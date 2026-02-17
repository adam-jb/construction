import logging
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter()


class GraphNode(BaseModel):
    id: str
    type: str
    label: str
    page: int = 0


class GraphEdge(BaseModel):
    source: str
    target: str
    type: str


class GraphContext(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    focusNodeId: str


@router.get("/references/{section_id}")
async def get_references(request: Request, section_id: str) -> dict:
    """Get references for a section."""
    store = request.app.state.store
    refs = store.references.get(section_id)
    if refs is None:
        raise HTTPException(status_code=404, detail="Section not found")
    return {"section_id": section_id, "references": refs}


@router.get("/references/{section_id}/graph")
async def get_reference_graph(
    request: Request, section_id: str, depth: int = 2,
) -> GraphContext:
    """Build a reference graph from a section outward."""
    if depth < 1 or depth > 5:
        raise HTTPException(status_code=400, detail="Depth must be 1-5")

    store = request.app.state.store

    sec = store.sections.get(section_id)
    if not sec:
        raise HTTPException(status_code=404, detail="Section not found")

    nodes = {}
    edges = []
    visited = set()

    def _add_node(sid: str):
        if sid in nodes:
            return
        s = store.sections.get(sid) or store.objects.get(sid)
        if s:
            nodes[sid] = GraphNode(
                id=sid,
                type="section" if sid in store.sections else "object",
                label=s.get("section_code") or s.get("code", sid),
                page=s.get("page", 0),
            )
        else:
            nodes[sid] = GraphNode(id=sid, type="external", label=sid)

    def _traverse(sid: str, current_depth: int):
        if current_depth > depth or sid in visited:
            return
        visited.add(sid)
        _add_node(sid)

        refs = store.references.get(sid, [])
        for ref_key in refs:
            _add_node(ref_key)
            edges.append(GraphEdge(source=sid, target=ref_key, type="references"))
            if current_depth < depth:
                _traverse(ref_key, current_depth + 1)

    _traverse(section_id, 1)

    return GraphContext(
        nodes=list(nodes.values()),
        edges=edges,
        focusNodeId=section_id,
    )
