"""
Entity ingestion from a single PDF document.
Extracts entities and relationships, saves as graph JSON.

Usage:
    python ingest_entities.py pdfs/en.1991.1.1.2002.pdf
    python ingest_entities.py pdfs/en.1991.1.1.2002.pdf --max-pages 5
    python ingest_entities.py pdfs/en.1991.1.1.2002.pdf --start-page 1 --max-pages 10
"""

import os
import sys
import json
import base64
import fitz  # pymupdf
import pdfplumber
from openai import OpenAI
from dotenv import load_dotenv

# Load .env file
load_dotenv()

# =============================================================================
# CONFIGURATION
# =============================================================================

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")

MODEL = "gpt-5-nano-2025-08-07"
CHUNK_SIZE = 3000  # characters per chunk for LLM processing
MIN_IMAGE_SIZE = 100  # minimum width/height in pixels to consider an image meaningful

# =============================================================================
# EXTRACTION PROMPT
# =============================================================================

EXTRACT_ENTITIES_PROMPT = """Extract entities and relationships from this construction design code section.

Document: {document_name}
Page: {page_number}

Text:
\"\"\"
{text}
\"\"\"

Entity types to extract:
- Clause: numbered sections (e.g., "3.2.1", "4.1")
- Table: tables with numbers (e.g., "Table 4.1")
- Figure: figures/diagrams/charts with numbers (e.g., "Figure 5.2")
- Parameter: ANY named value - from text, from tables, from anywhere. Include symbol, value, units, and context.
- Concept: technical terms (e.g., "dead load", "permanent action", "snow load")
- Formula: equations and their descriptions (e.g., "Expression 6.10")

CRITICAL - For Tables:
- Create ONE Table entity for the table itself
- Create SEPARATE Parameter entities for EACH value/cell in the table
- Link each Parameter to the Table with CONTAINS relationship
- Example: Table showing densities → create Parameter for "reinforced concrete density = 25 kN/m³", Parameter for "steel density = 78.5 kN/m³", etc.

CRITICAL - For Parameters:
- Every numeric value with meaning should be a Parameter node
- Include: symbol, value, units, context (what it's for)
- This makes values searchable in the graph

Relationship types:
- REFERENCES: explicit reference to another clause/table/figure
- DEFINED_IN: where a parameter or concept is defined
- EQUIVALENT_TO: synonyms (e.g., "dead load" = "permanent action")
- CONTAINS: table/figure contains parameters
- USES: formula uses parameter

Return JSON only:
{{
  "entities": [
    {{"type": "Table", "id": "table_a1", "name": "Table A.1", "title": "Density of materials", "page": {page_number}}},
    {{"type": "Parameter", "id": "param_concrete_density", "name": "reinforced concrete density", "value": "25", "units": "kN/m³", "context": "for dead load calculations", "page": {page_number}}},
    {{"type": "Parameter", "id": "param_gamma_g", "name": "γG", "symbol": "γG", "value": "1.35", "units": "", "context": "partial factor for permanent actions", "page": {page_number}}},
    {{"type": "Clause", "id": "clause_4_1", "name": "4.1 General", "page": {page_number}}},
    {{"type": "Figure", "id": "figure_5_2", "name": "Figure 5.2", "description": "Load distribution diagram", "page": {page_number}}}
  ],
  "relationships": [
    {{"from_id": "table_a1", "type": "CONTAINS", "to_id": "param_concrete_density", "evidence": "Table A.1 row 1"}},
    {{"from_id": "clause_4_1", "type": "REFERENCES", "to_id": "table_a1", "evidence": "see Table A.1"}}
  ]
}}

Extract ALL values. Every number with meaning = a Parameter node. Return valid JSON only."""


# =============================================================================
# FUNCTIONS
# =============================================================================

def extract_text_from_pdf(pdf_path: str, start_page: int = 6, max_pages: int = None) -> list[dict]:
    """Extract text from PDF, page by page."""
    doc = fitz.open(pdf_path)
    pages = []

    total_pages = len(doc)
    start_idx = start_page - 1  # Convert to 0-indexed

    if max_pages:
        end_idx = min(total_pages, start_idx + max_pages)
    else:
        end_idx = total_pages

    for page_num in range(start_idx, end_idx):
        page = doc[page_num]
        text = page.get_text()
        if text.strip():
            pages.append({
                "page": page_num + 1,
                "text": text
            })

    doc.close()
    return pages


