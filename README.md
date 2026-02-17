
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

## Example Queries

The `/api/v1/query` endpoint accepts either a plain `query` string or a `messages` array for multi-turn conversation. The classifier routes each request as either `"query"` (run the full document search pipeline) or `"chat"` (conversational response, no search).

### 1. Single-shot technical question (backwards-compatible)

```bash
curl -X POST http://localhost:8000/api/v1/query \
  -H "Content-Type: application/json" \
  -d '{"query": "What density should be used for reinforced concrete?"}'
```

Classified as **query** — runs the full 11-step pipeline (vector search, keyword expansion, reference following, answer synthesis).

### 2. Greeting via conversation

```bash
curl -X POST http://localhost:8000/api/v1/query \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Hi, can you help me with Eurocode load combinations?"}
    ]
  }'
```

Classified as **chat** — returns a conversational reply, no document search.

### 3. New technical question in a conversation

```bash
curl -X POST http://localhost:8000/api/v1/query \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Hello"},
      {"role": "assistant", "content": "Hi! I can help you search Eurocodes..."},
      {"role": "user", "content": "What are the partial safety factors for dead loads on a concrete bridge?"}
    ]
  }'
```

Classified as **query** — the latest message is a real technical question, so the full pipeline runs.

### 4. Follow-up about previous results

```bash
curl -X POST http://localhost:8000/api/v1/query \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "What are the partial safety factors for dead loads?"},
      {"role": "assistant", "content": "According to EN 1990 Table A2.4(B)...", "references": [{"section_code": "EN_1990_A2.4", "page": 42}]},
      {"role": "user", "content": "Can you explain what the gamma_G,sup value means in that table?"}
    ]
  }'
```

Classified as **chat** — the user is asking about results already returned, so the LLM answers from conversation context without re-searching.

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

## 🔀 Git Workflow

We use **Git Flow** with protected branches to prevent merge conflicts:

```
main (production)     ← Only merge from develop via PR
  ↑
develop (integration) ← PR your feature branches here
  ↑
feature/* branches    ← Your day-to-day work
```

### Daily Workflow:

```bash
# 1. Start new feature
git checkout develop
git pull origin develop
git checkout -b feature/your-feature-name

# 2. Make changes, commit often
git add .
git commit -m "feat: description of changes"

# 3. Push and create PR
git push -u origin feature/your-feature-name
# Create PR to 'develop' (not main!) in GitHub

# 4. After PR merged, clean up
git checkout develop
git pull origin develop
git branch -d feature/your-feature-name
```

### Commit Message Convention:

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation only
- `style:` - Formatting, missing semicolons, etc.
- `refactor:` - Code restructuring
- `test:` - Adding tests
- `chore:` - Maintenance tasks

### Branch Protection Rules:

- `main` - Protected, requires PR from develop, 1 approval
- `develop` - Protected, requires PR from feature branches, 1 approval
- `feature/*` - Unprotected, delete after merge

**⚠️ Never commit directly to `main` or `develop`**

---

## 🤝 Contributing

1. **Branch** from latest `develop`
2. **Follow** TypeScript/Python style guides (Prettier, Black)
3. **Update** API contract if needed (`openapi.yaml`) and notify team
4. **Write** tests for new features
5. **PR** to `develop` with clear description and screenshots
6. **Review** other PRs promptly
7. **Merge** only after approval and passing CI

---

**For detailed development information, see [DEVELOPMENT.md](DEVELOPMENT.md)**
