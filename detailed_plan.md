# Construction Design Code Search System - Detailed Plan

## Overview

A system to search construction design code PDFs, follow reference chains across documents, and surface all relevant information for a given query.

**Core principle:** Over-retrieve then filter. False negatives (missing info) are much worse than false positives (noise).

---

## Part 1: Preprocessing Pipeline

### 1.1 PDF Parsing & Text Extraction

**Libraries:**
- `pymupdf` (fitz) - primary PDF parsing, text extraction with position data
- `pdfplumber` - fallback for complex layouts, better table detection
- `pytesseract` + `pdf2image` - OCR fallback for scanned documents

**Process:**
```python
# For each PDF:
1. Extract raw text with bounding boxes (position on page)
2. Detect document structure:
   - Title, headers, section numbers (regex + font size analysis)
   - Paragraphs, lists
   - Tables (see 1.3)
   - Figures/diagrams (see 1.4)
3. Build document hierarchy:
   - Chapter → Section → Clause → Paragraph
4. Output: structured JSON per document
```

**Output structure:**
```json
{
  "document_id": "BS_EN_1990_2002",
  "title": "Eurocode - Basis of structural design",
  "sections": [
    {
      "id": "section_5",
      "number": "5",
      "title": "Structural analysis",
      "clauses": [
        {
          "id": "clause_5_3_2",
          "number": "5.3.2",
          "title": "Load combinations",
          "text": "...",
          "page": 34,
          "bbox": [x1, y1, x2, y2]
        }
      ]
    }
  ]
}
```

### 1.2 Chunking Strategy

**Approach:** Semantic chunking based on document structure, not arbitrary token windows.

**Chunk boundaries:**
- Prefer: clause/section boundaries
- Max size: ~500 tokens
- Min size: ~100 tokens
- If clause exceeds max, split at paragraph boundaries
- Never split mid-sentence or mid-table

**Libraries:**
- `langchain.text_splitter.RecursiveCharacterTextSplitter` - with custom separators
- Or custom chunker respecting document structure

**Chunk metadata:**
```json
{
  "chunk_id": "chunk_001",
  "document_id": "BS_EN_1990_2002",
  "section_id": "clause_5_3_2",
  "page": 34,
  "position_in_section": 0,
  "text": "...",
  "preceding_chunk_id": null,
  "following_chunk_id": "chunk_002"
}
```

### 1.3 Table Extraction

**Critical for construction codes.** Tables contain factors, coefficients, limits.

**Libraries:**
- `camelot-py` - best for bordered tables
- `tabula-py` - good for simple tables
- `pdfplumber` - fallback, handles complex layouts
- `img2table` - for tables that are images

**Process:**
```python
1. Detect tables in PDF (camelot.read_pdf with flavor='lattice' and 'stream')
2. Extract as structured data:
   - Headers (column names)
   - Row labels
   - Cell values
   - Spanning cells
3. Store table caption/title (usually text above table)
4. Create searchable text representation:
   "Table NA.A1.2: Partial factors for actions.
    Columns: Action type, γG unfavourable, γG favourable...
    Row 1: Permanent actions, 1.35, 1.00..."
5. Store structured data for programmatic lookup
```

**Table storage:**
```json
{
  "table_id": "table_NA_A1_2",
  "document_id": "BS_EN_1990_2002",
  "number": "NA.A1.2",
  "title": "Design values of actions (STR/GEO) (Set B)",
  "page": 28,
  "caption": "Table NA.A1.2(B) - Design values of actions...",
  "headers": ["Action", "γ unfavourable", "γ favourable"],
  "rows": [
    {"label": "Permanent", "values": ["1.35", "1.00"]},
    {"label": "Variable", "values": ["1.50", "0.00"]}
  ],
  "searchable_text": "Table NA.A1.2 Design values... Permanent 1.35 1.00...",
  "conditions": "For STR/GEO limit state, Set B"
}
```

### 1.4 Diagram & Figure Extraction

**Diagrams contain critical information:** load diagrams, structural details, flowcharts, maps.

**Libraries:**
- `pymupdf` (fitz) - extract embedded images
- `pdf2image` - render pages as images, crop figure regions
- `PIL/Pillow` - image processing
- `CLIP` (openai/clip-vit-base-patch32) - multimodal embeddings for images

**Process:**
```python
1. Detect figures in PDF:
   - Look for "Figure X.Y" captions in text
   - Detect image objects in PDF structure
   - Detect large whitespace regions (often diagrams)

2. Extract figure images:
   - If embedded image: extract directly via pymupdf
   - If vector graphic or complex: render page region as image via pdf2image

3. Extract metadata:
   - Figure number and title (from caption)
   - Surrounding text (context)
   - Page number

4. Create searchable representation:
   - Caption text (for BM25)
   - Caption embedding (for semantic search)
   - OPTIONAL: CLIP embedding of image (for visual search)
   - OPTIONAL: LLM-generated description of figure

5. Store image file for later retrieval
```

