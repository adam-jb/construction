import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.v1 import documents, query, references, health, debug
from core.config import settings
from services.gemini import GeminiService
from services.pinecone_search import PineconeSearch
from services.datastore import DataStore
from services.query_engine import QueryEngine

logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize services on startup, save on shutdown."""
    logger.info("Starting Construction AI Backend...")

    # DataStore (R2)
    store = DataStore(
        settings.R2_ENDPOINT_URL, settings.R2_ACCESS_KEY_ID,
        settings.R2_SECRET_ACCESS_KEY, settings.R2_BUCKET_NAME,
    )
    store.load_all()
    logger.info(f"DataStore loaded: {len(store.documents)} docs, {len(store.sections)} sections")

    # Gemini (OpenRouter + OpenAI)
    gemini = GeminiService(settings.OPENROUTER_API_KEY, settings.OPENAI_API_KEY)

    # Pinecone
    pc = PineconeSearch(settings.PINECONE_API_KEY, settings.PINECONE_INDEX_NAME)
    pc.ensure_index_exists(1536)
    logger.info("Pinecone connected")

    # Query Engine
    engine = QueryEngine(gemini, pc, store)

    # Attach to app state for access in endpoints
    app.state.store = store
    app.state.gemini = gemini
    app.state.pinecone = pc
    app.state.engine = engine

    yield

    # Shutdown: save all data
    logger.info("Shutting down — saving data stores...")
    store.save_all()
    logger.info("Shutdown complete")


app = FastAPI(
    title="Construction AI API",
    description="AI-powered document search for construction codes and standards",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api/v1", tags=["health"])
app.include_router(documents.router, prefix="/api/v1", tags=["documents"])
app.include_router(query.router, prefix="/api/v1", tags=["query"])
app.include_router(references.router, prefix="/api/v1", tags=["references"])
app.include_router(debug.router, prefix="/api/v1", tags=["debug"])


@app.get("/")
async def root():
    return {
        "message": "Construction AI API",
        "version": "0.1.0",
        "docs": "/docs" if settings.DEBUG else "disabled in production",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=settings.DEBUG)
