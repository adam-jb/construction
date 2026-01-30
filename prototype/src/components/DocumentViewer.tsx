import { useState, useEffect, useRef } from 'react';
import { FileText, ChevronRight, ChevronLeft, ChevronsLeft, ChevronsRight, Search, X } from 'lucide-react';
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const activeDoc = documents.find(d => d.id === activeDocumentId);

  // Keyboard shortcut for Ctrl+F
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f' && activeDoc && !collapsed) {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
      if (e.key === 'Escape' && searchOpen) {
        setSearchOpen(false);
        setSearchQuery('');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeDoc, collapsed, searchOpen]);

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
        {/* Search button */}
        {activeDoc && (
          <button
            onClick={() => setSearchOpen(!searchOpen)}
            className={`p-1.5 rounded-lg transition-colors ${
              searchOpen ? 'bg-blue-100 text-blue-600' : 'hover:bg-slate-100 text-slate-500'
            }`}
            title="Search in document (Ctrl+F)"
          >
            <Search className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Search bar */}
      {searchOpen && activeDoc && (
        <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 flex items-center gap-2">
          <Search className="w-4 h-4 text-blue-500 flex-shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Find in document..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 text-sm bg-white border border-blue-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-300"
            autoFocus
          />
          {searchQuery && (
            <span className="text-xs text-blue-600 whitespace-nowrap">
              {searchQuery.length > 0 ? 'Matches highlighted' : ''}
            </span>
          )}
          <button
            onClick={() => {
              setSearchQuery('');
              setSearchOpen(false);
            }}
            className="p-1 hover:bg-blue-100 rounded transition-colors"
          >
            <X className="w-4 h-4 text-blue-500" />
          </button>
        </div>
      )}

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
            searchQuery={searchQuery}
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
  searchQuery,
}: {
  document: Document;
  page: number;
  highlight: Reference | null;
  searchQuery: string;
}) {
  const isHighlightOnThisPage = highlight?.docId === document.id && highlight?.page === page;
  const highlightText = isHighlightOnThisPage ? highlight?.highlightText : undefined;

  return (
    <div className="h-full overflow-auto p-4 bg-slate-100">
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 aspect-[8.5/11] relative overflow-hidden">
        {/* Simulated page content */}
        <SimulatedPageContent 
          documentId={document.id} 
          page={page} 
          highlightText={highlightText}
          searchQuery={searchQuery}
        />
      </div>
    </div>
  );
}

function SimulatedPageContent({ 
  documentId, 
  page,
  highlightText,
  searchQuery,
}: { 
  documentId: string; 
  page: number;
  highlightText?: string[];
  searchQuery: string;
}) {
  // Generate deterministic fake content based on doc and page
  const content = getPageContent(documentId, page, highlightText, searchQuery);

  return (
    <div className="p-6 text-xs leading-relaxed text-slate-700 font-mono">
      <div className="text-center mb-4">
        <p className="text-slate-400 text-[10px]">{documentId} — Page {page}</p>
      </div>
      {content}
    </div>
  );
}

// Helper to highlight text within a string
function highlightTextInString(
  text: string, 
  highlightTexts: string[] = [], 
  searchQuery: string = ''
): React.ReactNode {
  if (!highlightTexts.length && !searchQuery) return text;
  
  // Build patterns for both reference highlights and search
  const patterns: { pattern: string; type: 'reference' | 'search' }[] = [];
  
  highlightTexts.forEach(ht => {
    if (ht) patterns.push({ pattern: ht, type: 'reference' });
  });
  
  if (searchQuery && searchQuery.length >= 2) {
    patterns.push({ pattern: searchQuery, type: 'search' });
  }
  
  if (!patterns.length) return text;
  
  // Create a combined regex
  const escapedPatterns = patterns.map(p => ({
    ...p,
    escaped: p.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }));
  
  const combinedRegex = new RegExp(
    `(${escapedPatterns.map(p => p.escaped).join('|')})`,
    'gi'
  );
  
  const parts = text.split(combinedRegex);
  
  return parts.map((part, i) => {
    const matchedPattern = patterns.find(
      p => p.pattern.toLowerCase() === part.toLowerCase()
    );
    
    if (matchedPattern) {
      const className = matchedPattern.type === 'reference' 
        ? 'text-highlight-ref' 
        : 'text-highlight-search';
      return <mark key={i} className={className}>{part}</mark>;
    }
    return part;
  });
}

