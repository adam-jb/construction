# Implementation Plan

This is the plan for implementing the algo_masterplan. It overwrites all the dummy service code in `backend/services/` and rewires the API endpoints to use the correct tech stack.

## Tech Stack (per masterplan)

| Component | Current (dummy) | Target |
|-----------|-----------------|--------|
| LLM | OpenAI GPT-4 | Gemini 2.5 Flash Lite |
| Embeddings | OpenAI text-embedding-3 | Gemini embeddings |
| Vector DB | GCP Vertex AI Vector Search | Pinecone |
| File storage | GCP Cloud Storage | Cloudflare R2 (S3-compatible) |
| Graph DB | Neo4j | **None** — plain dictionaries in JSON on R2 |
| Metadata DB | PostgreSQL | JSON files on R2 |

The masterplan says: *"our datastores are a bunch of dictionaries. We don't need a graph db."*

---

## 1. Data Stores — All JSON on R2

All stored as JSON files in R2. One file per store. Loaded into memory on startup, written back on mutation.

**Key format (CRITICAL — used everywhere consistently):** `{publisher}_{doc_code}_{item_code}` joined by underscores.

Examples:
- Section: `BSI_EN_1991-1-1_4.2.1`
- Table: `BSI_EN_1991-1-1_table_A.1`
- Figure: `BSI_EN_1991-1-1_figure_5.1`
- Formula: `BSI_EN_1991-1-1_eq_6.10`
- External doc ref: `CEN_EN_1992-1-1` (no item code, just the doc)

The publisher and doc_code are extracted during ingestion by the LLM (step 4) and stored in the document record. All downstream keys for sections/tables/figures/formulae within that document use the same `publisher_doccode` prefix.

**R2 bucket structure:**
```
r2://
  datastore/
    sections.json          # section_key → {content, page, doc_name, section_code}
    references.json        # section_key → [list of section_keys it refers to]
    precedence.json        # section_key → {superseded_by: [...], supersedes: [...], source: "..."}
    kv_store.json          # arbitrary key → value (symbols, acronyms, parameter mappings)
    documents.json         # doc_id → {publisher, code, name, short_name, type, pages, status, uploaded_at, file_key}
    formulae.json          # publisher_doccode_formulacode → {latex/text, description, variables}
    objects.json           # publisher_doccode_objectcode → {type: "figure"|"table", r2_path, description, page}
  pdfs/
    {doc_id}.pdf           # uploaded PDFs
  images/
    {doc_id}/
      page_{n}.png         # rendered pages
      {object_key}.png     # extracted figures/tables
```

**In Python, each store is just a dict loaded from JSON:**

```python
# services/datastore.py
import json, boto3

class DataStore:
    """All dictionaries, backed by JSON files in R2."""

    def __init__(self, r2_url: str, access_key: str, secret_key: str, bucket: str):
        self.s3 = boto3.client("s3",
            endpoint_url=r2_url,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
        )
        self.bucket = bucket
        # Each store is a dict in memory
        self.sections: dict = {}       # key → {content, page, doc_name, ...}
        self.references: dict = {}     # key → [referenced_keys]
        self.precedence: dict = {}     # key → {superseded_by, supersedes, source}
        self.kv_store: dict = {}       # arbitrary lookups
        self.documents: dict = {}      # doc_id → doc metadata
        self.formulae: dict = {}       # formula_key → formula data
        self.objects: dict = {}        # object_key → {type, r2_path, description, page}

    def load_all(self):
        """Load all JSON files from R2 into memory."""
        for name in ["sections", "references", "precedence", "kv_store",
                      "documents", "formulae", "objects"]:
            try:
                obj = self.s3.get_object(Bucket=self.bucket, Key=f"datastore/{name}.json")
                setattr(self, name, json.loads(obj["Body"].read()))
            except self.s3.exceptions.NoSuchKey:
                pass  # empty dict is fine

    def save(self, name: str):
        """Write one store back to R2."""
        data = json.dumps(getattr(self, name), ensure_ascii=False)
        self.s3.put_object(Bucket=self.bucket, Key=f"datastore/{name}.json",
                           Body=data.encode(), ContentType="application/json")

    def save_all(self):
        for name in ["sections", "references", "precedence", "kv_store",
                      "documents", "formulae", "objects"]:
            self.save(name)
```

Simple. No ORM, no migrations, no schema. Just dicts.

### Multi-user / multi-upload availability

The stores are loaded into memory in a single server process. When user A uploads a PDF, the background processing task updates the in-memory dicts and calls `save()` to write them back to R2. Because all requests route to the same process, user B's next request will immediately see the updated in-memory data — no reload needed.

