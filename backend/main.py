from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from api.v1 import documents, query, references, health
from core.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events"""
    # Startup
    print("🚀 Starting Construction AI Backend...")
    print(f"📝 Environment: {settings.ENVIRONMENT}")
    print(f"🔧 Debug Mode: {settings.DEBUG}")
    
    # TODO: Initialize connections
    # - Neo4j client
    # - GCP Storage client
    # - Vector search client
    
    yield
    
    # Shutdown
    print("👋 Shutting down Construction AI Backend...")
    # TODO: Close connections


app = FastAPI(
    title="Construction AI API",
    description="AI-powered document search for construction codes and standards",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health.router, prefix="/api/v1", tags=["health"])
app.include_router(documents.router, prefix="/api/v1", tags=["documents"])
app.include_router(query.router, prefix="/api/v1", tags=["query"])
app.include_router(references.router, prefix="/api/v1", tags=["references"])


@app.get("/")
async def root():
    return {
        "message": "Construction AI API",
        "version": "0.1.0",
        "docs": "/docs" if settings.DEBUG else "disabled in production",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG,
    )
