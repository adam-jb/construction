import { useState, useEffect, useRef, useCallback } from 'react';
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

// Number of actual rendered pages (creates illusion of longer doc)
const RENDERED_PAGES = 12;

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
  const [currentVisiblePage, setCurrentVisiblePage] = useState(1);
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

  // Map actual page to rendered page index (for scrolling to correct position)
  const getRenderedPageIndex = useCallback((page: number, totalPages: number): number => {
    if (page <= RENDERED_PAGES) return page;
    // For pages beyond rendered content, map proportionally
    const ratio = (page - 1) / (totalPages - 1);
    return Math.max(1, Math.min(RENDERED_PAGES, Math.ceil(ratio * RENDERED_PAGES)));
  }, []);

  // Scroll to page when activePage changes (from clicking a reference)
  useEffect(() => {
    if (activeDoc && activePage && scrollContainerRef.current) {
      const renderedIndex = getRenderedPageIndex(activePage, activeDoc.pages);
      const pageElement = pageRefs.current.get(renderedIndex);
      if (pageElement) {
        pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [activePage, activeDoc, getRenderedPageIndex]);

  // Track scroll position to update current page indicator
  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current || !activeDoc) return;
    
    const container = scrollContainerRef.current;
    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight - container.clientHeight;
    
    if (scrollHeight <= 0) return;
    
    // Calculate which page we're on based on scroll position
    const scrollRatio = scrollTop / scrollHeight;
    const estimatedPage = Math.max(1, Math.ceil(scrollRatio * activeDoc.pages) || 1);
    
    if (estimatedPage !== currentVisiblePage) {
      setCurrentVisiblePage(estimatedPage);
    }
  }, [activeDoc, currentVisiblePage]);

  // Reset scroll when document changes
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
      setCurrentVisiblePage(1);
    }
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

      {/* Document info with page indicator */}
      {activeDoc && (
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-700 truncate">{activeDoc.shortName}</p>
            <p className="text-xs text-slate-500 truncate">{activeDoc.name}</p>
          </div>
          <div className="ml-3 px-2 py-1 bg-white rounded border border-slate-200 text-xs text-slate-600 whitespace-nowrap">
            Page {currentVisiblePage} of {activeDoc.pages}
          </div>
        </div>
      )}

      {/* Document content - vertical scroll */}
      <div 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 bg-slate-100"
      >
        {activeDoc ? (
          <div className="space-y-4">
            {/* Render pages */}
            {Array.from({ length: RENDERED_PAGES }, (_, i) => {
              const pageNum = i + 1;
              // Map rendered page to actual page number for display
              const displayPageNum = Math.ceil((pageNum / RENDERED_PAGES) * activeDoc.pages);
              const isHighlightPage = activeHighlight?.docId === activeDoc.id && 
                getRenderedPageIndex(activeHighlight.page, activeDoc.pages) === pageNum;
              
              return (
                <div
                  key={pageNum}
                  ref={(el) => {
                    if (el) pageRefs.current.set(pageNum, el);
                  }}
                  className="scroll-mt-4"
                >
                  <DocumentPage
                    documentId={activeDoc.id}
                    pageNumber={pageNum}
                    displayPageNumber={displayPageNum}
                    totalPages={activeDoc.pages}
                    highlight={isHighlightPage ? activeHighlight : null}
                    searchQuery={searchQuery}
                    isHighlightPage={isHighlightPage}
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

function DocumentPage({
  documentId,
  pageNumber,
  displayPageNumber,
  totalPages,
  highlight,
  searchQuery,
  isHighlightPage,
}: {
  documentId: string;
  pageNumber: number;
  displayPageNumber: number;
  totalPages: number;
  highlight: Reference | null;
  searchQuery: string;
  isHighlightPage?: boolean;
}) {
  const highlightText = isHighlightPage && highlight?.highlightText ? highlight.highlightText : undefined;

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-slate-200 min-h-[800px] relative overflow-hidden ${isHighlightPage ? 'ring-2 ring-yellow-300' : ''}`}>
      {/* Page content */}
      <SimulatedPageContent 
        documentId={documentId} 
        page={pageNumber}
        displayPage={displayPageNumber}
        totalPages={totalPages}
        highlightText={highlightText}
        searchQuery={searchQuery}
      />
      
      {/* Page number footer */}
      <div className="absolute bottom-2 left-0 right-0 text-center">
        <span className="text-[10px] text-slate-400 bg-white px-2 py-0.5 rounded">
          {displayPageNumber}
        </span>
      </div>
    </div>
  );
}

function SimulatedPageContent({ 
  documentId, 
  page,
  displayPage,
  highlightText,
  searchQuery,
}: { 
  documentId: string; 
  page: number;
  displayPage: number;
  totalPages: number;
  highlightText?: string[];
  searchQuery: string;
}) {
  const content = getPageContent(documentId, page, displayPage, highlightText, searchQuery);

  return (
    <div className="p-6 text-xs leading-relaxed text-slate-700 font-mono pb-8">
      <div className="text-center mb-4">
        <p className="text-slate-400 text-[10px]">{documentId} — Page {displayPage}</p>
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

function getPageContent(
  docId: string, 
  page: number,
  displayPage: number,
  highlightText?: string[],
  searchQuery: string = ''
): React.ReactNode {
  const hl = highlightText || [];
  const sq = searchQuery;
  const T = (text: string) => highlightTextInString(text, hl, sq);

  // Content pages with actual data (pages 1-12 have specific content)
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
          <p className="mb-2">{T('This South African National Standard was approved by National Committee SABS/TC 98, Civil engineering structures, in accordance with procedures of the SABS Standards Division.')}</p>
          <p className="mb-2">{T('SANS 10160 consists of the following parts under the general title Basis of structural design and actions for buildings and industrial structures:')}</p>
          <ul className="list-disc pl-6 mb-2 space-y-1 text-[10px]">
            <li>{T('Part 1: Basis of structural design')}</li>
            <li>{T('Part 2: Self-weight and imposed loads')}</li>
            <li>{T('Part 3: Wind actions')}</li>
            <li>{T('Part 4: Seismic actions and general requirements for buildings')}</li>
          </ul>
        </>
      ),
      2: (
        <>
          <h4 className="font-semibold mb-2">{T('1. Scope')}</h4>
          <p className="mb-2">{T('This part of SANS 10160 establishes principles and requirements for safety, serviceability and durability of structures.')}</p>
          <p className="mb-2">{T('It is based on the limit state concept used in conjunction with the partial factor method.')}</p>
          <p className="mb-2">{T('This part is applicable to the design of structures within the scope of SANS 10160.')}</p>
          <h4 className="font-semibold mt-4 mb-2">{T('2. Normative references')}</h4>
          <p className="mb-2">{T('The following documents contain provisions which, through reference in this text, constitute provisions of this part of SANS 10160.')}</p>
          <ul className="list-disc pl-6 mb-2 space-y-1 text-[10px]">
            <li>SANS 2394, General principles on reliability for structures</li>
            <li>SANS 10100, The structural use of concrete</li>
            <li>SANS 10162, The structural use of steel</li>
          </ul>
        </>
      ),
      3: (
        <>
          <h4 className="font-semibold mb-2">{T('3. Terms and definitions')}</h4>
          <p className="mb-2">{T('For the purposes of this part of SANS 10160, the following terms and definitions apply:')}</p>
          <p className="mb-2"><strong>3.1 action</strong><br/>{T('Force or deformation applied to a structure.')}</p>
          <p className="mb-2"><strong>3.2 characteristic value</strong><br/>{T('Principal representative value of an action.')}</p>
          <p className="mb-2"><strong>3.3 combination of actions</strong><br/>{T('Set of design values used for verification of structural reliability.')}</p>
          <p className="mb-2"><strong>3.4 design situation</strong><br/>{T('Set of physical conditions representing the real conditions during a certain time interval.')}</p>
          <h4 className="font-semibold mt-4 mb-2">{T('4. Symbols')}</h4>
          <p className="mb-2">{T('The following symbols are used in this part of SANS 10160:')}</p>
        </>
      ),
      4: (
        <>
          <h4 className="font-semibold mb-2">{T('4.2 Actions')}</h4>
          <p className="mb-2">{T('4.2.1 Permanent actions')}</p>
          <p className="mb-2">{T('Permanent actions are those that remain constant during the reference period of the structure. Self-weight of structural and non-structural components is a permanent action.')}</p>
          <h4 className="font-semibold mt-4 mb-2">{T('4.2.1 Variable actions')}</h4>
          <p className="mb-2">{T('Variable actions are those that vary significantly during the reference period of the structure.')}</p>
          <p className="mb-2">{T('Examples include imposed loads, wind actions, snow loads, and thermal actions.')}</p>
          <h4 className="font-semibold mt-4 mb-2">{T('4.2.2 Accidental actions')}</h4>
          <p className="mb-2">{T('Accidental actions are usually of short duration but of significant magnitude. Examples include explosions, impact from vehicles, and fire.')}</p>
        </>
      ),
      5: (
        <>
          <h4 className="font-bold mb-3">{T('Table 1 — Design working life')}</h4>
          <table className="w-full border-collapse text-[10px] mb-4">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-1 text-left">{T('Category')}</th>
                <th className="border border-slate-300 p-1 text-left">{T('Design working life (years)')}</th>
                <th className="border border-slate-300 p-1 text-left">{T('Examples')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-slate-300 p-1">1</td>
                <td className="border border-slate-300 p-1">10</td>
                <td className="border border-slate-300 p-1">{T('Temporary structures')}</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">2</td>
                <td className="border border-slate-300 p-1">25</td>
                <td className="border border-slate-300 p-1">{T('Replaceable structural parts')}</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">3</td>
                <td className="border border-slate-300 p-1">50</td>
                <td className="border border-slate-300 p-1">{T('Building structures and common structures')}</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">4</td>
                <td className="border border-slate-300 p-1">100</td>
                <td className="border border-slate-300 p-1">{T('Monumental structures, bridges')}</td>
              </tr>
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
              <tr>
                <td className="border border-slate-300 p-1">{T('Accidental (A)')}</td>
                <td className="border border-slate-300 p-1 text-center">{T('γ_A = 1.0')}</td>
                <td className="border border-slate-300 p-1 text-center">—</td>
              </tr>
            </tbody>
          </table>
          <p className="mb-2 text-[9px] text-slate-500">{T('NOTE: For earth pressure and water pressure, use γ = 1.3 (unfavorable) or γ = 0.8 (favorable)')}</p>
        </>
      ),
      7: (
        <>
          <h4 className="font-semibold mb-2">{T('8.3 Ultimate limit states')}</h4>
          <p className="mb-2">{T('Ultimate limit states are associated with collapse or with other forms of structural failure.')}</p>
          <h4 className="font-semibold mt-4 mb-2">{T('8.3.1 Combination of actions')}</h4>
          <p className="mb-2">{T('For ultimate limit states, the following combination shall be used:')}</p>
          <p className="mb-2 pl-4 font-mono bg-slate-50 p-2 rounded">{T('E_d = γ_G · G_k + γ_Q · Q_k')}</p>
          <p className="mb-2">{T('where G_k is the characteristic permanent action and Q_k is the characteristic variable action.')}</p>
          <p className="mb-2">{T('For situations with multiple variable actions, the following expression shall be used:')}</p>
          <p className="mb-2 pl-4 font-mono bg-slate-50 p-2 rounded text-[9px]">{T('E_d = γ_G · G_k + γ_Q,1 · Q_k,1 + Σ γ_Q,i · ψ_0,i · Q_k,i')}</p>
        </>
      ),
      8: (
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
          <h4 className="font-semibold mt-4 mb-2">{T('8.4.2 Vibration')}</h4>
          <p className="mb-2">{T('Vibration shall be limited to avoid discomfort to users and damage to contents or structure.')}</p>
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
                <td className="border border-slate-300 p-1">{T('Imposed loads - Category A')}</td>
                <td className="border border-slate-300 p-1 text-center">0.7</td>
                <td className="border border-slate-300 p-1 text-center">0.5</td>
                <td className="border border-slate-300 p-1 text-center">0.3</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">{T('Imposed loads - Category B')}</td>
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
          <p className="mb-2">{T('This annex provides supplementary rules for the design of building structures.')}</p>
          <h4 className="font-semibold mt-4 mb-2">{T('A.1 Categories of use')}</h4>
          <p className="mb-2">{T('Buildings shall be classified according to their use:')}</p>
          <ul className="list-disc pl-6 mb-2 space-y-1">
            <li>{T('Category A — Domestic, residential')}</li>
            <li>{T('Category B — Office areas')}</li>
            <li>{T('Category C — Congregation areas')}</li>
            <li>{T('Category D — Shopping areas')}</li>
            <li>{T('Category E — Storage areas')}</li>
            <li>{T('Category F — Traffic areas (vehicles ≤ 30 kN)')}</li>
            <li>{T('Category G — Traffic areas (vehicles > 30 kN)')}</li>
          </ul>
        </>
      ),
      11: (
        <>
          <h4 className="font-bold mb-3">{T('Annex B — Management of structural reliability')}</h4>
          <p className="mb-2">{T('B.1 General')}</p>
          <p className="mb-2">{T('This annex provides additional information on reliability differentiation and quality management measures.')}</p>
          <h4 className="font-semibold mt-4 mb-2">{T('B.2 Reliability classes')}</h4>
          <p className="mb-2">{T('Three reliability classes (RC1, RC2, RC3) are defined based on consequences of failure.')}</p>
          <table className="w-full border-collapse text-[10px] mb-4">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-1 text-left">{T('Class')}</th>
                <th className="border border-slate-300 p-1 text-left">{T('Consequences')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-slate-300 p-1">RC3</td>
                <td className="border border-slate-300 p-1">{T('High consequence for loss of life, economic, social or environmental')}</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">RC2</td>
                <td className="border border-slate-300 p-1">{T('Medium consequence')}</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">RC1</td>
                <td className="border border-slate-300 p-1">{T('Low consequence')}</td>
              </tr>
            </tbody>
          </table>
        </>
      ),
      12: (
        <>
          <h4 className="font-bold mb-3">{T('Annex C — References')}</h4>
          <p className="mb-2">{T('The following referenced documents are indispensable:')}</p>
          <ul className="list-disc pl-6 mb-2 space-y-1">
            <li>{T('SANS 10160-2: Self-weight and imposed loads')}</li>
            <li>{T('SANS 10160-3: Wind actions')}</li>
            <li>{T('SANS 10160-4: Seismic actions')}</li>
            <li>{T('SANS 10160-5: Basis for geotechnical design')}</li>
            <li>{T('SANS 10160-6: Actions induced by cranes and machinery')}</li>
            <li>{T('SANS 10160-7: Thermal actions')}</li>
            <li>{T('SANS 10160-8: Actions during execution')}</li>
          </ul>
          <p className="mt-4 mb-2 text-[9px] text-slate-500">{T('END OF DOCUMENT')}</p>
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
          <p className="mb-2">{T('This part of SANS 10160 specifies imposed loads and self-weight values for the design of buildings and building components.')}</p>
          <p className="mb-2">{T('It provides characteristic values for densities of construction materials and stored materials, and characteristic values for imposed loads in buildings.')}</p>
        </>
      ),
      2: (
        <>
          <h4 className="font-semibold mb-2">{T('2. Normative references')}</h4>
          <p className="mb-2">{T('The following documents are referred to in the text:')}</p>
          <ul className="list-disc pl-6 mb-2 space-y-1 text-[10px]">
            <li>SANS 10160-1, Basis of structural design</li>
            <li>SANS 10162, The structural use of steel</li>
            <li>SANS 10100, The structural use of concrete</li>
          </ul>
          <h4 className="font-semibold mt-4 mb-2">{T('3. Terms and definitions')}</h4>
          <p className="mb-2"><strong>3.1 self-weight</strong><br/>{T('Weight of structural and non-structural elements including fixed equipment.')}</p>
          <p className="mb-2"><strong>3.2 imposed load</strong><br/>{T('Load produced by intended use or occupancy of a building.')}</p>
        </>
      ),
      3: (
        <>
          <h4 className="font-bold mb-3">{T('4. Densities of materials')}</h4>
          <p className="mb-2">{T('Characteristic values of density shall be used for calculating self-weight.')}</p>
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
                <td className="border border-slate-300 p-1">{T('Plain concrete')}</td>
                <td className="border border-slate-300 p-1 text-center">24</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">{T('Structural steel')}</td>
                <td className="border border-slate-300 p-1 text-center">{T('78.5')}</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">{T('Timber (softwood)')}</td>
                <td className="border border-slate-300 p-1 text-center">{T('5')}</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">Timber (hardwood)</td>
                <td className="border border-slate-300 p-1 text-center">9</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">Masonry (solid brick)</td>
                <td className="border border-slate-300 p-1 text-center">19</td>
              </tr>
            </tbody>
          </table>
        </>
      ),
      4: (
        <>
          <h4 className="font-bold mb-3">{T('5. Self-weight of materials')}</h4>
          <p className="mb-2">{T('Characteristic values of self-weight shall be taken from Table A.1 or determined by testing.')}</p>
          <h4 className="font-semibold mt-4 mb-2">{T('5.1 Floor finishes')}</h4>
          <table className="w-full border-collapse text-[10px] mb-4">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-1 text-left">{T('Finish type')}</th>
                <th className="border border-slate-300 p-1">{T('Load (kN/m²)')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-slate-300 p-1">Ceramic tiles on screed (40mm)</td>
                <td className="border border-slate-300 p-1 text-center">1.0</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">Carpet on underlay</td>
                <td className="border border-slate-300 p-1 text-center">0.05</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">Raised access floor</td>
                <td className="border border-slate-300 p-1 text-center">0.5</td>
              </tr>
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
              <tr>
                <td className="border border-slate-300 p-1">E1</td>
                <td className="border border-slate-300 p-1">{T('Storage (general)')}</td>
                <td className="border border-slate-300 p-1 text-center">7.5</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">E2</td>
                <td className="border border-slate-300 p-1">{T('Industrial use')}</td>
                <td className="border border-slate-300 p-1 text-center">5.0</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">F</td>
                <td className="border border-slate-300 p-1">{T('Traffic (≤ 30 kN)')}</td>
                <td className="border border-slate-300 p-1 text-center">2.5</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">G</td>
                <td className="border border-slate-300 p-1">{T('Traffic (> 30 kN)')}</td>
                <td className="border border-slate-300 p-1 text-center">5.0</td>
              </tr>
            </tbody>
          </table>
        </>
      ),
      7: (
        <>
          <h4 className="font-bold mb-3">{T('6. Reduction factors')}</h4>
          <p className="mb-2">{T('Imposed loads may be reduced when considering multiple floors.')}</p>
          <h4 className="font-semibold mt-4 mb-2">{T('6.1 Reduction factor α_n')}</h4>
          <p className="mb-2">{T('For n floors above the element being designed:')}</p>
          <p className="mb-2 pl-4 font-mono bg-slate-50 p-2 rounded">{T('α_n = 0.7 + 0.3/n')}</p>
          <p className="mb-2">{T('This reduction shall not be applied to storage areas or areas with fixed equipment.')}</p>
          <h4 className="font-semibold mt-4 mb-2">{T('6.2 Reduction factor α_A')}</h4>
          <p className="mb-2">{T('For large floor areas, the following reduction may be applied:')}</p>
          <p className="mb-2 pl-4 font-mono bg-slate-50 p-2 rounded text-[9px]">{T('α_A = 0.5 + 10/A ≤ 1.0 (where A is floor area in m²)')}</p>
        </>
      ),
      8: (
        <>
          <h4 className="font-bold mb-3">{T('7. Roof loads')}</h4>
          <p className="mb-2">{T('Roofs shall be designed for imposed loads based on accessibility:')}</p>
          <table className="w-full border-collapse text-[10px] mb-4">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-1 text-left">{T('Roof type')}</th>
                <th className="border border-slate-300 p-1">{T('q_k (kN/m²)')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-slate-300 p-1">{T('Inaccessible (maintenance only)')}</td>
                <td className="border border-slate-300 p-1 text-center">0.25</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">{T('Accessible for normal use')}</td>
                <td className="border border-slate-300 p-1 text-center">As per Table 1</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">{T('Accessible for special services')}</td>
                <td className="border border-slate-300 p-1 text-center">Specific assessment</td>
              </tr>
            </tbody>
          </table>
        </>
      ),
      9: (
        <>
          <h4 className="font-bold mb-3">{T('8. Horizontal loads')}</h4>
          <p className="mb-2">{T('Horizontal loads on parapets, barriers and balustrades shall be considered.')}</p>
          <table className="w-full border-collapse text-[10px] mb-4">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-1 text-left">{T('Location')}</th>
                <th className="border border-slate-300 p-1">{T('Line load (kN/m)')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-slate-300 p-1">{T('Residential')}</td>
                <td className="border border-slate-300 p-1 text-center">0.5</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">{T('Office areas')}</td>
                <td className="border border-slate-300 p-1 text-center">0.5</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">{T('Assembly areas')}</td>
                <td className="border border-slate-300 p-1 text-center">3.0</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">{T('Vehicle barriers')}</td>
                <td className="border border-slate-300 p-1 text-center">See clause 9</td>
              </tr>
            </tbody>
          </table>
        </>
      ),
      10: (
        <>
          <h4 className="font-bold mb-3">{T('Annex A — Densities of stored materials')}</h4>
          <p className="mb-2">{T('Characteristic densities for stored bulk materials:')}</p>
          <table className="w-full border-collapse text-[10px] mb-4">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-1 text-left">{T('Material')}</th>
                <th className="border border-slate-300 p-1">{T('Density (kN/m³)')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-slate-300 p-1">Books (solid stacking)</td>
                <td className="border border-slate-300 p-1 text-center">8.5</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">Paper (bundled)</td>
                <td className="border border-slate-300 p-1 text-center">11.0</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">Sand (dry)</td>
                <td className="border border-slate-300 p-1 text-center">16.0</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">Water</td>
                <td className="border border-slate-300 p-1 text-center">10.0</td>
              </tr>
            </tbody>
          </table>
        </>
      ),
      11: (
        <>
          <h4 className="font-bold mb-3">{T('Annex A — Specific applications')}</h4>
          <p className="mb-2">{T('Additional guidance for specific building types.')}</p>
          <h4 className="font-semibold mt-4 mb-2">{T('A.1 Roof loads')}</h4>
          <p className="mb-2">{T('Roofs not accessible except for maintenance: 0.25 kN/m²')}</p>
          <p className="mb-2">{T('Roofs accessible for normal use: as per Table 1')}</p>
          <h4 className="font-semibold mt-4 mb-2">{T('A.2 Partition loads')}</h4>
          <p className="mb-2">{T('Where partitions may be relocated, an allowance shall be made:')}</p>
          <ul className="list-disc pl-6 mb-2 space-y-1">
            <li>{T('Lightweight partitions: 0.5 kN/m² additional')}</li>
            <li>{T('Heavyweight partitions: 1.0 kN/m² additional')}</li>
          </ul>
        </>
      ),
      12: (
        <>
          <h4 className="font-bold mb-3">{T('Annex B — References')}</h4>
          <p className="mb-2">{T('The following referenced documents are indispensable:')}</p>
          <ul className="list-disc pl-6 mb-2 space-y-1">
            <li>{T('SANS 10160-1: Basis of structural design')}</li>
            <li>{T('SANS 10160-3: Wind actions')}</li>
            <li>{T('SANS 10100: Structural use of concrete')}</li>
            <li>{T('SANS 10162: Structural use of steel')}</li>
            <li>{T('SANS 10163: Structural use of timber')}</li>
          </ul>
          <p className="mt-4 mb-2 text-[9px] text-slate-500">{T('END OF DOCUMENT')}</p>
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
          <p className="mb-2 text-[9px] text-slate-400">European Committee for Standardization (CEN)</p>
          <h4 className="font-semibold mb-2">{T('1. General')}</h4>
          <p className="mb-2">{T('This European Standard provides guidance on actions for structural design of buildings and civil engineering works.')}</p>
          <p className="mb-2">{T('It includes densities of construction materials, self-weight, and imposed loads for buildings.')}</p>
        </>
      ),
      2: (
        <>
          <h4 className="font-semibold mb-2">{T('1.2 Scope')}</h4>
          <p className="mb-2">{T('This part provides guidance on determining design values of self-weight and imposed loads for buildings.')}</p>
          <p className="mb-2">{T('The values given in this part are characteristic values for use with EN 1990 for structural design.')}</p>
          <h4 className="font-semibold mt-4 mb-2">{T('2. Normative references')}</h4>
          <p className="mb-2">{T('The following referenced documents are indispensable for the application of this document:')}</p>
          <ul className="list-disc pl-6 mb-2 space-y-1 text-[10px]">
            <li>EN 1990: Basis of structural design</li>
            <li>EN 1991-1-3: Snow loads</li>
            <li>EN 1991-1-4: Wind actions</li>
          </ul>
        </>
      ),
      3: (
        <>
          <h4 className="font-bold mb-3">{T('4. Densities of construction materials')}</h4>
          <table className="w-full border-collapse text-[10px] mb-4">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-1 text-left">{T('Material')}</th>
                <th className="border border-slate-300 p-1">{T('Density (kN/m³)')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-slate-300 p-1">{T('Normal weight concrete')}</td>
                <td className="border border-slate-300 p-1 text-center">24</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">{T('Reinforced concrete (1% steel)')}</td>
                <td className="border border-slate-300 p-1 text-center">25</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">{T('Steel')}</td>
                <td className="border border-slate-300 p-1 text-center">77-78.5</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">{T('Aluminium')}</td>
                <td className="border border-slate-300 p-1 text-center">27</td>
              </tr>
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
          <p className="mb-2 text-[9px] text-slate-500">{T('NOTE: Values given are recommended. National Annexes may specify different values.')}</p>
        </>
      ),
      5: (
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
      6: (
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
              <tr>
                <td className="border border-slate-300 p-1">{T('C1')}</td>
                <td className="border border-slate-300 p-1 text-center">2.5 - 3.0</td>
                <td className="border border-slate-300 p-1 text-center">4.0</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">{T('D1')}</td>
                <td className="border border-slate-300 p-1 text-center">4.0 - 5.0</td>
                <td className="border border-slate-300 p-1 text-center">4.0</td>
              </tr>
            </tbody>
          </table>
        </>
      ),
      7: (
        <>
          <h4 className="font-bold mb-3">{T('6.3 Roofs')}</h4>
          <p className="mb-2">{T('Roofs are divided into three categories according to accessibility:')}</p>
          <table className="w-full border-collapse text-[10px] mb-4">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-1 text-left">{T('Category')}</th>
                <th className="border border-slate-300 p-1 text-left">{T('Description')}</th>
                <th className="border border-slate-300 p-1">{T('q_k')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-slate-300 p-1">H</td>
                <td className="border border-slate-300 p-1">{T('Not accessible except for maintenance')}</td>
                <td className="border border-slate-300 p-1 text-center">0.4 kN/m²</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">I</td>
                <td className="border border-slate-300 p-1">{T('Accessible with occupancy')}</td>
                <td className="border border-slate-300 p-1 text-center">Per category</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">K</td>
                <td className="border border-slate-300 p-1">{T('For helicopter landing')}</td>
                <td className="border border-slate-300 p-1 text-center">Special</td>
              </tr>
            </tbody>
          </table>
        </>
      ),
      8: (
        <>
          <h4 className="font-bold mb-3">{T('6.4 Horizontal loads on parapets')}</h4>
          <p className="mb-2">{T('Horizontal loads on parapets and partition walls acting as barriers shall be based on building usage.')}</p>
          <table className="w-full border-collapse text-[10px] mb-4">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-1 text-left">{T('Category')}</th>
                <th className="border border-slate-300 p-1">{T('q_k (kN/m)')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-slate-300 p-1">A (residential)</td>
                <td className="border border-slate-300 p-1 text-center">0.5 - 1.0</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">B (offices)</td>
                <td className="border border-slate-300 p-1 text-center">0.5 - 1.0</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">C3, C5 (assembly areas)</td>
                <td className="border border-slate-300 p-1 text-center">3.0 - 5.0</td>
              </tr>
            </tbody>
          </table>
        </>
      ),
      9: (
        <>
          <h4 className="font-bold mb-3">{T('Annex A — National Annex')}</h4>
          <p className="mb-2">{T('This annex contains information on the National Determined Parameters.')}</p>
          <p className="mb-2 text-[9px] text-slate-500">{T('NOTE: National Annexes are published separately by each CEN member country.')}</p>
          <h4 className="font-semibold mt-4 mb-2">{T('A.1 General')}</h4>
          <p className="mb-2">{T('National choice is allowed for various parameters. The recommended values are given in the main text.')}</p>
          <h4 className="font-semibold mt-4 mb-2">{T('A.2 Tables')}</h4>
          <p className="mb-2">{T('Tables 6.1, 6.2, and 6.10 may be modified through National Annexes to reflect local conditions.')}</p>
        </>
      ),
      10: (
        <>
          <h4 className="font-bold mb-3">{T('Annex B — Vehicle barriers and parapets')}</h4>
          <p className="mb-2">{T('B.1 Categories')}</p>
          <p className="mb-2">{T('Vehicle barriers in car parks shall be designed for the following horizontal forces:')}</p>
          <table className="w-full border-collapse text-[10px] mb-4">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-1 text-left">{T('Category')}</th>
                <th className="border border-slate-300 p-1">{T('Force F (kN)')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-slate-300 p-1">F (vehicles ≤ 30 kN)</td>
                <td className="border border-slate-300 p-1 text-center">50</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1">G (vehicles &gt; 30 kN)</td>
                <td className="border border-slate-300 p-1 text-center">As specified</td>
              </tr>
            </tbody>
          </table>
        </>
      ),
      11: (
        <>
          <h4 className="font-bold mb-3">{T('Annex C — Dynamic load factors')}</h4>
          <p className="mb-2">{T('C.1 Forklifts and other industrial vehicles')}</p>
          <p className="mb-2">{T('For dynamic effects, imposed loads from forklifts shall be multiplied by a dynamic factor φ:')}</p>
          <p className="mb-2 pl-4 font-mono bg-slate-50 p-2 rounded">{T('φ = 1.4 for pneumatic tires')}</p>
          <p className="mb-2 pl-4 font-mono bg-slate-50 p-2 rounded">{T('φ = 2.0 for solid tires')}</p>
          <h4 className="font-semibold mt-4 mb-2">{T('C.2 Cranes')}</h4>
          <p className="mb-2">{T('Dynamic factors for cranes shall be determined according to EN 1991-3.')}</p>
        </>
      ),
      12: (
        <>
          <h4 className="font-bold mb-3">{T('References')}</h4>
          <p className="mb-2">{T('The following referenced documents form part of this European Standard:')}</p>
          <ul className="list-disc pl-6 mb-2 space-y-1 text-[10px]">
            <li>EN 1990: Eurocode — Basis of structural design</li>
            <li>EN 1991-1-2: Actions on structures — Fire actions</li>
            <li>EN 1991-1-3: Actions on structures — Snow loads</li>
            <li>EN 1991-1-4: Actions on structures — Wind actions</li>
            <li>EN 1991-1-5: Actions on structures — Thermal actions</li>
            <li>EN 1991-1-6: Actions during execution</li>
            <li>EN 1991-1-7: Accidental actions</li>
          </ul>
          <p className="mt-4 mb-2 text-[9px] text-slate-500">{T('END OF DOCUMENT')}</p>
        </>
      ),
    },
  };

  // Return specific content if available, otherwise generate filler
  if (contents[docId]?.[page]) {
    return contents[docId][page];
  }

  // Generate realistic filler content for pages without specific content
  return (
    <div>
      <h4 className="font-semibold mb-2">{T('Additional Technical Guidance')}</h4>
      <p className="mb-2">{T('This section contains detailed technical requirements and implementation guidance.')}</p>
      <p className="mb-2">{T('The principles outlined in the preceding sections shall be applied in conjunction with the following considerations:')}</p>
      <ul className="list-disc pl-6 mb-3 space-y-1">
        <li>{T('Structural analysis methods appropriate to the type of structure and loading conditions')}</li>
        <li>{T('Material properties based on characteristic values as defined in the relevant material codes')}</li>
        <li>{T('Safety margins adequate for the design working life of the structure')}</li>
        <li>{T('Quality assurance and control measures during design and construction')}</li>
      </ul>
      <h4 className="font-semibold mt-4 mb-2">{T('Design Verification')}</h4>
      <p className="mb-2">{T('Structures shall be verified to satisfy both ultimate and serviceability limit states for all design situations specified in this standard.')}</p>
      <p className="mb-2">{T('Documentation of the design process, including assumptions, methods, and calculations, shall be retained for future reference.')}</p>
      <div className="mt-6 pt-4 border-t border-slate-200">
        <p className="text-[9px] text-slate-500">{T('— Continued on next page')}</p>
      </div>
    </div>
  );
}