Pinecone is a cloud service, so new vectors are globally visible as soon as the upsert completes (Pinecone's eventual consistency is typically <1 second).

For images/PDFs on R2, they're available to all users the moment the `put_object` call returns.

The `save()` call after each mutation (not just at shutdown) is key — if the server crashes, the last-saved state is in R2 and gets reloaded on restart. We call `save()` after every document ingestion completes, not only at shutdown.

If we ever need multiple server instances, we'd add a `load_all()` call at the start of each request (or poll R2 on a timer). But single-instance is correct for now.

---

## 2. Config — Rewrite `core/config.py`

Strip out Neo4j, GCP, OpenAI. Replace with:

The blank-string defaults are not a problem. `pydantic-settings` with `env_file = ".env"` reads `.env` at import time and overrides every field that has a matching env var. So `GEMINI_API_KEY: str = ""` in the class means "required at runtime, but don't crash at import time if .env hasn't been loaded yet." The actual value comes from `.env`. If someone forgets to set a key, the first call to that service will fail with a clear API error — no silent corruption.

```python
class Settings(BaseSettings):
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    # Gemini
    GEMINI_API_KEY: str = ""

    # Pinecone
    PINECONE_API_KEY: str = ""
    PINECONE_INDEX_NAME: str = "construction-docs"

    # Cloudflare R2 (S3-compatible)
    R2_ENDPOINT_URL: str = ""
    R2_ACCESS_KEY_ID: str = ""
    R2_SECRET_ACCESS_KEY: str = ""
    R2_BUCKET_NAME: str = "project-machine-test"

    # Processing
    MAX_UPLOAD_SIZE_MB: int = 100
    CHUNK_SIZE: int = 1000
    CHUNK_OVERLAP: int = 200

    class Config:
        env_file = ".env"
        case_sensitive = True
```

---

## 3. Services — What Gets Created/Rewritten

### 3a. `services/datastore.py` (NEW)
The dict-backed store above. ~80 lines.

### 3b. `services/gemini.py` (NEW — replaces LLM + embeddings)
Single wrapper for all Gemini calls. Uses `google-generativeai` library.

```python
import google.generativeai as genai

class GeminiService:
    def __init__(self, api_key: str):
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel("gemini-2.5-flash-lite")

    async def generate(self, prompt: str, system: str = "") -> str:
        """Simple text generation."""
        response = await self.model.generate_content_async(
            contents=prompt,
            generation_config={"temperature": 0.1},
            system_instruction=system if system else None,
        )
        return response.text

    async def generate_with_image(self, prompt: str, image_bytes: bytes) -> str:
        """Vision call for describing figures/tables."""
        import PIL.Image, io
        img = PIL.Image.open(io.BytesIO(image_bytes))
        response = await self.model.generate_content_async([prompt, img])
        return response.text

    async def embed(self, texts: list[str]) -> list[list[float]]:
        """Batch embed using Gemini embedding model."""
        result = genai.embed_content(
            model="models/text-embedding-004",
            content=texts,
            task_type="retrieval_document",
        )
        return result["embedding"]

    async def embed_query(self, text: str) -> list[float]:
        """Embed a single query (uses retrieval_query task type)."""
        result = genai.embed_content(
            model="models/text-embedding-004",
            content=text,
            task_type="retrieval_query",
        )
        return result["embedding"]
```

### 3c. `services/pinecone_search.py` (NEW — replaces vector_search.py)

```python
from pinecone import Pinecone

class PineconeSearch:
    def __init__(self, api_key: str, index_name: str):
        self.pc = Pinecone(api_key=api_key)
        self.index = self.pc.Index(index_name)

    def upsert(self, vectors: list[dict]):
        """vectors = [{"id": key, "values": [...], "metadata": {...}}, ...]"""
        self.index.upsert(vectors=vectors, namespace="sections")

    def search(self, query_vector: list[float], top_k: int = 10,
               filter: dict = None) -> list[dict]:
        results = self.index.query(
            vector=query_vector, top_k=top_k, namespace="sections",
            include_metadata=True, filter=filter,
        )
        return [
            {"id": m.id, "score": m.score, **m.metadata}
            for m in results.matches
        ]

    def delete_by_doc(self, doc_id: str):
        self.index.delete(filter={"doc_id": doc_id}, namespace="sections")
```

### 3d. `services/document_processor.py` (REWRITE)
The big one. PDF ingestion per masterplan steps.

**Overall flow:**
```
process_pdf(file_bytes, doc_id)
  ├── 1. Extract text page-by-page (PyMuPDF)
  ├── 2. Find image/table bounding boxes per page (PyMuPDF)
  ├── 3. Crop and save images to R2
  ├── 4. LLM: split text into sections (one call per ~5 pages batched)
  ├── 5. LLM: describe images/tables (vision, one call per image)
  ├── 6. LLM: extract references from each section
  ├── 7. Create embeddings (Gemini, batched)
  ├── 8. Upsert to Pinecone
  ├── 9. LLM: extract precedence rules
  ├── 10. LLM: scan for KV pairs (symbols, acronyms)
  └── 11. Write all stores back to R2
```

Key details:

**Step 1-2: Text + image/figure extraction (PyMuPDF, no LLM)**

`doc.extract_image(xref)` is NOT reliable for construction code PDFs. It pulls every embedded raster image — including tiny decorative elements, watermarks, logos, background textures, page borders, and 1x1 pixel spacer images. Old scanned PDFs are especially bad for this.

Instead, we use a **render-and-crop** approach that catches everything: raster images, vector diagrams, tables drawn with lines, charts, and any other visual content.

**How it works:**

1. Render each page at high DPI (200 DPI) as a full-page PNG using PyMuPDF.
2. Get the structured text layout via `page.get_text("dict")` which returns text blocks with bounding boxes.
3. Identify **non-text regions**: areas of the page not covered by text blocks, above a minimum size threshold.
4. Also detect embedded images via `page.get_images()` but only as supplementary hints — filter aggressively by size.
5. Merge overlapping candidate regions.
6. Crop candidate regions from the rendered page image.
7. Filter out crops that are too small or too uniform (solid backgrounds/borders).

This catches figures that are vector drawings (not raster images), tables drawn with ruling lines, diagrams composed of paths, and properly-embedded raster figures — all of which `extract_image(xref)` would miss or mishandle.

```python
import fitz  # PyMuPDF
from PIL import Image
import io
import numpy as np

# Minimum dimensions for a region to be considered a figure/table (% of page)
MIN_REGION_WIDTH_PCT = 0.15   # at least 15% of page width
MIN_REGION_HEIGHT_PCT = 0.08  # at least 8% of page height
RENDER_DPI = 200

def extract_pages(pdf_bytes: bytes) -> list[dict]:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    pages = []
    for i, page in enumerate(doc):
        text = page.get_text("text")
        text_dict = page.get_text("dict")  # structured layout with bboxes
        page_rect = page.rect
        pw, ph = page_rect.width, page_rect.height

        # Render full page as image
        pix = page.get_pixmap(dpi=RENDER_DPI)
        page_img = Image.open(io.BytesIO(pix.tobytes("png")))
        img_w, img_h = page_img.size
        scale_x, scale_y = img_w / pw, img_h / ph

        # Collect all text block bounding boxes
        text_rects = []
        for block in text_dict.get("blocks", []):
            if block["type"] == 0:  # text block
                bbox = block["bbox"]  # (x0, y0, x1, y1) in PDF coords
                text_rects.append(fitz.Rect(bbox))

        # Find candidate non-text regions:
        # 1. Embedded images (filtered by size)
        # 2. Drawing clusters (vector graphics)
        # 3. Large gaps between text blocks
        candidates = []

        # Method A: Embedded raster images, filtered by size
        for img_info in page.get_images(full=True):
            xref = img_info[0]
            try:
                img_rect = page.get_image_rects(img_info)
                for rect in img_rect:
                    if (rect.width / pw >= MIN_REGION_WIDTH_PCT and
                        rect.height / ph >= MIN_REGION_HEIGHT_PCT):
                        candidates.append(rect)
            except Exception:
                pass

        # Method B: Drawing/path clusters (vector diagrams, table lines)
        drawings = page.get_drawings()
        if drawings:
            # Cluster nearby drawings into regions
            draw_rects = [fitz.Rect(d["rect"]) for d in drawings]
            clusters = _cluster_rects(draw_rects, merge_distance=10)
            for cluster_rect in clusters:
                if (cluster_rect.width / pw >= MIN_REGION_WIDTH_PCT and
                    cluster_rect.height / ph >= MIN_REGION_HEIGHT_PCT):
                    # Check it's not just a single ruling line
                    if cluster_rect.width > 5 and cluster_rect.height > 5:
                        candidates.append(cluster_rect)

        # Method C: Image blocks from text dict (type == 1)
        for block in text_dict.get("blocks", []):
            if block["type"] == 1:  # image block
                rect = fitz.Rect(block["bbox"])
                if (rect.width / pw >= MIN_REGION_WIDTH_PCT and
                    rect.height / ph >= MIN_REGION_HEIGHT_PCT):
                    candidates.append(rect)

        # Merge overlapping candidates
        merged = _merge_overlapping_rects(candidates)

        # Crop each candidate from the rendered page image
        figures = []
        for rect in merged:
            # Convert PDF coords to pixel coords
            x0 = int(rect.x0 * scale_x)
            y0 = int(rect.y0 * scale_y)
            x1 = int(rect.x1 * scale_x)
            y1 = int(rect.y1 * scale_y)
            crop = page_img.crop((x0, y0, x1, y1))

            # Filter out near-blank crops (solid color, noise)
            if _is_meaningful_image(crop):
                buf = io.BytesIO()
                crop.save(buf, format="PNG")
                figures.append({
                    "bytes": buf.getvalue(),
                    "bbox": (rect.x0, rect.y0, rect.x1, rect.y1),
                    "page_num": i + 1,
                })

        pages.append({
            "page_num": i + 1,
            "text": text,
            "figures": figures,
            "page_image_bytes": pix.tobytes("png"),  # full page for later use
        })
    return pages


def _cluster_rects(rects: list, merge_distance: float = 10) -> list:
    """Merge nearby rectangles into clusters (for grouping drawing paths)."""
    if not rects:
        return []
    # Expand each rect by merge_distance, then merge overlapping
    expanded = [r + (-merge_distance, -merge_distance,
                      merge_distance, merge_distance) for r in rects]
    return _merge_overlapping_rects(expanded)


def _merge_overlapping_rects(rects: list) -> list:
    """Union overlapping rectangles until no more overlaps."""
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
            current = merged[i]
            for j in range(i + 1, len(merged)):
                if j in used:
                    continue
                if current.intersects(merged[j]):
                    current = current | merged[j]  # union
                    used.add(j)
                    changed = True
            new_merged.append(current)
            used.add(i)
        merged = new_merged
    return merged


def _is_meaningful_image(img: Image.Image, min_std: float = 15.0) -> bool:
    """Filter out near-blank or solid-color crops."""
    arr = np.array(img.convert("L"))  # grayscale
    if arr.std() < min_std:
        return False  # near-uniform = probably blank/background
    if arr.size < 500:
        return False  # too tiny
    return True
```

**Speed optimisations for extraction (applied in step 1-2 and throughout):**
- Pages are processed with `concurrent.futures.ThreadPoolExecutor` since PyMuPDF releases the GIL during rendering. Render all pages in parallel.
- Figures are cropped from the already-rendered page image (no re-render).
- Text extraction (`get_text`) is very fast in PyMuPDF (C-based).
- LLM calls in later steps use `asyncio.gather` for concurrency.
- Embedding calls are batched (Gemini supports batch embedding).
- Pinecone upserts are batched (up to 100 vectors per call).

**Step 4: Section splitting (LLM)**
Batch ~5 pages of text per call. Prompt:
```
Given the following pages from a construction standards document,
identify all sections and their boundaries. Return JSON:
[{"section_code": "4.2.1", "title": "...", "start_page": N, "content": "full text of section"}]
Sections are typically numbered like 1.2.3 or A.2.1. Include clause text, notes, and any sub-clauses.
```

**Step 6: Reference extraction (LLM)**
Per section, prompt:
```
Extract all references to other sections, tables, figures, formulae, annexes, or
external documents from this text. Return JSON:
[{"reference_text": "see 4.3.1", "target_code": "4.3.1", "target_type": "section"},
 {"reference_text": "Table 5.1", "target_code": "table_5.1", "target_type": "table"},
 {"reference_text": "EN 1992-1-1", "target_code": "EN_1992-1-1", "target_type": "external_document"}]
References are often signalled by: 'see X', 'according to X', 'given in X', 'using X', etc.
Things of the format X.Y.Z are likely section references. Table/Figure/Annex followed by a
number are also references.
```

**Step 7-8: Embeddings + Pinecone upsert**
```python
# For each section, embed: section content + any image descriptions
texts = [section["content"] for section in sections]
embeddings = await gemini.embed(texts)  # batch call

vectors = []
for section, embedding in zip(sections, embeddings):
    key = f"{publisher}_{doc_code}_{section['section_code']}"
    vectors.append({
        "id": key,
        "values": embedding,
        "metadata": {
            "doc_id": doc_id,
            "doc_name": doc_name,
            "section_code": section["section_code"],
            "page": section["start_page"],
            "text_preview": section["content"][:500],
        },
    })
pinecone.upsert(vectors)
```

**Image/table descriptions (Step 5)** also get embedded and stored in the objects store, with the description used as the chunk text for Pinecone so they're searchable.

### 3e. `services/query_engine.py` (REWRITE)
The query pipeline per masterplan steps 1-11.

```python
class QueryEngine:
    def __init__(self, gemini: GeminiService, pinecone: PineconeSearch, store: DataStore):
        self.gemini = gemini
        self.pinecone = pinecone
        self.store = store

    async def query(self, query_text: str, doc_ids: list[str] = None,
                    previous_results: dict = None) -> dict:
        # Step 1: Check if query needs a search at all
        intent = await self._classify_intent(query_text, previous_results)
        if intent == "greeting":
            return {"answer": "Hello! Ask me about construction codes.", "references": []}
        if intent == "clarification_needed":
            return {"answer": "Could you be more specific?", "references": []}
        if intent == "follow_up":
            # User is asking about results we already have — LLM answers from previous results
            return await self._answer_follow_up(query_text, previous_results)

        # Step 2: RAG — vector search, top 10
        query_embedding = await self.gemini.embed_query(query_text)
        pc_filter = {"doc_id": {"$in": doc_ids}} if doc_ids else None
        hits = self.pinecone.search(query_embedding, top_k=10, filter=pc_filter)

        # Step 3: Keyword extraction + KV equivalency on ALL query words + keyword search
        keywords = await self._extract_keywords(query_text)
        expanded_query_terms = self._expand_all_words_with_kv(query_text)
        all_search_terms = list(set(keywords) | set(expanded_query_terms))
        keyword_hits = self._keyword_search(all_search_terms)
        all_section_keys = list({h["id"] for h in hits} | set(keyword_hits))

        # Step 4: LLM relevance check on all retrieved sections
        relevant, borderline = await self._check_relevance(query_text, all_section_keys)

        # Step 5: Expand if 2 least-relevant vector hits still have info
        round_num = 0
        while self._should_expand(hits, relevant) and round_num < 3:
            round_num += 1
            next_hits = self.pinecone.search(query_embedding, top_k=10 * (round_num + 1),
                                              filter=pc_filter)
            new_keys = [h["id"] for h in next_hits if h["id"] not in all_section_keys]
            all_section_keys.extend(new_keys)
            new_relevant, _ = await self._check_relevance(query_text, new_keys)
            relevant.update(new_relevant)
            if not new_relevant:
                break

        # Step 6-8: Follow references (up to 3rd order)
        first_order_refs = self._get_references(relevant.keys())
        rel_1st, _ = await self._check_relevance(query_text, first_order_refs)
        relevant.update(rel_1st)

        second_order_refs = self._get_references(rel_1st.keys())
        rel_2nd, _ = await self._check_relevance(query_text, second_order_refs)
        relevant.update(rel_2nd)

        third_order_refs = self._get_references(rel_2nd.keys())
        rel_3rd, _ = await self._check_relevance(query_text, third_order_refs)
        relevant.update(rel_3rd)

        # Note further refs without following
        unfollowed_refs = self._get_references(rel_3rd.keys())

        # Step 9: Check precedence
        precedence_notes = self._check_precedence(relevant.keys())

        # Step 10: Check for conflicts
        conflicts = await self._check_conflicts(query_text, relevant)

        # Step 11: Build final answer
        answer = await self._synthesize_answer(
            query_text, relevant, precedence_notes, conflicts, unfollowed_refs
        )
        return answer
```

**Helper methods explained:**

`_classify_intent(query_text, previous_results)`: Single Gemini call. Prompt includes whether previous results exist. Returns one of:
- `"greeting"` — user said hello, no search needed
- `"clarification_needed"` — too vague, ask user to be more specific
- `"follow_up"` — user is asking about or refining previous results (e.g. "what about the thermal expansion part?", "can you explain that table?"). Only possible when `previous_results` is not None.
- `"query"` — real search query, run the full pipeline

`_answer_follow_up(query_text, previous_results)`: Gemini call with the user's follow-up question and the full previous results (extracted text, references, answer). The LLM tries to answer purely from what we already have, without re-searching. If the LLM determines it can't answer from existing results, it returns a signal to fall through to a full query instead.

`_extract_keywords`: Gemini call. "Extract 1-5 search keywords from this query. Be conservative — don't pick too many." Returns list of strings.

`_expand_all_words_with_kv`: Tokenise the *entire query* into words and multi-word phrases (bigrams, trigrams). For **every** word and phrase, check `store.kv_store` for equivalents. E.g. if query is "what is the aA for dead loads", we check "aA", "dead", "loads", "dead loads", etc. "aA" might map to "reduction factor", "dead loads" might map to "permanent actions". All found equivalents become additional search terms alongside the LLM-extracted keywords. This catches domain jargon the keyword extractor might miss.

`_keyword_search`: Simple substring search across all section content in `store.sections`. Returns matching section keys.

`_check_relevance`: For a batch of section keys, load their content from `store.sections`, send to Gemini: "Which parts of these sections are relevant to the query '{query}'? Return JSON: {section_key: 'extracted relevant text' or null if not relevant}". Returns two dicts: relevant (key→extracted text) and borderline.

`_should_expand`: Check if the 2 lowest-scoring vector hits (by Pinecone score) ended up having relevant info after the LLM relevance check. If yes, there may be more relevant results further down the ranking.

`_get_references`: Look up `store.references[key]` for each key, return the union of all referenced section keys that aren't already in the relevant set.

`_check_precedence`: For each relevant section key, look up `store.precedence[key]`. Return any precedence notes.

`_check_conflicts`: Gemini call with all relevant extracted text. "Do any of these extracts conflict with each other? If so, describe the conflicts."

`_synthesize_answer`: Final Gemini call. Builds a prompt with all relevant extracts, precedence notes, conflicts, and unfollowed references. Returns structured answer with references list.

### 3f. `services/graph_service.py` → DELETE

No graph DB. The reference traversal is done via `store.references` dict lookups. The `/references/{id}/context` endpoint builds GraphContext nodes/edges from the dict data:

```python
# In the references API endpoint
def build_graph_context(section_key: str, store: DataStore, depth: int = 2) -> dict:
    """Build GraphContext response from dict-based reference data."""
    nodes = []
    edges = []
    visited = set()

    def traverse(key, current_depth):
        if key in visited or current_depth > depth:
            return
        visited.add(key)
        section = store.sections.get(key)
        if not section:
            return
        nodes.append({
            "id": key,
            "type": section.get("type", "section"),
            "label": section.get("section_code", key),
            "documentId": section.get("doc_id"),
            "page": section.get("page"),
        })
        for ref_key in store.references.get(key, []):
            edges.append({
                "id": f"{key}__{ref_key}",
                "source": key,
                "target": ref_key,
                "type": "references",
            })
            traverse(ref_key, current_depth + 1)

    traverse(section_key, 0)
    return {"nodes": nodes, "edges": edges, "focusNodeId": section_key}
```

---

## 4. API Endpoints — What Changes

All endpoints already exist in the right shape (they match the openapi.yaml). The changes are wiring them to real services instead of returning mocks.

### `GET /api/v1/health`
Check Gemini, Pinecone, R2 connectivity. Return service statuses.

### `POST /api/v1/documents` (upload)
1. Validate PDF
2. Generate doc_id (uuid)
3. Upload raw PDF to R2 (`pdfs/{doc_id}.pdf`)
4. Run `document_processor.process_pdf()` (in background via `asyncio.create_task`)
5. Return 202 with doc_id and status "processing"

### `GET /api/v1/documents`
Read `store.documents`, paginate, filter by type.

### `GET /api/v1/documents/{id}`
Lookup `store.documents[id]`.

### `DELETE /api/v1/documents/{id}`
Remove from all stores + Pinecone + R2. Save stores.

### `GET /api/v1/documents/{id}/pages/{pageNumber}`
Serve page image URL from R2, text from extracted pages.

### `POST /api/v1/query`
Call `query_engine.query()`. Format response per QueryResponse schema.

### `GET /api/v1/references/{id}`
Lookup section in `store.sections`, return as Reference schema.

### `GET /api/v1/references/{id}/context`
Call `build_graph_context()` to build nodes/edges from dict data.

### `GET /api/v1/debug/ingestion/{documentId}` (NEW — ingestion verification)

Returns an HTML page you can open in a browser to visually verify everything we ingested. Pass `?page=N` to see a single page, or omit for the whole document. Debug-only (disabled when `DEBUG=False`).

**What it shows, per page:**

1. **Original page render** — the full-page PNG we rendered at 200 DPI, as a reference to compare against
2. **Extracted text** — the raw text we got from PyMuPDF, displayed in a `<pre>` block so you can see exactly what the text extraction produced
3. **Detected figures/images** — each cropped image shown inline with its bounding box coordinates and the LLM-generated description underneath
4. **Sections on this page** — every section that starts on or spans this page, with its key (`BSI_EN_1991-1-1_4.2.1`), title, and full extracted content
5. **References found** — for each section on this page, the list of outgoing references (with target keys and types)
6. **KV pairs** — any key-value mappings extracted from content on this page
7. **Precedence rules** — any precedence info attached to sections on this page
8. **Objects** — any tables/figures registered in the objects store for this page, with their stored image and description

All images are embedded as base64 data URIs — no external requests needed, the HTML is fully self-contained. Open it in any browser to verify.

**Implementation** — lives in a new file `backend/api/v1/debug.py`:

```python
# backend/api/v1/debug.py
import base64
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import HTMLResponse

router = APIRouter()


@router.get("/debug/ingestion/{document_id}", response_class=HTMLResponse)
async def debug_ingestion(document_id: str, request: Request, page: int = None):
    """Visual verification of everything ingested for a document (or single page)."""
    store = request.app.state.store

    doc = store.documents.get(document_id)
    if not doc:
        raise HTTPException(404, "Document not found")

    publisher = doc["publisher"]
    doc_code = doc["code"]
    key_prefix = f"{publisher}_{doc_code}"

    # Collect all sections for this document
    doc_sections = {
        k: v for k, v in store.sections.items() if k.startswith(key_prefix)
    }

    # Filter to a specific page if requested
    if page is not None:
        doc_sections = {
            k: v for k, v in doc_sections.items() if v.get("page") == page
        }

    # Build HTML
    html_parts = [
        "<!DOCTYPE html><html><head>",
        "<meta charset='utf-8'>",
        f"<title>Ingestion Debug: {doc.get('name', document_id)}</title>",
        "<style>",
        "  body { font-family: system-ui, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; }",
        "  .page-block { border: 2px solid #333; margin: 30px 0; padding: 20px; }",
        "  .page-header { background: #1a1a2e; color: white; padding: 10px 15px; margin: -20px -20px 20px; }",
        "  .section-block { background: #f0f4f8; border-left: 4px solid #2563eb; padding: 12px; margin: 10px 0; }",
        "  .figure-block { background: #fef3c7; border-left: 4px solid #d97706; padding: 12px; margin: 10px 0; }",
        "  .ref-block { background: #ecfdf5; border-left: 4px solid #059669; padding: 8px 12px; margin: 5px 0; }",
        "  .kv-block { background: #faf5ff; border-left: 4px solid #7c3aed; padding: 8px 12px; margin: 5px 0; }",
        "  .prec-block { background: #fff1f2; border-left: 4px solid #e11d48; padding: 8px 12px; margin: 5px 0; }",
        "  pre { white-space: pre-wrap; background: #f8f8f8; padding: 10px; overflow-x: auto; ",
        "        font-size: 13px; border: 1px solid #ddd; }",
        "  img { max-width: 100%; border: 1px solid #ccc; }",
        "  h2 { border-bottom: 1px solid #ccc; padding-bottom: 5px; }",
        "  .key { font-family: monospace; background: #e2e8f0; padding: 2px 6px; border-radius: 3px; }",
        "  .score { color: #666; font-size: 0.85em; }",
        "</style></head><body>",
        f"<h1>Ingestion Debug: {doc.get('name', document_id)}</h1>",
        f"<p>Publisher: <b>{publisher}</b> | Code: <b>{doc_code}</b> | "
        f"Pages: <b>{doc.get('pages', '?')}</b> | Status: <b>{doc.get('status')}</b></p>",
    ]

    # Determine pages to show
    page_nums = sorted(set(v.get("page", 0) for v in doc_sections.values()))
    if page is not None:
        page_nums = [page]

    for pg in page_nums:
        html_parts.append(f'<div class="page-block">')
        html_parts.append(f'<div class="page-header"><h2>Page {pg}</h2></div>')

        # 1. Full page render from R2
        page_image_key = f"images/{document_id}/page_{pg}.png"
        page_img_bytes = _fetch_r2_image(store, page_image_key)
        if page_img_bytes:
            b64 = base64.b64encode(page_img_bytes).decode()
            html_parts.append("<h3>Original Page Render</h3>")
            html_parts.append(f'<img src="data:image/png;base64,{b64}" />')

        # 2. Sections on this page
        page_sections = {k: v for k, v in doc_sections.items() if v.get("page") == pg}
        if page_sections:
            html_parts.append("<h3>Sections</h3>")
            for key, sec in sorted(page_sections.items()):
                html_parts.append(f'<div class="section-block">')
                html_parts.append(f'<b>Key:</b> <span class="key">{key}</span><br>')
                html_parts.append(f'<b>Title:</b> {sec.get("title", "—")}<br>')
                html_parts.append(f"<pre>{sec.get('content', '(no content)')}</pre>")

                # References for this section
                refs = store.references.get(key, [])
                if refs:
                    html_parts.append("<b>References:</b>")
                    for ref in refs:
                        html_parts.append(f'<div class="ref-block">{ref}</div>')

                # Precedence for this section
                prec = store.precedence.get(key)
                if prec:
                    html_parts.append("<b>Precedence:</b>")
                    html_parts.append(f'<div class="prec-block"><pre>{prec}</pre></div>')

                html_parts.append("</div>")

        # 3. Figures/objects on this page
        page_objects = {
            k: v for k, v in store.objects.items()
            if k.startswith(key_prefix) and v.get("page") == pg
        }
        if page_objects:
            html_parts.append("<h3>Figures / Tables / Objects</h3>")
            for key, obj in sorted(page_objects.items()):
                html_parts.append(f'<div class="figure-block">')
                html_parts.append(f'<b>Key:</b> <span class="key">{key}</span> '
                                  f'| Type: <b>{obj.get("type", "?")}</b><br>')
                # Load image from R2
                obj_img = _fetch_r2_image(store, obj.get("r2_path", ""))
                if obj_img:
                    b64 = base64.b64encode(obj_img).decode()
                    html_parts.append(f'<img src="data:image/png;base64,{b64}" /><br>')
                html_parts.append(f'<b>Description:</b> {obj.get("description", "(none)")}<br>')
                html_parts.append("</div>")

        # 4. KV pairs mentioning this page (scan for entries sourced from this page)
        page_kvs = {
            k: v for k, v in store.kv_store.items()
            if isinstance(v, dict) and v.get("source_page") == pg
            and v.get("doc_id") == document_id
        }
        if page_kvs:
            html_parts.append("<h3>KV Store Entries</h3>")
            for k, v in sorted(page_kvs.items()):
                html_parts.append(f'<div class="kv-block">'
                                  f'<span class="key">{k}</span> = {v.get("value", v)}</div>')

        html_parts.append("</div>")  # close page-block

    html_parts.append("</body></html>")
    return HTMLResponse("".join(html_parts))


def _fetch_r2_image(store, key: str) -> bytes | None:
    """Fetch an image from R2, return bytes or None."""
    try:
        obj = store.s3.get_object(Bucket=store.bucket, Key=key)
        return obj["Body"].read()
    except Exception:
        return None
```

**Wire it up in `main.py`** (debug-only):
```python
from api.v1 import debug

if settings.DEBUG:
    app.include_router(debug.router, prefix="/api/v1", tags=["debug"])
```

**Usage:**
- `GET /api/v1/debug/ingestion/abc123` — full document, all pages
- `GET /api/v1/debug/ingestion/abc123?page=5` — just page 5
- Open the URL in a browser. Everything renders inline — original page, extracted text, cropped figures, section content, references, KV pairs, precedence. Compare side-by-side with the actual PDF to verify ingestion quality.

---

## 5. `requirements.txt` — New Dependencies

```
# Web Framework
fastapi==0.115.0
uvicorn[standard]==0.32.0
pydantic==2.9.0
pydantic-settings==2.5.0
python-multipart==0.0.12
python-dotenv==1.0.1

# PDF Processing
PyMuPDF==1.24.0

# AI / Embeddings
google-generativeai>=0.8.0

# Vector Search
pinecone-client>=5.0.0

# R2 / S3
boto3>=1.35.0

# Utilities
httpx==0.27.0
aiofiles==24.1.0
Pillow>=10.0.0
```

Removed: openai, langchain, langchain-openai, neo4j, google-cloud-storage, google-cloud-aiplatform, pdfplumber, python-jose, passlib.

Added: google-generativeai, pinecone-client, boto3, Pillow.

---

## 6. `main.py` — Startup Changes

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: load datastores from R2
    store = DataStore(
        r2_url=settings.R2_ENDPOINT_URL,
        access_key=settings.R2_ACCESS_KEY_ID,
        secret_key=settings.R2_SECRET_ACCESS_KEY,
        bucket=settings.R2_BUCKET_NAME,
    )
    store.load_all()

    gemini = GeminiService(settings.GEMINI_API_KEY)
    pinecone = PineconeSearch(settings.PINECONE_API_KEY, settings.PINECONE_INDEX_NAME)
    query_engine = QueryEngine(gemini, pinecone, store)

    # Attach to app state so endpoints can access
    app.state.store = store
    app.state.gemini = gemini
    app.state.pinecone = pinecone
    app.state.query_engine = query_engine

    yield

    # Shutdown: save all stores
    store.save_all()
```

Endpoints access services via `request.app.state.store`, etc.

---

## 7. File Plan — What Gets Created / Modified / Deleted

| Action | File |
|--------|------|
| **REWRITE** | `backend/core/config.py` |
| **REWRITE** | `backend/main.py` |
| **REWRITE** | `backend/requirements.txt` |
| **REWRITE** | `backend/api/v1/health.py` |
| **REWRITE** | `backend/api/v1/documents.py` |
| **REWRITE** | `backend/api/v1/query.py` |
| **REWRITE** | `backend/api/v1/references.py` |
| **CREATE** | `backend/api/v1/debug.py` |
| **CREATE** | `backend/services/datastore.py` |
| **CREATE** | `backend/services/gemini.py` |
| **CREATE** | `backend/services/pinecone_search.py` |
| **REWRITE** | `backend/services/document_processor.py` |
| **REWRITE** | `backend/services/query_engine.py` |
| **DELETE** | `backend/services/vector_search.py` |
| **DELETE** | `backend/services/graph_service.py` |
| **UPDATE** | `.env` (add R2 creds, Pinecone index name) |

---

## 8. Implementation Order

The order matters because later steps depend on earlier ones.

1. **Config + dependencies** — `config.py`, `requirements.txt`, `.env`
2. **DataStore service** — `datastore.py` (R2 read/write)
3. **Gemini service** — `gemini.py` (LLM + embeddings)
4. **Pinecone service** — `pinecone_search.py` (vector upsert/search)
5. **Document processor** — `document_processor.py` (PDF ingestion pipeline)
6. **Query engine** — `query_engine.py` (search pipeline)
7. **API endpoints** — rewire all endpoints to use real services
8. **main.py** — lifespan startup/shutdown
9. **Cleanup** — delete old files, remove unused imports

---

## 9. What About the OpenAPI Schema Mismatches?

The openapi.yaml mentions `GraphContext` with nodes/edges. We keep this response shape but populate it from dict data (see `build_graph_context` above). No schema changes needed — the frontend won't know the difference.

The openapi.yaml mentions `bearerAuth` security. For now we skip auth (no JWT). Can add later.

The `estimatedProcessingTime` in DocumentUploadResponse — we return a rough estimate based on page count.

---

## 10. Gemini Token Budget Awareness

Per the masterplan: "we shouldn't ask [the LLM] to do more than 10 things at once."

During ingestion, we make ~5 LLM passes over the PDF:
1. Section splitting (batched ~5 pages per call)
2. Image/table description (one call per image — vision)
3. Reference extraction (batched per section group)
4. Precedence extraction (one call over the whole doc)
5. KV pair extraction (one call over the whole doc)

During querying, we make ~4-6 LLM calls:
1. Intent classification (short)
2. Keyword extraction (short)
3. Relevance checking (per batch of sections, may repeat 1-3 times)
4. Conflict checking (one call)
5. Final synthesis (one call)

Gemini 2.5 Flash Lite is cheap and fast — this should be well within budget.

---

## 11. Verification Strategy — How Each Step Gets Checked

Every step has a concrete check I run before moving on. I'll create a small test script `backend/tests/smoke.py` that accumulates tests as I build each layer. Each test is isolated — if it fails, I know exactly which layer broke.

The test PDF used throughout: `en.1991.1.1.2002.pdf` (Eurocode 1 — Dead loads, 1.3MB, ~40 pages). It has text, tables, figures, section numbering, and cross-references — a good representative sample.

### Step 1: Config + Dependencies
**Check:** Import settings, verify .env values loaded.
```python
# Does it start?
from core.config import settings
assert settings.GEMINI_API_KEY != "", "GEMINI_API_KEY not loaded from .env"
assert settings.PINECONE_API_KEY != "", "PINECONE_API_KEY not loaded from .env"
assert settings.R2_ENDPOINT_URL != "", "R2_ENDPOINT_URL not loaded from .env"
print("Config OK")
```

### Step 2: DataStore (R2 read/write)
**Check:** Write a test dict, read it back, verify roundtrip.
```python
store = DataStore(...)
store.documents["test_123"] = {"name": "smoke test", "status": "ready"}
store.save("documents")
# Clear in-memory and reload
store.documents = {}
store.load_all()
assert store.documents["test_123"]["name"] == "smoke test"
# Cleanup
del store.documents["test_123"]
store.save("documents")
print("DataStore R2 roundtrip OK")
```

### Step 3: Gemini Service
**Check:** One text call, one embedding call.
```python
gemini = GeminiService(settings.GEMINI_API_KEY)
# Text generation
response = await gemini.generate("Return exactly the word 'OK'")
assert "OK" in response
# Embedding
vec = await gemini.embed_query("test query")
assert len(vec) > 0 and isinstance(vec[0], float)
print(f"Gemini OK — embedding dim: {len(vec)}")
```
I note the embedding dimension here because Pinecone index creation needs to match it.

### Step 4: Pinecone Service
**Check:** Upsert a vector, search for it, delete it.
```python
pinecone_svc = PineconeSearch(settings.PINECONE_API_KEY, settings.PINECONE_INDEX_NAME)
test_vec = await gemini.embed_query("wind load factor for concrete bridges")
pinecone_svc.upsert([{
    "id": "smoke_test_001",
    "values": test_vec,
    "metadata": {"doc_id": "test", "text_preview": "smoke test vector"},
}])
import time; time.sleep(2)  # Pinecone indexing delay
results = pinecone_svc.search(test_vec, top_k=1)
assert results[0]["id"] == "smoke_test_001"
pinecone_svc.index.delete(ids=["smoke_test_001"], namespace="sections")
print("Pinecone upsert/search/delete OK")
```

### Step 5: Document Processor — THE CRITICAL ONE

This is where info can be lost. I verify in three layers:

**Layer A: Raw extraction check (no LLM — just PyMuPDF)**

Process the test PDF and check that the raw extraction is complete.
```python
pdf_path = "pdfs/en.1991.1.1.2002.pdf"
with open(pdf_path, "rb") as f:
    pdf_bytes = f.read()

pages = extract_pages(pdf_bytes)

# Basic sanity
assert len(pages) > 30, f"Expected ~40 pages, got {len(pages)}"

# Spot-check a known page — page 1 should have text
assert len(pages[0]["text"]) > 100, "Page 1 has very little text"

# Check figures were found (this PDF should have at least some)
total_figures = sum(len(p["figures"]) for p in pages)
print(f"Pages: {len(pages)}, Total figures detected: {total_figures}")

# Print a sample so I can eyeball it
for p in pages[:3]:
    print(f"\n--- Page {p['page_num']} ---")
    print(f"Text length: {len(p['text'])} chars")
    print(f"Figures: {len(p['figures'])}")
    print(f"First 200 chars: {p['text'][:200]}")
```

**Layer B: LLM parsing check (sections, references, etc.)**

Run the full ingestion pipeline on the test PDF, then programmatically verify the outputs.
```python
processor = DocumentProcessor(gemini, pinecone_svc, store)
await processor.process_pdf(pdf_bytes, doc_id="test_en1991_1_1")

# Check sections were created
doc_sections = {k: v for k, v in store.sections.items() if "EN_1991-1-1" in k}
print(f"Sections created: {len(doc_sections)}")
assert len(doc_sections) > 10, "Too few sections — likely parsing failure"

# Check no section has empty content
empty = [k for k, v in doc_sections.items() if not v.get("content", "").strip()]
assert len(empty) == 0, f"Sections with empty content: {empty}"

# Check references were extracted
doc_refs = {k: v for k, v in store.references.items() if "EN_1991-1-1" in k}
refs_with_targets = {k: v for k, v in doc_refs.items() if len(v) > 0}
print(f"Sections with outgoing references: {len(refs_with_targets)}")

# Check total text coverage: sum of all section content should be
# close to the total extracted text (allowing for headers/footers/margins)
total_raw_text = sum(len(p["text"]) for p in pages)
total_section_text = sum(len(v.get("content", "")) for v in doc_sections.values())
coverage = total_section_text / total_raw_text if total_raw_text > 0 else 0
print(f"Text coverage: {coverage:.0%} of raw text is in sections")
assert coverage > 0.70, f"Only {coverage:.0%} coverage — sections are missing content"

# Check embeddings were stored in Pinecone
test_query_vec = await gemini.embed_query("dead loads for concrete")
results = pinecone_svc.search(test_query_vec, top_k=5,
                               filter={"doc_id": "test_en1991_1_1"})
assert len(results) > 0, "No Pinecone results for test doc"
print(f"Pinecone results for 'dead loads for concrete': {len(results)}")
for r in results[:3]:
    print(f"  {r['id']} (score: {r['score']:.3f}): {r.get('text_preview', '')[:80]}")
```

**Layer C: Visual verification (I do this myself — no human needed)**

I'm multimodal. After ingestion, I verify visually by:

1. Reading the original PDF pages directly (the Read tool supports PDFs — I see the rendered page)
2. Reading the extracted page-render PNGs (saved locally during ingestion)
3. Reading each cropped figure PNG
4. Comparing them side by side in my own context

Concrete workflow:
```python
# Save figures and page renders to local temp files during ingestion
# (the processor already produces these — just write to disk too)

# Then I use the Read tool:
# 1. Read original PDF, specific pages:
#    Read("pdfs/en.1991.1.1.2002.pdf", pages="12")  → I see the original page
# 2. Read the extracted page render:
#    Read("/tmp/debug/page_12.png")                   → I see what PyMuPDF rendered
# 3. Read each cropped figure:
#    Read("/tmp/debug/page_12_figure_0.png")           → I see what we cropped

# Then I check the extracted text + sections + references in code output
# against what I can visually see on the PDF page.
```

I'll pick 3 pages to verify against the original PDF:
- **Page 1-2** (title page + contents — tests header/metadata extraction)
- **A page with a table** (tests figure detection + table cropping)
- **A page with dense section text and references** (tests section splitting + reference extraction)

For each, I check by looking at both the original and extracted versions:
- Does the extracted text match what's on the page? Any garbled characters or missing paragraphs?
- Were the figures/tables detected and cropped correctly? No missing figures, no junk crops?
- Are the section boundaries correct? Does each section start and end where it should?
- Were cross-references picked up? (e.g. "see 4.3.1" → does references map contain that link?)

If anything looks wrong, I fix the parsing before moving on — this is the foundation everything else depends on.

### Step 6: Query Engine
**Check:** Run a real query against the ingested test document.
```python
engine = QueryEngine(gemini, pinecone_svc, store)

# Test a real domain query
result = await engine.query("What density should be used for reinforced concrete?")
print(f"Answer: {result['answer'][:300]}")
print(f"References: {len(result['references'])}")
for ref in result["references"]:
    print(f"  - {ref['id']}: page {ref['page']} — {ref.get('excerpt', '')[:100]}")
assert len(result["references"]) > 0, "No references returned"

# Test intent classification
greeting = await engine.query("hello")
assert "Hello" in greeting["answer"] or "greeting" in str(greeting).lower()

# Test follow-up
follow_up = await engine.query(
    "What about lightweight concrete?",
    previous_results=result,
)
print(f"Follow-up answer: {follow_up['answer'][:200]}")

# Test KV expansion — use a term that should be in the kv_store
# after ingesting the Eurocode
kv_result = await engine.query("What is Gk?")
print(f"KV query answer: {kv_result['answer'][:200]}")
```

### Step 7: API Endpoints
**Check:** Start the server, hit every endpoint with curl, verify HTTP status codes and response shapes.
```bash
# Health
curl -s localhost:8000/api/v1/health | python -m json.tool

# List documents
curl -s localhost:8000/api/v1/documents | python -m json.tool

# Get specific document
curl -s localhost:8000/api/v1/documents/test_en1991_1_1 | python -m json.tool

# Get page
curl -s localhost:8000/api/v1/documents/test_en1991_1_1/pages/5 | python -m json.tool

# Query
curl -s -X POST localhost:8000/api/v1/query \
  -H "Content-Type: application/json" \
  -d '{"query": "factors of safety for dead loads"}' | python -m json.tool

# Reference context
curl -s "localhost:8000/api/v1/references/BSI_EN_1991-1-1_4.2.1/context?depth=2" \
  | python -m json.tool

# Debug ingestion
curl -s "localhost:8000/api/v1/debug/ingestion/test_en1991_1_1?page=12" > /tmp/debug.html
open /tmp/debug.html
```

### Step 8: Upload flow (end-to-end)
**Check:** Upload a second PDF via the API, wait for processing, then verify it via debug endpoint.
```bash
curl -X POST localhost:8000/api/v1/documents \
  -F "file=@pdfs/en.1991.1.3.2003_snow_loads.pdf" \
  -F "type=code"
# Returns 202 with documentId — wait for status to become "ready"
# Then check debug endpoint for the new doc
```

---

## 12. What I Need From You

To get started and not get blocked:

1. **R2 credentials**: The `.env` has `R2_API_URL` which is the endpoint, but boto3 needs separate auth credentials. The endpoint URL alone doesn't include authentication. You need to go to **Cloudflare Dashboard → R2 → Manage R2 API Tokens → Create API Token**. This gives you two values:
   - `R2_ACCESS_KEY_ID` (looks like a short alphanumeric string)
   - `R2_SECRET_ACCESS_KEY` (longer secret string)

   Add both to `.env`. Without these, boto3 can't authenticate — the endpoint URL just tells it *where* R2 is, not *who you are*.

2. **Pinecone index**: You confirmed none exists yet. I'll create one automatically during setup. I'll:
   - Run a Gemini embedding call first to determine the vector dimension (likely 768)
   - Create the index via `pinecone.create_index("construction-docs", dimension=768, metric="cosine")`
   - This will be part of the startup/smoke test, not a manual step.

3. **Gemini model ID**: I'll auto-detect during the smoke test — list available models and pick the right one.

The only thing I actually need from you is **(1)** — the R2 API token. Everything else I can handle.
