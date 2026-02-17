import base64
import logging
import time
import uuid

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter()


class QueryRequest(BaseModel):
    query: str


class QueryResponse(BaseModel):
    queryId: str
    answer: str
    references: list
    steps: list
    processingTime: int  # milliseconds


@router.post("/query")
async def query_documents(request: Request, body: QueryRequest) -> QueryResponse:
    """Query documents with natural language."""
    if not body.query or len(body.query.strip()) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Query cannot be empty",
        )

    engine = request.app.state.engine
    store = request.app.state.store
    start = time.time()

    try:
        result = await engine.query(body.query.strip())
    except Exception as e:
        logger.error(f"Query failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Query processing failed: {str(e)}",
        )

    # Enrich references with base64 page images
    for ref in result.get("references", []):
        page_num = ref.get("page", 0)
        doc_id = ref.get("doc_id", "")

        # Find the actual doc_id from the prefix
        actual_doc_id = None
        for did, doc in store.documents.items():
            if doc.get("key_prefix", "") == doc_id:
                actual_doc_id = did
                break

        if actual_doc_id and page_num:
            try:
                img_bytes = store.download_file(
                    f"images/{actual_doc_id}/page_{page_num}.png"
                )
                ref["page_image_base64"] = base64.b64encode(img_bytes).decode()
            except Exception:
                ref["page_image_base64"] = None
        else:
            ref["page_image_base64"] = None

    elapsed_ms = int((time.time() - start) * 1000)

    return QueryResponse(
        queryId=str(uuid.uuid4())[:8],
        answer=result.get("answer", ""),
        references=result.get("references", []),
        steps=result.get("steps", []),
        processingTime=elapsed_ms,
    )
