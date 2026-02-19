import { useState, useEffect } from 'react';
import { ChevronRight, ChevronLeft, Search } from 'lucide-react';
import type { Document } from '../api/types';

interface ViewerPanelProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  activeDocument: Document | null;
  initialPage?: number;
}

export default function ViewerPanel({ collapsed, onToggleCollapse, activeDocument, initialPage = 1 }: ViewerPanelProps) {
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [searchQuery, setSearchQuery] = useState('');
  const totalPages = activeDocument?.pages || 1;

  // Update page when initialPage changes
  useEffect(() => {
    setCurrentPage(initialPage);
  }, [initialPage]);

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handlePageInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const page = parseInt(e.target.value);
    if (!isNaN(page) && page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  if (collapsed) {
    return (
      <div className="w-16 bg-white border-l border-slate-200 flex flex-col items-center py-4 gap-3">
        <button
          onClick={onToggleCollapse}
          className="p-2 hover:bg-slate-100 rounded transition-colors"
          title="Expand viewer"
        >
          <ChevronRight className="w-5 h-5 text-slate-600 transform rotate-180" />
        </button>
        <div className="w-6 h-12 flex items-center justify-center">
          <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
      </div>
    );
  }

  return (
    <div className="w-96 bg-white border-l border-slate-200 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-slate-200">
        <h2 className="text-sm font-semibold text-slate-900">Viewer</h2>
        <button
          onClick={onToggleCollapse}
          className="p-1 hover:bg-slate-100 rounded transition-colors"
          title="Collapse panel"
        >
          <ChevronRight className="w-5 h-5 text-slate-600" />
        </button>
      </div>

      {/* Document Title and Search */}
      {activeDocument && (
        <div className="px-4 py-3 border-b border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-slate-900">{activeDocument.shortName}</h3>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activeDocument ? (
          <div className="p-6">
            <div className="bg-slate-50 rounded-lg border-2 border-dashed border-slate-200 p-8">
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-slate-900 mb-2">{activeDocument.shortName}</h3>
                <p className="text-sm text-slate-600 mb-1">{activeDocument.name}</p>
                <p className="text-xs text-slate-500 mb-4">Page {currentPage} of {totalPages}</p>
                <div className="bg-white rounded-md p-4 text-left">
                  <p className="text-xs text-slate-600 italic">
                    PDF viewer not yet implemented. The document reference clicked successfully, 
                    and the page navigation is working. The actual PDF rendering will be added 
                    in a future sprint.
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-center px-6">
            <div>
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-sm text-slate-600 font-medium mb-1">No document selected</p>
              <p className="text-xs text-slate-500">Select a document from the list or click a reference in the chat</p>
            </div>
          </div>
        )}
      </div>

      {/* Page Navigation */}
      {activeDocument && (
        <div className="border-t border-slate-200 px-4 py-3 flex items-center justify-center gap-3">
          <button
            onClick={handlePrevPage}
            disabled={currentPage <= 1}
            className="p-1.5 hover:bg-slate-100 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Previous page"
          >
            <ChevronLeft className="w-5 h-5 text-slate-600" />
          </button>
          
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">Page</span>
            <input
              type="number"
              value={currentPage}
              onChange={handlePageInput}
              min={1}
              max={totalPages}
              className="w-12 px-2 py-1 text-center border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-slate-500">of {totalPages}</span>
          </div>

          <button
            onClick={handleNextPage}
            disabled={currentPage >= totalPages}
            className="p-1.5 hover:bg-slate-100 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Next page"
          >
            <ChevronRight className="w-5 h-5 text-slate-600" />
          </button>
        </div>
      )}
    </div>
  );
}
