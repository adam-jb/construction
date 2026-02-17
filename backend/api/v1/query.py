import base64
import logging
import time
import uuid

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter()


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str
    references: list = []


class QueryRequest(BaseModel):
    query: str = ""  # kept for backwards compat
    messages: list[ChatMessage] = []


class QueryResponse(BaseModel):
    queryId: str
    answer: str
    references: list
    steps: list
    processingTime: int  # milliseconds
    timings: dict = {}  # per-step timing breakdown
    missingDocuments: list = []  # referenced but not loaded


def _strip_base64_from_messages(messages: list[dict]) -> list[dict]:
    """Remove page_image_base64 from references in message history."""
    cleaned = []
    for msg in messages:
        refs = msg.get("references", [])
        cleaned_refs = [
            {k: v for k, v in ref.items() if k != "page_image_base64"}
            for ref in refs
        ]
        cleaned.append({**msg, "references": cleaned_refs})
    return cleaned


@router.post("/query")
async def query_documents(request: Request, body: QueryRequest) -> QueryResponse:
    """Query documents with natural language."""
    # Extract query text and messages
    if body.messages:
        # Find the latest user message
        user_msgs = [m for m in body.messages if m.role == "user"]
        if not user_msgs:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No user message found in messages",
            )
        query_text = user_msgs[-1].content.strip()
        messages = _strip_base64_from_messages(
            [m.model_dump() for m in body.messages]
        )
    elif body.query:
        query_text = body.query.strip()
        messages = [{"role": "user", "content": query_text, "references": []}]
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Query cannot be empty",
        )

    if not query_text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Query cannot be empty",
        )

    engine = request.app.state.engine
    store = request.app.state.store
    start = time.time()

    try:
        result = await engine.query(query_text, messages=messages)
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
        timings=result.get("timings", {}),
        missingDocuments=result.get("missing_documents", []),
    )
