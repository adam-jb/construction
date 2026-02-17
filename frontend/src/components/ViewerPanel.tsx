import { ChevronRight } from 'lucide-react';
import DocumentViewer from './DocumentViewer';
import type { Document } from '../api/types';

interface ViewerPanelProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  activeDocument: Document | null;
}

export default function ViewerPanel({ collapsed, onToggleCollapse, activeDocument }: ViewerPanelProps) {
  if (collapsed) {
    return (
      <div className="w-16 bg-white border-l border-slate-200 flex flex-col items-center py-4">
        <button
          onClick={onToggleCollapse}
          className="p-2 hover:bg-slate-100 rounded transition-colors"
          title="Expand viewer"
        >
          <ChevronRight className="w-5 h-5 text-slate-600 transform rotate-180" />
        </button>
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

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeDocument ? (
          <DocumentViewer
            documents={[activeDocument]}
            activeDocumentId={activeDocument.id}
            activePage={1}
            activeHighlight={null}
            collapsed={false}
            onToggleCollapse={onToggleCollapse}
            onPageChange={() => {}}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-center px-6">
            <div>
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-sm text-slate-600 font-medium mb-1">No document selected</p>
              <p className="text-xs text-slate-500">Select a document from the list or wait for a query response</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