function getPageContent(
  docId: string, 
  page: number, 
  highlightText?: string[],
  searchQuery: string = ''
): React.ReactNode {
  const hl = highlightText || [];
  const sq = searchQuery;
  
  // Helper to wrap text with highlighting
  const T = (text: string) => highlightTextInString(text, hl, sq);
  
  // Simulated content that looks like design code pages
  const contents: Record<string, Record<number, React.ReactNode>> = {
    'SANS10160-1': {
      1: (
        <>
          <h2 className="font-bold text-sm mb-3">{T('SANS 10160-1:2018')}</h2>
          <h3 className="font-bold mb-2">{T('Basis of structural design')}</h3>
          <p className="mb-3 text-slate-500">{T('Part 1: General basis of structural design')}</p>
          <hr className="my-4 border-slate-200" />
          <h4 className="font-semibold mb-2">{T('1. Scope')}</h4>
          <p className="mb-2">{T('This part of SANS 10160 establishes principles and requirements for safety, serviceability and durability of structures.')}</p>
          <p className="mb-2">{T('It is based on the limit state concept used in conjunction with the partial factor method.')}</p>
          <h4 className="font-semibold mt-4 mb-2">{T('4.2.1 Variable actions')}</h4>
          <p className="mb-2">{T('Variable actions are those that vary significantly during the reference period of the structure.')}</p>
          <p className="mb-2">{T('Examples include imposed loads, wind actions, snow loads, and thermal actions.')}</p>
        </>
      ),
      2: (
        <>
          <h4 className="font-bold mb-3">{T('Table 3 — Partial factors for actions')}</h4>
          <table className="w-full border-collapse text-[10px] mb-4">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-1 text-left">{T('Action')}</th>
                <th className="border border-slate-300 p-1">{T('Unfavorable')}</th>
                <th className="border border-slate-300 p-1">{T('Favorable')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-slate-300 p-1">{T('Permanent (G)')}</td>
                <td className="border border-slate-300 p-1 text-center">{T('γ_G = 1.2')}</td>
                <td className="border border-slate-300 p-1 text-center">{T('γ_G = 0.9')}</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">{T('Variable (Q)')}</td>
                <td className="border border-slate-300 p-1 text-center">{T('γ_Q = 1.6')}</td>
                <td className="border border-slate-300 p-1 text-center">{T('γ_Q = 0')}</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">{T('Accidental (A)')}</td>
                <td className="border border-slate-300 p-1 text-center">{T('γ_A = 1.0')}</td>
                <td className="border border-slate-300 p-1 text-center">—</td>
              </tr>
            </tbody>
          </table>
          <h4 className="font-semibold mt-4 mb-2">{T('8.3.1 Combination of actions')}</h4>
          <p className="mb-2">{T('For ultimate limit states, the following combination shall be used:')}</p>
          <p className="mb-2 pl-4">{T('E_d = γ_G · G_k + γ_Q · Q_k')}</p>
          <p className="mb-2">{T('where G_k is the characteristic permanent action and Q_k is the characteristic variable action.')}</p>
        </>
      ),
      3: (
        <>
          <h4 className="font-bold mb-3">{T('8.4 Serviceability limit states')}</h4>
          <p className="mb-2">{T('Serviceability limit states correspond to conditions beyond which specified service requirements are no longer met.')}</p>
          <h4 className="font-semibold mt-4 mb-2">{T('8.4.1 Deflection limits')}</h4>
          <p className="mb-2">{T('The following deflection limits shall apply:')}</p>
          <ul className="list-disc pl-6 mb-2 space-y-1">
            <li>{T('Floors: span/250')}</li>
            <li>{T('Roofs: span/200')}</li>
            <li>{T('Cantilevers: span/125')}</li>
          </ul>
        </>
      ),
      4: (
        <>
          <h4 className="font-bold mb-3">{T('Annex A — Application rules for buildings')}</h4>
          <p className="mb-2">{T('This annex provides supplementary rules for the design of building structures.')}</p>
          <h4 className="font-semibold mt-4 mb-2">{T('A.1 Categories of use')}</h4>
          <p className="mb-2">{T('Buildings shall be classified according to their use:')}</p>
          <ul className="list-disc pl-6 mb-2 space-y-1">
            <li>{T('Category A — Domestic, residential')}</li>
            <li>{T('Category B — Office areas')}</li>
            <li>{T('Category C — Congregation areas')}</li>
            <li>{T('Category D — Shopping areas')}</li>
          </ul>
        </>
      ),
      5: (
        <>
          <h4 className="font-bold mb-3">{T('Annex B — References')}</h4>
          <p className="mb-2">{T('The following referenced documents are indispensable:')}</p>
          <ul className="list-disc pl-6 mb-2 space-y-1">
            <li>{T('SANS 10160-2: Self-weight and imposed loads')}</li>
            <li>{T('SANS 10160-3: Wind actions')}</li>
            <li>{T('SANS 10160-4: Seismic actions')}</li>
            <li>{T('SANS 10160-5: Basis for geotechnical design')}</li>
          </ul>
        </>
      ),
    },
    'SANS10160-2': {
      1: (
        <>
          <h2 className="font-bold text-sm mb-3">{T('SANS 10160-2:2018')}</h2>
          <h3 className="font-bold mb-2">{T('Self-weight and imposed loads')}</h3>
          <p className="mb-3 text-slate-500">{T('Part 2: Self-weight and imposed loads for buildings')}</p>
          <hr className="my-4 border-slate-200" />
          <h4 className="font-semibold mb-2">{T('1. Scope')}</h4>
          <p className="mb-2">{T('This part specifies imposed loads and self-weight values for the design of buildings.')}</p>
        </>
      ),
      2: (
        <>
          <h4 className="font-bold mb-3">{T('5. Self-weight of materials')}</h4>
          <p className="mb-2">{T('Characteristic values of self-weight shall be taken from Table A.1 or determined by testing.')}</p>
          <table className="w-full border-collapse text-[10px] mb-4">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-1 text-left">{T('Material')}</th>
                <th className="border border-slate-300 p-1">{T('Density (kN/m³)')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-slate-300 p-1">{T('Reinforced concrete')}</td>
                <td className="border border-slate-300 p-1 text-center">{T('25')}</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">{T('Structural steel')}</td>
                <td className="border border-slate-300 p-1 text-center">{T('78.5')}</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">{T('Timber (softwood)')}</td>
                <td className="border border-slate-300 p-1 text-center">{T('5')}</td>
              </tr>
            </tbody>
          </table>
        </>
      ),
      3: (
        <>
          <h4 className="font-bold mb-3">{T('Table 1 — Imposed loads for buildings')}</h4>
          <table className="w-full border-collapse text-[10px] mb-4">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-1 text-left">{T('Category')}</th>
                <th className="border border-slate-300 p-1 text-left">{T('Description')}</th>
                <th className="border border-slate-300 p-1">{T('q_k (kN/m²)')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-slate-300 p-1">{T('A')}</td>
                <td className="border border-slate-300 p-1">{T('Domestic/residential')}</td>
                <td className="border border-slate-300 p-1 text-center">{T('1.5')}</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">{T('B')}</td>
                <td className="border border-slate-300 p-1">{T('Office areas')}</td>
                <td className="border border-slate-300 p-1 text-center">{T('2.5')}</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">{T('C1')}</td>
                <td className="border border-slate-300 p-1">{T('Congregation (tables)')}</td>
                <td className="border border-slate-300 p-1 text-center">{T('3.0')}</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">{T('C3')}</td>
                <td className="border border-slate-300 p-1">{T('Congregation (no obstacles)')}</td>
                <td className="border border-slate-300 p-1 text-center">{T('5.0')}</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">{T('D')}</td>
                <td className="border border-slate-300 p-1">{T('Shopping areas')}</td>
                <td className="border border-slate-300 p-1 text-center">{T('4.0')}</td>
              </tr>
            </tbody>
          </table>
        </>
      ),
      4: (
        <>
          <h4 className="font-bold mb-3">{T('6. Reduction factors')}</h4>
          <p className="mb-2">{T('Imposed loads may be reduced when considering multiple floors.')}</p>
          <h4 className="font-semibold mt-4 mb-2">{T('6.1 Reduction factor α_n')}</h4>
          <p className="mb-2">{T('For n floors above the element being designed:')}</p>
          <p className="mb-2 pl-4">{T('α_n = 0.7 + 0.3/n')}</p>
        </>
      ),
      5: (
        <>
          <h4 className="font-bold mb-3">{T('Annex A — Specific applications')}</h4>
          <p className="mb-2">{T('Additional guidance for specific building types.')}</p>
          <h4 className="font-semibold mt-4 mb-2">{T('A.1 Roof loads')}</h4>
          <p className="mb-2">{T('Roofs not accessible except for maintenance: 0.25 kN/m²')}</p>
          <p className="mb-2">{T('Roofs accessible for normal use: as per Table 1')}</p>
        </>
      ),
    },
    'EN1991-1-1': {
      1: (
        <>
          <h2 className="font-bold text-sm mb-3">{T('EN 1991-1-1:2002')}</h2>
          <h3 className="font-bold mb-2">{T('Eurocode 1: Actions on structures')}</h3>
          <p className="mb-3 text-slate-500">{T('Part 1-1: General actions — Densities, self-weight, imposed loads')}</p>
          <hr className="my-4 border-slate-200" />
          <h4 className="font-semibold mb-2">{T('1. General')}</h4>
          <p className="mb-2">{T('This European Standard provides guidance on actions for structural design of buildings and civil engineering works.')}</p>
        </>
      ),
      2: (
        <>
          <h4 className="font-bold mb-3">{T('Table A1.2(B) — Design values of actions (STR/GEO)')}</h4>
          <table className="w-full border-collapse text-[10px] mb-4">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-1 text-left">{T('Action')}</th>
                <th className="border border-slate-300 p-1">{T('Unfavorable')}</th>
                <th className="border border-slate-300 p-1">{T('Favorable')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-slate-300 p-1">{T('Permanent (G)')}</td>
                <td className="border border-slate-300 p-1 text-center">{T('γ_G = 1.35')}</td>
                <td className="border border-slate-300 p-1 text-center">{T('γ_G = 1.0')}</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">{T('Variable (Q)')}</td>
                <td className="border border-slate-300 p-1 text-center">{T('γ_Q = 1.5')}</td>
                <td className="border border-slate-300 p-1 text-center">{T('γ_Q = 0')}</td>
              </tr>
            </tbody>
          </table>
          <p className="mb-2 text-[9px] text-slate-500">{T('NOTE: Values given are recommended. National Annexes may specify different values.')}</p>
        </>
      ),
      3: (
        <>
          <h4 className="font-bold mb-3">{T('Table 6.1 — Categories of use')}</h4>
          <table className="w-full border-collapse text-[10px] mb-4">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-1 text-left">{T('Category')}</th>
                <th className="border border-slate-300 p-1 text-left">{T('Specific use')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-slate-300 p-1">{T('A')}</td>
                <td className="border border-slate-300 p-1">{T('Residential activities')}</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">{T('B')}</td>
                <td className="border border-slate-300 p-1">{T('Office areas')}</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">{T('C')}</td>
                <td className="border border-slate-300 p-1">{T('Areas where people may congregate')}</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">{T('D')}</td>
                <td className="border border-slate-300 p-1">{T('Shopping areas')}</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">{T('E')}</td>
                <td className="border border-slate-300 p-1">{T('Storage areas')}</td>
              </tr>
            </tbody>
          </table>
        </>
      ),
      4: (
        <>
          <h4 className="font-bold mb-3">{T('Table 6.2 — Imposed loads on floors')}</h4>
          <table className="w-full border-collapse text-[10px] mb-4">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-1 text-left">{T('Category')}</th>
                <th className="border border-slate-300 p-1">{T('q_k (kN/m²)')}</th>
                <th className="border border-slate-300 p-1">{T('Q_k (kN)')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-slate-300 p-1">{T('A - Floors')}</td>
                <td className="border border-slate-300 p-1 text-center">{T('1.5 - 2.0')}</td>
                <td className="border border-slate-300 p-1 text-center">{T('2.0 - 3.0')}</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">{T('B')}</td>
                <td className="border border-slate-300 p-1 text-center">{T('2.0 - 3.0')}</td>
                <td className="border border-slate-300 p-1 text-center">{T('1.5 - 4.5')}</td>
              </tr>
            </tbody>
          </table>
        </>
      ),
      5: (
        <>
          <h4 className="font-bold mb-3">{T('Annex A — National Annex')}</h4>
          <p className="mb-2">{T('This annex contains information on the National Determined Parameters.')}</p>
          <p className="mb-2 text-[9px] text-slate-500">{T('NOTE: National Annexes are published separately by each CEN member country.')}</p>
        </>
      ),
    },
  };

  return contents[docId]?.[page] || (
    <div className="text-center text-slate-400 mt-8">
      <p>{T('Page content placeholder')}</p>
      <p className="text-[10px] mt-2">{docId} — Page {page}</p>
    </div>
  );
}
