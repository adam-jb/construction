
# Construction AI Assistant

**AI-powered document search and analysis for construction codes and standards**

An intelligent assistant that helps engineers quickly find relevant information from design codes, building standards, and specifications using natural language queries with AI-powered semantic search and graph-based cross-referencing.

---

## 🎯 What This Does

Ask natural language questions like:
- *"What is the wind load factor for structures in terrain category 2?"*
- *"What are the fire rating requirements for steel columns?"*
- *"Show me all references to AS 1170.2 in the structural code"*

Get AI-generated answers with:
- ✅ Direct citations to specific pages and sections
- ✅ Highlighted text in the original PDF documents
- ✅ Related references via graph-based navigation
- ✅ Reasoning steps showing how the answer was derived

---

## 🏗️ Architecture

```
Frontend (React + TypeScript)
    ↓
Backend (FastAPI + Python)
    ↓ ↓ ↓
R2 files | Pinecone Vector Search | OpenRouter LLM | OpenAI embeddings
```

**Key Technologies:**
- **Frontend**: React, TypeScript, Vite, Tailwind CSS, PDF.js
- **Backend**: FastAPI, Python 3.11+

---

## 📁 Repository Structure

```
construction/
├── frontend/          # React application
├── backend/           # FastAPI backend
├── shared/            # Shared TypeScript types
├── openapi.yaml       # API contract
├── DEVELOPMENT.md     # Full development guide
└── docker-compose.yml # Local development setup
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Python 3.11+
- Docker Desktop

### Local Development

```bash
# 1. Install shared types
cd shared && npm install && npm run build && cd ..

# 2. Start backend
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# 3. Start frontend (new terminal)
cd frontend
npm install
npm run dev
```

Frontend runs at http://localhost:5173  
Backend API docs at http://localhost:8000/docs

---

## 📖 Documentation

- **[DEVELOPMENT.md](DEVELOPMENT.md)** - Complete development guide (architecture, data flow, API contract, sprint planning)
- **[openapi.yaml](openapi.yaml)** - API specification
- **[shared/types/](shared/types/)** - TypeScript type definitions

---

## 🎯 MVP Scope

### ✅ In MVP
- PDF document upload and processing
- Natural language queries
- AI-generated answers with citations
- Reference highlighting in PDF viewer
- Graph-based cross-referencing (Neo4j)
- Basic document management

### ❌ Out of MVP
- Team collaboration
- Multi-user permissions
- Project organization
- Note-taking features
- Chat history/memory
- Analytics dashboard

---

## 🏃 Current Status

**Phase**: Sprint 0 - Production Foundation  
**Branch**: `sprint-0-production-foundation`

**Completed**:
- [x] Repository restructure
- [x] Shared types package
- [x] OpenAPI specification
- [x] Development guide

**In Progress**:
- [ ] Backend scaffolding
- [ ] Frontend mock API
- [ ] Docker Compose setup

See [DEVELOPMENT.md](DEVELOPMENT.md) for detailed sprint planning.

---

## 👥 Team

- **Frontend + Tech Lead**: Building UI, defining architecture, API contracts
- **Backend**: Implementing API, PDF processing, AI integration

---

## 🔐 Environment Setup

### Frontend
```bash
# frontend/.env.local
VITE_API_URL=http://localhost:8000
VITE_USE_MOCK_API=true  # Toggle to false when backend is ready
```

### Backend
```bash
# backend/.env
DATABASE_URL=postgresql://...
NEO4J_URI=neo4j+s://xxx.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASSWORD=xxx
GCP_PROJECT_ID=construction-ai
GCP_BUCKET_NAME=construction-docs
OPENAI_API_KEY=sk-xxx
```

---

## 🧪 Testing

```bash
# Frontend
cd frontend
npm test
npm run test:e2e

# Backend
cd backend
pytest
pytest --cov
```

---

## 📦 Deployment

- **Frontend**: Vercel / Cloud Run
- **Backend**: Cloud Run
- **Neo4j**: Neo4j Aura (managed)
- **Storage**: GCP Cloud Storage
- **Vector DB**: GCP Vertex AI Vector Search

See `infrastructure/` for deployment configs.

---

## 📝 License

Proprietary - Internal use only

---

## 🤝 Contributing

1. Create feature branch from `main`
2. Follow TypeScript/Python style guides
3. Update API contract if needed (notify team)
4. Write tests
5. Submit PR with description

---

**For detailed development information, see [DEVELOPMENT.md](DEVELOPMENT.md)**
