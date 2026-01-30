import { FileText, ChevronRight, ChevronLeft, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Document, Reference } from '../types';

interface DocumentViewerProps {
  documents: Document[];
  activeDocumentId: string | null;
  activePage: number;
  activeHighlight: Reference | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onPageChange: (page: number) => void;
}

export default function DocumentViewer({
  documents,
  activeDocumentId,
  activePage,
  activeHighlight,
  collapsed,
  onToggleCollapse,
  onPageChange,
}: DocumentViewerProps) {
  const activeDoc = documents.find(d => d.id === activeDocumentId);

  if (collapsed) {
    return (
      <div className="w-12 bg-white border-l border-slate-200 flex flex-col items-center py-4">
        <button
          onClick={onToggleCollapse}
          className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          title="Expand document viewer"
        >
          <FileText className="w-5 h-5 text-slate-600" />
        </button>
        <div className="mt-2 text-xs text-slate-400 font-medium writing-vertical">
          Document
        </div>
      </div>
    );
  }

  return (
    <div className="w-[650px] bg-white border-l border-slate-200 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleCollapse}
            className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
            title="Collapse"
          >
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </button>
          <FileText className="w-5 h-5 text-slate-600" />
          <h2 className="font-semibold text-slate-800">Document Viewer</h2>
        </div>
      </div>

      {/* Document info */}
      {activeDoc && (
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-100">
          <p className="text-sm font-medium text-slate-700 truncate">{activeDoc.shortName}</p>
          <p className="text-xs text-slate-500 truncate">{activeDoc.name}</p>
        </div>
      )}

      {/* Document content */}
      <div className="flex-1 overflow-hidden relative">
        {activeDoc ? (
          <DocumentPage
            document={activeDoc}
            page={activePage}
            highlight={activeHighlight}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8">
            <FileText className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-sm text-center">
              Click a reference in the chat to view the source document
            </p>
          </div>
        )}
      </div>

      {/* Page navigation */}
      {activeDoc && (
        <div className="p-3 border-t border-slate-100 flex items-center justify-between">
          <button
            onClick={() => onPageChange(1)}
            disabled={activePage === 1}
            className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-30"
          >
            <ChevronsLeft className="w-4 h-4 text-slate-600" />
          </button>
          <button
            onClick={() => onPageChange(activePage - 1)}
            disabled={activePage === 1}
            className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-30"
          >
            <ChevronLeft className="w-4 h-4 text-slate-600" />
          </button>
          <span className="text-sm text-slate-600">
            Page {activePage} of {activeDoc.pages}
          </span>
          <button
            onClick={() => onPageChange(activePage + 1)}
            disabled={activePage >= activeDoc.pages}
            className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-30"
          >
            <ChevronRight className="w-4 h-4 text-slate-600" />
          </button>
          <button
            onClick={() => onPageChange(activeDoc.pages)}
            disabled={activePage >= activeDoc.pages}
            className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-30"
          >
            <ChevronsRight className="w-4 h-4 text-slate-600" />
          </button>
        </div>
      )}
    </div>
  );
}

function DocumentPage({
  document,
  page,
  highlight,
}: {
  document: Document;
  page: number;
  highlight: Reference | null;
}) {
  const isHighlightOnThisPage = highlight?.docId === document.id && highlight?.page === page;
  const highlightArea = isHighlightOnThisPage ? highlight?.highlightArea : null;

  return (
    <div className="h-full overflow-auto p-4 bg-slate-100">
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 aspect-[8.5/11] relative overflow-hidden">
        {/* Simulated page content */}
        <SimulatedPageContent documentId={document.id} page={page} />
        
        {/* Highlight overlay */}
        {highlightArea && (
          <div
            className="absolute highlight-active pointer-events-none"
            style={{
              top: `${highlightArea.top}%`,
              left: `${highlightArea.left}%`,
              width: `${highlightArea.width}%`,
              height: `${highlightArea.height}%`,
            }}
          />
        )}
      </div>
    </div>
  );
}

