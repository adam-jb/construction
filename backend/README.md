# Construction AI Backend

FastAPI backend for AI-powered construction document search.

If ingestion is very slow, we might do this in bulk overnight for all the code they are likely to use


## Setup

```bash
# From project root
source .venv/bin/activate
pip install -r backend/requirements.txt
```

Required `.env` keys (in project root):
- `OPENROUTER_API_KEY` — LLM generation (Gemini via OpenRouter)
- `OPENAI_API_KEY` — embeddings (text-embedding-3-small)
- `PINECONE_API_KEY` — vector search
- `R2_ENDPOINT_URL`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` — Cloudflare R2 storage

## Running the server

```bash
cd backend
source ../.venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000
```

- Swagger UI: http://localhost:8000/docs
- Health check: http://localhost:8000/api/v1/health
- Debug view: http://localhost:8000/api/v1/debug/{doc_id} (HTML, shows sections/objects/images per page)


## Example query 
```bash
curl -X POST http://localhost:8000/api/v1/query \
    -H "Content-Type: application/json" \
    -d '{"query": "What density should be used for reinforced concrete?"}'
```


## Key endpoints

- `POST /api/v1/query` — Query documents: `{"query": "What density for reinforced concrete?"}`
- `GET /api/v1/documents` — List ingested documents
- `POST /api/v1/documents` — Upload a PDF for ingestion
- `GET /api/v1/references/{section_id}` — Reference graph for a section

## Architecture

```
backend/
├── main.py                      # FastAPI app, service init via lifespan
├── api/v1/
│   ├── health.py                # Service connectivity checks
│   ├── documents.py             # CRUD + upload + ingestion
│   ├── query.py                 # Query endpoint (base64 page images in response)
│   ├── references.py            # Reference graph builder
│   └── debug.py                 # HTML debug view per document/page
├── services/
│   ├── gemini.py                # LLM (OpenRouter) + embeddings (OpenAI)
│   ├── datastore.py             # R2-backed JSON dict store
│   ├── pinecone_search.py       # Vector search wrapper
│   ├── document_processor.py    # Full PDF ingestion pipeline
│   └── query_engine.py          # 11-step query pipeline
└── core/
    └── config.py                # Settings from .env
```

## Query pipeline (11 steps)

1. Intent classification (greeting / clarification / query)
2. Vector search (Pinecone top 10)
3. Keyword extraction + KV symbol expansion + keyword search
4. Relevance check (LLM filters candidates)
5. Expansion (if bottom-2 vector hits relevant, fetch more)
6-8. Follow cross-references up to 3 levels deep
9. Precedence check (which standard supersedes which)
10. Conflict detection
11. Answer synthesis with citations

## Cross-document reference resolution

References between sections/tables/figures are resolved with fuzzy matching:

- **Before**: exact key lookup only — 35% of references resolved. References to our own loaded docs were silently dropped due to naming mismatches (e.g. `EN_1991-1-4` vs `CEN_EN_1991-1-4:2005+A1`).
- **Now**: fuzzy matching handles dots/underscores, parenthetical subclauses (`5.2.3(1)` -> `5.2.3`), double-prefix bugs, and cross-document code matching — **83.4% resolved**.
- **Remaining 17%** are genuinely external documents we don't have loaded (EN 1990 Basis of Design, EN 1992 Concrete Design, ISO standards).
- The snow loads query follows references across 5 documents and checks ~100 referenced sections across 3 depth levels.

## Data storage

Every page of every PDF is stored twice:
- **Raw page text**: `{prefix}_page_{N}` — exact PyMuPDF extraction, guarantees 0% information loss
- **LLM sections**: `{prefix}_{section_code}` — structured splits with codes/titles from Gemini

Both are embedded in Pinecone and searchable. Objects (tables/figures) are stored separately with AI-generated descriptions.

## Demo recommendations

| Document | Code | Quality | Good demo queries |
|----------|------|---------|-------------------|
| Dead loads | EN 1991-1-1 | Best | "What density for reinforced concrete?", "What are imposed loads for office buildings?" |
| Fire | EN 1991-1-2 | Best | "What is the fire resistance requirement?", "How is equivalent time of fire exposure calculated?" |
| Snow | EN 1991-1-3 | Great | "What snow loads apply at 500m altitude?", "How are snow drift loads calculated?" |
| Wind | EN 1991-1-4 | Good | "What are external pressure coefficients for walls?", "How is peak velocity pressure calculated?" |
| Accidental | EN 1991-1-7 | OK | "What are the accidental load requirements?" |
| Thermal | EN 1991-1-5 | Raw pages only | Searchable but no structured sections |
| Construction | EN 1991-1-6 | Raw pages only | Searchable but no structured sections |

Dead loads + Snow is the strongest demo combo: dead loads covers the CLAUDE.md example use case (density tables), snow demonstrates cross-document reference following.