def extract_images_from_pdf(pdf_path: str, start_page: int = 6, max_pages: int = None) -> list[dict]:
    """Extract meaningful images (figures, charts, graphs) from PDF.

    Filters out small decorative images like logos, bullets, icons.
    """
    doc = fitz.open(pdf_path)
    images = []

    total_pages = len(doc)
    start_idx = start_page - 1  # Convert to 0-indexed

    if max_pages:
        end_idx = min(total_pages, start_idx + max_pages)
    else:
        end_idx = total_pages

    for page_num in range(start_idx, end_idx):
        page = doc[page_num]
        image_list = page.get_images()

        for img_index, img in enumerate(image_list):
            xref = img[0]
            try:
                base_image = doc.extract_image(xref)
                width = base_image.get("width", 0)
                height = base_image.get("height", 0)

                # Skip small images (decorative, logos, bullets)
                if width < MIN_IMAGE_SIZE or height < MIN_IMAGE_SIZE:
                    continue

                image_bytes = base_image["image"]
                image_b64 = base64.b64encode(image_bytes).decode("utf-8")

                images.append({
                    "page": page_num + 1,
                    "index": img_index,
                    "image_b64": image_b64,
                    "ext": base_image.get("ext", "png"),
                    "width": width,
                    "height": height
                })
            except Exception:
                continue

    doc.close()
    return images


def extract_tables_from_pdf(pdf_path: str, start_page: int = 6, max_pages: int = None) -> list[dict]:
    """Extract tables from PDF using pdfplumber's table detection."""
    tables = []

    with pdfplumber.open(pdf_path) as pdf:
        total_pages = len(pdf.pages)
        start_idx = start_page - 1  # Convert to 0-indexed

        if max_pages:
            end_idx = min(total_pages, start_idx + max_pages)
        else:
            end_idx = total_pages

        for page_num in range(start_idx, end_idx):
            page = pdf.pages[page_num]
            page_tables = page.extract_tables()

            for table_idx, table_data in enumerate(page_tables):
                if not table_data or len(table_data) < 2:  # Skip empty or single-row tables
                    continue

                # Convert to markdown for readability
                headers = table_data[0] if table_data else []
                rows = table_data[1:] if len(table_data) > 1 else []

                # Clean up None values
                headers = [str(h) if h else "" for h in headers]
                rows = [[str(cell) if cell else "" for cell in row] for row in rows]

                markdown = " | ".join(headers) + "\n"
                markdown += " | ".join(["---"] * len(headers)) + "\n"
                for row in rows:
                    markdown += " | ".join(row) + "\n"

                tables.append({
                    "page": page_num + 1,
                    "index": table_idx,
                    "headers": headers,
                    "rows": rows,
                    "markdown": markdown.strip()
                })

    return tables


def extract_entities_from_image(client: OpenAI, image_b64: str, ext: str, doc_name: str, page: int) -> dict:
    """Use vision model to extract entities from an image (figure/chart/graph)."""
    prompt = f"""Analyze this image from a construction design code document.
Document: {doc_name}, Page: {page}

CRITICAL: Extract EVERY fact, value, and piece of information as separate entities.
Someone searching the knowledge graph must be able to find ANY information shown in this image.

Extract as Parameter entities:
- All numeric values (dimensions, coefficients, factors, loads, distances)
- All labeled data points
- All axis values and ranges from charts
- All cell values from tables
- All annotations and callouts
- All formulas or expressions shown
- All conditions or ranges (e.g., "for slopes 0° to 30°")

Extract as Concept entities:
- Technical terms shown
- Categories or classifications depicted
- Relationships illustrated (e.g., "load increases with height")

For the image itself:
- Create ONE Figure/Chart/Table entity as the container
- Link ALL extracted Parameters and Concepts to it with CONTAINS

Return JSON:
{{
  "entities": [
    {{"type": "Figure", "id": "fig_p{page}_1", "name": "Figure X.X", "description": "comprehensive description of what the figure shows", "page": {page}}},
    {{"type": "Parameter", "id": "param_1", "name": "snow load coefficient μ1", "symbol": "μ1", "value": "0.8", "units": "", "context": "for roof slope 30°", "page": {page}}},
    {{"type": "Parameter", "id": "param_2", "name": "roof slope range", "value": "0° to 60°", "context": "applicable range for coefficient", "page": {page}}},
    {{"type": "Concept", "id": "concept_1", "name": "drifted snow load", "description": "accumulation pattern on leeward side", "page": {page}}}
  ],
  "relationships": [
    {{"from_id": "fig_p{page}_1", "type": "CONTAINS", "to_id": "param_1", "evidence": "labeled in figure"}},
    {{"from_id": "fig_p{page}_1", "type": "CONTAINS", "to_id": "param_2", "evidence": "axis range"}},
    {{"from_id": "fig_p{page}_1", "type": "CONTAINS", "to_id": "concept_1", "evidence": "illustrated in diagram"}}
  ]
}}

If the image is decorative (logo, border, no information), return empty entities array.
Be exhaustive. Every fact = a node. Return valid JSON only."""

    response = client.chat.completions.create(
        model=MODEL,
        messages=[{
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": f"data:image/{ext};base64,{image_b64}"}}
            ]
        }],
        #temperature=0.1,
        response_format={"type": "json_object"}
    )

    content = response.choices[0].message.content
    result = json.loads(content)

    # Debug: print what was extracted
    for e in result.get("entities", []):
        etype = e.get('type', '?')
        name = e.get('name', e.get('id', '?'))
        val = e.get('value', '')
        units = e.get('units', '')
        print(f"      → {etype}: {name}" + (f" = {val}{units}" if val else ""))

    return result