function SimulatedPageContent({ documentId, page }: { documentId: string; page: number }) {
  // Generate deterministic fake content based on doc and page
  const content = getPageContent(documentId, page);

  return (
    <div className="p-6 text-xs leading-relaxed text-slate-700 font-mono">
      <div className="text-center mb-4">
        <p className="text-slate-400 text-[10px]">{documentId} — Page {page}</p>
      </div>
      {content}
    </div>
  );
}

function getPageContent(docId: string, page: number): React.ReactNode {
  // Simulated content that looks like design code pages
  const contents: Record<string, Record<number, React.ReactNode>> = {
    'SANS10160-1': {
      1: (
        <>
          <h2 className="font-bold text-sm mb-3">SANS 10160-1:2018</h2>
          <h3 className="font-bold mb-2">Basis of structural design</h3>
          <p className="mb-3 text-slate-500">Part 1: General basis of structural design</p>
          <hr className="my-4 border-slate-200" />
          <h4 className="font-semibold mb-2">1. Scope</h4>
          <p className="mb-2">This part of SANS 10160 establishes principles and requirements for safety, serviceability and durability of structures.</p>
          <p className="mb-2">It is based on the limit state concept used in conjunction with the partial factor method.</p>
          <h4 className="font-semibold mt-4 mb-2">4.2.1 Variable actions</h4>
          <p className="mb-2">Variable actions are those that vary significantly during the reference period of the structure.</p>
          <p className="mb-2">Examples include imposed loads, wind actions, snow loads, and thermal actions.</p>
        </>
      ),
      2: (
        <>
          <h4 className="font-bold mb-3">Table 3 — Partial factors for actions</h4>
          <table className="w-full border-collapse text-[10px] mb-4">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-1 text-left">Action</th>
                <th className="border border-slate-300 p-1">Unfavorable</th>
                <th className="border border-slate-300 p-1">Favorable</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-slate-300 p-1">Permanent (G)</td>
                <td className="border border-slate-300 p-1 text-center">γ_G = 1.2</td>
                <td className="border border-slate-300 p-1 text-center">γ_G = 0.9</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">Variable (Q)</td>
                <td className="border border-slate-300 p-1 text-center">γ_Q = 1.6</td>
                <td className="border border-slate-300 p-1 text-center">γ_Q = 0</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">Accidental (A)</td>
                <td className="border border-slate-300 p-1 text-center">γ_A = 1.0</td>
                <td className="border border-slate-300 p-1 text-center">—</td>
              </tr>
            </tbody>
          </table>
          <h4 className="font-semibold mt-4 mb-2">8.3.1 Combination of actions</h4>
          <p className="mb-2">For ultimate limit states, the following combination shall be used:</p>
          <p className="mb-2 pl-4">E_d = γ_G · G_k + γ_Q · Q_k</p>
          <p className="mb-2">where G_k is the characteristic permanent action and Q_k is the characteristic variable action.</p>
        </>
      ),
      3: (
        <>
          <h4 className="font-bold mb-3">8.4 Serviceability limit states</h4>
          <p className="mb-2">Serviceability limit states correspond to conditions beyond which specified service requirements are no longer met.</p>
          <h4 className="font-semibold mt-4 mb-2">8.4.1 Deflection limits</h4>
          <p className="mb-2">The following deflection limits shall apply:</p>
          <ul className="list-disc pl-6 mb-2 space-y-1">
            <li>Floors: span/250</li>
            <li>Roofs: span/200</li>
            <li>Cantilevers: span/125</li>
          </ul>
        </>
      ),
      4: (
        <>
          <h4 className="font-bold mb-3">Annex A — Application rules for buildings</h4>
          <p className="mb-2">This annex provides supplementary rules for the design of building structures.</p>
          <h4 className="font-semibold mt-4 mb-2">A.1 Categories of use</h4>
          <p className="mb-2">Buildings shall be classified according to their use:</p>
          <ul className="list-disc pl-6 mb-2 space-y-1">
            <li>Category A — Domestic, residential</li>
            <li>Category B — Office areas</li>
            <li>Category C — Congregation areas</li>
            <li>Category D — Shopping areas</li>
          </ul>
        </>
      ),
      5: (
        <>
          <h4 className="font-bold mb-3">Annex B — References</h4>
          <p className="mb-2">The following referenced documents are indispensable:</p>
          <ul className="list-disc pl-6 mb-2 space-y-1">
            <li>SANS 10160-2: Self-weight and imposed loads</li>
            <li>SANS 10160-3: Wind actions</li>
            <li>SANS 10160-4: Seismic actions</li>
            <li>SANS 10160-5: Basis for geotechnical design</li>
          </ul>
        </>
      ),
    },
    'SANS10160-2': {
      1: (
        <>
          <h2 className="font-bold text-sm mb-3">SANS 10160-2:2018</h2>
          <h3 className="font-bold mb-2">Self-weight and imposed loads</h3>
          <p className="mb-3 text-slate-500">Part 2: Self-weight and imposed loads for buildings</p>
          <hr className="my-4 border-slate-200" />
          <h4 className="font-semibold mb-2">1. Scope</h4>
          <p className="mb-2">This part specifies imposed loads and self-weight values for the design of buildings.</p>
        </>
      ),
      2: (
        <>
          <h4 className="font-bold mb-3">5. Self-weight of materials</h4>
          <p className="mb-2">Characteristic values of self-weight shall be taken from Table A.1 or determined by testing.</p>
          <table className="w-full border-collapse text-[10px] mb-4">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-1 text-left">Material</th>
                <th className="border border-slate-300 p-1">Density (kN/m³)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-slate-300 p-1">Reinforced concrete</td>
                <td className="border border-slate-300 p-1 text-center">25</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">Structural steel</td>
                <td className="border border-slate-300 p-1 text-center">78.5</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">Timber (softwood)</td>
                <td className="border border-slate-300 p-1 text-center">5</td>
              </tr>
            </tbody>
          </table>
        </>
      ),
      3: (
        <>
          <h4 className="font-bold mb-3">Table 1 — Imposed loads for buildings</h4>
          <table className="w-full border-collapse text-[10px] mb-4">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-1 text-left">Category</th>
                <th className="border border-slate-300 p-1 text-left">Description</th>
                <th className="border border-slate-300 p-1">q_k (kN/m²)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-slate-300 p-1">A</td>
                <td className="border border-slate-300 p-1">Domestic/residential</td>
                <td className="border border-slate-300 p-1 text-center">1.5</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">B</td>
                <td className="border border-slate-300 p-1">Office areas</td>
                <td className="border border-slate-300 p-1 text-center">2.5</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">C1</td>
                <td className="border border-slate-300 p-1">Congregation (tables)</td>
                <td className="border border-slate-300 p-1 text-center">3.0</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">C3</td>
                <td className="border border-slate-300 p-1">Congregation (no obstacles)</td>
                <td className="border border-slate-300 p-1 text-center">5.0</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">D</td>
                <td className="border border-slate-300 p-1">Shopping areas</td>
                <td className="border border-slate-300 p-1 text-center">4.0</td>
              </tr>
            </tbody>
          </table>
        </>
      ),
      4: (
        <>
          <h4 className="font-bold mb-3">6. Reduction factors</h4>
          <p className="mb-2">Imposed loads may be reduced when considering multiple floors.</p>
          <h4 className="font-semibold mt-4 mb-2">6.1 Reduction factor α_n</h4>
          <p className="mb-2">For n floors above the element being designed:</p>
          <p className="mb-2 pl-4">α_n = 0.7 + 0.3/n</p>
        </>
      ),
      5: (
        <>
          <h4 className="font-bold mb-3">Annex A — Specific applications</h4>
          <p className="mb-2">Additional guidance for specific building types.</p>
          <h4 className="font-semibold mt-4 mb-2">A.1 Roof loads</h4>
          <p className="mb-2">Roofs not accessible except for maintenance: 0.25 kN/m²</p>
          <p className="mb-2">Roofs accessible for normal use: as per Table 1</p>
        </>
      ),
    },
    'EN1991-1-1': {
      1: (
        <>
          <h2 className="font-bold text-sm mb-3">EN 1991-1-1:2002</h2>
          <h3 className="font-bold mb-2">Eurocode 1: Actions on structures</h3>
          <p className="mb-3 text-slate-500">Part 1-1: General actions — Densities, self-weight, imposed loads</p>
          <hr className="my-4 border-slate-200" />
          <h4 className="font-semibold mb-2">1. General</h4>
          <p className="mb-2">This European Standard provides guidance on actions for structural design of buildings and civil engineering works.</p>
        </>
      ),
      2: (
        <>
          <h4 className="font-bold mb-3">Table A1.2(B) — Design values of actions (STR/GEO)</h4>
          <table className="w-full border-collapse text-[10px] mb-4">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-1 text-left">Action</th>
                <th className="border border-slate-300 p-1">Unfavorable</th>
                <th className="border border-slate-300 p-1">Favorable</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-slate-300 p-1">Permanent (G)</td>
                <td className="border border-slate-300 p-1 text-center">γ_G = 1.35</td>
                <td className="border border-slate-300 p-1 text-center">γ_G = 1.0</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">Variable (Q)</td>
                <td className="border border-slate-300 p-1 text-center">γ_Q = 1.5</td>
                <td className="border border-slate-300 p-1 text-center">γ_Q = 0</td>
              </tr>
            </tbody>
          </table>
          <p className="mb-2 text-[9px] text-slate-500">NOTE: Values given are recommended. National Annexes may specify different values.</p>
        </>
      ),
      3: (
        <>
          <h4 className="font-bold mb-3">Table 6.1 — Categories of use</h4>
          <table className="w-full border-collapse text-[10px] mb-4">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-1 text-left">Category</th>
                <th className="border border-slate-300 p-1 text-left">Specific use</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-slate-300 p-1">A</td>
                <td className="border border-slate-300 p-1">Residential activities</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">B</td>
                <td className="border border-slate-300 p-1">Office areas</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">C</td>
                <td className="border border-slate-300 p-1">Areas where people may congregate</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">D</td>
                <td className="border border-slate-300 p-1">Shopping areas</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">E</td>
                <td className="border border-slate-300 p-1">Storage areas</td>
              </tr>
            </tbody>
          </table>
        </>
      ),
      4: (
        <>
          <h4 className="font-bold mb-3">Table 6.2 — Imposed loads on floors</h4>
          <table className="w-full border-collapse text-[10px] mb-4">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-1 text-left">Category</th>
                <th className="border border-slate-300 p-1">q_k (kN/m²)</th>
                <th className="border border-slate-300 p-1">Q_k (kN)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-slate-300 p-1">A - Floors</td>
                <td className="border border-slate-300 p-1 text-center">1.5 - 2.0</td>
                <td className="border border-slate-300 p-1 text-center">2.0 - 3.0</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">B</td>
                <td className="border border-slate-300 p-1 text-center">2.0 - 3.0</td>
                <td className="border border-slate-300 p-1 text-center">1.5 - 4.5</td>
              </tr>
            </tbody>
          </table>
        </>
      ),
      5: (
        <>
          <h4 className="font-bold mb-3">Annex A — National Annex</h4>
          <p className="mb-2">This annex contains information on the National Determined Parameters.</p>
          <p className="mb-2 text-[9px] text-slate-500">NOTE: National Annexes are published separately by each CEN member country.</p>
        </>
      ),
    },
  };

  return contents[docId]?.[page] || (
    <div className="text-center text-slate-400 mt-8">
      <p>Page content placeholder</p>
      <p className="text-[10px] mt-2">{docId} — Page {page}</p>
    </div>
  );
}
