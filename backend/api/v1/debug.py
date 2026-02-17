"""Debug endpoint — shows per-page extraction details as HTML."""

import base64
import logging

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/debug/{doc_id}", response_class=HTMLResponse)
async def debug_document(request: Request, doc_id: str, page: int = 0):
    """
    Debug view showing extraction details for a document.
    If page=0, shows summary. If page>0, shows that page's details.
    """
    store = request.app.state.store
    doc = store.documents.get(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    prefix = doc.get("key_prefix", "")
    total_pages = doc.get("pages", 0)

    if page == 0:
        # Summary view
        sections = {k: v for k, v in store.sections.items() if k.startswith(prefix)}
        objects = {k: v for k, v in store.objects.items() if k.startswith(prefix)}
        refs = {k: v for k, v in store.references.items() if k.startswith(prefix)}
        prec = {k: v for k, v in store.precedence.items() if k.startswith(prefix)}

        # KV entries for this doc
        kv_entries = {k: v for k, v in store.kv_store.items()
                      if isinstance(v, dict) and v.get("doc_id") == doc_id}

        html = f"""<!DOCTYPE html>
<html><head><title>Debug: {doc_id}</title>
<style>
body {{ font-family: monospace; max-width: 1200px; margin: 0 auto; padding: 20px; }}
table {{ border-collapse: collapse; width: 100%; margin: 10px 0; }}
td, th {{ border: 1px solid #ccc; padding: 6px 10px; text-align: left; }}
th {{ background: #f0f0f0; }}
a {{ color: #0066cc; }}
h2 {{ border-bottom: 2px solid #333; padding-bottom: 5px; }}
</style>
</head><body>
<h1>Debug: {doc_id}</h1>
<p>Code: {doc.get('code')} | Name: {doc.get('name')} | Pages: {total_pages} | Status: {doc.get('status')}</p>

<h2>Pages</h2>
<p>Click a page to see extraction details:</p>
<p>{"".join(f'<a href="?page={i}">[{i}]</a> ' for i in range(1, total_pages + 1))}</p>

<h2>Sections ({len(sections)})</h2>
<table><tr><th>Key</th><th>Code</th><th>Title</th><th>Page</th><th>Content Len</th></tr>"""

        for k, s in sorted(sections.items(), key=lambda x: x[1].get("page", 0)):
            html += f'<tr><td>{k}</td><td>{s.get("section_code", "")}</td><td>{s.get("title", "")}</td><td>{s.get("page", "")}</td><td>{len(s.get("content", ""))}</td></tr>'

        html += f"""</table>

<h2>Objects ({len(objects)})</h2>
<table><tr><th>Key</th><th>Type</th><th>Code</th><th>Title</th><th>Page</th><th>Description (preview)</th></tr>"""

        for k, o in sorted(objects.items(), key=lambda x: x[1].get("page", 0)):
            desc_preview = (o.get("description") or "")[:100]
            html += f'<tr><td>{k}</td><td>{o.get("type", "")}</td><td>{o.get("code", "")}</td><td>{o.get("title", "")}</td><td>{o.get("page", "")}</td><td>{desc_preview}</td></tr>'

        html += f"""</table>

<h2>References ({len(refs)} sections with refs)</h2>
<table><tr><th>Section</th><th>References</th></tr>"""

        for k, r in sorted(refs.items()):
            if r:
                html += f'<tr><td>{k}</td><td>{", ".join(str(x) for x in r)}</td></tr>'

        html += f"""</table>

<h2>Precedence ({len(prec)})</h2>
<table><tr><th>Key</th><th>Supersedes</th><th>Superseded By</th><th>Note</th></tr>"""

        for k, p in prec.items():
            html += f'<tr><td>{k}</td><td>{p.get("supersedes", [])}</td><td>{p.get("superseded_by", [])}</td><td>{p.get("note", "")}</td></tr>'

        html += f"""</table>

<h2>KV Pairs ({len(kv_entries)})</h2>
<table><tr><th>Key</th><th>Value</th></tr>"""

        for k, v in kv_entries.items():
            val = v.get("value", str(v)) if isinstance(v, dict) else str(v)
            html += f'<tr><td>{k}</td><td>{val}</td></tr>'

        html += "</table></body></html>"
        return html

    # Page detail view
    if page < 1 or page > total_pages:
        raise HTTPException(status_code=400, detail=f"Page must be 1-{total_pages}")

    # Load page image from R2
    try:
        img_bytes = store.download_file(f"images/{doc_id}/page_{page}.png")
        img_b64 = base64.b64encode(img_bytes).decode()
    except Exception:
        img_b64 = None

    # Find sections on this page
    page_sections = []
    for k, s in store.sections.items():
        if k.startswith(prefix) and s.get("page") == page:
            page_sections.append((k, s))

    # Find objects on this page
    page_objects = []
    for k, o in store.objects.items():
        if k.startswith(prefix) and o.get("page") == page:
            page_objects.append((k, o))

    # Find references from sections on this page
    page_refs = {}
    for k, s in page_sections:
        refs = store.references.get(k, [])
        if refs:
            page_refs[k] = refs

    html = f"""<!DOCTYPE html>
<html><head><title>Debug: {doc_id} - Page {page}</title>
<style>
body {{ font-family: monospace; max-width: 1400px; margin: 0 auto; padding: 20px; }}
.grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }}
img {{ max-width: 100%; border: 1px solid #ccc; }}
.section {{ background: #f8f8f8; padding: 10px; margin: 5px 0; border-left: 3px solid #0066cc; }}
.object {{ background: #fff8f0; padding: 10px; margin: 5px 0; border-left: 3px solid #cc6600; }}
pre {{ white-space: pre-wrap; word-wrap: break-word; font-size: 11px; max-height: 400px; overflow-y: auto; }}
a {{ color: #0066cc; }}
h2 {{ border-bottom: 2px solid #333; padding-bottom: 5px; }}
</style>
</head><body>
<h1><a href="?page=0">Debug: {doc_id}</a> - Page {page}/{total_pages}</h1>
<p>"""

    if page > 1:
        html += f'<a href="?page={page-1}">&laquo; Prev</a> | '
    if page < total_pages:
        html += f'<a href="?page={page+1}">Next &raquo;</a>'

    html += "</p><div class='grid'><div>"
    html += "<h2>Page Render</h2>"
    if img_b64:
        html += f'<img src="data:image/png;base64,{img_b64}" />'
    else:
        html += "<p>(image not available)</p>"

    html += "</div><div>"
    html += f"<h2>Sections on Page {page} ({len(page_sections)})</h2>"

    for k, s in page_sections:
        content = s.get("content", "")
        html += f"""<div class='section'>
<strong>{s.get('section_code', '')} — {s.get('title', '')}</strong> ({len(content)} chars)
<pre>{_escape_html(content[:2000])}</pre>
</div>"""

    html += f"<h2>Objects on Page {page} ({len(page_objects)})</h2>"
    for k, o in page_objects:
        html += f"""<div class='object'>
<strong>{o.get('type', '')} — {o.get('code', '')} — {o.get('title', '')}</strong>
<pre>{_escape_html(o.get('description', ''))}</pre>
</div>"""

    html += f"<h2>References from Page {page}</h2>"
    if page_refs:
        for k, refs in page_refs.items():
            html += f"<p><strong>{k}:</strong> {', '.join(str(r) for r in refs)}</p>"
    else:
        html += "<p>(none)</p>"

    html += "</div></div></body></html>"
    return html


def _escape_html(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