def extract_entities_from_table(client: OpenAI, table: dict, doc_name: str) -> dict:
    """Use LLM to extract entities from a detected table."""
    prompt = f"""Extract entities from this table found in a construction design code.

Document: {doc_name}
Page: {table['page']}

Table content (markdown):
{table['markdown']}

CRITICAL: Create a Parameter entity for EACH cell value that has meaning.
Every numeric value, coefficient, factor, or named value = a separate Parameter node.

Return JSON:
{{
  "entities": [
    {{"type": "Table", "id": "table_p{table['page']}_{table['index']}", "name": "Table X.X", "title": "infer from content", "page": {table['page']}}},
    {{"type": "Parameter", "id": "param_1", "name": "descriptive name", "value": "the value", "units": "if any", "context": "row/column context", "page": {table['page']}}},
    ...more parameters for each meaningful cell...
  ],
  "relationships": [
    {{"from_id": "table_p{table['page']}_{table['index']}", "type": "CONTAINS", "to_id": "param_1", "evidence": "row X, column Y"}}
  ]
}}

Return valid JSON only."""

    response = client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"}
    )

    content = response.choices[0].message.content
    result = json.loads(content)

    # Debug: print what was extracted
    for e in result.get("entities", []):
        etype = e.get('type', '?')
        name = e.get('name', e.get('id', '?'))
        val = e.get('value', '')
        units = e.get('units', '')
        print(f"      → {etype}: {name}" + (f" = {val}{units}" if val else ""))

    return result


def chunk_text(text: str, chunk_size: int = CHUNK_SIZE) -> list[str]:
    """Split text into chunks, trying to break at paragraph boundaries."""
    if len(text) <= chunk_size:
        return [text]

    chunks = []
    current = ""

    paragraphs = text.split("\n\n")
    for para in paragraphs:
        if len(current) + len(para) + 2 <= chunk_size:
            current += para + "\n\n"
        else:
            if current:
                chunks.append(current.strip())
            current = para + "\n\n"

    if current.strip():
        chunks.append(current.strip())

    return chunks if chunks else [text[:chunk_size]]


def extract_entities_from_chunk(client: OpenAI, text: str, doc_name: str, page: int) -> dict:
    """Use LLM to extract entities from a text chunk."""
    prompt = EXTRACT_ENTITIES_PROMPT.format(
        document_name=doc_name,
        page_number=page,
        text=text
    )

    response = client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": prompt}],
        #temperature=0.1,
        response_format={"type": "json_object"}
    )

    content = response.choices[0].message.content
    result = json.loads(content)

    # Debug: print what was extracted
    for e in result.get("entities", []):
        etype = e.get('type', '?')
        name = e.get('name', e.get('id', '?'))
        val = e.get('value', '')
        units = e.get('units', '')
        print(f"      → {etype}: {name}" + (f" = {val}{units}" if val else ""))

    return result


def build_graph(extractions: list[dict], doc_id: str) -> dict:
    """Build a graph structure from all extractions."""
    nodes = {}
    edges = []

    for extraction in extractions:
        # Add entities as nodes
        for entity in extraction.get("entities", []):
            node_id = f"{doc_id}_{entity['id']}"
            node_data = {
                "id": node_id,
                "type": entity.get("type"),
                "name": entity.get("name"),
                "page": entity.get("page"),
                "document": doc_id
            }
            # Include all extra fields (content, value, units, description, context, etc.)
            for key in ["title", "content", "description", "symbol", "value", "units", "context"]:
                if key in entity and entity[key]:
                    node_data[key] = entity[key]

            nodes[node_id] = node_data

        # Add relationships as edges
        for rel in extraction.get("relationships", []):
            edges.append({
                "source": f"{doc_id}_{rel['from_id']}",
                "target": f"{doc_id}_{rel['to_id']}",
                "type": rel["type"],
                "evidence": rel.get("evidence", "")
            })

    # NetworkX-compatible format
    return {
        "directed": True,
        "multigraph": False,
        "graph": {"document": doc_id},
        "nodes": [{"id": nid, **data} for nid, data in nodes.items()],
        "links": edges
    }


