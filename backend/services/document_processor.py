"""
Document Processor Service

Handles PDF ingestion: text extraction, figure detection, section splitting,
reference extraction, embeddings, precedence, and KV pair extraction.
"""

import asyncio
import io
import logging
import re
from concurrent.futures import ThreadPoolExecutor

import fitz  # PyMuPDF
import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)

# Figure detection thresholds
MIN_REGION_WIDTH_PCT = 0.15
MIN_REGION_HEIGHT_PCT = 0.08
MAX_REGION_AREA_PCT = 0.55
RENDER_DPI = 200

# LLM concurrency: allow some parallelism but leave headroom for query requests
# With 4 cores: use 2 concurrent LLM calls for ingestion, leaving capacity for queries
MAX_CONCURRENT_LLM = 2


# ---------------------------------------------------------------------------
# Phase 2: Raw extraction (no LLM)
# ---------------------------------------------------------------------------

def extract_pages(pdf_bytes: bytes) -> list[dict]:
    """
    Extract text and figures from every page of a PDF.

    Returns list of dicts, one per page:
      {
        "page_num": int (1-based),
        "text": str,
        "figures": [{"bytes": png_bytes, "bbox": (x0,y0,x1,y1), "page_num": int}],
        "page_image_bytes": png_bytes (full page render),
      }
    """
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")

    def _process_page(page_index: int) -> dict:
        page = doc[page_index]
        text = page.get_text("text")
        text_dict = page.get_text("dict")
        page_rect = page.rect
        pw, ph = page_rect.width, page_rect.height

        # Render full page as image
        pix = page.get_pixmap(dpi=RENDER_DPI)
        page_png = pix.tobytes("png")
        page_img = Image.open(io.BytesIO(page_png))
        img_w, img_h = page_img.size
        scale_x = img_w / pw if pw > 0 else 1
        scale_y = img_h / ph if ph > 0 else 1

        # Collect candidate non-text regions from multiple methods
        candidates = []

        # Method A: Embedded raster images, filtered by size
        for img_info in page.get_images(full=True):
            try:
                rects = page.get_image_rects(img_info)
                for rect in rects:
                    if (rect.width / pw >= MIN_REGION_WIDTH_PCT and
                            rect.height / ph >= MIN_REGION_HEIGHT_PCT):
                        candidates.append(rect)
            except Exception:
                pass

        # Method B: Drawing/path clusters (vector diagrams, table lines)
        drawings = page.get_drawings()
        if drawings:
            draw_rects = []
            for d in drawings:
                r = d.get("rect")
                if r:
                    draw_rects.append(fitz.Rect(r))
            if draw_rects:
                clusters = _cluster_rects(draw_rects, merge_distance=10)
                for cluster_rect in clusters:
                    if (cluster_rect.width / pw >= MIN_REGION_WIDTH_PCT and
                            cluster_rect.height / ph >= MIN_REGION_HEIGHT_PCT and
                            cluster_rect.width > 5 and cluster_rect.height > 5):
                        candidates.append(cluster_rect)

        # Method C: Image blocks from text dict (type == 1)
        for block in text_dict.get("blocks", []):
            if block["type"] == 1:
                rect = fitz.Rect(block["bbox"])
                if (rect.width / pw >= MIN_REGION_WIDTH_PCT and
                        rect.height / ph >= MIN_REGION_HEIGHT_PCT):
                    candidates.append(rect)

        # Method D: Text gap analysis (for scanned PDFs)
        text_blocks = sorted(
            [fitz.Rect(b["bbox"]) for b in text_dict.get("blocks", []) if b["type"] == 0],
            key=lambda r: r.y0,
        )
        if text_blocks:
            left_margin = min(r.x0 for r in text_blocks)
            right_margin = max(r.x1 for r in text_blocks)
            col_width = right_margin - left_margin
            for i in range(len(text_blocks) - 1):
                gap_top = text_blocks[i].y1
                gap_bottom = text_blocks[i + 1].y0
                gap_height = gap_bottom - gap_top
                if gap_height / ph >= 0.10 and col_width / pw >= MIN_REGION_WIDTH_PCT:
                    candidates.append(fitz.Rect(left_margin, gap_top, right_margin, gap_bottom))

        # Merge overlapping candidates
        merged = _merge_overlapping_rects(candidates)

        # Filter out full-page background images (scanned PDFs)
        page_area = pw * ph
        merged = [r for r in merged
                  if (r.width * r.height) / page_area < MAX_REGION_AREA_PCT]

        # Crop each candidate from the rendered page image
        figures = []
        for rect in merged:
            x0 = max(0, int(rect.x0 * scale_x))
            y0 = max(0, int(rect.y0 * scale_y))
            x1 = min(img_w, int(rect.x1 * scale_x))
            y1 = min(img_h, int(rect.y1 * scale_y))
            if x1 <= x0 or y1 <= y0:
                continue
            crop = page_img.crop((x0, y0, x1, y1))
            if _is_meaningful_image(crop):
                buf = io.BytesIO()
                crop.save(buf, format="PNG")
                figures.append({
                    "bytes": buf.getvalue(),
                    "bbox": (rect.x0, rect.y0, rect.x1, rect.y1),
                    "page_num": page_index + 1,
                })

        return {
            "page_num": page_index + 1,
            "text": text,
            "figures": figures,
            "page_image_bytes": page_png,
        }

    # Use 2 workers for rendering — leaves CPU for other server work
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(_process_page, range(len(doc))))

    return results