**Figure storage:**
```json
{
  "figure_id": "figure_5_1",
  "document_id": "BS_EN_1991_1_3",
  "number": "5.1",
  "title": "Snow load shape coefficients",
  "caption": "Figure 5.1 - Shape coefficients for snow loads on roofs",
  "page": 14,
  "image_path": "figures/BS_EN_1991_1_3/figure_5_1.png",
  "surrounding_text": "The shape coefficient μ depends on the roof geometry...",
  "searchable_text": "Figure 5.1 Snow load shape coefficients roof geometry μ...",
  "llm_description": null  // Populated on-demand or in batch
}
```

**At query time:**
- If a figure is retrieved as relevant, load the image and pass to multimodal LLM (Claude) for interpretation
- LLM can describe what the diagram shows, read values from charts, explain procedures

### 1.5 Embedding Generation

**Libraries:**
- `sentence-transformers` - local embeddings (e.g., all-MiniLM-L6-v2, all-mpnet-base-v2)
- `openai` - text-embedding-3-small or text-embedding-3-large
- `cohere` - embed-english-v3.0
- `CLIP` - for image embeddings

**What gets embedded:**
```
- Every text chunk → embedding
- Every table's searchable_text → embedding
- Every figure's caption + surrounding_text → embedding
- OPTIONAL: figure images → CLIP embedding
```

**Storage:**
- `chromadb` - simple, local, good for prototyping
- `pgvector` (PostgreSQL extension) - production, combines with relational data
- `qdrant` - good performance, filtering support
- `pinecone` - managed, scalable

**Embedding metadata:**
```json
{
  "embedding_id": "emb_001",
  "source_type": "chunk|table|figure",
  "source_id": "chunk_001",
  "document_id": "BS_EN_1990_2002",
  "text": "...",
  "embedding": [0.23, -0.41, ...],
  "page": 34
}
```

### 1.6 Knowledge Graph Construction

#### 1.6.1 Entity Types

```yaml
Document:
  - id, title, code_number, version, publication_date, status

Clause:
  - id, number, title, document_id, page, text_summary

Table:
  - id, number, title, document_id, page, structured_data

Figure:
  - id, number, title, document_id, page, image_path

Parameter:
  - id, name, symbol, unit, description
  - e.g., "partial factor for permanent actions", "γG", "-"

Value:
  - id, numeric_value, unit, parameter_id, conditions

Concept:
  - id, name, aliases[], category
  - e.g., name="dead load", aliases=["permanent action", "self-weight"]

Material:
  - id, name, properties{}

StructureType:
  - id, name, category
  - e.g., "bridge", "building", "retaining wall"

LoadType:
  - id, name, category, aliases[]
  - e.g., "dead load", "live load", "wind load", "snow load"
```

#### 1.6.2 Relationship Types

```yaml
REFERENCES:
  - from: Clause|Table
  - to: Clause|Table|Figure|Document
  - e.g., Clause 5.3.2 REFERENCES Table NA.A1.2

DEFINED_IN:
  - from: Parameter|Concept|Value
  - to: Clause|Table
  - e.g., γG DEFINED_IN Clause 6.4.3.2

HAS_VALUE:
  - from: Parameter
  - to: Value
  - properties: conditions[]
  - e.g., γG HAS_VALUE 1.35 (when unfavourable)

VALID_WHEN:
  - from: Value
  - to: Condition (embedded or node)
  - e.g., 1.35 VALID_WHEN {effect: "unfavourable", action: "permanent"}

APPLIES_TO:
  - from: Clause|Document|Parameter
  - to: StructureType|Material|LoadType
  - e.g., BS EN 1991-2 APPLIES_TO "bridge"

PART_OF:
  - from: Clause|Table|Figure
  - to: Document|Section
  - e.g., Clause 5.3.2 PART_OF Section 5

SUPERSEDES:
  - from: Document
  - to: Document
  - e.g., BS EN 1990:2002+A1:2005 SUPERSEDES BS EN 1990:2002

MODIFIES:
  - from: Document (National Annex)
  - to: Clause|Table|Value
  - properties: modification_type
  - e.g., UK NA MODIFIES Table A1.2 (replaces values)

EQUIVALENT_TO:
  - from: Concept
  - to: Concept
  - e.g., "dead load" EQUIVALENT_TO "permanent action"
```

#### 1.6.3 Extraction Method

**Libraries:**
- `Claude API` or `OpenAI API` - for LLM extraction
- `spaCy` - NER for basic entity recognition
- `neo4j` - graph database
- `networkx` - in-memory graph for prototyping

