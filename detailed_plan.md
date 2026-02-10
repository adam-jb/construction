# Construction Design Code Search System - Detailed Plan


## Things to improve in next iteration of plan - Adam's instructions
For embedding search (which retrieves chunks), how know how many chunks to retrieve? How many we need vary hugely across queries. So perhaps retrieve N chunks, and have an LLM evaluate how useful the least-relevant of those chunks are; if it’s still useful that means we should receive the next N chunks, and repeat until we run out of useful information.

Why have GRAPH_MAX_HOPS and BM25_TOP_K? You don’t know the number of findings which will be relevant in advance or the size of the graph. I guess GRAPH_MAX_HOPS is a good heuristic, but IRL it depends on the density of the graph - if it’s not too connected we can follow as far as we like. We might also (don’t do this but add to a *to consider* section at the top of the plan) have an LLM judge how relevant each node of the knowledge graph is to the query, so we dont follow edges which aren’t relevant in the graph search - but IRL this not worth doing unless the search gets very deep.

Do we want pure keyword search in addition to BM25? Give me pros and cons


To change down the line, but not necessary until you are asked to implement this specifically. For when you return images to user pertaining to their answer at the end:                              
  - Return structured JSON with:                                     
    - answer_markdown: The text resposne                          
    - images: Array of {id, path, base64, caption, page bbox}
  - Let the frontend/client decide how to render     




## Overview

A system to search construction design code PDFs, follow reference chains across documents, and surface all relevant information for a given query.

**Core principles:**
- Over-retrieve then filter. False negatives (missing info) are worse than false positives (noise).
- Keep it simple. No unnecessary complexity.

**Scale:** 5-10 documents, ~100 pages each.

---

## Repository Structure

```
construction/
├── config.py              # All tunable parameters (ALL_CAPS constants)
├── prompts.py             # All LLM prompts (easy to edit/improve)
├── preprocess.py          # PDF parsing, chunking, indexing
├── knowledge_graph.py     # Entity/relationship extraction, graph ops
├── search.py              # BM25, embedding search, graph lookup
├── query.py               # Main query loop, LLM review
├── utils.py               # Helpers (PDF utils, text cleaning, etc.)
├── main.py                # Entry point / CLI
├── data/
│   ├── pdfs/              # Source PDFs
│   ├── chunks/            # Processed chunks (JSON)
│   ├── tables/            # Extracted tables (JSON)
│   ├── figures/           # Extracted figure images + metadata
│   ├── graph.json         # Knowledge graph (NetworkX export)
│   └── embeddings/        # ChromaDB storage
└── requirements.txt
```

---

## config.py - All Tunable Parameters

```python
"""
Configuration constants. Edit these to tune system behavior.
"""

# =============================================================================
# PREPROCESSING
# =============================================================================
CHUNK_MAX_TOKENS = 500
CHUNK_MIN_TOKENS = 100
CHUNK_OVERLAP_TOKENS = 50

# =============================================================================
# SEARCH
# =============================================================================
BM25_TOP_K = 20
EMBEDDING_TOP_K = 20
GRAPH_MAX_HOPS = 3

# =============================================================================
# QUERY LOOP
# =============================================================================
MAX_ITERATIONS = 4
ADJACENT_CHUNKS_COUNT = 2

# =============================================================================
# LLM
# =============================================================================
LLM_MODEL = "gemini-2.0-flash"
LLM_TEMPERATURE = 0.1

# =============================================================================
# EMBEDDINGS
# =============================================================================
EMBEDDING_MODEL = "all-MiniLM-L6-v2"  # sentence-transformers model

# =============================================================================
# PATHS
# =============================================================================
DATA_DIR = "data"
PDFS_DIR = f"{DATA_DIR}/pdfs"
CHUNKS_DIR = f"{DATA_DIR}/chunks"
TABLES_DIR = f"{DATA_DIR}/tables"
FIGURES_DIR = f"{DATA_DIR}/figures"
GRAPH_PATH = f"{DATA_DIR}/graph.json"
CHROMA_PATH = f"{DATA_DIR}/embeddings"
```

---

## prompts.py - All LLM Prompts

