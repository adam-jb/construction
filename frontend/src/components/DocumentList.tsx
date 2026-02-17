import { useEffect, useState } from 'react';
import { FileText, Loader2, MoreVertical, Eye, Edit2, Trash2 } from 'lucide-react';
import apiClient from '../api/client';
import type { Document } from '../api/types';

interface DocumentListProps {
  onDocumentSelect?: (document: Document) => void;
  refreshTrigger?: number;
  enabledDocuments: Set<string>;
  onDocumentToggle: (documentId: string) => void;
}

export default function DocumentList({ 
  onDocumentSelect, 
  refreshTrigger, 
  enabledDocuments,
  onDocumentToggle 
}: DocumentListProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const loadDocuments = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.listDocuments();
      setDocuments(response.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, [refreshTrigger]);

  const filteredDocuments = documents.filter(doc => 
    doc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.shortName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const processingCount = documents.filter(d => d.status === 'processing').length;

  const handleToggleAll = () => {
    if (enabledDocuments.size === documents.length) {
      documents.forEach(doc => {
        if (enabledDocuments.has(doc.id)) {
          onDocumentToggle(doc.id);
        }
      });
    } else {
      documents.forEach(doc => {
        if (!enabledDocuments.has(doc.id)) {
          onDocumentToggle(doc.id);
        }
      });
    }
  };

  const handleDelete = async (documentId: string) => {
    setOpenMenuId(null);
    if (!confirm('Are you sure you want to delete this document?')) return;

    try {
      await apiClient.deleteDocument(documentId);
      setDocuments(prev => prev.filter(d => d.id !== documentId));
      if (selectedId === documentId) {
        setSelectedId(null);
      }
    } catch (err) {
      alert('Failed to delete document');
    }
  };

  const handleView = (document: Document) => {
    setOpenMenuId(null);
    setSelectedId(document.id);
    onDocumentSelect?.(document);
  };

  const handleRename = (document: Document) => {
    setOpenMenuId(null);
    const newName = prompt('Rename document:', document.name);
    if (newName && newName !== document.name) {
      console.log('Rename document:', document.id, 'to', newName);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 px-4">
        <p className="text-sm text-red-600 mb-2">{error}</p>
        <button
          onClick={loadDocuments}
          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          Retry
        </button>
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
        <FileText className="w-16 h-16 text-slate-200 mb-4" />
        <p className="text-sm text-slate-600 mb-1">Saved documents will appear here.</p>
        <p className="text-sm text-slate-500">Click "+ Add documents" above to add PDFs.</p>
        <p className="text-xs text-slate-400 mt-2">Right now we only accept PDF file types</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 pb-3">
        <input
          type="text"
          placeholder="Search..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="px-3 pb-2">
        <label className="flex items-center gap-2 text-sm text-slate-700 hover:text-slate-900 cursor-pointer">
          <input
            type="checkbox"
            checked={documents.length > 0 && enabledDocuments.size === documents.length}
            onChange={handleToggleAll}
            className="w-4 h-4 rounded border-slate-300"
          />
          <span className="font-medium">Select all documents</span>
        </label>
      </div>

      <div className="flex-1 overflow-y-auto px-3 space-y-1">
        {filteredDocuments.map((doc) => (
          <div
            key={doc.id}
            className="group relative flex items-center gap-2 py-2 px-2 rounded hover:bg-slate-50"
          >
            <input
              type="checkbox"
              checked={enabledDocuments.has(doc.id)}
              onChange={() => onDocumentToggle(doc.id)}
              className="flex-shrink-0 w-4 h-4 rounded border-slate-300"
            />

            <div className="flex-shrink-0 w-7 h-7 bg-slate-100 rounded flex items-center justify-center">
              <FileText className="w-4 h-4 text-slate-600" />
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-900 truncate">
                {doc.shortName || doc.name}
              </p>
            </div>

            {doc.status === 'processing' && (
              <Loader2 className="flex-shrink-0 w-4 h-4 text-blue-600 animate-spin" />
            )}

            <div className="relative">
              <button
                onClick={() => setOpenMenuId(openMenuId === doc.id ? null : doc.id)}
                className="flex-shrink-0 p-1 opacity-0 group-hover:opacity-100 hover:bg-slate-200 rounded transition-opacity"
              >
                <MoreVertical className="w-4 h-4 text-slate-600" />
              </button>

              {openMenuId === doc.id && (
                <>
                  <div 
                    className="fixed inset-0 z-10" 
                    onClick={() => setOpenMenuId(null)}
                  />
                  
                  <div className="absolute right-0 top-full mt-1 w-32 bg-white border border-slate-200 rounded-lg shadow-lg z-20 py-1">
                    <button
                      onClick={() => handleView(doc)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <Eye className="w-4 h-4" />
                      View
                    </button>
                    <button
                      onClick={() => handleRename(doc)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <Edit2 className="w-4 h-4" />
                      Rename
                    </button>
                    <button
                      onClick={() => handleDelete(doc.id)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                      Remove
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="px-3 py-2 border-t border-slate-200 text-xs text-slate-500">
        {enabledDocuments.size} of {documents.length} documents ({documents.length - enabledDocuments.size} remaining)
        {processingCount > 0 && ` • ${processingCount} processing`}
      </div>
    </div>
  );
}