**Extraction prompt:**
```
You are extracting entities and relationships from a construction design code.

Document: {document_name}
Section: {section_number} - {section_title}
Text:
"""
{section_text}
"""

Extract all entities and relationships. Return JSON:
{
  "entities": [
    {"type": "Parameter", "name": "...", "symbol": "...", "id": "..."},
    {"type": "Table", "number": "...", "title": "...", "id": "..."},
    ...
  ],
  "relationships": [
    {"from_id": "...", "type": "REFERENCES", "to_id": "...", "to_type": "Table", "confidence": 0.95, "evidence": "see Table 4.2"},
    ...
  ]
}

Rules:
- Include confidence score (0-1) for each relationship
- Include evidence (the text that supports the relationship)
- For references to other documents, include document name/number
- Extract parameter symbols (γG, fck, etc.) as separate entities
- Link values to their conditions (e.g., "1.35 for unfavourable")
```

**Validation pass:**
```python
def validate_extraction(extracted, document):
    validated = []
    flagged_for_review = []

    for rel in extracted["relationships"]:
        # Check 1: Does target exist?
        if rel["type"] == "REFERENCES":
            target_exists = verify_reference_target(rel["to_id"], document)
            if not target_exists:
                rel["confidence"] *= 0.3

        # Check 2: Cross-validate with regex
        if rel["type"] == "REFERENCES":
            regex_refs = extract_references_regex(document.text)
            if rel["to_id"] in regex_refs:
                rel["confidence"] = min(1.0, rel["confidence"] * 1.2)

        # Check 3: Table/Figure numbers should match pattern
        if "table" in rel["to_id"].lower():
            if not re.match(r"table[_\s]?\d+\.?\d*", rel["to_id"], re.I):
                rel["confidence"] *= 0.7

        # Route based on confidence
        if rel["confidence"] >= 0.85:
            validated.append(rel)
        elif rel["confidence"] >= 0.5:
            flagged_for_review.append(rel)
        # else: discard

    return validated, flagged_for_review
```

#### 1.6.4 Graph Storage

**Option A: Neo4j (recommended for production)**
```cypher
// Create entities
CREATE (c:Clause {id: "clause_5_3_2", number: "5.3.2", title: "Load combinations", document: "BS_EN_1990"})
CREATE (t:Table {id: "table_NA_A1_2", number: "NA.A1.2", title: "Design values of actions"})
CREATE (p:Parameter {id: "gamma_G", name: "partial factor for permanent actions", symbol: "γG"})

// Create relationships
MATCH (c:Clause {id: "clause_5_3_2"}), (t:Table {id: "table_NA_A1_2"})
CREATE (c)-[:REFERENCES {confidence: 0.95, evidence: "see Table NA.A1.2"}]->(t)
```

**Option B: PostgreSQL + Apache AGE (graph extension)**
- Familiar SQL + graph queries
- Single database for everything

**Option C: NetworkX + JSON (prototyping)**
- In-memory, simple
- Export to JSON for persistence

### 1.7 Chunk-Entity Mapping

**Purpose:** Connect searchable chunks to graph entities (many-to-many).

**Storage:**
```sql
CREATE TABLE chunk_entity_map (
    chunk_id VARCHAR,
    entity_id VARCHAR,
    entity_type VARCHAR,  -- Clause, Table, Parameter, etc.
    relation VARCHAR,     -- 'defines', 'mentions', 'contains', 'part_of'
    PRIMARY KEY (chunk_id, entity_id)
);
```

**Population:**
- When extracting entities, note which chunk they came from
- When chunking, check which entities are mentioned in each chunk
- Use regex + entity name matching

### 1.8 Alias / Synonym Index

**Purpose:** Map equivalent terms for query expansion and graph lookup.

```json
{
  "aliases": {
    "dead load": ["permanent action", "self-weight", "G", "Gk"],
    "live load": ["variable action", "imposed load", "Q", "Qk"],
    "safety factor": ["partial factor", "γ", "gamma"],
    "BS EN 1990": ["EN 1990", "Eurocode 0", "EC0", "Basis of design"],
    "γG": ["gamma G", "gamma_G", "partial factor for permanent actions"]
  }
}
```

**Libraries:**
- Custom dictionary (manual + LLM-assisted generation)
- `nltk.corpus.wordnet` - general synonyms (limited use for technical terms)

### 1.9 Document Section Index

**Purpose:** Enable "jump to section" functionality.

```json
{
  "document_id": "BS_EN_1990_2002",
  "sections": [
    {
      "identifier": "Section 5",
      "aliases": ["5", "Structural analysis"],
      "page_start": 31,
      "page_end": 38,
      "chunk_ids": ["chunk_045", "chunk_046", ...]
    },
    {
      "identifier": "Clause 5.3.2",
      "aliases": ["5.3.2", "Load combinations"],
      "page_start": 34,
      "page_end": 35,
      "chunk_ids": ["chunk_052"]
    },
    {
      "identifier": "Table NA.A1.2",
      "aliases": ["NA.A1.2", "Table NA.A1.2(B)"],
      "page": 28,
      "chunk_ids": ["chunk_030"]
    }
  ]
}
```

---

## Part 2: Query-Time Algorithm

### 2.0 Query Decomposition

**For complex queries, break into subquestions first.**