```python
"""
All LLM prompts in one place for easy editing and improvement.
"""

# =============================================================================
# PREPROCESSING PROMPTS
# =============================================================================

EXTRACT_ENTITIES_PROMPT = """
Extract entities and relationships from this construction design code section.

Document: {document_name}
Section: {section_number} - {section_title}

Text:
\"\"\"
{section_text}
\"\"\"

Entity types to extract:
- Clause (numbered sections)
- Table (with number and title)
- Figure (with number and title)
- Parameter (named values with symbols like γG, fck)
- Concept (technical terms: "dead load", "permanent action")

Relationship types:
- REFERENCES: explicit reference to another clause/table/figure
- DEFINED_IN: where a parameter or concept is defined
- EQUIVALENT_TO: synonyms (e.g., "dead load" = "permanent action")

Return JSON:
{{
  "entities": [
    {{"type": "...", "id": "...", "name": "...", "symbol": "..." (if applicable)}},
    ...
  ],
  "relationships": [
    {{"from_id": "...", "type": "...", "to_id": "...", "evidence": "the text that shows this"}},
    ...
  ]
}}

Only extract what is explicitly present. Do not infer.
"""

DESCRIBE_FIGURE_PROMPT = """
This is Figure {figure_number}: "{figure_title}" from {document_name}.

Generate:
1. A detailed description of what this figure shows
2. Keywords that someone might search for to find this figure
3. Any values, dimensions, or coefficients visible

Return JSON:
{{
  "description": "...",
  "keywords": ["...", "..."],
  "values_shown": ["...", "..."]
}}
"""

# =============================================================================
# QUERY PROMPTS
# =============================================================================

PARSE_QUERY_PROMPT = """
Parse this construction code query into structured concepts.

Query: "{query}"

Return JSON:
{{
  "seeking": [
    {{"type": "Parameter|Table|Clause|Procedure|Requirement", "value": "...", "aliases": ["..."]}}
  ],
  "conditions": [
    {{"type": "LoadType|Material|StructureType|Location", "value": "...", "aliases": ["..."]}}
  ],
  "intent": "lookup_value | find_procedure | check_applicability | find_requirements"
}}

Common aliases to consider:
- "dead load" = "permanent action" = "self-weight"
- "live load" = "variable action" = "imposed load"
- "safety factor" = "partial factor"
- "γG" = "gamma G" = "partial factor for permanent actions"
"""

DECOMPOSE_QUERY_PROMPT = """
Query: "{query}"

If this query asks multiple distinct things, break it into separate subquestions.
If it's a single question, return it as-is.

Return JSON:
{{"subquestions": ["...", "..."]}}
"""

LLM_REVIEW_PROMPT = """
You are reviewing search results for a construction design code query.

## Query
{query}

## Retrieved Content
{chunks_text}

## Tables Retrieved
{tables_text}

## Figures Retrieved
{figures_text}

## References Already Followed
{followed_refs}

## Your Tasks

1. **RELEVANT**: Which chunks are relevant? Return their IDs.

2. **UNFOLLOWED REFERENCES**: In the relevant content, are there references to other clauses/tables/figures/documents NOT in "References Already Followed"?

   For each:
   - ref: The reference text (e.g., "Table 4.2", "see Section 5.3")
   - source_chunk_id: Which chunk contains this reference
   - why_needed: Brief reason

3. **SURROUNDING CONTENT**: Do any chunks say "see above", "see below", "following table", etc.?

   For each:
   - chunk_id: The chunk
   - direction: "before" | "after"

4. **COMPLETENESS**: Can you answer the query with current content?
   - answer: "yes" | "partial" | "no"
   - missing: What's missing (if not yes)

Return JSON:
{{
  "relevant_chunk_ids": ["..."],
  "unfollowed_references": [
    {{"ref": "...", "source_chunk_id": "...", "why_needed": "..."}}
  ],
  "surrounding_content_needed": [
    {{"chunk_id": "...", "direction": "..."}}
  ],
  "completeness": {{"answer": "...", "missing": "..."}}
}}
"""

FORMAT_ANSWER_PROMPT = """
Generate a final answer for this construction code query.

## Query
{query}

## Relevant Content
{relevant_chunks}

## Relevant Tables
{relevant_tables}

## Relevant Figures
(See images attached)

## Reference Chain
{reference_chain}

## Conflicts Detected
{conflicts}

## Unresolved References
{unresolved}

Generate a clear, structured answer that:
1. Directly answers the query
2. Cites specific sources (document, clause/table number, page)
3. Includes relevant table data
4. Explains any figures
5. Notes any conflicts or unresolved references

Use markdown formatting.
"""
```

