from fastapi import APIRouter
from typing import Dict

router = APIRouter()


@router.get("/health")
async def health_check() -> Dict:
    """
    Health check endpoint
    
    Returns service status and version information.
    """
    # TODO: Add actual health checks for:
    # - Neo4j connection
    # - GCP Storage access
    # - Vector search availability
    # - OpenAI API access
    
    return {
        "status": "healthy",
        "version": "0.1.0",
        "services": {
            "neo4j": "unknown",
            "gcp_storage": "unknown",
            "vector_search": "unknown",
            "openai": "unknown",
        }
    }
