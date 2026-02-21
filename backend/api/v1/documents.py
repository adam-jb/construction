import logging
import re
import uuid

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, UploadFile, File, status
from fastapi.responses import Response
from pydantic import BaseModel

from core.config import settings
from services.document_processor import DocumentProcessor

logger = logging.getLogger(__name__)
router = APIRouter()


class DocumentResponse(BaseModel):
    id: str
    code: str
    name: str
    pages: int
    status: str
    key_prefix: str  # For matching with references


class UploadResponse(BaseModel):
    documentId: str
    status: str


@router.get("/documents")
async def list_documents(request: Request) -> list[DocumentResponse]:
    """List all ingested documents."""
    store = request.app.state.store
    docs = []
    for doc_id, doc in store.documents.items():
        docs.append(DocumentResponse(
            id=doc_id,
            code=doc.get("code") or doc_id,
            name=doc.get("name") or "",
            pages=doc.get("pages") or 0,
            status=doc.get("status") or "unknown",
            key_prefix=doc.get("key_prefix") or doc_id,
        ))
    return docs


class RenameRequest(BaseModel):
    name: str


@router.get("/documents/{doc_id}")
async def get_document(request: Request, doc_id: str) -> DocumentResponse:
    """Get document details."""
    store = request.app.state.store
    doc = store.documents.get(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return DocumentResponse(
        id=doc_id,
        code=doc.get("code", doc_id),
        name=doc.get("name", ""),
        pages=doc.get("pages", 0),
        status=doc.get("status", "unknown"),
        key_prefix=doc.get("key_prefix", doc_id),
    )


@router.put("/documents/{doc_id}")
async def rename_document(request: Request, doc_id: str, body: RenameRequest):
    """Rename a document's display name."""
    store = request.app.state.store
    doc = store.documents.get(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    new_name = body.name.strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")

    # Check for duplicates across other documents
    for other_id, other_doc in store.documents.items():
        if other_id != doc_id and other_doc.get("code", "").lower() == new_name.lower():
            raise HTTPException(status_code=409, detail="A document with this name already exists")

    doc["code"] = new_name
    doc["name"] = new_name
    store.save("documents")

    return DocumentResponse(
        id=doc_id,
        code=doc.get("code", doc_id),
        name=doc.get("name", ""),
        pages=doc.get("pages", 0),
        status=doc.get("status", "unknown"),
        key_prefix=doc.get("key_prefix", doc_id),
    )


@router.post("/documents", status_code=status.HTTP_202_ACCEPTED)
async def upload_document(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
):
    """Upload a PDF for ingestion (processed in background)."""
    if not file.filename or not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    pdf_bytes = await file.read()
    if len(pdf_bytes) > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"File exceeds {settings.MAX_UPLOAD_SIZE_MB}MB limit")

    # Generate doc_id from filename
    doc_id = re.sub(r"[.\s]+", "_", file.filename.replace(".pdf", ""))

    store = request.app.state.store
    gemini = request.app.state.gemini
    pc = request.app.state.pinecone

    processor = DocumentProcessor(gemini, pc, store)
    background_tasks.add_task(processor.process_pdf, pdf_bytes, doc_id, file.filename)

    return UploadResponse(documentId=doc_id, status="processing")


@router.delete("/documents/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(request: Request, doc_id: str):
    """Delete a document and its data."""
    store = request.app.state.store
    pc = request.app.state.pinecone

    if doc_id not in store.documents:
        raise HTTPException(status_code=404, detail="Document not found")

    doc = store.documents[doc_id]
    prefix = doc.get("key_prefix", "")

    # Remove from Pinecone
    try:
        pc.delete_by_doc(doc_id)
    except Exception as e:
        logger.warning(f"Pinecone delete failed: {e}")

    # Remove from data stores
    for key in list(store.sections.keys()):
        if key.startswith(prefix):
            del store.sections[key]
    for key in list(store.references.keys()):
        if key.startswith(prefix):
            del store.references[key]
    for key in list(store.objects.keys()):
        if key.startswith(prefix):
            del store.objects[key]
    for key in list(store.precedence.keys()):
        if key.startswith(prefix):
            del store.precedence[key]
    del store.documents[doc_id]

    store.save_all()


@router.get("/documents/{doc_id}/pdf")
async def get_document_pdf(request: Request, doc_id: str):
    """Serve the PDF file for a document."""
    store = request.app.state.store
    doc = store.documents.get(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    file_key = doc.get("file_key", f"pdfs/{doc_id}.pdf")
    
    try:
        pdf_bytes = store.download_file(file_key)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'inline; filename="{doc.get("code", doc_id)}.pdf"',
                "Cache-Control": "public, max-age=3600",
            }
        )
    except Exception as e:
        logger.error(f"Failed to retrieve PDF for {doc_id}: {e}")
        raise HTTPException(status_code=404, detail="PDF file not found")


@router.get("/documents/{doc_id}/sections")
async def list_sections(request: Request, doc_id: str) -> list[dict]:
    """List all sections for a document."""
    store = request.app.state.store
    doc = store.documents.get(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    prefix = doc.get("key_prefix", "")
    sections = []
    for key, sec in store.sections.items():
        if key.startswith(prefix):
            sections.append({
                "id": key,
                "section_code": sec.get("section_code", ""),
                "title": sec.get("title", ""),
                "page": sec.get("page", 0),
                "content_length": len(sec.get("content", "")),
            })
    sections.sort(key=lambda s: s["page"])
    return sections