---

## Part 1: Preprocessing Pipeline

### 1.1 PDF Parsing & Text Extraction

**Libraries:**
- `pymupdf` (fitz) - PDF parsing, text extraction, image extraction
- `pdfplumber` - table detection fallback
- `camelot-py` - table extraction

```python
# preprocess.py

def extract_document_structure(pdf_path: str) -> dict:
    """
    Extract text, structure, tables, and figures from PDF.
    """
    doc = fitz.open(pdf_path)

    structure = {
        "document_id": generate_id(pdf_path),
        "filename": os.path.basename(pdf_path),
        "pages": [],
        "sections": [],
        "tables": [],
        "figures": []
    }

    for page_num, page in enumerate(doc):
        # Extract text with position
        blocks = page.get_text("dict")["blocks"]

        # Detect section headers (larger font, numbered)
        # Detect tables (ruled areas)
        # Detect figures (image objects + "Figure X" captions)

    return structure
```

### 1.2 Chunking

**Strategy:** Respect document structure. Chunk at clause/section boundaries.

```python
def chunk_document(structure: dict) -> list[dict]:
    """
    Create searchable chunks from document structure.
    """
    chunks = []

    for section in structure["sections"]:
        text = section["text"]

        # If section fits in one chunk, keep it whole
        if count_tokens(text) <= CHUNK_MAX_TOKENS:
            chunks.append({
                "chunk_id": f"{structure['document_id']}_chunk_{len(chunks)}",
                "document_id": structure["document_id"],
                "section_id": section["id"],
                "section_number": section["number"],
                "page": section["page"],
                "text": text,
                "preceding_chunk_id": chunks[-1]["chunk_id"] if chunks else None,
                "following_chunk_id": None  # Set after
            })
        else:
            # Split at paragraph boundaries
            sub_chunks = split_at_paragraphs(text, CHUNK_MAX_TOKENS)
            for sub in sub_chunks:
                # ... similar structure
                pass

    # Link following_chunk_ids
    for i, chunk in enumerate(chunks[:-1]):
        chunk["following_chunk_id"] = chunks[i + 1]["chunk_id"]

    return chunks
```

### 1.3 Table Extraction

**Store full table data for output, plus searchable text for retrieval.**

```python
def extract_tables(pdf_path: str, structure: dict) -> list[dict]:
    """
    Extract tables as structured data.
    """
    tables = []

    # Use camelot for bordered tables
    camelot_tables = camelot.read_pdf(pdf_path, pages="all", flavor="lattice")

    for table in camelot_tables:
        df = table.df

        # Find caption (text above table containing "Table X")
        caption = find_table_caption(structure, table.page, table.bbox)

        tables.append({
            "table_id": f"{structure['document_id']}_table_{len(tables)}",
            "document_id": structure["document_id"],
            "number": extract_table_number(caption),  # e.g., "NA.A1.2"
            "title": caption,
            "page": table.page,
            "headers": df.iloc[0].tolist(),
            "rows": [
                {"label": row[0], "values": row[1:].tolist()}
                for _, row in df.iloc[1:].iterrows()
            ],
            "full_markdown": df.to_markdown(),  # For output
            "searchable_text": f"{caption} {df.to_string()}"  # For search
        })

    return tables
```

### 1.4 Figure Extraction with LLM Description

**Extract images, then use LLM to generate searchable description.**

