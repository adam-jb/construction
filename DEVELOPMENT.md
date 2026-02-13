# Development Guide - Construction AI Assistant

**Sprint 0 Foundation Document**  
Last Updated: February 13, 2026

This document is the single source of truth for moving from prototype to production. Both frontend and backend teams should refer to this guide.

---

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Repository Structure](#repository-structure)
3. [Data Flow](#data-flow)
4. [API Contract](#api-contract)
5. [Frontend Development](#frontend-development)
6. [Backend Development](#backend-development)
7. [Local Development Setup](#local-development-setup)
8. [MVP Scope](#mvp-scope)
9. [Sprint Planning](#sprint-planning)

---

## Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (React)                      │
│              Vercel / Cloud Run Deployment                   │
└──────────────┬──────────────────────────────────────────────┘
               │ HTTP/REST + SSE
               │
┌──────────────▼──────────────────────────────────────────────┐
│                    Backend (FastAPI)                         │
│                   Cloud Run Service                          │
└──┬──────────┬──────────────┬──────────────┬────────────────┘
   │          │               │              │
   │          │               │              │
┌──▼────┐ ┌──▼────────┐ ┌───▼──────┐ ┌────▼──────────┐
│Cloud  │ │Neo4j Aura │ │GCP Vector│ │   OpenAI API  │
│Storage│ │  (Graph)  │ │  Search  │ │   (LLM)       │
│(PDFs) │ │           │ │(Embeddings)│               │
└───────┘ └───────────┘ └──────────┘ └───────────────┘
```

### Tech Stack

**Frontend**
- React 18 + TypeScript
- Vite (build tool)
- Tailwind CSS
- Zustand (state management)
- PDF.js (document rendering)
- React Query (API calls)

**Backend**
- FastAPI (Python 3.11+)
- Neo4j (graph database for cross-references)
- GCP Vector Search / Vertex AI (embeddings)
- Cloud Storage (PDF storage)
- Cloud Run Jobs (background processing)
- OpenAI API (LLM + embeddings)

**Shared**
- TypeScript types package (`@construction-ai/shared`)
- OpenAPI 3.0 specification

---

## Repository Structure

```
construction/
├── README.md                  # High-level project overview
├── DEVELOPMENT.md             # This file - development guide
├── openapi.yaml               # API contract (SSOT)
├── docker-compose.yml         # Local development environment
│
├── frontend/                  # React application
│   ├── src/
│   │   ├── api/              # API client + mock implementation
│   │   ├── components/       # React components
│   │   ├── hooks/            # Custom hooks
│   │   ├── stores/           # Zustand stores
│   │   ├── types/            # Frontend-specific types
│   │   └── utils/            # Utilities
│   ├── public/
│   ├── package.json
│   └── vite.config.ts
│
├── backend/                   # FastAPI application
│   ├── api/                  # REST endpoints
│   │   ├── v1/
│   │   │   ├── documents.py
│   │   │   ├── query.py
│   │   │   └── references.py
│   │   └── deps.py           # Dependencies
│   ├── services/             # Business logic
│   │   ├── document_processor.py
│   │   ├── query_engine.py
│   │   ├── vector_search.py
│   │   └── graph_service.py
│   ├── models/               # Pydantic models
│   ├── core/                 # Configuration
│   ├── main.py               # FastAPI app entry
│   ├── requirements.txt
│   └── Dockerfile
│
├── shared/                    # Shared TypeScript types
│   ├── types/
│   │   ├── documents.ts
│   │   ├── queries.ts
│   │   ├── references.ts
│   │   ├── chat.ts
│   │   └── api.ts
│   ├── package.json
│   └── tsconfig.json
│
└── infrastructure/            # Deployment configs
    ├── terraform/
    └── docker/
```

---

## Data Flow

### 1. Document Upload Flow

```
User uploads PDF
    ↓
Frontend → POST /api/v1/documents
    ↓
Backend saves to Cloud Storage
    ↓
Trigger Pub/Sub → Cloud Run Job
    ↓
PDF Processing:
  - Extract text (PyMuPDF)
  - Identify sections/clauses
  - Generate embeddings (OpenAI)
  - Store in Vector DB
  - Create graph nodes/edges (Neo4j)
    ↓
Update document status → ready
```

### 2. Query Flow

```
User enters query
    ↓
Frontend → POST /api/v1/query
    ↓
Backend Query Engine:
  1. Generate query embedding
  2. Vector similarity search → top K chunks
  3. Neo4j graph traversal → related sections
  4. LLM synthesis with context
  5. Extract citations
    ↓
Stream response back to frontend
    ↓
Display answer + references
```

### 3. Document Viewing Flow

```
User clicks reference
    ↓
Frontend → GET /api/v1/documents/{id}/pages/{page}
    ↓
Backend returns:
  - Page image URL (Cloud Storage)
  - Text content
  - Highlight coordinates
    ↓
PDF.js renders with highlights
```

---

## API Contract

**The OpenAPI spec (`openapi.yaml`) is the single source of truth.**

### Key Endpoints

#### Health Check
```
GET /api/v1/health
Response: 200 OK
```

#### Upload Document
```
POST /api/v1/documents
Content-Type: multipart/form-data
Body: { file: binary, type: string }
Response: 202 Accepted
{
  "documentId": "uuid",
  "status": "processing",
  "estimatedProcessingTime": 180
}
```

#### Query Documents
```
POST /api/v1/query
Content-Type: application/json
Body: {
  "query": "What is the wind load factor for structures?",
  "documentIds": ["doc1", "doc2"],
  "options": { "includeReasoning": true }
}
Response: 200 OK (or SSE stream if options.stream = true)
{
  "queryId": "uuid",
  "answer": "The wind load factor...",
  "references": [
    {
      "id": "ref1",
      "documentId": "doc1",
      "documentName": "AS 1170.2",
      "page": 45,
      "section": "5.3.2",
      "label": "Wind Load Factors",
      "excerpt": "For structures in terrain category 2...",
      "highlightText": ["load factor", "wind"],
      "confidence": 0.95
    }
  ],
  "reasoning": [
    {
      "step": 1,
      "description": "Searched vector DB for wind load factors",
      "action": "search"
    },
    {
      "step": 2,
      "description": "Traversed graph to find related standards",
      "action": "graph_traverse"
    }
  ]
}
```

#### Get Document Page
```
GET /api/v1/documents/{documentId}/pages/{pageNumber}
Response: 200 OK
{
  "documentId": "doc1",
  "pageNumber": 45,
  "imageUrl": "https://storage.googleapis.com/.../page-45.png",
  "textContent": "5.3.2 Wind Load Factors...",
  "annotations": []
}
```

---

## Frontend Development

### Responsibilities
- Build all UI/UX
- Implement against mock API initially
- Handle state management
- PDF rendering with highlighting
- Error handling and loading states
- Responsive design

### Getting Started

```bash
cd frontend
npm install
npm run dev
```

### Mock API Implementation

Located in `frontend/src/api/mock.ts`:

```typescript
// Toggle between mock and real API
const USE_MOCK = import.meta.env.VITE_USE_MOCK_API === 'true';

export const apiClient = USE_MOCK ? mockAPI : realAPI;
```

**Mock API simulates:**
- 1-2 second delays
- Realistic response data
- Error scenarios
- Streaming responses (for SSE)

### State Management

Use Zustand for global state:

```typescript
// stores/documentStore.ts
interface DocumentStore {
  documents: Document[];
  selectedDocumentId: string | null;
  activePage: number;
  setActivePage: (page: number) => void;
}
```

### Component Structure

```
components/
├── layout/
│   ├── Header.tsx
│   ├── Sidebar.tsx
│   └── MainLayout.tsx
├── documents/
│   ├── DocumentUpload.tsx
│   ├── DocumentList.tsx
│   ├── DocumentViewer.tsx
│   └── PageNavigator.tsx
├── query/
│   ├── QueryInput.tsx
│   ├── QueryResults.tsx
│   ├── ReferenceCard.tsx
│   └── ReasoningSteps.tsx
└── shared/
    ├── Button.tsx
    ├── LoadingSpinner.tsx
    └── ErrorBoundary.tsx
```

### Testing Checklist

- [ ] Upload flow (drag-and-drop, file picker)
- [ ] Query input and results display
- [ ] PDF viewer with navigation
- [ ] Highlight system on PDF pages
- [ ] Reference click → document jump
- [ ] Mobile responsive
- [ ] Error states (network failure, invalid file)
- [ ] Loading states with skeletons

---

## Backend Development

### Responsibilities
- Implement API endpoints per OpenAPI spec
- PDF processing pipeline
- Vector search implementation
- Neo4j graph management
- LLM integration
- Background job processing

### Getting Started

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

### Project Structure

```python
# main.py
from fastapi import FastAPI
from api.v1 import documents, query, references

app = FastAPI(title="Construction AI API")
app.include_router(documents.router, prefix="/api/v1")
app.include_router(query.router, prefix="/api/v1")
app.include_router(references.router, prefix="/api/v1")
```

### Key Services

#### 1. Document Processor Service

```python
# services/document_processor.py
class DocumentProcessor:
    async def process_pdf(self, file_path: str) -> ProcessedDocument:
        """
        1. Extract text with PyMuPDF
        2. Identify sections/clauses
        3. Generate embeddings
        4. Store in vector DB
        5. Create Neo4j nodes/edges
        """
        pass
```

#### 2. Query Engine Service

```python
# services/query_engine.py
class QueryEngine:
    async def query(self, request: QueryRequest) -> QueryResponse:
        """
        1. Generate query embedding
        2. Vector search
        3. Graph traversal (Neo4j Cypher)
        4. LLM synthesis
        5. Extract citations
        """
        pass
```

#### 3. Vector Search Service

```python
# services/vector_search.py
class VectorSearchService:
    async def search(self, query_embedding: List[float], k: int = 10):
        """Query GCP Vector Search / Vertex AI"""
        pass
```

#### 4. Graph Service

```python
# services/graph_service.py
class GraphService:
    async def create_document_graph(self, doc_id: str, sections: List[Section]):
        """Create Neo4j nodes and relationships"""
        pass
    
    async def traverse_references(self, section_id: str, depth: int = 2):
        """Cypher query for related sections"""
        pass
```

### Neo4j Schema

```cypher
// Nodes
(:Document {id, name, type, uploadedAt})
(:Section {id, title, page, docId})
(:Clause {id, text, page, sectionId})
(:Table {id, caption, page})
(:Figure {id, caption, page})

// Relationships
(:Section)-[:BELONGS_TO]->(:Document)
(:Clause)-[:IN_SECTION]->(:Section)
(:Clause)-[:REFERENCES]->(:Clause)
(:Document)-[:CITES]->(:Document)
(:Section)-[:SUPERSEDES]->(:Section)
```

### Environment Variables

```bash
# .env
DATABASE_URL=postgresql://...
NEO4J_URI=neo4j+s://xxx.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASSWORD=xxx
GCP_PROJECT_ID=construction-ai
GCP_BUCKET_NAME=construction-docs
OPENAI_API_KEY=sk-xxx
VECTOR_INDEX_ENDPOINT=xxx
```

### Testing Checklist

- [ ] Health check endpoint
- [ ] Document upload (saves to Cloud Storage)
- [ ] Background job triggers processing
- [ ] PDF text extraction works
- [ ] Embeddings generation
- [ ] Vector search returns results
- [ ] Neo4j graph creation
- [ ] Query endpoint returns formatted response
- [ ] Citation extraction is accurate
- [ ] SSE streaming works

---

## Local Development Setup

### Prerequisites

- Node.js 18+
- Python 3.11+
- Docker Desktop
- GCP account (or use mock services)

### Quick Start

```bash
# 1. Clone repo
cd construction

# 2. Install shared types
cd shared
npm install
npm run build
cd ..

# 3. Start services with Docker Compose
docker-compose up -d
# This starts:
# - Neo4j (localhost:7474)
# - Mock GCP services (optional)

# 4. Start backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# 5. Start frontend (in new terminal)
cd frontend
npm install
npm run dev
# Opens http://localhost:5173

# 6. Set frontend to use mock API
echo "VITE_USE_MOCK_API=true" > frontend/.env.local
```

### Docker Compose Services

```yaml
# docker-compose.yml
services:
  neo4j:
    image: neo4j:5.15
    ports:
      - "7474:7474"  # Browser
      - "7687:7687"  # Bolt
    environment:
      NEO4J_AUTH: neo4j/testpassword
```

---

## MVP Scope

### ✅ In MVP

- PDF upload (one at a time)
- Document processing (text extraction, embeddings)
- Natural language query
- AI-generated answers with citations
- Reference highlighting in PDF viewer
- Graph-based cross-references
- Basic document list view
- Single user (no auth for MVP)

### ❌ Out of MVP

- ~~Collaboration features~~
- ~~Team sharing~~
- ~~Project organization~~
- ~~Non-PDF file types~~
- ~~Folder structures~~
- ~~Note-taking~~
- ~~Team insights~~
- ~~Permission controls~~
- ~~Memory/context across chats~~
- ~~Chat summaries (NotebookLM-style)~~
- ~~AI analytics~~

### Nice-to-Have (Post-MVP)

- Document comparison
- Bulk upload
- Export query results
- Saved searches
- Dark mode
- Keyboard shortcuts
- Mobile app

---

## Sprint Planning

### Sprint 0 (Current) - Foundation
**Duration**: 1 week  
**Goal**: Production-ready structure

- [x] Restructure repository
- [x] Create shared types package
- [x] Define OpenAPI contract
- [x] Create this development guide
- [ ] Backend scaffolding
- [ ] Frontend mock API
- [ ] Docker Compose setup
- [ ] Update README

### Sprint 1 - Core Upload & Processing
**Duration**: 2 weeks  
**Goal**: End-to-end document processing

**Backend**:
- [ ] Implement document upload endpoint
- [ ] Cloud Storage integration
- [ ] PDF text extraction
- [ ] Basic embeddings generation
- [ ] Store in vector DB

**Frontend**:
- [ ] Document upload UI
- [ ] Upload progress indicator
- [ ] Document list view
- [ ] Status polling

### Sprint 2 - Query Engine
**Duration**: 2 weeks  
**Goal**: Basic query functionality

**Backend**:
- [ ] Query endpoint
- [ ] Vector similarity search
- [ ] LLM integration (OpenAI)
- [ ] Citation extraction
- [ ] Response formatting

**Frontend**:
- [ ] Query input UI
- [ ] Results display
- [ ] Reference cards
- [ ] Basic error handling

### Sprint 3 - Document Viewer & Neo4j
**Duration**: 2 weeks  
**Goal**: Full viewing experience + graph

**Backend**:
- [ ] Page endpoint
- [ ] Neo4j schema implementation
- [ ] Graph population during processing
- [ ] Graph traversal in queries

**Frontend**:
- [ ] PDF.js integration
- [ ] Highlight system
- [ ] Page navigation
- [ ] Reference click → jump to page

### Sprint 4 - Polish & Integration
**Duration**: 1 week  
**Goal**: Production-ready MVP

- [ ] Frontend connects to real API
- [ ] End-to-end testing
- [ ] Performance optimization
- [ ] Error handling polish
- [ ] Deployment to GCP
- [ ] Basic monitoring

---

## Integration Timeline

### Week 1-3: Parallel Development
- Frontend builds against mock API
- Backend implements real endpoints
- Weekly sync on API contract changes

### Week 4: Integration Week
- Frontend switches to real API
- Fix integration issues
- E2E testing
- Performance testing

### Week 5: Pre-Pilot
- Deploy to staging
- Customer demos
- Gather feedback
- Bug fixes

---

## Communication Protocol

### Daily
- Slack updates on progress
- Blockers shared immediately

### Weekly
- 30min sync meeting
- API contract review
- Integration planning

### Ad-hoc
- API changes require notification
- Breaking changes need coordination
- Schema changes need discussion

---

## Key Technical Decisions

### Why Neo4j?
Construction codes have complex cross-references. Graph DB makes traversing these relationships natural and fast.

### Why GCP Vector Search?
Native GCP integration, managed service, scales well. Alternative: pgvector (simpler but less scalable).

### Why FastAPI?
- Best Python async framework
- Automatic OpenAPI docs
- Great for ML/AI integration
- Strong type hints

### Why Vite?
- Fastest dev server
- Best HMR
- Modern build tool
- Great DX

---

## Questions & Answers

**Q: What if OpenAPI spec changes?**  
A: Increment version, notify team, update shared types, frontend mock API, then backend.

**Q: How do we handle large PDFs?**  
A: Background job processing, chunking strategy, progress updates via status polling.

**Q: What about authentication?**  
A: Post-MVP. For now, single tenant/user assumed.

**Q: Deployment strategy?**  
A: Frontend → Vercel/Cloud Run, Backend → Cloud Run, Neo4j → Aura, Storage → GCS.

---

## Success Metrics

**MVP Success Criteria:**
- Upload 50+ page PDF successfully
- Process in < 5 minutes
- Query returns relevant results 80%+ of time
- Citations are accurate
- UI is responsive (< 200ms interactions)
- Can handle 3 pilot customers concurrently

---

## Resources

- **OpenAPI Spec**: `openapi.yaml`
- **Shared Types**: `shared/types/`
- **Architecture Diagram**: See Adam's PNG
- **Neo4j Browser**: http://localhost:7474
- **API Docs** (when backend running): http://localhost:8000/docs

---

**Last Updated**: February 13, 2026  
**Maintained By**: Tech Lead (You) + Backend Lead (Adam)  
**Next Review**: End of Sprint 1