```python
def decompose_query(query: str) -> List[str]:
    """
    Input: "Do I need snow loading? What steps to check this?"
    Output: [
        "Does snow loading apply to my structure?",
        "What is the procedure to calculate snow loads?",
        "What code sections cover snow loading?"
    ]
    """
    prompt = f"""
    Query: {query}

    If this query asks multiple things, break it into separate subquestions.
    If it's a single question, return it as-is.

    Return as JSON: {{"subquestions": ["...", "..."]}}
    """
    return llm_call(prompt)["subquestions"]
```

**Process each subquestion through steps 1-7, then merge results.**

### 2.1 Parse Query → Structured Concepts

```python
def parse_query(query: str) -> QueryConcepts:
    prompt = f"""
    Parse this construction code query into structured concepts.

    Query: "{query}"

    Return JSON:
    {{
      "seeking": [
        {{"type": "Parameter|Table|Clause|Procedure|Requirement", "value": "...", "aliases": [...]}}
      ],
      "conditions": [
        {{"type": "LoadType|Material|StructureType|Location|UseCase", "value": "...", "aliases": [...]}}
      ],
      "intent": "lookup_value | find_procedure | check_applicability | find_requirements"
    }}

    Use the following alias mappings for expansion:
    {ALIAS_INDEX}
    """
    return llm_call(prompt)
```

**Example:**
```
Query: "factors of safety for dead loads for a concrete bridge"

Output:
{
  "seeking": [
    {"type": "Parameter", "value": "factor of safety", "aliases": ["partial factor", "γG", "gamma"]}
  ],
  "conditions": [
    {"type": "LoadType", "value": "dead load", "aliases": ["permanent action", "self-weight"]},
    {"type": "Material", "value": "concrete", "aliases": []},
    {"type": "StructureType", "value": "bridge", "aliases": []}
  ],
  "intent": "lookup_value"
}
```

### 2.2 Search (Parallel)

Run three searches simultaneously:

```python
async def search_all(concepts: QueryConcepts) -> SearchResults:
    # Build search terms from concepts + aliases
    search_terms = flatten([c["value"]] + c["aliases"] for c in concepts.all())

    # Run in parallel
    bm25_results, embedding_results, graph_results = await asyncio.gather(
        bm25_search(search_terms),
        embedding_search(concepts),
        graph_lookup(concepts)
    )

    return SearchResults(bm25_results, embedding_results, graph_results)
```

#### 2.2.1 BM25 / Keyword Search

**Libraries:**
- `rank_bm25` - pure Python BM25
- `elasticsearch` - full-featured, scalable
- `whoosh` - pure Python, simple
- `tantivy` (via `tantivy-py`) - fast, Rust-based

```python
def bm25_search(terms: List[str], top_k: int = 20) -> List[ChunkID]:
    """
    Search chunk text, table searchable_text, figure captions.
    """
    query = " OR ".join(terms)
    results = bm25_index.search(query, top_k=top_k)
    return [r.chunk_id for r in results]
```

#### 2.2.2 Embedding Search

```python
def embedding_search(concepts: QueryConcepts, top_k: int = 20) -> List[ChunkID]:
    """
    Semantic search using query embedding.
    """
    # Construct semantic query
    query_text = f"{concepts.intent}: {' '.join(c['value'] for c in concepts.all())}"
    query_embedding = embed(query_text)

    results = vector_db.search(query_embedding, top_k=top_k)
    return [r.chunk_id for r in results]
```

#### 2.2.3 Graph Lookup

```python
def graph_lookup(concepts: QueryConcepts) -> List[EntityID]:
    """
    Find entities matching concept values or aliases.
    """
    entity_ids = []

    for concept in concepts.all():
        # Search by name/value
        matches = graph.find_nodes(
            name_contains=concept["value"],
            type=concept["type"]
        )
        entity_ids.extend(matches)

        # Search by aliases
        for alias in concept["aliases"]:
            matches = graph.find_nodes(name_contains=alias)
            entity_ids.extend(matches)

    return list(set(entity_ids))
```

### 2.3 Map to Entry Nodes

```python
def get_entry_nodes(search_results: SearchResults) -> List[EntityID]:
    """
    Convert chunk IDs to entity IDs, union with direct graph results.
    """
    # Map chunks to entities
    chunk_entity_ids = []
    for chunk_id in search_results.bm25 + search_results.embedding:
        entity_ids = chunk_entity_map.get_entities(chunk_id)
        chunk_entity_ids.extend(entity_ids)

    # Union with direct graph lookup
    all_entry_nodes = set(chunk_entity_ids) | set(search_results.graph)

    return list(all_entry_nodes)
```

### 2.4 Traverse Graph