```python
def extract_figures(pdf_path: str, structure: dict) -> list[dict]:
    """
    Extract figures and generate LLM descriptions for searchability.
    """
    doc = fitz.open(pdf_path)
    figures = []

    for page_num, page in enumerate(doc):
        # Find images
        images = page.get_images()

        for img_index, img in enumerate(images):
            # Extract image
            xref = img[0]
            pix = fitz.Pixmap(doc, xref)

            # Find caption
            caption = find_figure_caption(page, img)

            # Save image
            image_path = f"{FIGURES_DIR}/{structure['document_id']}_fig_{page_num}_{img_index}.png"
            pix.save(image_path)

            # Generate LLM description for searchability
            description_data = generate_figure_description(image_path, caption, structure["filename"])

            figures.append({
                "figure_id": f"{structure['document_id']}_fig_{page_num}_{img_index}",
                "document_id": structure["document_id"],
                "number": extract_figure_number(caption),
                "title": caption,
                "page": page_num + 1,
                "image_path": image_path,
                "description": description_data["description"],
                "keywords": description_data["keywords"],
                "searchable_text": f"{caption} {description_data['description']} {' '.join(description_data['keywords'])}"
            })

    return figures


def generate_figure_description(image_path: str, caption: str, document_name: str) -> dict:
    """
    Use LLM to describe figure for better searchability.
    """
    image_data = load_image_as_base64(image_path)

    prompt = DESCRIBE_FIGURE_PROMPT.format(
        figure_number=extract_figure_number(caption),
        figure_title=caption,
        document_name=document_name
    )

    response = call_gemini(prompt, images=[image_data])
    return json.loads(response)
```

### 1.5 Embedding Generation

**Local embeddings with sentence-transformers, stored in ChromaDB.**

```python
from sentence_transformers import SentenceTransformer
import chromadb

def build_embeddings(chunks: list, tables: list, figures: list):
    """
    Generate embeddings for all searchable content.
    """
    model = SentenceTransformer(EMBEDDING_MODEL)
    client = chromadb.PersistentClient(path=CHROMA_PATH)
    collection = client.get_or_create_collection("construction_codes")

    # Embed chunks
    for chunk in chunks:
        embedding = model.encode(chunk["text"]).tolist()
        collection.add(
            ids=[chunk["chunk_id"]],
            embeddings=[embedding],
            documents=[chunk["text"]],
            metadatas=[{
                "type": "chunk",
                "document_id": chunk["document_id"],
                "page": chunk["page"]
            }]
        )

    # Embed tables (searchable text)
    for table in tables:
        embedding = model.encode(table["searchable_text"]).tolist()
        collection.add(
            ids=[table["table_id"]],
            embeddings=[embedding],
            documents=[table["searchable_text"]],
            metadatas=[{
                "type": "table",
                "document_id": table["document_id"],
                "page": table["page"]
            }]
        )

    # Embed figures (searchable text from LLM description)
    for figure in figures:
        embedding = model.encode(figure["searchable_text"]).tolist()
        collection.add(
            ids=[figure["figure_id"]],
            embeddings=[embedding],
            documents=[figure["searchable_text"]],
            metadatas=[{
                "type": "figure",
                "document_id": figure["document_id"],
                "page": figure["page"]
            }]
        )
```

### 1.6 Knowledge Graph

**NetworkX for simplicity. JSON persistence.**

```python
# knowledge_graph.py

import networkx as nx

def build_knowledge_graph(chunks: list, tables: list, figures: list) -> nx.DiGraph:
    """
    Extract entities and relationships, build graph.
    """
    G = nx.DiGraph()

    # Add document structure as nodes
    for chunk in chunks:
        G.add_node(chunk["chunk_id"], type="chunk", **chunk)

    for table in tables:
        G.add_node(table["table_id"], type="table", **table)

    for figure in figures:
        G.add_node(figure["figure_id"], type="figure", **figure)

    # Extract entities and relationships via LLM
    for chunk in chunks:
        extracted = extract_entities_llm(chunk)

        for entity in extracted["entities"]:
            G.add_node(entity["id"], **entity)

        for rel in extracted["relationships"]:
            G.add_edge(
                rel["from_id"],
                rel["to_id"],
                type=rel["type"],
                evidence=rel["evidence"]
            )

    return G


def extract_entities_llm(chunk: dict) -> dict:
    """
    Use LLM to extract entities and relationships from chunk.
    """
    prompt = EXTRACT_ENTITIES_PROMPT.format(
        document_name=chunk["document_id"],
        section_number=chunk.get("section_number", ""),
        section_title=chunk.get("section_title", ""),
        section_text=chunk["text"]
    )

    response = call_gemini(prompt)
    return json.loads(response)


def save_graph(G: nx.DiGraph, path: str = GRAPH_PATH):
    """Save graph to JSON."""
    data = nx.node_link_data(G)
    with open(path, "w") as f:
        json.dump(data, f)


def load_graph(path: str = GRAPH_PATH) -> nx.DiGraph:
    """Load graph from JSON."""
    with open(path) as f:
        data = json.load(f)
    return nx.node_link_graph(data)
```

