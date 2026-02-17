# LLM Prompts Reference

All prompts used by the system, organized by function.

---

## Prompt 1: Section Splitting

Used in `document_processor.py` — batch ~5 pages per call.

```
You are parsing a construction standards document (Eurocode).
Given the text from pages {start_page} to {end_page}, identify all sections and their boundaries.

Known section code patterns: numbered like 1.2.3, A.2.1 (Annexes), or named like "Foreword", "Scope".
Include clause text, notes, tables (as text), and sub-clauses within each section.

Return JSON array:
[
  {
    "section_code": "4.2.1",
    "title": "Section title if present",
    "page": <page number where section starts>,
    "content": "Full text content of this section including notes and sub-clauses"
  }
]

If a section spans across a page boundary, include all its text in the content field.
If the page contains a table, include the table header and all visible data in the section that contains it.
Every piece of text should belong to exactly one section — do not skip any text.

PAGE TEXT:
{page_texts}
```

---

## Prompt 2: Image/Table Description (Vision)

Used in `document_processor.py` — one call per page with visual content.

```
You are examining a page from a construction standards document (Eurocode).
Describe ALL visual elements on this page: tables, figures, diagrams, charts.

For each visual element found, provide:
- type: "table" or "figure"
- code: the identifier (e.g. "Table A.1", "Figure 6.2") if visible
- title: the caption or title text
- description: detailed description of the content

For tables: list all column headers and describe the data (materials, values, units).
For figures: describe what the diagram shows, any dimensions, labels, symbols.

Also provide context from nearby text that explains what this visual element is about.

Return JSON array:
[
  {
    "type": "table",
    "code": "Table A.1",
    "title": "Construction materials - concrete and mortar",
    "description": "Table showing nominal density values for concrete and mortar materials. Columns: Materials, Density γ [kN/m³]. Lists lightweight concrete density classes LC 1.0 through LC 2.0 with ranges from 9.0 to 20.0, normal weight at 24.0, heavy weight >24.0. Also lists mortar types: cement (19-23), gypsum (12-18), lime-cement (18-20), lime (12-18). Notes: increase by 1kN/m³ for reinforcement percentage, increase by 1kN/m³ for unhardened concrete.",
    "page": 34
  }
]

If no visual elements are found, return an empty array [].
```

---

## Prompt 3: Reference Extraction

Used in `document_processor.py` — per section.

```
Extract all references to other sections, tables, figures, formulae, annexes, or external documents from this text.

References are signalled by phrases like: "see X", "according to X", "given in X", "using X", "defined in X", "specified in X", "in accordance with X", "see also X", "refer to X".

Things of the format X.Y.Z (e.g. 4.2.1, 3.5, A.1) are likely section references.
"Table X.Y", "Figure X.Y", "Annex X", "EN XXXX" are also references.

Known section codes in this document: {known_codes}

Return JSON array:
[
  {
    "target_code": "4.3.1",
    "target_type": "section"
  },
  {
    "target_code": "Table_6.8",
    "target_type": "table"
  },
  {
    "target_code": "EN_1992-1-1",
    "target_type": "external_document"
  }
]

Section text:
{section_text}
```

---

## Prompt 4: Precedence Extraction

Used in `document_processor.py` — one call per document.

```
You are analyzing a construction standards document for precedence rules.
Precedence means one code/standard supersedes, replaces, or takes priority over another.

Look for phrases like:
- "supersedes", "replaces", "takes precedence over"
- "in case of conflict, X shall prevail"
- "where X and Y differ, use X"
- "this standard replaces..."
- "National Annex may override..."

Return JSON array of precedence rules found:
[
  {
    "section_code": "Section or clause where the rule is stated",
    "supersedes": ["list of section/document codes that are superseded"],
    "superseded_by": ["list of section/document codes that take priority"],
    "note": "Brief explanation of the precedence rule"
  }
]

If no precedence rules found, return [].

Document text (first ~20 pages):
{document_text}
```

