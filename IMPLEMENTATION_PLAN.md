# Implementation Plan: Entity Ingestion Enhancements

## Overview

Two main enhancements to `ingest_entities.py`:
1. **Hybrid Knowledge Graph with Rule Entities** - Add calculation logic as executable rule objects
2. **Improved Image Extraction** - Replace simple image extraction with spatial clustering for figure regions

---

## Part 1: Rule Entity Type & Related Changes

### 1.1 Update `EXTRACT_ENTITIES_PROMPT` (Lines 37-88)

**Add to entity types list:**
```
- Rule: any calculation, formula, conditional logic, or decision table. Capture:
  - inputs: list of parameter IDs this rule consumes
  - output: parameter ID this rule produces
  - expression: the formula as a string (e.g., "mu_i * Ce * Ct * sk")
  - conditions: list of conditions defining when this rule applies
  - source_clause: the clause ID where this rule is defined
  - priority: "P" if Principle (mandatory), "AR" if Application Rule
```

**Add to relationship types:**
```
- COMPUTES: rule computes a parameter (from Rule to output Parameter)
- REQUIRES: rule requires an input parameter (from Rule to input Parameter)
- GOVERNED_BY: rule is governed by a clause (from Rule to Clause)
- CONDITIONAL_ON: rule applicability depends on a condition or another parameter
- DEFERS_TO: clause/parameter defers decision to National Annex or other authority
- SUPERSEDED_BY: one rule/value overrides another under certain conditions
```

**Add example entities to JSON template:**
```json
{"type": "Rule", "id": "rule_snow_roof_persistent", "name": "Snow load on roof (persistent)", "expression": "mu_i * Ce * Ct * sk", "inputs": ["param_mu_i", "param_Ce", "param_Ct", "param_sk"], "output": "param_s", "conditions": [{"context": "persistent/transient design situation"}], "source_clause": "clause_5_2", "priority": "AR", "page": 18}
```

**Add NDP (Nationally Determined Parameter) guidance:**
- On Parameter entities, add optional `"ndp": true` and `"recommended_value"` fields
- Create Authority entity for National Annex references
- Example:
```json
{"type": "Parameter", "id": "param_sk", "name": "characteristic ground snow load", "symbol": "sk", "ndp": true, "recommended_value": "see NA", "page": 12}
{"type": "Authority", "id": "national_annex", "name": "National Annex"}
```
- Relationship: `{"from_id": "param_sk", "type": "DEFERS_TO", "to_id": "national_annex"}`

### 1.2 Update `build_graph()` (Lines 385-424)

**Changes:**
1. Include additional fields for Rule entities: `expression`, `inputs`, `output`, `conditions`, `source_clause`, `priority`
2. Include NDP fields for Parameters: `ndp`, `recommended_value`
3. After building the main graph, extract all Rule-type nodes into a separate dict
4. Return both graph and rules dict

**Implementation (~15 lines added at end of function):**
```python
# Extract rules into sidecar structure
rules = {}
for node in nodes.values():
    if node.get("type") == "Rule":
        rules[node["id"]] = {
            "expression": node.get("expression", ""),
            "inputs": node.get("inputs", []),
            "output": node.get("output", ""),
            "conditions": node.get("conditions", []),
            "source_clause": node.get("source_clause", ""),
            "priority": node.get("priority", "")
        }

return graph, rules
```

### 1.3 Update `ingest_document()` (Lines 427-547)

**Changes:**
1. Receive both `graph` and `rules` from `build_graph()`
2. Compute rules output path: `data/rules_<docid>.json`
3. Save rules file alongside graph file
4. Update console output to show rules count

---

## Part 2: Improved Image Extraction with Spatial Clustering

### 2.1 New function `extract_figure_regions()` (Replace lines 121-167)

**Function signature:**
```python
def extract_figure_regions(pdf_path: str, start_page: int = 6, max_pages: int = None) -> list[dict]:
```

**Algorithm (10 steps):**

1. **For each page:** Render full page pixmap at 200 DPI using `page.get_pixmap(dpi=200)`

2. **Collect non-text bounding boxes:**
   - From `page.get_drawings()`: take each drawing's `rect`
   - From `page.get_images()`: for each xref, get rect via `page.get_image_rects(xref)`
   - Flatten into list of `fitz.Rect` objects

3. **Collect text bounding boxes:**
   - From `page.get_text("dict")["blocks"]` where `block["type"] == 0`
   - Store separately for filtering in step 5

4. **Cluster non-text rects:**
   - Merge any two rects whose gap < 30px (expand each by 15px, check intersection)
   - Loop until no more merges occur

5. **Filter clusters:**
   - Remove if width < 150px OR height < 150px (page points)
   - Remove if >70% of area covered by text blocks

6. **Pad and clamp:**
   - Pad each surviving bbox by 10px
   - Clamp to page bounds

7. **Convert to pixmap coordinates:**
   - Multiply by `dpi/72` to convert page points to pixels
   - Crop using `fitz.IRect`

8. **Collect nearby text:**
   - Find text blocks overlapping or within 20px below figure bbox
   - Concatenate as `nearby_text` string

9. **Base64-encode** each cropped image

10. **Return format:**
```python
{"page": int, "bbox": [x0, y0, x1, y1], "image_b64": str, "ext": "png", "nearby_text": str}
```

### 2.2 Update `extract_entities_from_image()` (Lines 215-283)

**Changes:**
- Add `nearby_text: str = ""` parameter
- Include in prompt: `"Text near this figure: {nearby_text}"` to ground the model

### 2.3 Update `ingest_document()` (Lines 516-534)

**Changes:**
- Replace `extract_images_from_pdf()` with `extract_figure_regions()`
- Pass `nearby_text` field to `extract_entities_from_image()`
- Update log message text

---

## Summary of Changes

| Location | What Changes |
|----------|--------------|
| `EXTRACT_ENTITIES_PROMPT` (L37-88) | Add Rule entity type, NDP fields, 6 new relationship types, updated examples |
| `extract_images_from_pdf` (L121-167) | Replace entirely with `extract_figure_regions` |
| `extract_entities_from_image` (L215-283) | Add `nearby_text` param, include in prompt |
| `build_graph` (L385-424) | Handle new entity fields, extract rules dict, return tuple |
| `ingest_document` (L427-547) | Use new image function, save rules file, unpack tuple return |

---

## Testing

```bash
python ingest_entities.py pdfs/en.1991.1.3.2003.pdf --max-pages 5
```

**Verify:**
- `data/graph_en_1991_1_3_2003.json` contains Rule nodes with expression/inputs/output fields
- `data/rules_en_1991_1_3_2003.json` exists with flat rule dict
- Figure regions detected and cropped properly (check image count in output)
- Vision model receives `nearby_text` context (visible in any errors/logs)
