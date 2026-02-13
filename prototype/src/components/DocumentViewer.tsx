import { useState, useEffect, useRef, useMemo } from 'react';
import { FileText, ChevronRight, Search, X } from 'lucide-react';
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

// Actual pages with content defined for each document
const DOCUMENT_PAGES: Record<string, number[]> = {
  'SANS10160-1': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  'SANS10160-2': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  'EN1991-1-1': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
};

export default function DocumentViewer({
  documents,
  activeDocumentId,
  activePage,
  activeHighlight,
  collapsed,
  onToggleCollapse,
}: DocumentViewerProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
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

  // Scroll to page when activePage changes (from clicking a reference)
  useEffect(() => {
    if (activeDoc && activePage && scrollContainerRef.current) {
      const pageElement = pageRefs.current.get(activePage);
      if (pageElement) {
        pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [activePage, activeDoc, activeHighlight]);

  // Reset scroll when document changes
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
    pageRefs.current.clear();
  }, [activeDocumentId]);

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

  const pages = activeDoc ? (DOCUMENT_PAGES[activeDoc.id] || [1, 2, 3, 4, 5, 6]) : [];

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
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-700 truncate">{activeDoc.shortName}</p>
            <p className="text-xs text-slate-500 truncate">{activeDoc.name}</p>
          </div>
          <div className="ml-3 px-2 py-1 bg-white rounded border border-slate-200 text-xs text-slate-600 whitespace-nowrap">
            {pages.length} pages
          </div>
        </div>
      )}

      {/* Document content - vertical scroll */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-4 bg-slate-100"
      >
        {activeDoc ? (
          <div className="space-y-4">
            {pages.map((pageNum) => {
              // Check if this page should be highlighted
              const isHighlightPage = activeHighlight?.docId === activeDoc.id && 
                activeHighlight?.page === pageNum;
              
              return (
                <div
                  key={`${activeDoc.id}-page-${pageNum}`}
                  ref={(el) => {
                    if (el) pageRefs.current.set(pageNum, el);
                  }}
                  className="scroll-mt-4"
                >
                  <DocumentPage
                    key={`${activeDoc.id}-${pageNum}-${isHighlightPage ? JSON.stringify(activeHighlight) : 'no-hl'}`}
                    documentId={activeDoc.id}
                    pageNumber={pageNum}
                    highlight={isHighlightPage ? activeHighlight : null}
                    searchQuery={searchQuery}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8">
            <FileText className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-sm text-center">
              Click a reference in the chat to view the source document
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

interface DocumentPageProps {
  documentId: string;
  pageNumber: number;
  highlight: Reference | null;
  searchQuery: string;
}

function DocumentPage({ documentId, pageNumber, highlight, searchQuery }: DocumentPageProps) {
  const isHighlighted = highlight !== null;
  const highlightTexts = highlight?.highlightText || [];
  // Create unique key to force PageContent to fully re-render when highlights change
  const contentKey = `${documentId}-${pageNumber}-${highlightTexts.join('|')}-${searchQuery}`;

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-slate-200 min-h-[600px] relative overflow-hidden ${isHighlighted ? 'ring-2 ring-yellow-300' : ''}`}>
      {/* Page content */}
      <div className="p-6 text-xs leading-relaxed text-slate-700 font-mono pb-8">
        <div className="text-center mb-4">
          <p className="text-slate-400 text-[10px]">{documentId} — Page {pageNumber}</p>
        </div>
        <PageContent 
          key={contentKey}
          documentId={documentId} 
          page={pageNumber} 
          highlightTexts={highlightTexts}
          searchQuery={searchQuery}
        />
      </div>
      
      {/* Page number footer */}
      <div className="absolute bottom-2 left-0 right-0 text-center">
        <span className="text-[10px] text-slate-400 bg-white px-2 py-0.5 rounded">
          {pageNumber}
        </span>
      </div>
    </div>
  );
}

interface PageContentProps {
  documentId: string;
  page: number;
  highlightTexts: string[];
  searchQuery: string;
}

function PageContent({ documentId, page, highlightTexts, searchQuery }: PageContentProps) {
  // Use useMemo to regenerate content whenever highlight/search changes
  const content = useMemo(() => {
    const T = (text: string): React.ReactNode => {
      return highlightTextInString(text, highlightTexts, searchQuery);
    };
    return getPageContent(documentId, page, T);
  }, [documentId, page, highlightTexts, searchQuery]);

  return <>{content}</>;
}

// Helper to highlight text within a string
function highlightTextInString(
  text: string, 
  highlightTexts: string[] = [], 
  searchQuery: string = ''
): React.ReactNode {
  if (!highlightTexts.length && !searchQuery) return text;
  
  const patterns: { pattern: string; type: 'reference' | 'search' }[] = [];
  
  highlightTexts.forEach(ht => {
    if (ht) patterns.push({ pattern: ht, type: 'reference' });
  });
  
  if (searchQuery && searchQuery.length >= 2) {
    patterns.push({ pattern: searchQuery, type: 'search' });
  }
  
  if (!patterns.length) return text;
  
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

// Page content definitions - SIMPLE: page number = actual page number
function getPageContent(
  docId: string, 
  page: number,
  T: (text: string) => React.ReactNode
): React.ReactNode {
  const contents: Record<string, Record<number, React.ReactNode>> = {
    'SANS10160-1': {
      1: (
        <>
          <h2 className="font-bold text-sm mb-3">{T('SANS 10160-1:2018')}</h2>
          <h3 className="font-bold mb-2">{T('Basis of structural design')}</h3>
          <p className="mb-3 text-slate-500">{T('Part 1: General basis of structural design')}</p>
          <hr className="my-4 border-slate-200" />
          <p className="mb-2 text-[9px] text-slate-400">Edition 3.1 — Incorporating Amendment No. 1</p>
          <h4 className="font-semibold mb-2 mt-4">{T('Foreword')}</h4>
          <p className="mb-2">{T('This South African National Standard was approved by National Committee SABS/TC 98, Civil engineering structures.')}</p>
        </>
      ),
      2: (
        <>
          <h4 className="font-semibold mb-2">{T('1. Scope')}</h4>
          <p className="mb-2">{T('This part of SANS 10160 establishes principles and requirements for safety, serviceability and durability of structures.')}</p>
          <p className="mb-2">{T('It is based on the limit state concept used in conjunction with the partial factor method.')}</p>
          <h4 className="font-semibold mt-4 mb-2">{T('2. Normative references')}</h4>
          <p className="mb-2">{T('The following documents contain provisions which constitute provisions of this part of SANS 10160.')}</p>
        </>
      ),
      3: (
        <>
          <h4 className="font-semibold mb-2">{T('3. Terms and definitions')}</h4>
          <p className="mb-2">{T('For the purposes of this part of SANS 10160, the following terms and definitions apply:')}</p>
          <p className="mb-2"><strong>3.1 action</strong><br/>{T('Force or deformation applied to a structure.')}</p>
          <p className="mb-2"><strong>3.2 characteristic value</strong><br/>{T('Principal representative value of an action.')}</p>
          <h4 className="font-semibold mt-4 mb-2">{T('4. Symbols')}</h4>
        </>
      ),
      4: (
        <>
          <h4 className="font-semibold mb-2">{T('4.2 Actions')}</h4>
          <p className="mb-2">{T('4.2.1 Permanent actions')}</p>
          <p className="mb-2">{T('Permanent actions are those that remain constant during the reference period.')}</p>
          <h4 className="font-semibold mt-4 mb-2">{T('Variable actions')}</h4>
          <p className="mb-2">{T('Variable actions vary significantly during the reference period. Examples include imposed loads, wind actions, snow loads.')}</p>
        </>
      ),
      5: (
        <>
          <h4 className="font-bold mb-3">{T('Table 1 — Design working life')}</h4>
          <table className="w-full border-collapse text-[10px] mb-4">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-1 text-left">{T('Category')}</th>
                <th className="border border-slate-300 p-1">{T('Years')}</th>
                <th className="border border-slate-300 p-1">{T('Examples')}</th>
              </tr>
            </thead>
            <tbody>
              <tr><td className="border border-slate-300 p-1">1</td><td className="border border-slate-300 p-1">10</td><td className="border border-slate-300 p-1">Temporary</td></tr>
              <tr><td className="border border-slate-300 p-1">2</td><td className="border border-slate-300 p-1">25</td><td className="border border-slate-300 p-1">Replaceable parts</td></tr>
              <tr><td className="border border-slate-300 p-1">3</td><td className="border border-slate-300 p-1">50</td><td className="border border-slate-300 p-1">Buildings</td></tr>
              <tr><td className="border border-slate-300 p-1">4</td><td className="border border-slate-300 p-1">100</td><td className="border border-slate-300 p-1">Bridges</td></tr>
            </tbody>
          </table>
        </>
      ),
      6: (
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
            </tbody>
          </table>
          <p className="text-[9px] text-slate-500">{T('NOTE: For earth and water pressure, use γ = 1.3 (unfavorable)')}</p>
        </>
      ),
      7: (
        <>
          <h4 className="font-semibold mb-2">{T('8.3 Ultimate limit states')}</h4>
          <p className="mb-2">{T('Ultimate limit states are associated with collapse or structural failure.')}</p>
          <h4 className="font-semibold mt-4 mb-2">{T('8.3.1 Combination of actions')}</h4>
          <p className="mb-2">{T('For ultimate limit states, the following combination shall be used:')}</p>
          <p className="mb-2 pl-4 font-mono bg-slate-50 p-2 rounded">{T('E_d = γ_G · G_k + γ_Q · Q_k')}</p>
        </>
      ),
      8: (
        <>
          <h4 className="font-bold mb-3">{T('8.4 Serviceability limit states')}</h4>
          <p className="mb-2">{T('Serviceability limit states correspond to conditions beyond which service requirements are not met.')}</p>
          <h4 className="font-semibold mt-4 mb-2">{T('8.4.1 Deflection limits')}</h4>
          <ul className="list-disc pl-6 mb-2 space-y-1">
            <li>{T('Floors: span/250')}</li>
            <li>{T('Roofs: span/200')}</li>
            <li>{T('Cantilevers: span/125')}</li>
          </ul>
        </>
      ),
      9: (
        <>
          <h4 className="font-bold mb-3">{T('Table 4 — Combination factors ψ')}</h4>
          <table className="w-full border-collapse text-[10px] mb-4">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-1 text-left">{T('Action')}</th>
                <th className="border border-slate-300 p-1">{T('ψ_0')}</th>
                <th className="border border-slate-300 p-1">{T('ψ_1')}</th>
                <th className="border border-slate-300 p-1">{T('ψ_2')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-slate-300 p-1">{T('Imposed - Cat A')}</td>
                <td className="border border-slate-300 p-1 text-center">0.7</td>
                <td className="border border-slate-300 p-1 text-center">0.5</td>
                <td className="border border-slate-300 p-1 text-center">0.3</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">{T('Wind actions')}</td>
                <td className="border border-slate-300 p-1 text-center">0.6</td>
                <td className="border border-slate-300 p-1 text-center">0.2</td>
                <td className="border border-slate-300 p-1 text-center">0.0</td>
              </tr>
            </tbody>
          </table>
        </>
      ),
      10: (
        <>
          <h4 className="font-bold mb-3">{T('Annex A — Application rules for buildings')}</h4>
          <h4 className="font-semibold mt-4 mb-2">{T('A.1 Categories of use')}</h4>
          <ul className="list-disc pl-6 mb-2 space-y-1">
            <li>{T('Category A — Domestic, residential')}</li>
            <li>{T('Category B — Office areas')}</li>
            <li>{T('Category C — Congregation areas')}</li>
            <li>{T('Category D — Shopping areas')}</li>
          </ul>
        </>
      ),
      11: (
        <>
          <h4 className="font-bold mb-3">{T('Annex B — Reliability management')}</h4>
          <p className="mb-2">{T('Three reliability classes (RC1, RC2, RC3) based on consequences of failure.')}</p>
          <table className="w-full border-collapse text-[10px] mb-4">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-1">{T('Class')}</th>
                <th className="border border-slate-300 p-1">{T('Consequences')}</th>
              </tr>
            </thead>
            <tbody>
              <tr><td className="border border-slate-300 p-1">RC3</td><td className="border border-slate-300 p-1">High</td></tr>
              <tr><td className="border border-slate-300 p-1">RC2</td><td className="border border-slate-300 p-1">Medium</td></tr>
              <tr><td className="border border-slate-300 p-1">RC1</td><td className="border border-slate-300 p-1">Low</td></tr>
            </tbody>
          </table>
        </>
      ),
      12: (
        <>
          <h4 className="font-bold mb-3">{T('Annex C — References')}</h4>
          <ul className="list-disc pl-6 mb-2 space-y-1">
            <li>{T('SANS 10160-2: Self-weight and imposed loads')}</li>
            <li>{T('SANS 10160-3: Wind actions')}</li>
            <li>{T('SANS 10160-4: Seismic actions')}</li>
          </ul>
          <p className="mt-4 text-[9px] text-slate-500">{T('END OF DOCUMENT')}</p>
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
          <p className="mb-2">{T('This part specifies imposed loads and self-weight values for buildings.')}</p>
        </>
      ),
      2: (
        <>
          <h4 className="font-semibold mb-2">{T('2. Normative references')}</h4>
          <ul className="list-disc pl-6 mb-2 space-y-1 text-[10px]">
            <li>SANS 10160-1, Basis of structural design</li>
            <li>SANS 10162, The structural use of steel</li>
          </ul>
          <h4 className="font-semibold mt-4 mb-2">{T('3. Terms and definitions')}</h4>
          <p className="mb-2"><strong>self-weight:</strong> {T('Weight of structural and non-structural elements.')}</p>
          <p className="mb-2"><strong>imposed load:</strong> {T('Load from intended use or occupancy.')}</p>
        </>
      ),
      3: (
        <>
          <h4 className="font-bold mb-3">{T('4. Densities of materials')}</h4>
          <table className="w-full border-collapse text-[10px] mb-4">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-1 text-left">{T('Material')}</th>
                <th className="border border-slate-300 p-1">{T('Density (kN/m³)')}</th>
              </tr>
            </thead>
            <tbody>
              <tr><td className="border border-slate-300 p-1">{T('Reinforced concrete')}</td><td className="border border-slate-300 p-1 text-center">25</td></tr>
              <tr><td className="border border-slate-300 p-1">{T('Plain concrete')}</td><td className="border border-slate-300 p-1 text-center">24</td></tr>
              <tr><td className="border border-slate-300 p-1">{T('Structural steel')}</td><td className="border border-slate-300 p-1 text-center">78.5</td></tr>
            </tbody>
          </table>
        </>
      ),
      4: (
        <>
          <h4 className="font-bold mb-3">{T('5. Self-weight of materials')}</h4>
          <h4 className="font-semibold mt-4 mb-2">{T('5.1 Floor finishes')}</h4>
          <table className="w-full border-collapse text-[10px] mb-4">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-1 text-left">{T('Finish type')}</th>
                <th className="border border-slate-300 p-1">{T('Load (kN/m²)')}</th>
              </tr>
            </thead>
            <tbody>
              <tr><td className="border border-slate-300 p-1">Ceramic tiles (40mm screed)</td><td className="border border-slate-300 p-1 text-center">1.0</td></tr>
              <tr><td className="border border-slate-300 p-1">Carpet on underlay</td><td className="border border-slate-300 p-1 text-center">0.05</td></tr>
            </tbody>
          </table>
        </>
      ),
      5: (
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
                <td className="border border-slate-300 p-1">A</td>
                <td className="border border-slate-300 p-1">{T('Domestic/residential')}</td>
                <td className="border border-slate-300 p-1 text-center">1.5</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">B</td>
                <td className="border border-slate-300 p-1">{T('Office areas')}</td>
                <td className="border border-slate-300 p-1 text-center">2.5</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">C1</td>
                <td className="border border-slate-300 p-1">{T('Congregation (tables)')}</td>
                <td className="border border-slate-300 p-1 text-center">3.0</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">D</td>
                <td className="border border-slate-300 p-1">{T('Shopping areas')}</td>
                <td className="border border-slate-300 p-1 text-center">4.0</td>
              </tr>
            </tbody>
          </table>
        </>
      ),
      6: (
        <>
          <h4 className="font-bold mb-3">{T('Table 2 — Imposed loads (continued)')}</h4>
          <table className="w-full border-collapse text-[10px] mb-4">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-1 text-left">{T('Category')}</th>
                <th className="border border-slate-300 p-1 text-left">{T('Description')}</th>
                <th className="border border-slate-300 p-1">{T('q_k (kN/m²)')}</th>
              </tr>
            </thead>
            <tbody>
              <tr><td className="border border-slate-300 p-1">E1</td><td className="border border-slate-300 p-1">Storage (general)</td><td className="border border-slate-300 p-1 text-center">7.5</td></tr>
              <tr><td className="border border-slate-300 p-1">E2</td><td className="border border-slate-300 p-1">Industrial use</td><td className="border border-slate-300 p-1 text-center">5.0</td></tr>
              <tr><td className="border border-slate-300 p-1">F</td><td className="border border-slate-300 p-1">Traffic (≤ 30 kN)</td><td className="border border-slate-300 p-1 text-center">2.5</td></tr>
            </tbody>
          </table>
        </>
      ),
      7: (
        <>
          <h4 className="font-bold mb-3">{T('6. Reduction factors')}</h4>
          <p className="mb-2">{T('Imposed loads may be reduced for multiple floors.')}</p>
          <h4 className="font-semibold mt-4 mb-2">{T('6.1 Reduction factor α_n')}</h4>
          <p className="mb-2 pl-4 font-mono bg-slate-50 p-2 rounded">{T('α_n = 0.7 + 0.3/n')}</p>
          <p className="mb-2">{T('Not applicable to storage areas.')}</p>
        </>
      ),
      8: (
        <>
          <h4 className="font-bold mb-3">{T('7. Roof loads')}</h4>
          <table className="w-full border-collapse text-[10px] mb-4">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-1 text-left">{T('Roof type')}</th>
                <th className="border border-slate-300 p-1">{T('q_k (kN/m²)')}</th>
              </tr>
            </thead>
            <tbody>
              <tr><td className="border border-slate-300 p-1">Inaccessible (maintenance)</td><td className="border border-slate-300 p-1 text-center">0.25</td></tr>
              <tr><td className="border border-slate-300 p-1">Accessible for normal use</td><td className="border border-slate-300 p-1 text-center">As per Table 1</td></tr>
            </tbody>
          </table>
        </>
      ),
      9: (
        <>
          <h4 className="font-bold mb-3">{T('8. Horizontal loads on barriers')}</h4>
          <table className="w-full border-collapse text-[10px] mb-4">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-1 text-left">{T('Location')}</th>
                <th className="border border-slate-300 p-1">{T('Line load (kN/m)')}</th>
              </tr>
            </thead>
            <tbody>
              <tr><td className="border border-slate-300 p-1">Residential</td><td className="border border-slate-300 p-1 text-center">0.5</td></tr>
              <tr><td className="border border-slate-300 p-1">Office areas</td><td className="border border-slate-300 p-1 text-center">0.5</td></tr>
              <tr><td className="border border-slate-300 p-1">Assembly</td><td className="border border-slate-300 p-1 text-center">3.0</td></tr>
            </tbody>
          </table>
        </>
      ),
      10: (
        <>
          <h4 className="font-bold mb-3">{T('Annex A — Material densities')}</h4>
          <p className="mb-2">{T('Additional material densities for design:')}</p>
          <table className="w-full border-collapse text-[10px] mb-4">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-1 text-left">{T('Material')}</th>
                <th className="border border-slate-300 p-1">{T('kN/m³')}</th>
              </tr>
            </thead>
            <tbody>
              <tr><td className="border border-slate-300 p-1">Glass</td><td className="border border-slate-300 p-1 text-center">25</td></tr>
              <tr><td className="border border-slate-300 p-1">Sand (dry)</td><td className="border border-slate-300 p-1 text-center">16</td></tr>
              <tr><td className="border border-slate-300 p-1">Water</td><td className="border border-slate-300 p-1 text-center">10</td></tr>
            </tbody>
          </table>
        </>
      ),
      11: (
        <>
          <h4 className="font-bold mb-3">{T('Annex B — Vehicle loads')}</h4>
          <p className="mb-2">{T('For parking structures and vehicle access areas:')}</p>
          <ul className="list-disc pl-6 mb-2 space-y-1">
            <li>{T('Vehicles ≤ 30 kN: Category F')}</li>
            <li>{T('Vehicles > 30 kN: Category G')}</li>
          </ul>
        </>
      ),
      12: (
        <>
          <h4 className="font-bold mb-3">{T('Annex C — References')}</h4>
          <ul className="list-disc pl-6 mb-2 space-y-1">
            <li>{T('SANS 10160-1: Basis of structural design')}</li>
            <li>{T('SANS 10160-3: Wind actions')}</li>
          </ul>
          <p className="mt-4 text-[9px] text-slate-500">{T('END OF DOCUMENT')}</p>
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
          <h4 className="font-semibold mb-2">{T('1. Scope')}</h4>
          <p className="mb-2">{T('This European Standard provides guidance on actions for structural design of buildings.')}</p>
        </>
      ),
      2: (
        <>
          <h4 className="font-semibold mb-2">{T('2. Normative references')}</h4>
          <ul className="list-disc pl-6 mb-2 space-y-1 text-[10px]">
            <li>EN 1990, Basis of structural design</li>
            <li>EN 1991-1-3, Snow loads</li>
            <li>EN 1991-1-4, Wind actions</li>
          </ul>
          <h4 className="font-semibold mt-4 mb-2">{T('3. Terms and definitions')}</h4>
          <p className="mb-2">{T('Terms from EN 1990 apply to this standard.')}</p>
        </>
      ),
      3: (
        <>
          <h4 className="font-bold mb-3">{T('Table A1.1 — Material densities')}</h4>
          <table className="w-full border-collapse text-[10px] mb-4">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-1 text-left">{T('Material')}</th>
                <th className="border border-slate-300 p-1">{T('γ (kN/m³)')}</th>
              </tr>
            </thead>
            <tbody>
              <tr><td className="border border-slate-300 p-1">Reinforced concrete</td><td className="border border-slate-300 p-1 text-center">25</td></tr>
              <tr><td className="border border-slate-300 p-1">Steel</td><td className="border border-slate-300 p-1 text-center">78.5</td></tr>
              <tr><td className="border border-slate-300 p-1">Aluminium</td><td className="border border-slate-300 p-1 text-center">27</td></tr>
            </tbody>
          </table>
        </>
      ),
      4: (
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
          <p className="text-[9px] text-slate-500">{T('NOTE: These values apply to STR and GEO limit states.')}</p>
        </>
      ),
      5: (
        <>
          <h4 className="font-bold mb-3">{T('Table 6.1 — Categories of use')}</h4>
          <table className="w-full border-collapse text-[10px] mb-4">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-1">{T('Category')}</th>
                <th className="border border-slate-300 p-1">{T('Specific use')}</th>
              </tr>
            </thead>
            <tbody>
              <tr><td className="border border-slate-300 p-1">A</td><td className="border border-slate-300 p-1">Domestic, residential</td></tr>
              <tr><td className="border border-slate-300 p-1">B</td><td className="border border-slate-300 p-1">Office areas</td></tr>
              <tr><td className="border border-slate-300 p-1">C</td><td className="border border-slate-300 p-1">Congregation areas</td></tr>
              <tr><td className="border border-slate-300 p-1">D</td><td className="border border-slate-300 p-1">Shopping areas</td></tr>
            </tbody>
          </table>
        </>
      ),
      6: (
        <>
          <h4 className="font-bold mb-3">{T('Table 6.2 — Imposed loads on floors')}</h4>
          <table className="w-full border-collapse text-[10px] mb-4">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-1">{T('Category')}</th>
                <th className="border border-slate-300 p-1">{T('q_k (kN/m²)')}</th>
                <th className="border border-slate-300 p-1">{T('Q_k (kN)')}</th>
              </tr>
            </thead>
            <tbody>
              <tr><td className="border border-slate-300 p-1">A (floors)</td><td className="border border-slate-300 p-1 text-center">1.5-2.0</td><td className="border border-slate-300 p-1 text-center">2.0-3.0</td></tr>
              <tr><td className="border border-slate-300 p-1">B</td><td className="border border-slate-300 p-1 text-center">2.0-3.0</td><td className="border border-slate-300 p-1 text-center">1.5-4.5</td></tr>
              <tr><td className="border border-slate-300 p-1">C1</td><td className="border border-slate-300 p-1 text-center">2.5-3.0</td><td className="border border-slate-300 p-1 text-center">3.0-4.0</td></tr>
            </tbody>
          </table>
        </>
      ),
      7: (
        <>
          <h4 className="font-bold mb-3">{T('Table A1.1 — ψ factors')}</h4>
          <table className="w-full border-collapse text-[10px] mb-4">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-1">{T('Action')}</th>
                <th className="border border-slate-300 p-1">{T('ψ_0')}</th>
                <th className="border border-slate-300 p-1">{T('ψ_1')}</th>
                <th className="border border-slate-300 p-1">{T('ψ_2')}</th>
              </tr>
            </thead>
            <tbody>
              <tr><td className="border border-slate-300 p-1">Imposed (Cat A)</td><td className="border border-slate-300 p-1 text-center">0.7</td><td className="border border-slate-300 p-1 text-center">0.5</td><td className="border border-slate-300 p-1 text-center">0.3</td></tr>
              <tr><td className="border border-slate-300 p-1">Wind</td><td className="border border-slate-300 p-1 text-center">0.6</td><td className="border border-slate-300 p-1 text-center">0.2</td><td className="border border-slate-300 p-1 text-center">0</td></tr>
            </tbody>
          </table>
        </>
      ),
      8: (
        <>
          <h4 className="font-bold mb-3">{T('6.3 Horizontal loads on parapets')}</h4>
          <p className="mb-2">{T('Horizontal loads shall be applied to parapets and partition walls.')}</p>
          <table className="w-full border-collapse text-[10px] mb-4">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-1">{T('Category')}</th>
                <th className="border border-slate-300 p-1">{T('q_k (kN/m)')}</th>
              </tr>
            </thead>
            <tbody>
              <tr><td className="border border-slate-300 p-1">A, B</td><td className="border border-slate-300 p-1 text-center">0.5-1.0</td></tr>
              <tr><td className="border border-slate-300 p-1">C, D</td><td className="border border-slate-300 p-1 text-center">1.0-2.0</td></tr>
            </tbody>
          </table>
        </>
      ),
      9: (
        <>
          <h4 className="font-bold mb-3">{T('6.4 Roof loads')}</h4>
          <p className="mb-2">{T('Roofs shall be designed for the following minimum loads:')}</p>
          <ul className="list-disc pl-6 mb-2 space-y-1">
            <li>{T('Category H (roofs not accessible): 0.4 kN/m²')}</li>
            <li>{T('Category I (accessible): As per Table 6.2')}</li>
            <li>{T('Category K (helipad): Special assessment')}</li>
          </ul>
        </>
      ),
      10: (
        <>
          <h4 className="font-bold mb-3">{T('Annex A — National Annex provisions')}</h4>
          <p className="mb-2">{T('The following items are for national determination:')}</p>
          <ul className="list-disc pl-6 mb-2 space-y-1">
            <li>{T('Choice of representative values')}</li>
            <li>{T('Combination factors for specific uses')}</li>
            <li>{T('Reduction factors for area')}</li>
          </ul>
        </>
      ),
      11: (
        <>
          <h4 className="font-bold mb-3">{T('Annex B — Vehicle barriers')}</h4>
          <p className="mb-2">{T('Impact loads on vehicle barriers in parking structures:')}</p>
          <ul className="list-disc pl-6 mb-2 space-y-1">
            <li>{T('Light vehicles: 50 kN force at bumper height')}</li>
            <li>{T('Heavy vehicles: assess per specific use')}</li>
          </ul>
        </>
      ),
      12: (
        <>
          <h4 className="font-bold mb-3">{T('Bibliography')}</h4>
          <ul className="list-disc pl-6 mb-2 space-y-1">
            <li>{T('EN 1990: Basis of structural design')}</li>
            <li>{T('EN 1991-1-3: Snow loads')}</li>
            <li>{T('EN 1991-1-4: Wind actions')}</li>
          </ul>
          <p className="mt-4 text-[9px] text-slate-500">{T('END OF DOCUMENT')}</p>
        </>
      ),
    },
  };

  const docContent = contents[docId];
  if (!docContent) {
    return <p className="text-slate-400 italic">Document content not available</p>;
  }
  
  const pageContent = docContent[page];
  if (!pageContent) {
    return <p className="text-slate-400 italic">Page {page} content not defined</p>;
  }
  
  return pageContent;
}
