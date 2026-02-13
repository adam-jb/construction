import { FileText, ChevronLeft, Check, Upload } from 'lucide-react';
import { Document } from '../types';

interface SourcesPaneProps {
  documents: Document[];
  enabledDocuments: Set<string>;
  onDocumentToggle: (id: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  scenarioDocuments: string[];
}

export default function SourcesPane({
  documents,
  enabledDocuments,
  onDocumentToggle,
  collapsed,
  onToggleCollapse,
  scenarioDocuments,
}: SourcesPaneProps) {
  const relevantDocs = documents.filter(d => scenarioDocuments.includes(d.id));
  const otherDocs = documents.filter(d => !scenarioDocuments.includes(d.id));

  if (collapsed) {
    return (
      <div className="w-12 bg-white border-r border-slate-200 flex flex-col items-center py-4">
        <button
          onClick={onToggleCollapse}
          className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          title="Expand sources"
        >
          <FileText className="w-5 h-5 text-slate-600" />
        </button>
        <div className="mt-2 text-xs text-slate-400 font-medium writing-vertical">
          Sources
        </div>
      </div>
    );
  }

  return (
    <div className="w-72 bg-white border-r border-slate-200 flex flex-col">
      <div className="p-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-slate-600" />
          <h2 className="font-semibold text-slate-800">Sources</h2>
        </div>
        <button
          onClick={onToggleCollapse}
          className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
          title="Collapse"
        >
          <ChevronLeft className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {relevantDocs.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2 px-1">
              Scenario Documents
            </p>
            <div className="space-y-1">
              {relevantDocs.map((doc) => (
                <DocumentItem
                  key={doc.id}
                  document={doc}
                  enabled={enabledDocuments.has(doc.id)}
                  onToggle={() => onDocumentToggle(doc.id)}
                  highlight
                />
              ))}
            </div>
          </div>
        )}

        {otherDocs.length > 0 && (
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2 px-1">
              Other Documents
            </p>
            <div className="space-y-1">
              {otherDocs.map((doc) => (
                <DocumentItem
                  key={doc.id}
                  document={doc}
                  enabled={enabledDocuments.has(doc.id)}
                  onToggle={() => onDocumentToggle(doc.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="p-3 border-t border-slate-100 space-y-2">
        <button className="w-full py-2.5 px-4 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2 text-sm">
          <Upload className="w-4 h-4" />
          Upload Documents
        </button>
        <p className="text-xs text-slate-500 text-center">
          {enabledDocuments.size} of {documents.length} documents selected
        </p>
      </div>
    </div>
  );
}

function DocumentItem({
  document,
  enabled,
  onToggle,
  highlight = false,
}: {
  document: Document;
  enabled: boolean;
  onToggle: () => void;
  highlight?: boolean;
}) {
  return (
    <button
      onClick={onToggle}
      className={`w-full text-left p-2.5 rounded-lg transition-all flex items-start gap-2.5 ${
        highlight
          ? enabled
            ? 'bg-primary-50 border border-primary-200 hover:bg-primary-100'
            : 'bg-slate-50 border border-slate-200 hover:bg-slate-100 opacity-60'
          : enabled
          ? 'bg-slate-50 hover:bg-slate-100'
          : 'hover:bg-slate-50 opacity-50'
      }`}
    >
      <div
        className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5 ${
          enabled
            ? 'bg-primary-600 text-white'
            : 'border-2 border-slate-300'
        }`}
      >
        {enabled && <Check className="w-3 h-3" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium truncate ${enabled ? 'text-slate-800' : 'text-slate-500'}`}>
          {document.shortName}
        </p>
        <p className="text-xs text-slate-400 truncate">{document.name}</p>
      </div>
    </button>
  );
}