---

## Part 2: Query-Time Algorithm

### Overview

```
1. Decompose query into subquestions (if needed)
2. Parse query → structured concepts
3. Search (parallel): BM25 + Embeddings + Graph lookup
4. Map results to graph entry nodes
5. Traverse graph from entry nodes
6. Gather all reached content (chunks, tables, figures)
7. LLM review: filter relevant, find unfollowed references
8. If incomplete: follow references, get surrounding content, loop to step 7
9. Format final answer with full tables and figures
```

### 2.1 Main Query Loop

```python
# query.py

def query(user_query: str) -> str:
    """
    Main entry point for queries.
    """
    # Load indexes
    graph = load_graph()
    chunks = load_chunks()
    tables = load_tables()
    figures = load_figures()

    # Step 1: Decompose if needed
    subquestions = decompose_query(user_query)

    all_results = []

    for subquery in subquestions:
        result = process_subquery(subquery, graph, chunks, tables, figures)
        all_results.append(result)

    # Step 9: Format final answer
    return format_final_answer(user_query, all_results, tables, figures)


def process_subquery(query: str, graph, chunks, tables, figures) -> dict:
    """
    Process a single query/subquery through the full pipeline.
    """
    # Step 2: Parse query
    concepts = parse_query(query)

    # Step 3: Search (parallel)
    bm25_ids = bm25_search(query, concepts)
    embedding_ids = embedding_search(query, concepts)
    graph_ids = graph_lookup(concepts, graph)

    # Step 4: Map to entry nodes
    entry_node_ids = set(bm25_ids + embedding_ids + graph_ids)

    # Step 5: Traverse graph
    reached_ids = traverse_graph(entry_node_ids, graph, concepts["intent"])

    # Step 6: Gather content
    reached_chunks = [c for c in chunks if c["chunk_id"] in reached_ids]
    reached_tables = [t for t in tables if t["table_id"] in reached_ids]
    reached_figures = [f for f in figures if f["figure_id"] in reached_ids]

    followed_refs = set()

    # Steps 7-8: LLM review loop
    for iteration in range(MAX_ITERATIONS):
        review = llm_review(
            query=query,
            chunks=reached_chunks,
            tables=reached_tables,
            figures=reached_figures,
            followed_refs=followed_refs
        )

        # Check if done
        if review["completeness"]["answer"] == "yes" and not review["unfollowed_references"]:
            break

        # Follow unfollowed references
        for ref in review["unfollowed_references"]:
            if ref["ref"] in followed_refs:
                continue

            # Validate reference exists in source chunk (prevent hallucination)
            source_chunk = get_chunk_by_id(ref["source_chunk_id"], chunks)
            if not validate_reference_exists(ref["ref"], source_chunk):
                continue

            followed_refs.add(ref["ref"])

            # Search for reference
            new_ids = search_for_reference(ref["ref"])
            new_chunks, new_tables, new_figures = gather_content(new_ids, chunks, tables, figures)

            reached_chunks.extend(new_chunks)
            reached_tables.extend(new_tables)
            reached_figures.extend(new_figures)

        # Get surrounding content
        for surrounding in review["surrounding_content_needed"]:
            adjacent = get_adjacent_chunks(
                surrounding["chunk_id"],
                surrounding["direction"],
                chunks
            )
            reached_chunks.extend(adjacent)

        # Deduplicate
        reached_chunks = deduplicate_by_id(reached_chunks)
        reached_tables = deduplicate_by_id(reached_tables)
        reached_figures = deduplicate_by_id(reached_figures)

    # Filter to relevant only
    relevant_chunks = [c for c in reached_chunks if c["chunk_id"] in review["relevant_chunk_ids"]]

    # Detect conflicts before output
    conflicts = detect_conflicts(relevant_chunks, reached_tables)

    return {
        "query": query,
        "chunks": relevant_chunks,
        "tables": reached_tables,
        "figures": reached_figures,
        "conflicts": conflicts,
        "followed_refs": followed_refs
    }
```

