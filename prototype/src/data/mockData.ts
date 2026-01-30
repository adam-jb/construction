import { Document, Scenario } from '../types';

export const documents: Document[] = [
  {
    id: 'SANS10160-1',
    name: 'SANS 10160-1 — Basis of Structural Design',
    shortName: 'SANS 10160-1',
    pages: 94,
  },
  {
    id: 'SANS10160-2',
    name: 'SANS 10160-2 — Self-Weight and Imposed Loads',
    shortName: 'SANS 10160-2',
    pages: 68,
  },
  {
    id: 'EN1991-1-1',
    name: 'EN 1991-1-1 — Actions on Structures (General)',
    shortName: 'EN 1991-1-1',
    pages: 146,
  },
];

export const scenarios: Scenario[] = [
  {
    id: 'residential-loads',
    title: 'Residential Building Load Cases',
    description: 'Demonstrates finding applicable load cases for residential buildings',
    documents: ['SANS10160-1', 'SANS10160-2'],
    steps: [
      {
        type: 'user',
        text: 'What load cases apply to a residential building in South Africa?',
      },
      {
        type: 'assistant',
        text: `For residential buildings in South Africa, the following load cases typically apply:

**1. Permanent Actions (Dead Loads)** [2]
Self-weight of structural elements, finishes, and fixed equipment. These are calculated per SANS 10160-2.

**2. Imposed Actions (Live Loads)** [2]
For residential occupancy (Category A), the characteristic imposed load is typically 1.5 kN/m² for floors.

**3. Load Combinations** [1]
The ultimate limit state combination uses partial factors:
- γ_G = 1.2 for permanent actions (unfavorable)
- γ_Q = 1.6 for imposed actions`,
        references: [
          {
            docId: 'SANS10160-1',
            page: 2,
            label: '[1] Table 3 — Partial factors for actions',
            highlightText: ['Table 3 — Partial factors for actions', 'Permanent (G)', 'Variable (Q)', 'γ_G = 1.2', 'γ_Q = 1.6'],
          },
          {
            docId: 'SANS10160-2',
            page: 3,
            label: '[2] Table 1 — Imposed loads for buildings',
            highlightText: ['Table 1 — Imposed loads for buildings', 'Domestic/residential', '1.5'],
          },
        ],
      },
      {
        type: 'user',
        text: 'What about wind loads?',
      },
      {
        type: 'assistant',
        text: `Wind loads must also be considered for residential buildings. [1] The key parameters are:

**Basic Wind Speed**
Determined by geographic location within South Africa. Coastal areas typically have higher design wind speeds.

**Pressure Coefficients**
Depend on building geometry, roof pitch, and surface location (windward, leeward, etc.).

**Combination with Other Loads** [1]
Wind is treated as a variable action with partial factor γ_Q = 1.6 when unfavorable.

Note: Detailed wind load calculations require SANS 10160-3 (Wind Actions), which is not in the current source selection.`,
        references: [
          {
            docId: 'SANS10160-1',
            page: 1,
            label: '[1] Clause 4.2.1 — Variable actions',
            highlightText: ['4.2.1 Variable actions', 'Variable actions are those that vary significantly', 'wind actions'],
          },
        ],
      },
    ],
  },
  {
    id: 'load-combinations',
    title: 'Load Combination Factors',
    description: 'Finding partial safety factors for structural design',
    documents: ['SANS10160-1', 'EN1991-1-1'],
    steps: [
      {
        type: 'user',
        text: 'What are the partial safety factors for dead and live loads in ultimate limit state design?',
      },
      {
        type: 'assistant',
        text: `For Ultimate Limit State (ULS) design, the partial safety factors are:

**SANS 10160-1 (South Africa)** [1]
| Action Type | Unfavorable | Favorable |
|-------------|-------------|-----------|
| Permanent (G) | γ_G = 1.2 | γ_G = 0.9 |
| Variable (Q) | γ_Q = 1.6 | γ_Q = 0 |

**Eurocode (EN 1990)** [2]
| Action Type | Unfavorable | Favorable |
|-------------|-------------|-----------|
| Permanent (G) | γ_G = 1.35 | γ_G = 1.0 |
| Variable (Q) | γ_Q = 1.5 | γ_Q = 0 |

Note the differences between the two codes — SANS uses higher variable action factors while Eurocode uses higher permanent action factors.`,
        references: [
          {
            docId: 'SANS10160-1',
            page: 2,
            label: '[1] Table 3 — Partial factors (SANS)',
            highlightText: ['Table 3 — Partial factors for actions', 'γ_G = 1.2', 'γ_G = 0.9', 'γ_Q = 1.6'],
          },
          {
            docId: 'EN1991-1-1',
            page: 2,
            label: '[2] Table A1.2(B) — Partial factors (Eurocode)',
            highlightText: ['Table A1.2(B) — Design values of actions', 'γ_G = 1.35', 'γ_G = 1.0', 'γ_Q = 1.5'],
          },
        ],
      },
    ],
  },
  {
    id: 'refusal-demo',
    title: 'Compliance Refusal Demo',
    description: 'Demonstrates appropriate professional boundaries',
    documents: ['SANS10160-1'],
    steps: [
      {
        type: 'user',
        text: 'Is my 200mm slab design compliant with the code requirements?',
      },
      {
        type: 'assistant',
        text: `I can't confirm compliance or approve a design — that determination must be made by a qualified professional engineer who can assess: [1]

- Complete loading conditions for your specific structure
- Material properties and construction quality
- Deflection and serviceability requirements
- Site-specific conditions

**What I can help with:**
I can show you the relevant code requirements, load tables, and calculation procedures so you can verify compliance yourself.

Would you like me to find the relevant sections for slab design requirements?`,
        references: [
          {
            docId: 'SANS10160-1',
            page: 1,
            label: '[1] Scope and responsibility clauses',
            highlightText: ['1. Scope', 'safety, serviceability and durability', 'limit state concept'],
          },
        ],
      },
      {
        type: 'user',
        text: 'Yes, show me the slab loading requirements.',
      },
      {
        type: 'assistant',
        text: `Here are the key requirements for floor slab loading:

**Imposed Loads (SANS 10160-2)**
For residential buildings, minimum imposed load = 1.5 kN/m²

**Self-Weight Calculation**
For a 200mm reinforced concrete slab:
- Concrete density: 25 kN/m³
- Self-weight = 0.2m × 25 kN/m³ = 5.0 kN/m²

**Ultimate Design Load** [1]
Using the load combination formula:
w_u = 1.2G + 1.6Q = 1.2(5.0) + 1.6(1.5) = 8.4 kN/m²

You should verify these values against your specific design conditions.`,
        references: [
          {
            docId: 'SANS10160-1',
            page: 2,
            label: '[1] Clause 8.3.1 — Load combinations',
            highlightText: ['8.3.1 Combination of actions', 'E_d = γ_G · G_k + γ_Q · Q_k', 'ultimate limit states'],
          },
        ],
      },
    ],
  },
];
