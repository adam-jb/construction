# Construction AI Backend

FastAPI backend for AI-powered construction document search.

## Setup

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set up environment
cp .env.example .env
# Edit .env with your API keys

# Run development server
uvicorn main:app --reload
```

API docs available at: http://localhost:8000/docs

## Project Structure

```
backend/
├── main.py                 # FastAPI app entry point
├── api/
│   └── v1/                # API v1 endpoints
│       ├── health.py      # Health check
│       ├── documents.py   # Document management
│       ├── query.py       # Query endpoint
│       └── references.py  # Reference management
├── services/              # Business logic
│   ├── document_processor.py  # PDF processing
│   ├── query_engine.py        # Query orchestration
│   ├── vector_search.py       # Vector embeddings & search
│   └── graph_service.py       # Neo4j graph operations
└── core/
    └── config.py          # Settings
```

## TODO for Adam

See extensive inline TODOs in each file. Key areas:

1. **Document Processing** (`services/document_processor.py`)
   - PyMuPDF text extraction
   - Section identification
   - Text chunking with overlap

2. **Vector Search** (`services/vector_search.py`)
   - OpenAI embeddings generation
   - GCP Vector Search integration
   - Batch processing

3. **Graph Service** (`services/graph_service.py`)
   - Neo4j connection
   - Graph schema implementation
   - Cypher queries for traversal

4. **Query Engine** (`services/query_engine.py`)
   - Full pipeline orchestration
   - Context assembly
   - Citation extraction

5. **API Endpoints** (`api/v1/*.py`)
   - Implement upload logic
   - Connect to services
   - Error handling

## Development

```bash
# Run tests
pytest

# Run with auto-reload
uvicorn main:app --reload --log-level debug

# Check code style
black .
flake8 .
```

## API Contract

See `../openapi.yaml` for full API specification.

Key endpoints:
- `POST /api/v1/documents` - Upload PDF
- `POST /api/v1/query` - Query documents
- `GET /api/v1/documents/{id}/pages/{page}` - Get page

---

For full development guide, see `../DEVELOPMENT.md`