### 2.2 Search Functions

```python
# search.py

from rank_bm25 import BM25Okapi
import chromadb
from sentence_transformers import SentenceTransformer

def bm25_search(query: str, concepts: dict) -> list[str]:
    """
    Keyword search using BM25.
    """
    # Build search terms from query + aliases
    terms = [query]
    for c in concepts["seeking"] + concepts["conditions"]:
        terms.append(c["value"])
        terms.extend(c.get("aliases", []))

    search_text = " ".join(terms)

    # Search chunks, tables, figures
    results = bm25_index.search(search_text, top_k=BM25_TOP_K)

    return [r["id"] for r in results]


def embedding_search(query: str, concepts: dict) -> list[str]:
    """
    Semantic search using embeddings.
    """
    model = SentenceTransformer(EMBEDDING_MODEL)
    client = chromadb.PersistentClient(path=CHROMA_PATH)
    collection = client.get_collection("construction_codes")

    # Build semantic query
    query_text = f"{concepts['intent']}: {query}"
    query_embedding = model.encode(query_text).tolist()

    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=EMBEDDING_TOP_K
    )

    return results["ids"][0]


def graph_lookup(concepts: dict, graph: nx.DiGraph) -> list[str]:
    """
    Find graph nodes matching concept values/aliases.
    """
    matching_ids = []

    for concept in concepts["seeking"] + concepts["conditions"]:
        search_terms = [concept["value"]] + concept.get("aliases", [])

        for node_id, data in graph.nodes(data=True):
            node_text = f"{data.get('name', '')} {data.get('title', '')} {data.get('text', '')}".lower()

            for term in search_terms:
                if term.lower() in node_text:
                    matching_ids.append(node_id)
                    break

    return list(set(matching_ids))
```

### 2.3 Graph Traversal

```python
def traverse_graph(entry_ids: set, graph: nx.DiGraph, intent: str) -> set:
    """
    BFS from entry nodes, following relevant edge types.
    """
    # Edge types to follow based on intent
    edge_priorities = {
        "lookup_value": ["DEFINED_IN", "HAS_VALUE", "REFERENCES"],
        "find_procedure": ["REFERENCES", "PART_OF"],
        "check_applicability": ["APPLIES_TO", "REFERENCES"],
        "find_requirements": ["REFERENCES", "DEFINED_IN"]
    }
    edge_types = edge_priorities.get(intent, ["REFERENCES", "DEFINED_IN"])

    visited = set()
    queue = [(nid, 0) for nid in entry_ids]

    while queue:
        node_id, depth = queue.pop(0)

        if node_id in visited or depth > GRAPH_MAX_HOPS:
            continue

        if node_id not in graph:
            continue

        visited.add(node_id)

        # Follow edges
        for _, target, data in graph.edges(node_id, data=True):
            if data.get("type") in edge_types:
                queue.append((target, depth + 1))

    return visited
```

### 2.4 LLM Review