def ingest_document(pdf_path: str, output_path: str = None, start_page: int = 6, max_pages: int = None) -> dict:
    """Main ingestion function.

    Args:
        pdf_path: Path to PDF file
        output_path: Where to save the graph JSON (default: data/graph_<docid>.json)
        start_page: Page to start from (default: 6, to skip front matter)
        max_pages: Maximum pages to process (default: None = all pages)
    """
    if not os.path.exists(pdf_path):
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    doc_name = os.path.basename(pdf_path)
    doc_id = os.path.splitext(doc_name)[0].replace(".", "_")

    if output_path is None:
        output_path = f"data/graph_{doc_id}.json"

    # Ensure output directory exists
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)

    if max_pages:
        print(f"Processing {doc_name} (pages {start_page} to {start_page + max_pages - 1})...")
    else:
        print(f"Processing {doc_name} (from page {start_page})...")

    # Extract text
    print("Extracting text...")
    pages = extract_text_from_pdf(pdf_path, start_page, max_pages)
    print(f"  Found {len(pages)} pages with text")

    # Extract tables (using pdfplumber's detection)
    print("Extracting tables...")
    tables = extract_tables_from_pdf(pdf_path, start_page, max_pages)
    print(f"  Found {len(tables)} tables")

    # Extract images (figures, charts, graphs) - filtered by size
    print("Extracting images...")
    images = extract_images_from_pdf(pdf_path, start_page, max_pages)
    print(f"  Found {len(images)} meaningful images (filtered small/decorative)")

    # Initialize OpenAI client
    client = OpenAI(api_key=OPENAI_API_KEY)

    extractions = []

    # Process text chunks
    total_chunks = sum(len(chunk_text(p["text"])) for p in pages)
    processed = 0

    print(f"Extracting entities from text ({total_chunks} chunks)...")

    for page_data in pages:
        chunks = chunk_text(page_data["text"])

        for chunk in chunks:
            if len(chunk.strip()) < 50:  # Skip very short chunks
                processed += 1
                continue

            try:
                extraction = extract_entities_from_chunk(
                    client, chunk, doc_name, page_data["page"]
                )
                extractions.append(extraction)

                entity_count = len(extraction.get("entities", []))
                rel_count = len(extraction.get("relationships", []))
                processed += 1
                print(f"  [{processed}/{total_chunks}] Page {page_data['page']}: {entity_count} entities, {rel_count} relationships")

            except Exception as e:
                processed += 1
                print(f"  [{processed}/{total_chunks}] Page {page_data['page']}: Error - {e}")

    # Process tables (detected by pdfplumber)
    if tables:
        print(f"Extracting entities from tables ({len(tables)} tables)...")
        for i, table in enumerate(tables):
            try:
                extraction = extract_entities_from_table(client, table, doc_name)
                if extraction.get("entities"):
                    extractions.append(extraction)
                    entity_count = len(extraction.get("entities", []))
                    print(f"  [{i+1}/{len(tables)}] Page {table['page']}: {entity_count} entities from table")
            except Exception as e:
                print(f"  [{i+1}/{len(tables)}] Page {table['page']}: Error - {e}")

    # Process images
    if images:
        print(f"Extracting entities from images ({len(images)} images)...")
        for i, img_data in enumerate(images):
            try:
                extraction = extract_entities_from_image(
                    client,
                    img_data["image_b64"],
                    img_data["ext"],
                    doc_name,
                    img_data["page"]
                )
                if extraction.get("entities"):
                    extractions.append(extraction)
                    entity_count = len(extraction.get("entities", []))
                    print(f"  [{i+1}/{len(images)}] Page {img_data['page']}: {entity_count} entities from image")
                else:
                    print(f"  [{i+1}/{len(images)}] Page {img_data['page']}: skipped (not meaningful)")
            except Exception as e:
                print(f"  [{i+1}/{len(images)}] Page {img_data['page']}: Error - {e}")

    print("Building graph...")
    graph = build_graph(extractions, doc_id)

    print(f"Saving to {output_path}...")
    with open(output_path, "w") as f:
        json.dump(graph, f, indent=2)

    print(f"\nDone!")
    print(f"  Nodes: {len(graph['nodes'])}")
    print(f"  Edges: {len(graph['links'])}")

    return graph


# =============================================================================
# MAIN
# =============================================================================

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Extract entities from PDF into graph JSON")
    parser.add_argument("pdf_path", help="Path to PDF file")
    parser.add_argument("-o", "--output", help="Output JSON path (default: data/graph_<docid>.json)")
    parser.add_argument("--start-page", type=int, default=6,
                        help="Page to start from (default: 6, to skip front matter)")
    parser.add_argument("--max-pages", type=int, default=None,
                        help="Max pages to process (default: all)")

    args = parser.parse_args()

    ingest_document(args.pdf_path, args.output, args.start_page, args.max_pages)
