"""
Query Engine — multi-turn conversation + 11-step pipeline.

Step 1 classifies the latest message as "query" or "chat":
  - "chat" → conversational LLM response (no document search)
  - "query" → full pipeline:
     2. Vector search (Pinecone top 10)
     3. Keyword extraction + KV expansion + keyword search
     4. Relevance check (LLM filters)
     5. Expansion loop (keep fetching while bottom-2 hits are relevant)
     6-8. Follow references 1st/2nd/3rd order, check relevance each time
     9. Check precedence via dict lookup
    10. Conflict detection (LLM)
    11. Synthesize answer (LLM)
"""

import asyncio
import logging
import re
import time

logger = logging.getLogger(__name__)

MAX_REFERENCE_DEPTH = 3
MAX_EXPANSION_ROUNDS = 5  # safety cap on expansion loops
RELEVANCE_BATCH_SIZE = 4  # candidates per parallel LLM call


def _ms_since(start: float) -> int:
    return int((time.time() - start) * 1000)


CONVERSATION_MODEL = "google/gemini-3-flash-preview"
CONVERSATION_CONTEXT_LIMIT = 10  # max messages sent to classifier


class QueryEngine:
    def __init__(self, gemini, pinecone, store):
        self.gemini = gemini
        self.pinecone = pinecone
        self.store = store
        self._ref_index = None  # lazy-built fuzzy reference index

    def _build_ref_index(self):
        """Build an index for fuzzy reference resolution.

        Maps normalized reference strings to actual store keys so that
        cross-document refs (EN_1990 -> our loaded EN 1990) and sub-clause
        refs (5.2.3(1) -> 5.2.3) can be resolved.
        """
        idx = {}  # normalized_key -> actual_key
        all_keys = list(self.store.sections.keys()) + list(self.store.objects.keys())
        for key in all_keys:
            idx[key] = key
            idx[key.replace(".", "_")] = key
            stripped = re.sub(r'\([^)]*\)$', '', key)
            if stripped != key:
                idx.setdefault(stripped, key)
                idx.setdefault(stripped.replace(".", "_"), key)

        self._doc_code_to_prefix = {}
        for doc in self.store.documents.values():
            prefix = doc.get("key_prefix") or ""
            code = doc.get("code") or ""
            if not prefix:
                continue
            for variant in self._code_variants(code):
                self._doc_code_to_prefix[variant] = prefix

        self._ref_index = idx

    @staticmethod
    def _code_variants(code: str) -> list[str]:
        """Generate normalized variants of a document code for matching."""
        variants = set()
        c = code.lower().strip()
        variants.add(c)
        no_year = re.sub(r'[_:]?\d{4}(\+\w+)?$', '', c)
        variants.add(no_year)
        for v in list(variants):
            variants.add(v.replace("_", "-"))
            variants.add(v.replace("-", "_"))
            variants.add(v.replace(" ", "_"))
            variants.add(v.replace(" ", "-"))
            variants.add(v.replace(" ", ""))
        for v in list(variants):
            variants.add(re.sub(r'[^a-z0-9\-]', '', v))
        return list(variants)

    def _resolve_ref(self, ref_key: str) -> str | None:
        """Try to resolve a reference key to an actual store key."""
        if self._ref_index is None:
            self._build_ref_index()

        if ref_key in self._ref_index:
            return self._ref_index[ref_key]

        normalized = ref_key.replace(".", "_")
        if normalized in self._ref_index:
            return self._ref_index[normalized]

        stripped = re.sub(r'\([^)]*\)$', '', ref_key)
        if stripped in self._ref_index:
            return self._ref_index[stripped]
        stripped_norm = stripped.replace(".", "_")
        if stripped_norm in self._ref_index:
            return self._ref_index[stripped_norm]

        for prefix in [doc.get("key_prefix", "") for doc in self.store.documents.values()]:
            doubled = prefix + "_" + prefix
            if ref_key.startswith(doubled):
                fixed = ref_key[len(prefix) + 1:]
                if fixed in self._ref_index:
                    return self._ref_index[fixed]

        ref_lower = ref_key.lower()
        ref_canonical = re.sub(r'[^a-z0-9]', '', ref_lower)
        for code_variant, prefix in self._doc_code_to_prefix.items():
            cv_canonical = re.sub(r'[^a-z0-9]', '', code_variant)
            if code_variant in ref_lower or cv_canonical == ref_canonical or cv_canonical in ref_canonical:
                idx = ref_lower.find(code_variant)
                remainder = ref_key[idx + len(code_variant):].lstrip("_:/ ")
                if remainder:
                    candidate = f"{prefix}_{remainder}"
                    resolved = self._resolve_ref_simple(candidate)
                    if resolved:
                        return resolved
                for k in self.store.sections:
                    if k.startswith(prefix):
                        return k
                break

        return None

    def _resolve_ref_simple(self, key: str) -> str | None:
        """Simple resolution without cross-doc (avoids recursion)."""
        if key in self._ref_index:
            return self._ref_index[key]
        normalized = key.replace(".", "_")
        if normalized in self._ref_index:
            return self._ref_index[normalized]
        stripped = re.sub(r'\([^)]*\)$', '', key)
        if stripped in self._ref_index:
            return self._ref_index[stripped]
        return None

    def _collect_missing_docs(self, ref_keys: set) -> list[str]:
        """Track external document references we can't resolve."""
        missing = set()
        for ref_key in ref_keys:
            if self._resolve_ref(ref_key):
                continue
            # Try to extract a document code from the unresolved ref
            ref_lower = ref_key.lower()
            # Match patterns like EN_1990, ISO_8930, ENV_1991-2-1:1995
            m = re.match(r'((?:en[v]?|iso|bs)\s*[-_]?\s*[\d][\d\-_.:\s+a-z]*)', ref_lower)
            if m:
                doc_code = m.group(1).strip().rstrip("_-: ")
                missing.add(doc_code.upper())
        return sorted(missing)

    async def query(self, query_text: str, messages: list[dict] = None) -> dict:
        """Run the full query pipeline. Returns structured response."""
        if messages is None:
            messages = [{"role": "user", "content": query_text, "references": []}]

        pipeline_start = time.time()
        steps_log = []
        timings = {}

        # Step 1: Classify conversation intent
        t0 = time.time()
        intent = await self._classify_conversation_intent(messages)
        timings["1_intent"] = _ms_since(t0)
        steps_log.append({"step": "intent", "result": intent})
        logger.info(f"[query] step 1 intent: {intent} ({timings['1_intent']}ms)")

        if intent == "chat":
            t0 = time.time()
            answer = await self._conversational_response(messages)
            timings["chat_response"] = _ms_since(t0)
            timings["total"] = _ms_since(pipeline_start)
            logger.info(f"[query] chat response: {timings['chat_response']}ms")
            return {
                "answer": answer,
                "references": [],
                "steps": steps_log,
                "timings": timings,
                "missing_documents": [],
            }

        # Step 2: Vector search
        t0 = time.time()
        query_vec = await self.gemini.embed_query(query_text)
        timings["2a_embed"] = _ms_since(t0)

        t0 = time.time()
        top_k = 10
        vector_hits = self.pinecone.search(query_vec, top_k=top_k)
        hit_ids = [h["id"] for h in vector_hits]
        timings["2b_pinecone"] = _ms_since(t0)
        steps_log.append({"step": "vector_search", "hits": len(vector_hits),
                          "top_ids": hit_ids[:5]})
        logger.info(f"[query] step 2 vector: embed={timings['2a_embed']}ms pinecone={timings['2b_pinecone']}ms hits={len(vector_hits)}")

        # Step 3: Keyword extraction + KV expansion + keyword search
        t0 = time.time()
        keywords = await self._extract_keywords(query_text)
        timings["3a_keywords_llm"] = _ms_since(t0)

        t0 = time.time()
        expanded_keywords = self._expand_keywords_with_kv(keywords)
        keyword_hits = self._keyword_search(expanded_keywords)
        timings["3b_keyword_search"] = _ms_since(t0)
        steps_log.append({"step": "keyword_search", "keywords": keywords,
                          "expanded": expanded_keywords,
                          "keyword_hits": len(keyword_hits)})
        logger.info(f"[query] step 3 keywords: llm={timings['3a_keywords_llm']}ms search={timings['3b_keyword_search']}ms hits={len(keyword_hits)}")

        # Merge results (vector + keyword), de-duplicate
        all_candidate_ids = list(dict.fromkeys(hit_ids + keyword_hits))

        # Build sections dict for candidates
        candidates = {}
        for sid in all_candidate_ids:
            sec = self.store.sections.get(sid)
            if sec:
                candidates[sid] = sec
            else:
                obj = self.store.objects.get(sid)
                if obj:
                    candidates[sid] = {
                        "section_code": obj.get("code", sid),
                        "title": obj.get("title", ""),
                        "content": obj.get("description", ""),
                        "page": obj.get("page", 0),
                    }

        if not candidates:
            return {
                "answer": "I couldn't find any relevant sections in the indexed documents for your query. Please try rephrasing or being more specific.",
                "references": [], "steps": steps_log,
            }

        # Step 4: Relevance check
        t0 = time.time()
        relevant_extracts = await self._check_relevance(query_text, candidates)
        timings["4_relevance"] = _ms_since(t0)
        steps_log.append({"step": "relevance_check",
                          "candidates": len(candidates),
                          "relevant": len(relevant_extracts)})
        logger.info(f"[query] step 4 relevance: {timings['4_relevance']}ms ({len(relevant_extracts)}/{len(candidates)} relevant)")

        # Step 5: Expansion loop — keep fetching while bottom-2 hits are relevant
        t0 = time.time()
        expansion_rounds = 0
        while expansion_rounds < MAX_EXPANSION_ROUNDS:
            if len(vector_hits) < top_k:
                break  # not enough hits to justify expanding
            bottom_two = [h["id"] for h in vector_hits[-2:]]
            if not any(bid in relevant_extracts for bid in bottom_two):
                break  # bottom hits aren't relevant, stop expanding

            expansion_rounds += 1
            top_k += 10
            extra_hits = self.pinecone.search(query_vec, top_k=top_k)
            new_ids = [h["id"] for h in extra_hits if h["id"] not in candidates]
            if not new_ids:
                break

            extra_candidates = {}
            for sid in new_ids:
                sec = self.store.sections.get(sid)
                if sec:
                    extra_candidates[sid] = sec
                else:
                    obj = self.store.objects.get(sid)
                    if obj:
                        extra_candidates[sid] = {
                            "section_code": obj.get("code", sid),
                            "title": obj.get("title", ""),
                            "content": obj.get("description", ""),
                            "page": obj.get("page", 0),
                        }
            if not extra_candidates:
                break

            extra_relevant = await self._check_relevance(query_text, extra_candidates)
            relevant_extracts.update(extra_relevant)
            candidates.update(extra_candidates)
            # Update vector_hits to be the new full set for next iteration's bottom-2 check
            vector_hits = extra_hits

            steps_log.append({"step": f"expansion_round_{expansion_rounds}",
                              "top_k": top_k,
                              "extra_checked": len(extra_candidates),
                              "extra_relevant": len(extra_relevant)})

        timings["5_expansion"] = _ms_since(t0)
        logger.info(f"[query] step 5 expansion: {timings['5_expansion']}ms rounds={expansion_rounds}")

        # Steps 6-8: Follow references up to 3 levels
        t0 = time.time()
        all_followed = set(relevant_extracts.keys())
        all_unresolved_refs = set()

        for depth in range(1, MAX_REFERENCE_DEPTH + 1):
            ref_ids = set()
            for sid in list(relevant_extracts.keys()):
                refs = self.store.references.get(sid, [])
                for ref_key in refs:
                    if ref_key not in all_followed:
                        ref_ids.add(ref_key)

            if not ref_ids:
                break

            # Track unresolved for master doc list
            ref_candidates = {}
            for rid in ref_ids:
                resolved_key = self._resolve_ref(rid)
                if not resolved_key:
                    all_unresolved_refs.add(rid)
                    continue
                sec = self.store.sections.get(resolved_key)
                if sec:
                    ref_candidates[resolved_key] = sec
                else:
                    obj = self.store.objects.get(resolved_key)
                    if obj:
                        ref_candidates[resolved_key] = {
                            "section_code": obj.get("code", resolved_key),
                            "title": obj.get("title", ""),
                            "content": obj.get("description", ""),
                            "page": obj.get("page", 0),
                        }

            if ref_candidates:
                ref_relevant = await self._check_relevance(query_text, ref_candidates)
                relevant_extracts.update(ref_relevant)
                all_followed.update(ref_candidates.keys())
                steps_log.append({"step": f"follow_refs_depth_{depth}",
                                  "checked": len(ref_candidates),
                                  "relevant": len(ref_relevant)})
            else:
                all_followed.update(ref_ids)

        timings["6_8_refs"] = _ms_since(t0)
        logger.info(f"[query] steps 6-8 refs: {timings['6_8_refs']}ms")

        # Collect unfollowed 4th+ order refs
        unfollowed = []
        for sid in relevant_extracts:
            refs = self.store.references.get(sid, [])
            for ref_key in refs:
                if ref_key not in all_followed:
                    unfollowed.append(ref_key)
                    all_unresolved_refs.add(ref_key)

        # Build missing documents list from all unresolved refs
        missing_docs = self._collect_missing_docs(all_unresolved_refs)

        # Step 9: Check precedence
        t0 = time.time()
        precedence_notes = []
        for sid in relevant_extracts:
            prefix = self.store.sections.get(sid, {}).get("doc_key_prefix", "")
            for pkey, prule in self.store.precedence.items():
                if pkey.startswith(prefix):
                    precedence_notes.append({
                        "key": pkey,
                        "supersedes": prule.get("supersedes", []),
                        "superseded_by": prule.get("superseded_by", []),
                        "note": prule.get("note", ""),
                    })
        seen_pkeys = set()
        unique_precedence = []
        for p in precedence_notes:
            if p["key"] not in seen_pkeys:
                seen_pkeys.add(p["key"])
                unique_precedence.append(p)
        timings["9_precedence"] = _ms_since(t0)
        steps_log.append({"step": "precedence", "rules": len(unique_precedence)})
        logger.info(f"[query] step 9 precedence: {timings['9_precedence']}ms")

        # Step 10: Conflict detection
        t0 = time.time()
        conflicts = []
        if len(relevant_extracts) > 1:
            conflicts = await self._check_conflicts(query_text, relevant_extracts)
        timings["10_conflicts"] = _ms_since(t0)
        steps_log.append({"step": "conflicts", "found": len(conflicts)})
        logger.info(f"[query] step 10 conflicts: {timings['10_conflicts']}ms")

        # Step 11: Synthesize answer
        t0 = time.time()
        answer = await self._synthesize_answer(
            query_text, relevant_extracts, unique_precedence, conflicts,
            unfollowed, missing_docs
        )
        timings["11_synthesize"] = _ms_since(t0)
        logger.info(f"[query] step 11 synthesize: {timings['11_synthesize']}ms")

        # Build references list for API response
        references = []
        for sid, extract in relevant_extracts.items():
            sec = self.store.sections.get(sid, {})
            obj = self.store.objects.get(sid, {})
            doc_prefix = sec.get("doc_key_prefix", "")
            if not doc_prefix and obj:
                raw_doc_id = obj.get("doc_id", "")
                doc = self.store.documents.get(raw_doc_id, {})
                doc_prefix = doc.get("key_prefix", "")
            
            # Extract highlight terms from query and extract
            highlight_terms = self._extract_highlight_terms(query_text, str(extract))
            
            references.append({
                "id": sid,
                "section_code": sec.get("section_code") or obj.get("code", sid),
                "title": sec.get("title") or obj.get("title", ""),
                "page": sec.get("page") or obj.get("page", 0),
                "extract": str(extract) if extract else "",
                "doc_id": doc_prefix,
                "highlightText": highlight_terms,
            })

        total_ms = _ms_since(pipeline_start)
        timings["total"] = total_ms
        logger.info(f"[query] TOTAL: {total_ms}ms | refs={len(references)} | missing_docs={missing_docs}")
        logger.info(f"[query] TIMINGS: {timings}")

        return {
            "answer": answer,
            "references": references,
            "steps": steps_log,
            "timings": timings,
            "missing_documents": missing_docs,
        }

    # ----- Step implementations -----

    async def _classify_conversation_intent(self, messages: list[dict]) -> str:
        """Classify the latest user message as 'query' or 'chat'.

        - 'query': a new technical question needing document search
        - 'chat': greeting, follow-up about already-returned results, clarification, chitchat
        """
        # Use last N messages for context
        recent = messages[-CONVERSATION_CONTEXT_LIMIT:]

        # Build a readable conversation snippet for the classifier
        convo_lines = []
        for msg in recent:
            role = msg["role"].upper()
            content = msg["content"][:500]  # truncate long messages
            has_refs = bool(msg.get("references"))
            ref_note = " [has document references]" if has_refs else ""
            convo_lines.append(f"{role}{ref_note}: {content}")
        convo_text = "\n".join(convo_lines)

        prompt = f"""You are classifying the latest user message in a conversation with a construction standards assistant.

Classify into exactly one category:
- "query": The user is asking a NEW technical question that requires searching construction documents. Examples: asking about load factors, concrete densities, design codes, safety factors, structural requirements.
- "chat": Everything else — greetings, thank you, follow-up questions about results already shown in the conversation, asking for clarification of a previous answer, chitchat, or messages that are too vague to search.

Conversation:
{convo_text}

Return exactly one word: query or chat"""

        try:
            result = (await self.gemini.generate(prompt)).strip().lower()
            if result in ("query", "chat"):
                return result
            return "query"  # default to search
        except Exception as e:
            logger.warning(f"Conversation intent classification failed: {e}")
            return "query"

    async def _conversational_response(self, messages: list[dict]) -> str:
        """Generate a conversational reply (no document search)."""
        system_prompt = (
            "You are a helpful construction standards assistant specializing in "
            "Eurocodes and structural engineering design codes. You help engineers "
            "find and understand information in their design standards.\n\n"
            "The user is having a conversation with you. Respond naturally and helpfully. "
            "If the user is asking about results you previously provided, refer back to them. "
            "If the user greets you, greet them back and mention what you can help with. "
            "Keep responses concise and professional."
        )

        # Build chat messages — include references as context (without base64)
        chat_messages = []
        for msg in messages:
            content = msg["content"]
            refs = msg.get("references", [])
            if refs and msg["role"] == "assistant":
                # Append a brief note about what references were included
                ref_summary = ", ".join(
                    ref.get("section_code") or ref.get("title", "ref")
                    for ref in refs[:10]
                )
                content += f"\n\n[Referenced sections: {ref_summary}]"
            chat_messages.append({"role": msg["role"], "content": content})

        try:
            return await self.gemini.generate_chat(
                chat_messages, system=system_prompt, model=CONVERSATION_MODEL
            )
        except Exception as e:
            logger.error(f"Conversational response failed: {e}")
            return "I'm sorry, I encountered an error. Could you try rephrasing your question?"

    async def _extract_keywords(self, query_text: str) -> list[str]:
        prompt = f"""Extract 1-5 search keywords from this construction/engineering query.
Be conservative — pick the most distinctive terms that would appear in technical standards.
Do not include common words like "what", "is", "the", "for".

Query: "{query_text}"

Return JSON array of keywords:
["keyword1", "keyword2"]"""

        try:
            return await self.gemini.generate_json(prompt)
        except Exception as e:
            logger.warning(f"Keyword extraction failed: {e}")
            words = re.findall(r'\b[a-zA-Z]{3,}\b', query_text.lower())
            stop = {"what", "where", "when", "which", "that", "this", "with",
                    "from", "have", "does", "should", "would", "could", "the",
                    "for", "are", "how"}
            return [w for w in words if w not in stop][:5]

    def _expand_keywords_with_kv(self, keywords: list[str]) -> list[str]:
        """Expand keywords using KV store definitions."""
        expanded = list(keywords)
        for kw in keywords:
            kw_lower = kw.lower()
            for key, val in self.store.kv_store.items():
                key_lower = key.lower()
                if isinstance(val, dict):
                    definition = val.get("value", "").lower()
                else:
                    definition = str(val).lower()
                if kw_lower == key_lower:
                    def_words = re.findall(r'\b[a-zA-Z]{3,}\b', definition)
                    expanded.extend(def_words[:3])
                elif kw_lower in definition:
                    expanded.append(key)
        return list(dict.fromkeys(expanded))

    def _keyword_search(self, keywords: list[str]) -> list[str]:
        """Search sections by keyword matching."""
        matches = []
        for sid, sec in self.store.sections.items():
            content = (sec.get("content") or "").lower()
            title = (sec.get("title") or "").lower()
            score = 0
            for kw in keywords:
                kw_lower = kw.lower()
                if kw_lower in content:
                    score += content.count(kw_lower)
                if kw_lower in title:
                    score += 5
            if score > 0:
                matches.append((sid, score))

        for oid, obj in self.store.objects.items():
            desc = (obj.get("description") or "").lower()
            title = (obj.get("title") or "").lower()
            code = (obj.get("code") or "").lower()
            score = 0
            for kw in keywords:
                kw_lower = kw.lower()
                if kw_lower in desc:
                    score += desc.count(kw_lower)
                if kw_lower in title:
                    score += 5
                if kw_lower in code:
                    score += 3
            if score > 0:
                matches.append((oid, score))

        matches.sort(key=lambda x: -x[1])
        return [m[0] for m in matches[:20]]

    def _extract_highlight_terms(self, query_text: str, extract_text: str) -> list[str]:
        """Extract 2-4 key terms from query that appear in the extract for highlighting."""
        # Get significant words from query (3+ chars, not stopwords)
        stop_words = {
            "what", "where", "when", "which", "that", "this", "with", "from",
            "have", "does", "should", "would", "could", "the", "for", "are",
            "how", "and", "about", "can", "you", "tell", "find", "show", "give"
        }
        query_lower = query_text.lower()
        extract_lower = extract_text.lower()
        
        # Extract potential highlight terms from query
        query_words = re.findall(r'\b[a-zA-Z]{3,}\b', query_lower)
        candidates = [w for w in query_words if w not in stop_words]
        
        # Find terms that appear in extract
        highlights = []
        for term in candidates:
            if term in extract_lower:
                # Find the actual case-preserved version from extract
                pattern = re.compile(r'\b' + re.escape(term) + r'\b', re.IGNORECASE)
                match = pattern.search(extract_text)
                if match:
                    highlights.append(match.group())
        
        # Also look for multi-word phrases (2-3 words)
        phrases = re.findall(r'\b[a-zA-Z]{3,}(?:\s+[a-zA-Z]{3,}){1,2}\b', query_lower)
        for phrase in phrases:
            if phrase in extract_lower and len(highlights) < 4:
                pattern = re.compile(r'\b' + re.escape(phrase) + r'\b', re.IGNORECASE)
                match = pattern.search(extract_text)
                if match:
                    highlights.append(match.group())
        
        # Return unique highlights, limit to 4
        seen = set()
        unique_highlights = []
        for h in highlights:
            if h.lower() not in seen and len(unique_highlights) < 4:
                seen.add(h.lower())
                unique_highlights.append(h)
        
        return unique_highlights[:4]

    async def _check_relevance(self, query_text: str, candidates: dict) -> dict:
        """LLM checks which sections are relevant and extracts useful text.

        Splits candidates into batches and runs them in parallel for speed.
        """
        if not candidates:
            return {}

        # Split into batches
        items = list(candidates.items())
        batches = [dict(items[i:i + RELEVANCE_BATCH_SIZE])
                   for i in range(0, len(items), RELEVANCE_BATCH_SIZE)]

        if len(batches) == 1:
            return await self._check_relevance_batch(query_text, batches[0])

        # Run batches in parallel
        logger.info(f"[query] relevance: {len(candidates)} candidates -> {len(batches)} parallel batches")
        tasks = [self._check_relevance_batch(query_text, batch) for batch in batches]
        results = await asyncio.gather(*tasks)

        # Merge all results
        merged = {}
        for r in results:
            merged.update(r)
        return merged

    async def _check_relevance_batch(self, query_text: str, candidates: dict) -> dict:
        """Single-batch relevance check via LLM."""
        import json

        sections_payload = {}
        for sid, sec in candidates.items():
            sections_payload[sid] = {
                "code": sec.get("section_code", sid),
                "title": sec.get("title", ""),
                "content": sec.get("content", ""),
            }

        prompt = f"""For each section below, extract ONLY the text that is directly relevant to answering this query.
Include contextual information that helps interpret the relevant parts (e.g. table headers, units, conditions).
If a section has no relevant information, set its value to null.

Query: "{query_text}"

Sections:
{json.dumps(sections_payload, indent=1)}

Return JSON object mapping section keys to extracted relevant text (or null):"""

        try:
            result = await self.gemini.generate_json_with_fallback(prompt)
            return {k: v for k, v in result.items() if v is not None and v}
        except Exception as e:
            logger.warning(f"Relevance batch failed: {e}")
            return {sid: sec.get("content", "")[:500]
                    for sid, sec in candidates.items()}

    async def _check_conflicts(self, query_text: str, extracts: dict) -> list[dict]:
        """Check for conflicting information across extracts."""
        import json
        extracts_preview = {k: str(v)[:500] for k, v in extracts.items()}
        prompt = f"""Review these extracts from construction standards documents. Do any of them conflict with each other?
Conflicts include: contradictory values, incompatible requirements, overlapping scope with different specifications.

Do NOT flag as conflicts:
- Different values for different materials/conditions (that's expected)
- General vs specific rules (the specific rule applies)
- Informative vs normative content

Query context: "{query_text}"

Extracts:
{json.dumps(extracts_preview, indent=1)}

If conflicts exist, return JSON array:
[{{"sections": ["key1", "key2"], "description": "Description of the conflict"}}]

If no conflicts, return: []"""

        try:
            return await self.gemini.generate_json_with_fallback(prompt)
        except Exception as e:
            logger.warning(f"Conflict detection failed: {e}")
            return []

    async def _synthesize_answer(self, query_text: str, extracts: dict,
                                  precedence: list, conflicts: list,
                                  unfollowed: list, missing_docs: list) -> str:
        """Final answer synthesis with citations."""
        import json

        extracts_text = ""
        for sid, text in extracts.items():
            sec = self.store.sections.get(sid, {})
            obj = self.store.objects.get(sid, {})
            code = sec.get("section_code") or obj.get("code", sid)
            page = sec.get("page") or obj.get("page", "?")
            title = sec.get("title") or obj.get("title", "")
            extracts_text += f"\n### [{code}] {title} (Page {page})\n{str(text)}\n"

        precedence_text = json.dumps(precedence, indent=1) if precedence else "None"
        conflicts_text = json.dumps(conflicts, indent=1) if conflicts else "None"
        unfollowed_text = ", ".join(unfollowed[:10]) if unfollowed else "None"
        missing_text = ", ".join(missing_docs[:10]) if missing_docs else "None"

        prompt = f"""You are answering a question about construction standards (Eurocodes).
Use ONLY the provided extracts to answer. Cite every piece of information with its source.

IMPORTANT formatting rules:
- Keep your answer CONCISE — aim for 300-800 words maximum
- Use proper markdown with line breaks between elements
- Use tables with SHORT cell contents (abbreviate long text, max ~50 chars per cell)
- Each table row MUST be on its own line
- Citations in format [Section X.Y.Z, Page N] or [Table X.Y, Page N]
- Include units for all values
- Note any conditions or exceptions that apply
- Do NOT repeat raw source text verbatim — summarize and cite instead

If there are precedence notes, mention which standard takes priority.
If there are conflicts, highlight them clearly.
If there are unfollowed references, mention them as "Further references available".
If there are missing documents, note them as "Referenced but not loaded" so the user knows.

Query: "{query_text}"

Relevant extracts:
{extracts_text}

Precedence notes:
{precedence_text}

Conflicts:
{conflicts_text}

Unfollowed references:
{unfollowed_text}

Referenced documents not loaded in system:
{missing_text}"""

        try:
            answer = await self.gemini.generate(prompt)
            if len(answer) > 10000:
                answer = answer[:10000] + "\n\n*[Answer truncated for length]*"
            return answer
        except Exception as e:
            logger.error(f"Answer synthesis failed: {e}")
            return f"Error synthesizing answer. Raw relevant sections:\n{extracts_text}"