```python
def llm_review(query: str, chunks: list, tables: list, figures: list, followed_refs: set) -> dict:
    """
    LLM reviews content and identifies gaps.
    Figures are passed directly as images (no tool needed).
    """
    # Format text content
    chunks_text = "\n\n".join([
        f"[{c['chunk_id']}] (Page {c['page']})\n{c['text']}"
        for c in chunks
    ])

    tables_text = "\n\n".join([
        f"[{t['table_id']}] {t['title']} (Page {t['page']})\n{t['full_markdown']}"
        for t in tables
    ])

    figures_text = "\n\n".join([
        f"[{f['figure_id']}] {f['title']} (Page {f['page']})\n{f['description']}"
        for f in figures
    ])

    prompt = LLM_REVIEW_PROMPT.format(
        query=query,
        chunks_text=chunks_text,
        tables_text=tables_text,
        figures_text=figures_text,
        followed_refs=list(followed_refs)
    )

    # Load figure images and pass directly to multimodal LLM
    images = [load_image_as_base64(f["image_path"]) for f in figures]

    response = call_gemini(prompt, images=images if images else None)
    return json.loads(response)
```

### 2.5 Validation Functions

```python
def validate_reference_exists(ref: str, source_chunk: dict) -> bool:
    """
    Verify that a claimed reference actually exists in the source chunk.
    Prevents LLM hallucination of references.

    Called: Before searching for each reference the LLM claims to find.
    """
    if not source_chunk:
        return False

    chunk_text = source_chunk["text"].lower()
    ref_lower = ref.lower()

    # Check exact match
    if ref_lower in chunk_text:
        return True

    # Check without spaces
    if ref_lower.replace(" ", "") in chunk_text.replace(" ", ""):
        return True

    return False


def detect_conflicts(chunks: list, tables: list) -> list[dict]:
    """
    Detect when same parameter has different values in different sources.

    Called: Before formatting final output, to warn user of conflicts.
    """
    conflicts = []

    # Simple heuristic: look for common parameters
    parameters = ["γG", "γQ", "density", "factor"]

    values_found = {}  # parameter -> [(value, source), ...]

    for chunk in chunks:
        for param in parameters:
            if param.lower() in chunk["text"].lower():
                # Extract value near parameter (simplified)
                # In practice, use regex or LLM extraction
                values_found.setdefault(param, []).append({
                    "source": chunk["chunk_id"],
                    "document": chunk["document_id"]
                })

    # Check for same param in different documents
    for param, sources in values_found.items():
        docs = set(s["document"] for s in sources)
        if len(docs) > 1:
            conflicts.append({
                "parameter": param,
                "found_in": list(docs),
                "note": "Check which source applies to your specific case. National Annex values typically take precedence."
            })

    return conflicts
```

### 2.6 Helper Functions

```python
def get_adjacent_chunks(chunk_id: str, direction: str, chunks: list) -> list[dict]:
    """
    Get chunks immediately before/after a given chunk.
    """
    chunk = get_chunk_by_id(chunk_id, chunks)
    if not chunk:
        return []

    result = []

    if direction in ["before", "both"]:
        prev_id = chunk.get("preceding_chunk_id")
        for _ in range(ADJACENT_CHUNKS_COUNT):
            if prev_id:
                prev_chunk = get_chunk_by_id(prev_id, chunks)
                if prev_chunk:
                    result.append(prev_chunk)
                    prev_id = prev_chunk.get("preceding_chunk_id")

    if direction in ["after", "both"]:
        next_id = chunk.get("following_chunk_id")
        for _ in range(ADJACENT_CHUNKS_COUNT):
            if next_id:
                next_chunk = get_chunk_by_id(next_id, chunks)
                if next_chunk:
                    result.append(next_chunk)
                    next_id = next_chunk.get("following_chunk_id")

    return result


def decompose_query(query: str) -> list[str]:
    """Break complex query into subquestions."""
    prompt = DECOMPOSE_QUERY_PROMPT.format(query=query)
    response = call_gemini(prompt)
    return json.loads(response)["subquestions"]


def parse_query(query: str) -> dict:
    """Parse query into structured concepts."""
    prompt = PARSE_QUERY_PROMPT.format(query=query)
    response = call_gemini(prompt)
    return json.loads(response)
```

---

## Part 3: Output Formatting

