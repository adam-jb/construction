"""
Query Engine — 11-step pipeline for answering construction code questions.

Steps:
 1. Classify intent (greeting / clarification / follow_up / query)
 2. Vector search (Pinecone top 10)
 3. Keyword extraction + KV expansion + keyword search
 4. Relevance check (LLM filters)
 5. Expansion (if bottom-2 vector hits were relevant, fetch more)
 6-8. Follow references 1st/2nd/3rd order, check relevance each time
 9. Check precedence via dict lookup
10. Conflict detection (LLM)
11. Synthesize answer (LLM)
"""

import logging
import re

logger = logging.getLogger(__name__)

MAX_REFERENCE_DEPTH = 3


class QueryEngine:
    def __init__(self, gemini, pinecone, store):
        self.gemini = gemini
        self.pinecone = pinecone
        self.store = store
        self._last_results = None  # for follow-up queries
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
            # Exact key
            idx[key] = key
            # Dots-to-underscores variant
            idx[key.replace(".", "_")] = key
            # Strip trailing parens: key_5.2.3(1) -> key_5.2.3
            stripped = re.sub(r'\([^)]*\)$', '', key)
            if stripped != key:
                idx.setdefault(stripped, key)
                idx.setdefault(stripped.replace(".", "_"), key)

        # Build cross-document lookup: extract document code patterns
        # e.g., prefix "CEN_EN_1991-1-1:2002" should match refs like
        # "EN_1991-1-1", "BS_EN_1991-1-1:2002", "EN1991-1-1"
        self._doc_code_to_prefix = {}
        for doc in self.store.documents.values():
            prefix = doc.get("key_prefix", "")
            code = doc.get("code", "")
            if not prefix:
                continue
            # Register various forms of the document code
            for variant in self._code_variants(code):
                self._doc_code_to_prefix[variant] = prefix

        self._ref_index = idx

    @staticmethod
    def _code_variants(code: str) -> list[str]:
        """Generate normalized variants of a document code for matching.

        Must handle: "EN_1991-1-1:2002", "EN_1991-1-4:2005+A1",
        "en_1991_1_6_2005", and refs like "EN_1991-1-4", "EN 1991-1-6".
        """
        variants = set()
        c = code.lower().strip()
        variants.add(c)

        # Strip year/amendment suffixes: ":2002", ":2005+A1", "_2005", etc.
        no_year = re.sub(r'[_:]?\d{4}(\+\w+)?$', '', c)
        variants.add(no_year)

        # Normalize separators: convert _ to - and vice versa
        for v in list(variants):
            variants.add(v.replace("_", "-"))
            variants.add(v.replace("-", "_"))
            variants.add(v.replace(" ", "_"))
            variants.add(v.replace(" ", "-"))
            variants.add(v.replace(" ", ""))

        # Strip all non-alphanumeric except hyphens
        for v in list(variants):
            variants.add(re.sub(r'[^a-z0-9\-]', '', v))

        return list(variants)

    def _resolve_ref(self, ref_key: str) -> str | None:
        """Try to resolve a reference key to an actual store key.

        Tries: exact match, fuzzy match (dots/parens), cross-document match.
        Returns the resolved key or None.
        """
        if self._ref_index is None:
            self._build_ref_index()

        # 1. Exact match
        if ref_key in self._ref_index:
            return self._ref_index[ref_key]

        # 2. Dots-to-underscores
        normalized = ref_key.replace(".", "_")
        if normalized in self._ref_index:
            return self._ref_index[normalized]

        # 3. Strip trailing parens
        stripped = re.sub(r'\([^)]*\)$', '', ref_key)
        if stripped in self._ref_index:
            return self._ref_index[stripped]
        stripped_norm = stripped.replace(".", "_")
        if stripped_norm in self._ref_index:
            return self._ref_index[stripped_norm]

        # 4. Double-prefix fix: if key has prefix repeated, strip one
        for prefix in [doc.get("key_prefix", "") for doc in self.store.documents.values()]:
            doubled = prefix + "_" + prefix
            if ref_key.startswith(doubled):
                fixed = ref_key[len(prefix) + 1:]
                if fixed in self._ref_index:
                    return self._ref_index[fixed]

        # 5. Cross-document: try to match a doc code in the ref key
        #    e.g., "EN_1990" or "BS_EN_1991-1-2:2002" -> find matching prefix
        ref_lower = ref_key.lower()
        # Also try canonical form (strip all non-alphanumeric)
        ref_canonical = re.sub(r'[^a-z0-9]', '', ref_lower)
        for code_variant, prefix in self._doc_code_to_prefix.items():
            cv_canonical = re.sub(r'[^a-z0-9]', '', code_variant)
            if code_variant in ref_lower or cv_canonical == ref_canonical or cv_canonical in ref_canonical:
                # Found a matching document — now try to find the specific section
                # Extract the section part after the doc code
                # e.g., "EN_1990_4.1.2" -> section "4.1.2"
                idx = ref_lower.find(code_variant)
                remainder = ref_key[idx + len(code_variant):].lstrip("_:/ ")
                if remainder:
                    # Try to find prefix_remainder in our index
                    candidate = f"{prefix}_{remainder}"
                    resolved = self._resolve_ref_simple(candidate)
                    if resolved:
                        return resolved
                # No specific section — just means "this document exists"
                # Return the first section of this doc as a pointer
                for k in self.store.sections:
                    if k.startswith(prefix) and not self.store.sections[k].get("is_raw_page"):
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

    async def query(self, query_text: str) -> dict:
        """Run the full query pipeline. Returns structured response."""
        steps_log = []

        # Step 1: Intent classification
        intent = await self._classify_intent(query_text)
        steps_log.append({"step": "intent", "result": intent})

        if intent == "greeting":
            return {
                "answer": "Hello! I can help you search construction standards (Eurocodes). Ask me about loads, densities, safety factors, or any technical question.",
                "references": [],
                "steps": steps_log,
            }

        if intent == "clarification":
            return {
                "answer": "Could you be more specific? For example:\n- \"What density should be used for reinforced concrete?\"\n- \"What are the factors of safety for dead loads?\"\n- \"What snow loads apply at 500m altitude?\"",
                "references": [],
                "steps": steps_log,
            }

        # Step 2: Vector search
        query_vec = await self.gemini.embed_query(query_text)
        vector_hits = self.pinecone.search(query_vec, top_k=10)
        hit_ids = [h["id"] for h in vector_hits]
        steps_log.append({"step": "vector_search", "hits": len(vector_hits),
                          "top_ids": hit_ids[:5]})

        # Step 3: Keyword extraction + KV expansion + keyword search
        keywords = await self._extract_keywords(query_text)
        expanded_keywords = self._expand_keywords_with_kv(keywords)
        keyword_hits = self._keyword_search(expanded_keywords)
        steps_log.append({"step": "keyword_search", "keywords": keywords,
                          "expanded": expanded_keywords,
                          "keyword_hits": len(keyword_hits)})

        # Merge results (vector + keyword), de-duplicate
        all_candidate_ids = list(dict.fromkeys(hit_ids + keyword_hits))

        # Build sections dict for candidates (check both sections and objects)
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
                "references": [],
                "steps": steps_log,
            }

        # Step 4: Relevance check
        relevant_extracts = await self._check_relevance(query_text, candidates)
        steps_log.append({"step": "relevance_check",
                          "candidates": len(candidates),
                          "relevant": len(relevant_extracts)})

        # Step 5: Expansion — if bottom 2 vector hits were relevant, fetch more
        if len(vector_hits) >= 10:
            bottom_two = [h["id"] for h in vector_hits[-2:]]
            if any(bid in relevant_extracts for bid in bottom_two):
                extra_hits = self.pinecone.search(query_vec, top_k=20)
                new_ids = [h["id"] for h in extra_hits if h["id"] not in candidates]
                if new_ids:
                    extra_candidates = {}
                    for sid in new_ids:
                        sec = self.store.sections.get(sid)
                        if sec:
                            extra_candidates[sid] = sec
                    if extra_candidates:
                        extra_relevant = await self._check_relevance(query_text, extra_candidates)
                        relevant_extracts.update(extra_relevant)
                        steps_log.append({"step": "expansion",
                                          "extra_checked": len(extra_candidates),
                                          "extra_relevant": len(extra_relevant)})

        # Steps 6-8: Follow references up to 3 levels
        all_followed = set(relevant_extracts.keys())
        unfollowed = []

        for depth in range(1, MAX_REFERENCE_DEPTH + 1):
            ref_ids = set()
            for sid in list(relevant_extracts.keys()):
                refs = self.store.references.get(sid, [])
                for ref_key in refs:
                    if ref_key not in all_followed:
                        ref_ids.add(ref_key)

            if not ref_ids:
                break

            # Look up referenced sections (with fuzzy resolution)
            ref_candidates = {}
            for rid in ref_ids:
                resolved_key = self._resolve_ref(rid)
                if not resolved_key:
                    continue
                # Use the resolved key for lookup
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

        # Collect any 4th+ order refs as unfollowed
        for sid in relevant_extracts:
            refs = self.store.references.get(sid, [])
            for ref_key in refs:
                if ref_key not in all_followed:
                    unfollowed.append(ref_key)

        # Step 9: Check precedence
        precedence_notes = []
        for sid in relevant_extracts:
            # Check if this section's document has precedence rules
            prefix = self.store.sections.get(sid, {}).get("doc_key_prefix", "")
            for pkey, prule in self.store.precedence.items():
                if pkey.startswith(prefix):
                    precedence_notes.append({
                        "key": pkey,
                        "supersedes": prule.get("supersedes", []),
                        "superseded_by": prule.get("superseded_by", []),
                        "note": prule.get("note", ""),
                    })
        # De-duplicate
        seen_pkeys = set()
        unique_precedence = []
        for p in precedence_notes:
            if p["key"] not in seen_pkeys:
                seen_pkeys.add(p["key"])
                unique_precedence.append(p)
        steps_log.append({"step": "precedence", "rules": len(unique_precedence)})

        # Step 10: Conflict detection
        conflicts = []
        if len(relevant_extracts) > 1:
            conflicts = await self._check_conflicts(query_text, relevant_extracts)
        steps_log.append({"step": "conflicts", "found": len(conflicts)})

        # Step 11: Synthesize answer
        answer = await self._synthesize_answer(
            query_text, relevant_extracts, unique_precedence, conflicts, unfollowed
        )

        # Build references list for API response
        references = []
        for sid, extract in relevant_extracts.items():
            sec = self.store.sections.get(sid, {})
            obj = self.store.objects.get(sid, {})

            # Resolve doc_id to key_prefix for consistent lookup
            doc_prefix = sec.get("doc_key_prefix", "")
            if not doc_prefix and obj:
                # Objects store raw doc_id; resolve to key_prefix
                raw_doc_id = obj.get("doc_id", "")
                doc = self.store.documents.get(raw_doc_id, {})
                doc_prefix = doc.get("key_prefix", "")

            references.append({
                "id": sid,
                "section_code": sec.get("section_code") or obj.get("code", sid),
                "title": sec.get("title") or obj.get("title", ""),
                "page": sec.get("page") or obj.get("page", 0),
                "extract": str(extract) if extract else "",
                "doc_id": doc_prefix,
            })

        self._last_results = relevant_extracts
        return {
            "answer": answer,
            "references": references,
            "steps": steps_log,
        }

    # ----- Step implementations -----

    async def _classify_intent(self, query_text: str) -> str:
        has_previous = "true" if self._last_results else "false"
        prompt = f"""Classify this user query into one of these categories:
- "greeting": user is saying hello or making small talk, no search needed
- "clarification": query is too vague to search (e.g. single word like "loads" or "concrete" with no specific question)
- "follow_up": user is asking about or refining previous results (only if previous results exist)
- "query": a real technical question that needs document search

Previous results exist: {has_previous}

User query: "{query_text}"

Return exactly one word: greeting, clarification, follow_up, or query"""

        try:
            result = (await self.gemini.generate(prompt)).strip().lower()
            if result in ("greeting", "clarification", "follow_up", "query"):
                return result
            # If LLM returns something unexpected, default to query
            return "query"
        except Exception as e:
            logger.warning(f"Intent classification failed: {e}")
            return "query"

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
            # Fallback: simple word extraction
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
            # Check KV store for matching keys
            for key, val in self.store.kv_store.items():
                key_lower = key.lower()
                if isinstance(val, dict):
                    definition = val.get("value", "").lower()
                else:
                    definition = str(val).lower()

                # If keyword matches a KV key or appears in a definition
                if kw_lower == key_lower:
                    # Add words from the definition
                    def_words = re.findall(r'\b[a-zA-Z]{3,}\b', definition)
                    expanded.extend(def_words[:3])
                elif kw_lower in definition:
                    expanded.append(key)

        return list(dict.fromkeys(expanded))  # de-duplicate preserving order

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
                    score += 5  # title match is worth more
            if score > 0:
                matches.append((sid, score))

        # Also search objects (tables, figures)
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

    async def _check_relevance(self, query_text: str, candidates: dict) -> dict:
        """LLM checks which sections are relevant and extracts useful text."""
        if not candidates:
            return {}

        # Build sections payload (limit text size)
        sections_payload = {}
        for sid, sec in candidates.items():
            content = sec.get("content", "")
            if len(content) > 3000:
                content = content[:3000] + "..."
            sections_payload[sid] = {
                "code": sec.get("section_code", sid),
                "title": sec.get("title", ""),
                "content": content,
            }

        import json
        prompt = f"""For each section below, extract ONLY the text that is directly relevant to answering this query.
Include contextual information that helps interpret the relevant parts (e.g. table headers, units, conditions).
If a section has no relevant information, set its value to null.

Query: "{query_text}"

Sections:
{json.dumps(sections_payload, indent=1)}

Return JSON object mapping section keys to extracted relevant text (or null):"""

        try:
            result = await self.gemini.generate_json(prompt)
            # Filter out null values
            return {k: v for k, v in result.items() if v is not None and v}
        except Exception as e:
            logger.warning(f"Relevance check failed: {e}")
            # Fallback: include all candidates with their content
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
            return await self.gemini.generate_json(prompt)
        except Exception as e:
            logger.warning(f"Conflict detection failed: {e}")
            return []

    async def _synthesize_answer(self, query_text: str, extracts: dict,
                                  precedence: list, conflicts: list,
                                  unfollowed: list) -> str:
        """Final answer synthesis with citations."""
        import json

        # Build extracts text with section info
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

Query: "{query_text}"

Relevant extracts:
{extracts_text}

Precedence notes:
{precedence_text}

Conflicts:
{conflicts_text}

Unfollowed references:
{unfollowed_text}"""

        try:
            answer = await self.gemini.generate(prompt)
            # Safety truncation — LLM occasionally produces extremely long output
            if len(answer) > 10000:
                answer = answer[:10000] + "\n\n*[Answer truncated for length]*"
            return answer
        except Exception as e:
            logger.error(f"Answer synthesis failed: {e}")
            # Fallback: return raw extracts
            return f"Error synthesizing answer. Raw relevant sections:\n{extracts_text}"