---

## Prompt 5: KV Pair Extraction

Used in `document_processor.py` — one call per document.

```
Extract all significant symbols, abbreviations, parameters, and their definitions from this construction standards document.

Look for:
- Symbol definitions (e.g. "Gk = characteristic value of permanent action")
- Abbreviations (e.g. "CPD = Construction Products Directive")
- Parameter mappings (e.g. "γ = density")
- Unit conversions or standard values
- Named quantities with their meanings

Return JSON object mapping each key to its definition:
{
  "Gk": "characteristic value of a permanent action",
  "Qk": "characteristic value of a single variable action",
  "γ": "density or unit weight",
  "qk": "characteristic value of a uniformly distributed load",
  "ψ0": "factor for combination value of a variable action",
  "dead load": "permanent action, self-weight",
  "imposed load": "variable action from occupancy"
}

Include both the symbol and its meaning. Also include common alternative names (e.g. "dead load" = "permanent action").

Document text:
{document_text}
```

---

## Prompt 6: Intent Classification (Query Engine)

Used in `query_engine.py`.

```
Classify this user query into one of these categories:
- "greeting": user is saying hello or making small talk, no search needed
- "clarification": query is too vague to search (e.g. "loads", "concrete" with no specific question)
- "follow_up": user is asking about or refining previous results (only if previous results exist)
- "query": a real technical question that needs document search

Previous results exist: {has_previous}

User query: "{query_text}"

Return exactly one word: greeting, clarification, follow_up, or query
```

---

## Prompt 7: Keyword Extraction (Query Engine)

Used in `query_engine.py`.

```
Extract 1-5 search keywords from this construction/engineering query.
Be conservative — pick the most distinctive terms that would appear in technical standards.
Do not include common words like "what", "is", "the", "for".

Query: "{query_text}"

Return JSON array of keywords:
["keyword1", "keyword2"]
```

---

## Prompt 8: Relevance Check (Query Engine)

Used in `query_engine.py` — per batch of sections.

```
For each section below, extract ONLY the text that is directly relevant to answering this query.
Include contextual information that helps interpret the relevant parts (e.g. table headers, units, conditions).
If a section has no relevant information, set its value to null.

Query: "{query_text}"

Sections:
{sections_json}

Return JSON object mapping section keys to extracted relevant text (or null):
{{
  "section_key_1": "The relevant extracted text from this section...",
  "section_key_2": null,
  "section_key_3": "Another relevant extract..."
}}
```

---

## Prompt 9: Conflict Detection (Query Engine)

Used in `query_engine.py`.

```
Review these extracts from construction standards documents. Do any of them conflict with each other?
Conflicts include: contradictory values, incompatible requirements, overlapping scope with different specifications.

Do NOT flag as conflicts:
- Different values for different materials/conditions (that's expected)
- General vs specific rules (the specific rule applies)
- Informative vs normative content

Query context: "{query_text}"

Extracts:
{extracts_json}

If conflicts exist, return JSON array:
[{{"sections": ["key1", "key2"], "description": "Description of the conflict"}}]

If no conflicts, return: []
```

---

## Prompt 10: Answer Synthesis (Query Engine)

Used in `query_engine.py`.

```
You are answering a question about construction standards (Eurocodes).
Use ONLY the provided extracts to answer. Cite every piece of information with its source.

Format your answer as markdown with:
- Clear headings for different aspects of the answer
- Tables where appropriate (especially for values/factors)
- Citations in format [Section X.Y.Z, Page N] or [Table X.Y, Page N]
- Include units for all values
- Note any conditions or exceptions that apply

If there are precedence notes, mention which standard takes priority.
If there are conflicts, highlight them clearly.
If there are unfollowed references (4th+ order), mention them as "Further references available".

Query: "{query_text}"

Relevant extracts:
{extracts}

Precedence notes:
{precedence}

Conflicts:
{conflicts}

Unfollowed references:
{unfollowed}
```