```python
def traverse_graph(
    entry_nodes: List[EntityID],
    intent: str,
    max_hops: int = 3
) -> List[TraversalResult]:
    """
    BFS from entry nodes, following relevant edge types.
    """
    # Edge types to follow based on intent
    edge_types = {
        "lookup_value": ["DEFINED_IN", "HAS_VALUE", "REFERENCES", "VALID_WHEN"],
        "find_procedure": ["REFERENCES", "PART_OF", "REQUIRES"],
        "check_applicability": ["APPLIES_TO", "VALID_WHEN", "REFERENCES"],
        "find_requirements": ["REFERENCES", "REQUIRES", "DEFINED_IN"]
    }.get(intent, ["REFERENCES", "DEFINED_IN"])

    visited = set()
    results = []
    queue = [(node_id, 0, [node_id]) for node_id in entry_nodes]  # (node, depth, path)

    while queue:
        node_id, depth, path = queue.pop(0)

        if node_id in visited or depth > max_hops:
            continue
        visited.add(node_id)

        node = graph.get_node(node_id)
        results.append(TraversalResult(
            entity_id=node_id,
            entity=node,
            depth=depth,
            path=path  # How we got here (provenance)
        ))

        # Expand along relevant edges
        for edge in graph.edges_from(node_id):
            if edge.type in edge_types:
                new_path = path + [edge.target_id]
                queue.append((edge.target_id, depth + 1, new_path))

    return results
```

### 2.5 Map Back to Text

```python
def get_chunks_for_entities(traversal_results: List[TraversalResult]) -> List[Chunk]:
    """
    Get actual text chunks for each reached entity.
    """
    chunks = []

    for result in traversal_results:
        entity_id = result.entity_id
        entity = result.entity

        # Get associated chunks
        chunk_ids = chunk_entity_map.get_chunks(entity_id)

        for chunk_id in chunk_ids:
            chunk = chunk_store.get(chunk_id)
            chunk.provenance = result.path  # Why this chunk was included
            chunk.entity_type = entity.type
            chunks.append(chunk)

        # For figures, also load the image
        if entity.type == "Figure":
            chunk.image_path = entity.image_path

    return deduplicate(chunks)
```

### 2.6 LLM Review

```python
def llm_review(
    query: str,
    concepts: QueryConcepts,
    chunks: List[Chunk],
    followed_refs: Set[str],
    figures: List[Figure]
) -> ReviewResult:

    # Format chunks for prompt
    chunks_text = format_chunks_with_ids(chunks)

    # If there are figures, include them as images for multimodal LLM
    images = [load_image(f.image_path) for f in figures]

    prompt = f"""
You are reviewing search results for a construction code query.

## Query
{query}

## Query Intent
{concepts.intent}

## Retrieved Content
{chunks_text}

## References Already Followed
{followed_refs}

## Your Tasks

1. **RELEVANT**: Which chunk IDs are relevant to answering the query? List them.

2. **IRRELEVANT**: Which chunk IDs are noise? List them.

3. **UNFOLLOWED REFERENCES**: In the relevant chunks, are there references to other clauses/tables/figures/documents that are NOT in "References Already Followed"?

   For each, provide:
   - ref: The reference (e.g., "Table 4.2", "BS EN 1991-1-1 Clause 3.2")
   - source_chunk: Which chunk contains this reference
   - why_needed: Why this reference might be needed for the query
   - reference_type: "explicit" (e.g., "see Table 4.2") or "implicit" (e.g., "see above")

4. **SURROUNDING CONTENT NEEDED**: Do any chunks reference content immediately before/after them (e.g., "see above", "following table", "as shown below")?

   For each, provide:
   - chunk_id: The chunk
   - direction: "before" | "after" | "both"
   - what_to_find: What type of content (table, figure, clause)

5. **COMPLETENESS**: Can you fully answer the query with current chunks?
   - answer: "yes" | "no" | "partial"
   - if no/partial: What specific information is missing?

Respond as JSON:
{{
  "relevant_chunk_ids": [...],
  "irrelevant_chunk_ids": [...],
  "unfollowed_references": [...],
  "surrounding_content_needed": [...],
  "completeness": {{
    "answer": "...",
    "missing": "..."
  }}
}}
"""

    # Use multimodal call if figures present
    if images:
        response = llm_call_multimodal(prompt, images)
    else:
        response = llm_call(prompt)

    return parse_review_result(response)
```

### 2.7 Follow-Up Searches

