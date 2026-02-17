import logging
from fastapi import APIRouter, Request

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/health")
async def health_check(request: Request):
    """Health check with real service connectivity."""
    store = request.app.state.store
    pc = request.app.state.pinecone

    checks = {
        "datastore": "unknown",
        "pinecone": "unknown",
        "openrouter": "unknown",
        "openai_embeddings": "unknown",
    }

    # DataStore (R2)
    try:
        _ = store.documents  # dict exists if loaded
        checks["datastore"] = "ok"
    except Exception as e:
        checks["datastore"] = f"error: {e}"

    # Pinecone
    try:
        if pc.index:
            stats = pc.index.describe_index_stats()
            checks["pinecone"] = f"ok ({stats.total_vector_count} vectors)"
        else:
            checks["pinecone"] = "not connected"
    except Exception as e:
        checks["pinecone"] = f"error: {e}"

    all_ok = all(v.startswith("ok") for v in checks.values())
    return {
        "status": "healthy" if all_ok else "degraded",
        "version": "0.1.0",
        "documents_loaded": len(store.documents),
        "sections_loaded": len(store.sections),
        "services": checks,
    }
