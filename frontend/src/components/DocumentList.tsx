import { useEffect, useState, useRef, useCallback } from 'react';
import { FileText, Loader2, MoreVertical, Eye, Edit2, Trash2 } from 'lucide-react';
import apiClient from '../api/client';
import type { Document } from '../api/types';
import ConfirmModal from './ConfirmModal';
import RenameModal from './RenameModal';

interface DocumentListProps {
  onDocumentSelect?: (document: Document) => void;
  refreshTrigger?: number;
  enabledDocuments: Set<string>;
  onDocumentToggle: (documentId: string) => void;
  onDocumentsLoaded?: (docs: { name: string; shortName: string }[], count: number) => void;
}

export default function DocumentList({
  onDocumentSelect,
  refreshTrigger,
  enabledDocuments,
  onDocumentToggle,
  onDocumentsLoaded,
}: DocumentListProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal state
  const [deleteTarget, setDeleteTarget] = useState<Document | null>(null);
  const [renameTarget, setRenameTarget] = useState<Document | null>(null);

  // Indeterminate checkbox ref
  const selectAllRef = useRef<HTMLInputElement>(null);

  // Helper: display name for a document
  const displayName = (doc: Document) => doc.shortName || doc.name;

  // Sort documents alphabetically by display name
  const sortDocs = (docs: Document[]) =>
    [...docs].sort((a, b) =>
      displayName(a).localeCompare(displayName(b), undefined, {
        sensitivity: 'base',
      })
    );

  const loadDocuments = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.listDocuments();
      const sorted = sortDocs(response.items);
      setDocuments(sorted);
      onDocumentsLoaded?.(sorted.map(d => ({ name: d.name, shortName: d.shortName })), sorted.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, [refreshTrigger]);

  // Indeterminate state for "select all"
  const allSelected = documents.length > 0 && enabledDocuments.size === documents.length;
  const someSelected = enabledDocuments.size > 0 && enabledDocuments.size < documents.length;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  // Filtered (search) — does not mutate original
  const filteredDocuments = documents.filter((doc) =>
    displayName(doc).toLowerCase().includes(searchQuery.toLowerCase())
  );

  const processingCount = documents.filter((d) => d.status === 'processing').length;

  // Close context menu on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && openMenuId) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [openMenuId]);

  // ── Handlers ──────────────────────────────────────────────

  const handleToggleAll = () => {
    if (allSelected) {
      // Deselect all
      documents.forEach((doc) => {
        if (enabledDocuments.has(doc.id)) {
          onDocumentToggle(doc.id);
        }
      });
    } else {
      // Select all
      documents.forEach((doc) => {
        if (!enabledDocuments.has(doc.id)) {
          onDocumentToggle(doc.id);
        }
      });
    }
  };

  const handleView = (document: Document) => {
    setOpenMenuId(null);
    setSelectedId(document.id);
    onDocumentSelect?.(document);
  };

  // ── Rename ────────────────────────────────────────────────

  const handleRenameClick = (document: Document) => {
    setOpenMenuId(null);
    setRenameTarget(document);
  };

  const handleRenameSave = useCallback(
    async (newName: string) => {
      if (!renameTarget) return;

      // Optimistically update local state
      const previousDocs = documents;
      const updatedDocs = sortDocs(
        documents.map((d) =>
          d.id === renameTarget.id ? { ...d, shortName: newName } : d
        )
      );
      setDocuments(updatedDocs);
      setRenameTarget(null);

      try {
        await apiClient.renameDocument(renameTarget.id, newName);
        // Sync names to parent
        onDocumentsLoaded?.(
          updatedDocs.map((d) => ({ name: d.name, shortName: d.shortName })),
          updatedDocs.length
        );
      } catch {
        // Revert on failure
        setDocuments(previousDocs);
        // Could add inline error here in future
      }
    },
    [renameTarget, documents, onDocumentsLoaded]
  );

  // ── Delete ────────────────────────────────────────────────

  const handleDeleteClick = (document: Document) => {
    setOpenMenuId(null);
    setDeleteTarget(document);
  };

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await apiClient.deleteDocument(deleteTarget.id);
      setDocuments((prev) => prev.filter((d) => d.id !== deleteTarget.id));
      // Clean up enabled set
      if (enabledDocuments.has(deleteTarget.id)) {
        onDocumentToggle(deleteTarget.id);
      }
      if (selectedId === deleteTarget.id) {
        setSelectedId(null);
      }
    } catch {
      // Silently handle — could add inline error later
    }
    setDeleteTarget(null);
  }, [deleteTarget, enabledDocuments, onDocumentToggle, selectedId]);

  // ── Render ────────────────────────────────────────────────

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
      {/* Search */}
      <div className="px-3 pb-3">
        <input
          type="text"
          placeholder="Search..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Select all */}
      <div className="px-3 pb-2">
        <label className="flex items-center gap-2 text-sm text-slate-700 hover:text-slate-900 cursor-pointer">
          <input
            ref={selectAllRef}
            type="checkbox"
            checked={allSelected}
            onChange={handleToggleAll}
            className="w-4 h-4 rounded border-slate-300"
          />
          <span className="font-medium">Select all documents</span>
        </label>
      </div>

      {/* Document list */}
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
                {displayName(doc)}
              </p>
            </div>

            {doc.status === 'processing' && (
              <Loader2 className="flex-shrink-0 w-4 h-4 text-blue-600 animate-spin" />
            )}

            {/* Context menu trigger */}
            <div className="relative">
              <button
                onClick={() =>
                  setOpenMenuId(openMenuId === doc.id ? null : doc.id)
                }
                className="flex-shrink-0 p-1 opacity-0 group-hover:opacity-100 hover:bg-slate-200 rounded transition-opacity"
                aria-label={`Actions for ${displayName(doc)}`}
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
                      onClick={() => handleRenameClick(doc)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <Edit2 className="w-4 h-4" />
                      Rename
                    </button>
                    <button
                      onClick={() => handleDeleteClick(doc)}
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

      {/* Footer */}
      <div className="px-3 py-2 border-t border-slate-200 text-xs text-slate-500">
        {enabledDocuments.size} of {documents.length} selected
        {processingCount > 0 && ` · ${processingCount} processing`}
      </div>

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <ConfirmModal
          title="Delete Document"
          message={`Are you sure you want to delete "${displayName(deleteTarget)}"? This action cannot be undone.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* Rename modal */}
      {renameTarget && (
        <RenameModal
          currentName={displayName(renameTarget)}
          existingNames={documents
            .filter((d) => d.id !== renameTarget.id)
            .map(displayName)}
          onSave={handleRenameSave}
          onCancel={() => setRenameTarget(null)}
        />
      )}
    </div>
  );
}