```python
def follow_references(
    review_result: ReviewResult,
    followed_refs: Set[str],
    chunks: List[Chunk]
) -> Tuple[List[Chunk], Set[str]]:
    """
    Search for unfollowed references and surrounding content.
    """
    new_chunks = []

    # Handle explicit references
    for ref in review_result.unfollowed_references:
        if ref["ref"] in followed_refs:
            continue

        followed_refs.add(ref["ref"])

        # Try document section index first (fast, precise)
        section_chunks = section_index.lookup(ref["ref"])

        if section_chunks:
            new_chunks.extend(section_chunks)
        else:
            # Fall back to search
            ref_chunks = bm25_search([ref["ref"]], top_k=5)
            ref_chunks += embedding_search_text(ref["ref"], top_k=5)
            new_chunks.extend(ref_chunks)

    # Handle surrounding content ("see above", etc.)
    for surrounding in review_result.surrounding_content_needed:
        chunk_id = surrounding["chunk_id"]
        direction = surrounding["direction"]

        adjacent = get_adjacent_chunks(
            chunk_id=chunk_id,
            direction=direction,
            count=2  # Get 2 chunks before/after
        )
        new_chunks.extend(adjacent)

    return deduplicate(new_chunks), followed_refs


def get_adjacent_chunks(chunk_id: str, direction: str, count: int) -> List[Chunk]:
    """
    Get chunks immediately before/after a given chunk.
    Uses chunk metadata: preceding_chunk_id, following_chunk_id
    """
    chunks = []
    current = chunk_store.get(chunk_id)

    if direction in ["before", "both"]:
        prev = current
        for _ in range(count):
            if prev.preceding_chunk_id:
                prev = chunk_store.get(prev.preceding_chunk_id)
                chunks.append(prev)
            else:
                break

    if direction in ["after", "both"]:
        next_chunk = current
        for _ in range(count):
            if next_chunk.following_chunk_id:
                next_chunk = chunk_store.get(next_chunk.following_chunk_id)
                chunks.append(next_chunk)
            else:
                break

    return chunks
```

### 2.8 Main Query Loop

```python
def query(user_query: str, max_iterations: int = 4) -> Answer:
    # Step 0: Decompose if needed
    subquestions = decompose_query(user_query)

    all_results = []

    for subquery in subquestions:
        # Step 1: Parse
        concepts = parse_query(subquery)

        # Step 2: Search
        search_results = search_all(concepts)

        # Step 3: Map to entry nodes
        entry_nodes = get_entry_nodes(search_results)

        # Step 4: Traverse graph
        traversal_results = traverse_graph(entry_nodes, concepts.intent)

        # Step 5: Map to chunks
        chunks = get_chunks_for_entities(traversal_results)
        figures = [c for c in chunks if c.entity_type == "Figure"]

        followed_refs = set()

        for iteration in range(max_iterations):
            # Step 6: LLM review
            review = llm_review(subquery, concepts, chunks, followed_refs, figures)

            # Check if complete
            if review.completeness.answer == "yes" and not review.unfollowed_references:
                break

            # Step 7: Follow references
            new_chunks, followed_refs = follow_references(review, followed_refs, chunks)

            if not new_chunks:
                # No new content found, stop
                break

            chunks.extend(new_chunks)
            figures = [c for c in chunks if c.entity_type == "Figure"]

        # Filter to relevant chunks only
        relevant_chunks = [c for c in chunks if c.id in review.relevant_chunk_ids]
        all_results.append((subquery, relevant_chunks, review))

    # Step 8: Format final answer
    return format_answer(user_query, all_results)
```

---

## Part 3: LLM Tools

Tools available to the LLM during query processing:

### 3.1 table_lookup

```python
def table_lookup(table_id: str, row_condition: str = None, column_condition: str = None) -> str:
    """
    Look up values in a table.

    Args:
        table_id: ID or number of the table (e.g., "NA.A1.2", "table_NA_A1_2")
        row_condition: Row label or condition (e.g., "permanent action", "unfavourable")
        column_condition: Column header to retrieve (e.g., "γG", "value")

    Returns:
        Matching cell value(s) or full table if no conditions
    """
    table = table_store.get(table_id)

    if not row_condition and not column_condition:
        return format_table_as_markdown(table)

    # Find matching rows
    matching_rows = [r for r in table.rows if row_condition.lower() in r.label.lower()]

    # Find matching column index
    col_idx = None
    if column_condition:
        for i, header in enumerate(table.headers):
            if column_condition.lower() in header.lower():
                col_idx = i
                break

    # Extract values
    if col_idx is not None:
        values = [r.values[col_idx] for r in matching_rows]
    else:
        values = [r.values for r in matching_rows]

    return str(values)
```

### 3.2 get_surrounding_content

```python
def get_surrounding_content(chunk_id: str, direction: str, count: int = 2) -> List[Chunk]:
    """
    Get content immediately before/after a chunk.

    Args:
        chunk_id: The reference chunk
        direction: "before", "after", or "both"
        count: Number of chunks to retrieve in each direction

    Returns:
        Adjacent chunks
    """
    return get_adjacent_chunks(chunk_id, direction, count)
```

### 3.3 jump_to_section

```python
def jump_to_section(document: str, section: str) -> List[Chunk]:
    """
    Jump to a specific section of a document.

    Args:
        document: Document name or code (e.g., "BS EN 1990", "EN 1991-1-3")
        section: Section identifier (e.g., "5.3.2", "Section 5", "Table NA.A1.2")

    Returns:
        Chunks for that section
    """
    # Normalize document name
    doc_id = resolve_document_alias(document)

    # Look up section
    section_info = section_index.lookup(doc_id, section)

    if section_info:
        return [chunk_store.get(cid) for cid in section_info.chunk_ids]

    # Fallback: search within document
    return bm25_search([section], filter_document=doc_id)
```

### 3.4 describe_figure