# ---------------------------------------------------------------------------
# Phase 3: Full ingestion pipeline
# ---------------------------------------------------------------------------

class DocumentProcessor:
    def __init__(self, gemini, pinecone, store):
        self.gemini = gemini
        self.pinecone = pinecone
        self.store = store
        self.sem = asyncio.Semaphore(MAX_CONCURRENT_LLM)

    async def process_pdf(self, pdf_bytes: bytes, doc_id: str, filename: str = ""):
        """Full ingestion pipeline for a PDF."""
        logger.info(f"Starting ingestion for {doc_id} ({filename})")

        # Step 1-2: Raw extraction
        pages = extract_pages(pdf_bytes)
        logger.info(f"Extracted {len(pages)} pages")

        # Upload PDF and page renders to R2
        self.store.upload_file(f"pdfs/{doc_id}.pdf", pdf_bytes, "application/pdf")
        for p in pages:
            self.store.upload_file(
                f"images/{doc_id}/page_{p['page_num']}.png",
                p["page_image_bytes"],
                "image/png",
            )

        # Step 3: Identify document metadata (publisher, code) from first pages
        first_pages_text = "\n".join(p["text"] for p in pages[:3])
        doc_meta = await self._extract_doc_metadata(first_pages_text, filename)
        publisher = doc_meta.get("publisher", "BSI")
        doc_code = doc_meta.get("code", doc_id)
        doc_name = doc_meta.get("name", filename)
        short_name = doc_meta.get("short_name", doc_code)
        key_prefix = f"{publisher}_{doc_code}"

        # Store document record
        self.store.documents[doc_id] = {
            "publisher": publisher,
            "code": doc_code,
            "name": doc_name,
            "short_name": short_name,
            "pages": len(pages),
            "status": "processing",
            "file_key": f"pdfs/{doc_id}.pdf",
            "key_prefix": key_prefix,
        }
        self.store.save("documents")

        # Step 4: Section splitting with coverage verification (LLM, batched ~5 pages)
        sections = await self._split_sections(pages, key_prefix)
        logger.info(f"Split into {len(sections)} sections (with coverage verification)")

        # Store sections
        for key, sec in sections.items():
            self.store.sections[key] = sec
        self.store.save("sections")

        # Step 5: Image/table description via vision (LLM)
        await self._describe_visual_content(pages, doc_id, key_prefix)
        self.store.save("objects")

        # Step 6: Reference extraction (LLM, all sections including gap-fills)
        known_codes = list(sections.keys())
        await self._extract_references(sections, known_codes, key_prefix)
        self.store.save("references")

        # Step 7-8: Embeddings + Pinecone upsert
        await self._embed_and_upsert(sections, doc_id, doc_name, key_prefix)

        # Step 9: Precedence extraction (LLM)
        await self._extract_precedence(pages, key_prefix)
        self.store.save("precedence")

        # Step 10: KV pair extraction (LLM)
        await self._extract_kv_pairs(pages, doc_id)
        self.store.save("kv_store")

        # Mark complete
        self.store.documents[doc_id]["status"] = "ready"
        self.store.save("documents")
        logger.info(f"Ingestion complete for {doc_id}: {len(sections)} sections")

    async def _extract_doc_metadata(self, text: str, filename: str) -> dict:
        """Extract publisher, code, name from document header text."""
        prompt = f"""Extract document metadata from this construction standards document.

Text from first pages:
{text[:3000]}

Filename: {filename}

Return JSON:
{{
  "publisher": "Publisher abbreviation (e.g. BSI, CEN)",
  "code": "Document code (e.g. EN_1991-1-1). Use underscores not spaces.",
  "name": "Full document title",
  "short_name": "Short reference name"
}}"""
        try:
            return await self.gemini.generate_json(prompt)
        except Exception as e:
            logger.warning(f"Metadata extraction failed: {e}")
            # Fallback: try to parse from filename
            code = re.sub(r"[.\s]+", "_", filename.replace(".pdf", ""))
            return {"publisher": "BSI", "code": code, "name": filename, "short_name": code}

    async def _split_sections(self, pages: list[dict], key_prefix: str) -> dict:
        """Split page text into sections using LLM with coverage verification.

        Uses 5-page batches with 1-page overlap. After initial split, verifies
        coverage per page, retries gaps as single pages, and gap-fills anything
        still missing.
        """
        sections = {}
        batch_size = 5

        # Build batches with 1-page overlap
        batches = []
        i = 0
        while i < len(pages):
            end = min(i + batch_size, len(pages))
            batch = pages[i:end]
            # Tag overlap page (last page of previous batch = first page of this batch)
            overlap_page_num = pages[i]["page_num"] if i > 0 else None
            batches.append((batch, overlap_page_num))
            i = end if end == len(pages) else end - 1  # step back 1 for overlap

        tasks = []
        for batch, overlap_page_num in batches:
            tasks.append(self._split_section_batch(batch, key_prefix, overlap_page_num))

        results = await asyncio.gather(*tasks, return_exceptions=True)
        for result in results:
            if isinstance(result, Exception):
                logger.error(f"Section splitting batch failed: {result}")
                continue
            sections.update(result)

        # Coverage verification
        gap_pages = self._find_coverage_gaps(pages, sections)
        if gap_pages:
            logger.info(f"Coverage gaps on {len(gap_pages)} pages, retrying as single pages")
            retry_sections = await self._retry_gap_pages(gap_pages, key_prefix)
            sections.update(retry_sections)

            # Check again after retry
            still_gap = self._find_coverage_gaps(gap_pages, sections)
            if still_gap:
                logger.info(f"{len(still_gap)} pages still have gaps after retry, gap-filling")
                for p in still_gap:
                    raw_text = p["text"].strip()
                    if not raw_text:
                        continue
                    gf_key = f"{key_prefix}_gapfill_page_{p['page_num']}"
                    sections[gf_key] = {
                        "section_code": f"gapfill_page_{p['page_num']}",
                        "title": f"Page {p['page_num']} (gap-fill)",
                        "page": p["page_num"],
                        "content": raw_text,
                        "doc_key_prefix": key_prefix,
                    }

        return sections

    async def _split_section_batch(self, batch: list[dict], key_prefix: str,
                                    overlap_page_num: int | None = None) -> dict:
        """Split a batch of pages into sections."""
        async with self.sem:
            page_texts = ""
            for p in batch:
                if overlap_page_num and p["page_num"] == overlap_page_num:
                    page_texts += f"\n--- PAGE {p['page_num']} [CONTEXT FROM PREVIOUS BATCH — do not re-split] ---\n{p['text']}\n"
                else:
                    page_texts += f"\n--- PAGE {p['page_num']} ---\n{p['text']}\n"

            start_page = batch[0]["page_num"]
            end_page = batch[-1]["page_num"]
            overlap_note = ""
            if overlap_page_num:
                overlap_note = f"\nPage {overlap_page_num} is provided as context only (it was already split in the previous batch). Do NOT create sections for its text — only use it to understand if a section continues from the previous batch.\n"

            prompt = f"""You are parsing a construction standards document (Eurocode).
Given the text from pages {start_page} to {end_page}, identify all sections and their boundaries.
{overlap_note}
Known section code patterns: numbered like 1.2.3, A.2.1 (Annexes), or named like "Foreword", "Scope".
Include clause text, notes, tables (as text), and sub-clauses within each section.

Return JSON array:
[
  {{
    "section_code": "4.2.1",
    "title": "Section title if present",
    "page": <page number where section starts>,
    "content": "Full text content of this section including notes and sub-clauses"
  }}
]

If a section spans across a page boundary, include all its text in the content field.
If the page contains a table, include the table header and all visible data in the section that contains it.
Every piece of text should belong to exactly one section — do not skip any text.

PAGE TEXT:
{page_texts}"""

            try:
                result = await self.gemini.generate_json(prompt)
                sections = {}
                for sec in result:
                    code = sec.get("section_code") or "unknown"
                    code_clean = str(code).replace(" ", "_")
                    key = f"{key_prefix}_{code_clean}"
                    sections[key] = {
                        "section_code": code,
                        "title": sec.get("title") or "",
                        "page": sec.get("page") or start_page,
                        "content": sec.get("content") or "",
                        "doc_key_prefix": key_prefix,
                    }
                return sections
            except Exception as e:
                logger.error(f"Section split failed for pages {start_page}-{end_page}: {e}")
                # Fallback: store entire batch as one section
                all_text = "\n".join(p["text"] for p in batch
                                     if not (overlap_page_num and p["page_num"] == overlap_page_num))
                key = f"{key_prefix}_pages_{start_page}-{end_page}"
                return {key: {
                    "section_code": f"pages_{start_page}-{end_page}",
                    "title": f"Pages {start_page}-{end_page}",
                    "page": start_page,
                    "content": all_text,
                    "doc_key_prefix": key_prefix,
                }}

    @staticmethod
    def _normalize_text(text: str) -> str:
        """Normalize text for coverage comparison: lowercase, collapse whitespace."""
        t = text.lower()
        t = re.sub(r'\s+', ' ', t).strip()
        return t

    def _find_coverage_gaps(self, pages: list[dict], sections: dict) -> list[dict]:
        """Find pages where <90% of text appears in any section output."""
        gap_pages = []
        for p in pages:
            page_text = self._normalize_text(p["text"])
            if len(page_text) < 20:
                continue  # skip near-empty pages

            # Split page text into words for overlap measurement
            page_words = set(page_text.split())
            if not page_words:
                continue

            # Collect all words from sections that reference this page
            covered_words = set()
            for sec in sections.values():
                sec_text = self._normalize_text(sec.get("content", ""))
                sec_words = set(sec_text.split())
                # Check if this section overlaps with this page
                overlap = page_words & sec_words
                if len(overlap) > len(page_words) * 0.05:  # at least 5% overlap to count
                    covered_words |= overlap

            coverage = len(covered_words) / len(page_words) if page_words else 1.0
            if coverage < 0.90:
                logger.debug(f"Page {p['page_num']}: {coverage:.0%} coverage ({len(covered_words)}/{len(page_words)} words)")
                gap_pages.append(p)

        return gap_pages

    async def _retry_gap_pages(self, gap_pages: list[dict], key_prefix: str) -> dict:
        """Retry gap pages individually with an explicit single-page prompt."""
        tasks = []
        for p in gap_pages:
            tasks.append(self._retry_single_page(p, key_prefix))

        results = await asyncio.gather(*tasks, return_exceptions=True)
        sections = {}
        for result in results:
            if isinstance(result, Exception):
                logger.error(f"Single-page retry failed: {result}")
                continue
            sections.update(result)
        return sections

    async def _retry_single_page(self, page: dict, key_prefix: str) -> dict:
        """Retry section splitting for a single page with explicit prompt."""
        async with self.sem:
            page_num = page["page_num"]
            prompt = f"""This is a single page (page {page_num}) from a construction standards document.
Categorize ALL text on this page into sections. Include every word.
If unsure of the section code, use "uncategorized_page_{page_num}".

Known section code patterns: numbered like 1.2.3, A.2.1, or named like "Foreword", "Table A.1".

Return JSON array:
[
  {{
    "section_code": "A.2.1",
    "title": "Section title",
    "page": {page_num},
    "content": "Full text of this section"
  }}
]

PAGE TEXT:
{page["text"]}"""

            try:
                result = await self.gemini.generate_json(prompt)
                sections = {}
                for sec in result:
                    code = sec.get("section_code") or f"uncategorized_page_{page_num}"
                    code_clean = str(code).replace(" ", "_")
                    key = f"{key_prefix}_{code_clean}"
                    # Avoid overwriting existing sections — append _retry suffix
                    if key in sections:
                        key = f"{key}_retry_{page_num}"
                    sections[key] = {
                        "section_code": code,
                        "title": sec.get("title") or "",
                        "page": page_num,
                        "content": sec.get("content") or "",
                        "doc_key_prefix": key_prefix,
                    }
                return sections
            except Exception as e:
                logger.error(f"Single-page retry failed for page {page_num}: {e}")
                return {}

    async def _describe_visual_content(self, pages: list[dict], doc_id: str, key_prefix: str):
        """Use LLM vision to describe tables/figures on pages that have visual content."""
        # Identify pages likely to have visual content based on text cues
        visual_pages = []
        for p in pages:
            text_lower = p["text"].lower()
            if any(kw in text_lower for kw in ["table ", "figure ", "fig.", "fig "]):
                visual_pages.append(p)

        if not visual_pages:
            logger.info("No visual content pages detected")
            return

        logger.info(f"Describing visual content on {len(visual_pages)} pages")

        tasks = []
        for p in visual_pages:
            tasks.append(self._describe_page_visuals(p, doc_id, key_prefix))

        results = await asyncio.gather(*tasks, return_exceptions=True)
        for result in results:
            if isinstance(result, Exception):
                logger.error(f"Visual description failed: {result}")

    async def _describe_page_visuals(self, page: dict, doc_id: str, key_prefix: str):
        """Describe visual content on a single page using LLM vision."""
        async with self.sem:
            prompt = """You are examining a page from a construction standards document (Eurocode).
Describe ALL visual elements on this page: tables, figures, diagrams, charts.

For each visual element found, provide:
- type: "table" or "figure"
- code: the identifier (e.g. "Table A.1", "Figure 6.2") if visible
- title: the caption or title text
- description: detailed description of the content

For tables: list all column headers and describe the data (materials, values, units).
For figures: describe what the diagram shows, any dimensions, labels, symbols.

Return JSON array:
[
  {
    "type": "table",
    "code": "Table A.1",
    "title": "Title text",
    "description": "Detailed description..."
  }
]

If no visual elements are found, return an empty array []."""

            try:
                from services.gemini import _parse_json_lenient
                raw = await self.gemini.generate_with_image(prompt, page["page_image_bytes"])
                if not raw:
                    return
                items = _parse_json_lenient(raw)
                if not isinstance(items, list):
                    return

                for item in items:
                    if not isinstance(item, dict):
                        continue
                    code = item.get("code") or f"page_{page['page_num']}_item"
                    code_key = str(code).replace(" ", "_").replace(".", "_")
                    obj_key = f"{key_prefix}_{code_key}"
                    r2_path = f"images/{doc_id}/page_{page['page_num']}.png"

                    self.store.objects[obj_key] = {
                        "type": item.get("type") or "unknown",
                        "code": str(code),
                        "title": item.get("title") or "",
                        "description": item.get("description") or "",
                        "page": page["page_num"],
                        "r2_path": r2_path,
                        "doc_id": doc_id,
                    }
            except Exception as e:
                logger.error(f"Visual description failed for page {page['page_num']}: {e}")

    async def _extract_references(self, sections: dict, known_codes: list[str], key_prefix: str):
        """Extract cross-references from each section."""
        # Build a concise list of known codes for the prompt
        codes_str = ", ".join(known_codes[:100])  # Limit to avoid huge prompts

        tasks = []
        for key, sec in sections.items():
            if len(sec.get("content", "")) > 50:  # Skip very short sections
                tasks.append(self._extract_refs_for_section(key, sec, codes_str, key_prefix))

        results = await asyncio.gather(*tasks, return_exceptions=True)
        for result in results:
            if isinstance(result, Exception):
                logger.error(f"Reference extraction failed: {result}")

    async def _extract_refs_for_section(self, key: str, sec: dict, codes_str: str, key_prefix: str):
        """Extract references from a single section."""
        async with self.sem:
            prompt = f"""Extract all references to other sections, tables, figures, formulae, annexes, or external documents from this text.

References are signalled by phrases like: "see X", "according to X", "given in X", "using X", "defined in X", "specified in X", "in accordance with X".

Things of format X.Y.Z (e.g. 4.2.1, 3.5, A.1) are likely section references.
"Table X.Y", "Figure X.Y", "Annex X", "EN XXXX" are also references.

Known section codes in this document: {codes_str}

Return JSON array:
[
  {{"target_code": "4.3.1", "target_type": "section"}},
  {{"target_code": "Table_6.8", "target_type": "table"}},
  {{"target_code": "EN_1992-1-1", "target_type": "external_document"}}
]

If no references found, return [].

Section text:
{sec['content'][:3000]}"""

            try:
                refs = await self.gemini.generate_json(prompt)
                ref_keys = []
                for ref in refs:
                    target = ref.get("target_code", "")
                    target_type = ref.get("target_type", "section")
                    # Build the full key for internal references
                    if target_type == "external_document":
                        ref_keys.append(target.replace(" ", "_"))
                    else:
                        target_clean = target.replace(" ", "_")
                        # Avoid double-prefix if LLM already included it
                        if target_clean.startswith(key_prefix):
                            ref_key = target_clean
                        else:
                            ref_key = f"{key_prefix}_{target_clean}"
                        ref_keys.append(ref_key)
                self.store.references[key] = ref_keys
            except Exception as e:
                logger.error(f"Reference extraction failed for {key}: {e}")
                self.store.references[key] = []

    async def _embed_and_upsert(self, sections: dict, doc_id: str, doc_name: str, key_prefix: str):
        """Create embeddings and upsert to Pinecone."""
        keys = []
        texts = []
        for key, sec in sections.items():
            # Combine section content with any object descriptions for richer embedding
            text = sec.get("content") or ""
            # Add object descriptions if they exist for this section's page
            for obj_key, obj in self.store.objects.items():
                if obj.get("page") == sec.get("page") and obj_key.startswith(key_prefix):
                    text += f"\n{obj.get('description') or ''}"
            text = text.strip()[:8000]
            if not text:
                continue  # Skip empty sections — OpenAI rejects empty inputs
            keys.append(key)
            texts.append(text)

        if not texts:
            return

        # Batch embed (Gemini supports batch)
        batch_size = 50
        all_embeddings = []
        for i in range(0, len(texts), batch_size):
            batch_texts = texts[i:i + batch_size]
            embeddings = await self.gemini.embed(batch_texts)
            all_embeddings.extend(embeddings)

        # Build vectors for Pinecone
        vectors = []
        for key, embedding in zip(keys, all_embeddings):
            sec = sections[key]
            vectors.append({
                "id": key,
                "values": embedding,
                "metadata": {
                    "doc_id": doc_id,
                    "doc_name": doc_name,
                    "section_code": sec.get("section_code", ""),
                    "page": sec.get("page", 0),
                    "text_preview": sec.get("content", "")[:500],
                },
            })

        self.pinecone.upsert(vectors)
        logger.info(f"Upserted {len(vectors)} vectors to Pinecone")

    async def _extract_precedence(self, pages: list[dict], key_prefix: str):
        """Extract precedence rules from the document."""
        # Use text from first ~20 pages where precedence is typically stated
        doc_text = "\n".join(p["text"] for p in pages[:20])[:10000]

        prompt = f"""You are analyzing a construction standards document for precedence rules.
Precedence means one code/standard supersedes, replaces, or takes priority over another.

Look for phrases like:
- "supersedes", "replaces", "takes precedence over"
- "in case of conflict, X shall prevail"
- "this standard replaces..."
- "National Annex may override..."

Return JSON array of precedence rules found:
[
  {{
    "section_code": "Section or clause where the rule is stated",
    "supersedes": ["list of codes that are superseded"],
    "superseded_by": ["list of codes that take priority"],
    "note": "Brief explanation"
  }}
]

If no precedence rules found, return [].

Document text:
{doc_text}"""

        try:
            rules = await self.gemini.generate_json(prompt)
            for rule in rules:
                code = rule.get("section_code", "general")
                code_clean = code.replace(" ", "_")
                key = f"{key_prefix}_{code_clean}"
                self.store.precedence[key] = {
                    "supersedes": rule.get("supersedes", []),
                    "superseded_by": rule.get("superseded_by", []),
                    "note": rule.get("note", ""),
                }
        except Exception as e:
            logger.error(f"Precedence extraction failed: {e}")

    async def _extract_kv_pairs(self, pages: list[dict], doc_id: str):
        """Extract key/value pairs (symbols, abbreviations) from the document."""
        # Symbols section is typically in first 15 pages; also check annex text
        doc_text = "\n".join(p["text"] for p in pages[:15])[:8000]

        prompt = f"""Extract all significant symbols, abbreviations, parameters, and their definitions from this construction standards document.

Look for:
- Symbol definitions (e.g. "Gk = characteristic value of permanent action")
- Abbreviations (e.g. "CPD = Construction Products Directive")
- Parameter mappings (e.g. "γ = density")
- Named quantities with their meanings

Return JSON object mapping each key to its definition:
{{
  "Gk": "characteristic value of a permanent action",
  "Qk": "characteristic value of a single variable action",
  "γ": "density or unit weight"
}}

Document text:
{doc_text}"""

        try:
            kv_pairs = await self.gemini.generate_json(prompt)
            for k, v in kv_pairs.items():
                self.store.kv_store[k] = {
                    "value": v,
                    "doc_id": doc_id,
                }
        except Exception as e:
            logger.error(f"KV extraction failed: {e}")


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

def _cluster_rects(rects: list[fitz.Rect], merge_distance: float = 10) -> list[fitz.Rect]:
    if not rects:
        return []
    expanded = [r + (-merge_distance, -merge_distance,
                      merge_distance, merge_distance) for r in rects]
    return _merge_overlapping_rects(expanded)


def _merge_overlapping_rects(rects: list[fitz.Rect]) -> list[fitz.Rect]:
    if not rects:
        return []
    merged = list(rects)
    changed = True
    while changed:
        changed = False
        new_merged = []
        used = set()
        for i in range(len(merged)):
            if i in used:
                continue
            current = fitz.Rect(merged[i])
            for j in range(i + 1, len(merged)):
                if j in used:
                    continue
                if current.intersects(merged[j]):
                    current = current | merged[j]
                    used.add(j)
                    changed = True
            new_merged.append(current)
            used.add(i)
        merged = new_merged
    return merged


def _is_meaningful_image(img: Image.Image, min_std: float = 15.0) -> bool:
    arr = np.array(img.convert("L"))
    if arr.size < 500:
        return False
    if arr.std() < min_std:
        return False
    return True