```python
def format_final_answer(original_query: str, results: list, all_tables: list, all_figures: list) -> str:
    """
    Format the final answer with full tables and figures.
    """
    # Gather all relevant content
    all_chunks = []
    all_conflicts = []
    all_followed_refs = set()

    for result in results:
        all_chunks.extend(result["chunks"])
        all_conflicts.extend(result["conflicts"])
        all_followed_refs.update(result["followed_refs"])

    # Get tables and figures that were referenced
    referenced_tables = [t for t in all_tables if any(
        t["table_id"] in c.get("text", "") or t["number"] in c.get("text", "")
        for c in all_chunks
    )]

    referenced_figures = [f for f in all_figures if any(
        f["figure_id"] in c.get("text", "") or f["number"] in c.get("text", "")
        for c in all_chunks
    )]

    # Build reference chain for display
    reference_chain = " → ".join(all_followed_refs) if all_followed_refs else "Direct search"

    # Use LLM to generate formatted answer
    prompt = FORMAT_ANSWER_PROMPT.format(
        query=original_query,
        relevant_chunks=format_chunks_for_prompt(all_chunks),
        relevant_tables=format_tables_for_prompt(referenced_tables),  # Full markdown tables
        reference_chain=reference_chain,
        conflicts=all_conflicts,
        unresolved=[]  # Add any unresolved refs here
    )

    # Include figure images directly
    images = [load_image_as_base64(f["image_path"]) for f in referenced_figures]

    answer = call_gemini(prompt, images=images if images else None)

    # Append full tables at the end
    if referenced_tables:
        answer += "\n\n---\n\n## Full Tables\n\n"
        for table in referenced_tables:
            answer += f"### {table['title']} (Page {table['page']})\n\n"
            answer += table["full_markdown"]
            answer += "\n\n"

    return answer
```

---

## Part 4: LLM Client

```python
# utils.py

import google.generativeai as genai
from config import LLM_MODEL, LLM_TEMPERATURE

def call_gemini(prompt: str, images: list = None) -> str:
    """
    Call Gemini Flash 2.0 with optional images.
    """
    genai.configure(api_key=os.environ["GEMINI_API_KEY"])
    model = genai.GenerativeModel(LLM_MODEL)

    if images:
        # Multimodal call
        content = [prompt]
        for img_b64 in images:
            content.append({
                "mime_type": "image/png",
                "data": img_b64
            })
        response = model.generate_content(content)
    else:
        response = model.generate_content(prompt)

    return response.text


def load_image_as_base64(image_path: str) -> str:
    """Load image and convert to base64."""
    import base64
    with open(image_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")
```

---

## Part 5: Requirements

```
# requirements.txt

# PDF Processing
pymupdf>=1.23.0
pdfplumber>=0.10.0
camelot-py[cv]>=0.11.0

# Embeddings & Vector Store
sentence-transformers>=2.2.0
chromadb>=0.4.0

# Search
rank-bm25>=0.2.2

# Graph
networkx>=3.0

# LLM
google-generativeai>=0.3.0

# Utilities
pillow>=10.0.0
pandas>=2.0.0
```

---

## Part 6: Test Cases

### Test 1: Snow Loading

**Query:** "Do I need to apply snow loading onto my structure? What steps would I need to take to check this and what part of the code should I refer to?"

**Expected output includes:**
- Scope section (what structures snow loading applies to)
- Calculation procedure
- Reference to National Annex for UK snow map
- Shape coefficient tables (full table in output)
- Any relevant figures

### Test 2: Fire for Bridge

**Query:** "I am designing a bridge in London UK. Should I be considering potential issues regarding fire damage to my structure?"

**Expected output includes:**
- Scope section (does fire code apply to bridges?)
- Clear answer: yes/no with reasoning
- If no: what code to use instead

### Test 3: Concrete Density

**Query:** "What density should I use for reinforced concrete when calculating dead loads?"

**Expected output includes:**
- Density value: 25 kN/m³
- Source table (full table in output)
- Any conditions/variations

---

## Part 7: Usage

```bash
# Preprocess documents
python preprocess.py

# Run query
python main.py "What density should I use for reinforced concrete?"
```

```python
# main.py

from query import query

if __name__ == "__main__":
    import sys
    user_query = sys.argv[1] if len(sys.argv) > 1 else input("Query: ")
    result = query(user_query)
    print(result)
```