```python
def describe_figure(figure_id: str, question: str = None) -> str:
    """
    Get LLM description/interpretation of a figure.

    Args:
        figure_id: ID of the figure
        question: Specific question about the figure (optional)

    Returns:
        LLM-generated description or answer
    """
    figure = figure_store.get(figure_id)
    image = load_image(figure.image_path)

    if question:
        prompt = f"""
        This is Figure {figure.number}: "{figure.title}" from {figure.document_id}.

        Question: {question}

        Examine the figure and answer the question. If the figure contains a chart or graph,
        read the values. If it's a diagram, describe the relevant parts.
        """
    else:
        prompt = f"""
        This is Figure {figure.number}: "{figure.title}" from {figure.document_id}.

        Describe what this figure shows. Include:
        - Type of figure (diagram, chart, flowchart, detail drawing, etc.)
        - Key information conveyed
        - Any values, dimensions, or coefficients shown
        - How this figure would be used in practice
        """

    return llm_call_multimodal(prompt, [image])
```

---

## Part 4: Output Format

### 4.1 Final Answer Structure

```markdown
## Answer: "{original_query}"

### Summary
[LLM-generated direct answer to the query, synthesizing all findings]

---

### Detailed Findings

#### 1. [Topic/Subquestion 1]

**Source:** {document} - {clause/table/figure} (Page {X})

> [Relevant quote or rendered content]

[LLM explanation of how this applies to the query]

#### 2. [Topic/Subquestion 2]
...

---

### Tables

#### Table {number}: {title}
**Source:** {document}, Page {X}

| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| ...      | ...      | ...      |

[Highlight relevant rows/values]

---

### Figures

#### Figure {number}: {title}
**Source:** {document}, Page {X}

![Figure description](path/to/figure.png)

**Interpretation:** [LLM description of what the figure shows and how to use it]

---

### Reference Chain
[Show how the search progressed]

```
Query: "factors of safety for dead loads"
  ↓
Clause 6.4.3 (BS EN 1990) - defines partial factors
  ↓ references
Table NA.A1.2(B) - contains values for UK
  ↓ references
BS EN 1991-1-1 - for load values
```

---

### Sources

1. BS EN 1990:2002+A1:2005 - Basis of structural design
   - Clause 6.4.3, Page 34
   - Table NA.A1.2(B), Page 28

2. BS EN 1991-1-1:2002 - Densities, self-weight, imposed loads
   - Clause 5.2.3, Page 12

---

### Not Resolved (if any)

The following references could not be found:
- "Table X.Y" referenced in Clause Z (not found in available documents)
```

---

## Part 5: Edge Cases & Error Handling

### 5.1 No Search Results

```python
if not search_results.any():
    # Expand query using aliases
    expanded_terms = expand_with_aliases(concepts)
    search_results = search_all_with_terms(expanded_terms)

    if not search_results.any():
        # Try broader search
        search_results = embedding_search(query_text_only, top_k=30)

        if not search_results.any():
            return "No relevant content found. Please rephrase your query or check that the relevant documents are indexed."
```

### 5.2 Reference Not Found

```python
def follow_reference(ref: str) -> List[Chunk]:
    chunks = search_for_reference(ref)

    if not chunks:
        # Check for OCR/typo variants
        variants = generate_variants(ref)  # "Table 4.2" -> ["Table 4,2", "Table4.2", "Tabie 4.2"]
        for variant in variants:
            chunks = search_for_reference(variant)
            if chunks:
                break

        if not chunks:
            # Log as unresolved
            unresolved_refs.append({
                "reference": ref,
                "reason": "Not found in indexed documents"
            })

    return chunks
```

### 5.3 Conflicting Information

```python
def detect_conflicts(chunks: List[Chunk]) -> List[Conflict]:
    """
    Detect when same parameter has different values in different sources.
    """
    values_by_parameter = defaultdict(list)

    for chunk in chunks:
        # Extract parameter-value pairs
        pairs = extract_parameter_values(chunk)
        for param, value, source in pairs:
            values_by_parameter[param].append((value, source, chunk))

    conflicts = []
    for param, entries in values_by_parameter.items():
        unique_values = set(e[0] for e in entries)
        if len(unique_values) > 1:
            conflicts.append(Conflict(
                parameter=param,
                values=entries,
                resolution_hint="National Annex values take precedence over base Eurocode"
            ))

    return conflicts
```

### 5.4 Max Iterations Reached

```python
if iteration >= max_iterations:
    return Answer(
        content=format_partial_answer(chunks, review),
        warnings=[
            f"Search stopped after {max_iterations} iterations.",
            f"The following references were not fully explored: {list(review.unfollowed_references)}"
        ],
        confidence="partial"
    )
```

### 5.5 LLM Hallucinated Reference

```python
def validate_reference_exists(ref: str, source_chunk: Chunk) -> bool:
    """
    Before searching for a reference, verify it actually exists in the source chunk.
    Prevents LLM hallucination.
    """
    # Check if reference text appears in chunk
    ref_patterns = [
        ref,
        ref.replace(" ", ""),
        ref.lower()
    ]

    chunk_text = source_chunk.text.lower()

    for pattern in ref_patterns:
        if pattern.lower() in chunk_text:
            return True

    # Reference not found in claimed source - likely hallucination
    return False
```

---

## Part 6: Technology Stack Summary

### Required Libraries

```
# PDF Processing
pymupdf>=1.23.0           # PDF parsing, image extraction
pdfplumber>=0.10.0        # Table detection
camelot-py[cv]>=0.11.0    # Table extraction
pdf2image>=1.16.0         # PDF to image conversion
pytesseract>=0.3.10       # OCR fallback

# NLP & Embeddings
sentence-transformers>=2.2.0   # Local embeddings
openai>=1.0.0                  # OpenAI embeddings & LLM
anthropic>=0.18.0              # Claude API
tiktoken>=0.5.0                # Token counting

# Search
rank-bm25>=0.2.2          # BM25 search
chromadb>=0.4.0           # Vector database (dev)
pgvector>=0.2.0           # PostgreSQL vectors (prod)

# Graph
neo4j>=5.0.0              # Graph database
networkx>=3.0             # In-memory graph

# Web Framework
fastapi>=0.100.0          # API
uvicorn>=0.23.0           # Server

# Utilities
pillow>=10.0.0            # Image processing
numpy>=1.24.0
pandas>=2.0.0
pydantic>=2.0.0
```

### Infrastructure

```
Development:
- SQLite + ChromaDB + NetworkX (local, simple)
- Single machine

Production:
- PostgreSQL + pgvector (embeddings + relational)
- Neo4j (graph)
- S3/GCS (PDF & image storage)
- Redis (caching)
```

---

## Part 7: Test Cases

### Test Case 1: Snow Loading

**Query:** "Do I need to apply snow loading onto my structure? What steps would I need to take to check this and what part of the code should I refer to?"

**Document:** en.1991.1.3.2003_snow_loads.pdf

**Expected traversal:**
1. Parse → seeking: procedure/requirements, conditions: snow load
2. Find → Scope section (applicability), Section 5 (procedure)
3. Traverse → References to National Annex (UK snow map), shape coefficient tables
4. LLM review → Should find Figure 5.1, Tables 5.1-5.2

**Expected output should include:**
- Section 1.1 Scope - what structures snow loading applies to
- Section 5 or equivalent - snow load calculation procedure
- Snow load formula: s = μ × Ce × Ct × sk
- Reference to National Annex for characteristic snow load sk
- Shape coefficient tables/figures
- Altitude correction if applicable

### Test Case 2: Fire for Bridge

**Query:** "I am designing a bridge in London UK. Should I be considering potential issues regarding fire damage to my structure?"

**Document:** en.1991.1.2.2002_fire.pdf

**Expected traversal:**
1. Parse → seeking: applicability/requirements, conditions: fire, bridge
2. Find → Scope section
3. LLM review → Should identify that fire code is primarily for buildings

**Expected output should include:**
- Scope section stating what structure types are covered
- If bridges excluded: clear statement that BS EN 1991-1-2 is for buildings
- If bridges partially covered: relevant sections
- Possible reference to bridge-specific guidance (BD 37, etc.)

### Test Case 3: Concrete Density

**Query:** "What density should I use for reinforced concrete when calculating dead loads?"

**Expected traversal:**
1. Parse → seeking: value (density), conditions: concrete, reinforced, dead load
2. Find → BS EN 1991-1-1 density tables
3. Traverse → Reference chain to specific table

**Expected output should include:**
- Table with concrete densities
- Value: 25 kN/m³ for normal weight reinforced concrete
- Source: BS EN 1991-1-1, specific table number and page
- Any conditions or variations (lightweight, heavyweight)

---

## Part 8: Implementation Phases

### Phase 1: Core Pipeline (Weeks 1-2)
- [ ] PDF parsing and text extraction
- [ ] Chunking with document structure
- [ ] Basic table extraction
- [ ] Embedding generation
- [ ] BM25 index setup
- [ ] Simple query → search → return results

### Phase 2: Knowledge Graph (Weeks 3-4)
- [ ] Entity extraction prompts
- [ ] Relationship extraction
- [ ] Graph storage (Neo4j or NetworkX)
- [ ] Chunk-entity mapping
- [ ] Graph traversal in query pipeline

### Phase 3: Figure Handling (Week 5)
- [ ] Figure detection and extraction
- [ ] Figure metadata indexing
- [ ] Multimodal LLM integration for figure interpretation

### Phase 4: LLM Review Loop (Week 6)
- [ ] Review prompt implementation
- [ ] Reference following logic
- [ ] Surrounding content retrieval
- [ ] Iteration control

### Phase 5: Polish & Testing (Weeks 7-8)
- [ ] Output formatting
- [ ] Error handling
- [ ] Edge cases
- [ ] Test case validation
- [ ] Performance optimization
