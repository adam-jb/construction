import { useState, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, Plus, Upload, FileText, X } from 'lucide-react';
import DocumentList from './DocumentList';
import apiClient from '../api/client';
import type { Document } from '../api/types';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const MAX_FILE_COUNT = 10;

interface UploadError {
  id: number;
  message: string;
}

interface DocumentsPanelProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onDocumentSelect?: (document: Document) => void;
  enabledDocuments: Set<string>;
  onDocumentToggle: (documentId: string) => void;
}

let errorIdCounter = 0;

export default function DocumentsPanel({
  collapsed,
  onToggleCollapse,
  onDocumentSelect,
  enabledDocuments,
  onDocumentToggle,
}: DocumentsPanelProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadErrors, setUploadErrors] = useState<UploadError[]>([]);
  const [documentCount, setDocumentCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  // Receive current doc names from list for duplicate checking
  const [existingNames, setExistingNames] = useState<string[]>([]);

  const documentType: 'code' | 'standard' | 'reference' | 'specification' = 'standard';

  // ── Error helpers ──────────────────────────────────────────

  const addError = (message: string) => {
    const id = ++errorIdCounter;
    setUploadErrors((prev) => [...prev, { id, message }]);
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      setUploadErrors((prev) => prev.filter((e) => e.id !== id));
    }, 5000);
  };

  const dismissError = (id: number) => {
    setUploadErrors((prev) => prev.filter((e) => e.id !== id));
  };

  // ── Validation ─────────────────────────────────────────────

  const validateFile = (file: File): string | null => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return `"${file.name}" is not a PDF. Only PDF files are supported.`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `"${file.name}" exceeds the 20 MB size limit.`;
    }
    if (existingNames.some((n) => n.toLowerCase() === file.name.toLowerCase())) {
      return `"${file.name}" already exists. Please rename the file before uploading.`;
    }
    return null;
  };

  // ── Upload ─────────────────────────────────────────────────

  const uploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const fileArr = Array.from(files);

    // Check count limit
    if (documentCount + fileArr.length > MAX_FILE_COUNT) {
      addError(
        `Cannot upload ${fileArr.length} file(s). Maximum is ${MAX_FILE_COUNT} documents (currently ${documentCount}).`
      );
      return;
    }

    setUploading(true);

    for (const file of fileArr) {
      const error = validateFile(file);
      if (error) {
        addError(error);
        continue;
      }

      try {
        await apiClient.uploadDocument(file, documentType);
        // Track the new name to prevent further duplicates in this batch
        setExistingNames((prev) => [...prev, file.name]);
      } catch {
        addError(`Failed to upload "${file.name}".`);
      }
    }

    setUploading(false);
    setRefreshTrigger((prev) => prev + 1);
  };

  // ── Drag & drop  ───────────────────────────────────────────

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsDragging(false);
      uploadFiles(e.dataTransfer.files);
    },
    [documentType, existingNames, documentCount]
  );

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current++;
    setIsDragging(true);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragging(false);
    }
  }, []);

  // ── File input ─────────────────────────────────────────────

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      uploadFiles(e.target.files);
      e.target.value = '';
    },
    [documentType, existingNames, documentCount]
  );

  const handleAddClick = () => {
    fileInputRef.current?.click();
  };

  // ── Callback from DocumentList to sync doc count + names ──

  const handleDocumentsLoaded = useCallback(
    (docs: { name: string; shortName: string }[], count: number) => {
      setDocumentCount(count);
      setExistingNames(docs.map((d) => d.name));
    },
    []
  );

  // ── Collapsed view ─────────────────────────────────────────

  if (collapsed) {
    return (
      <div className="w-16 bg-white border-r border-slate-200 flex flex-col items-center py-4 gap-3">
        <button
          onClick={onToggleCollapse}
          className="p-2 hover:bg-slate-100 rounded transition-colors"
          title="Expand documents panel"
        >
          <ChevronRight className="w-5 h-5 text-slate-600" />
        </button>

        {/* Selected count badge */}
        <div className="relative" title={`${enabledDocuments.size} documents selected`}>
          <FileText className="w-5 h-5 text-slate-500" />
          {enabledDocuments.size > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold text-white bg-blue-600 rounded-full px-1">
              {enabledDocuments.size}
            </span>
          )}
        </div>

        <button
          onClick={handleAddClick}
          className="p-2 hover:bg-slate-100 rounded transition-colors"
          title="Add documents"
        >
          <Plus className="w-5 h-5 text-slate-600" />
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          multiple
          onChange={handleFileInput}
          className="hidden"
        />
      </div>
    );
  }

  // ── Expanded view ──────────────────────────────────────────

  return (
    <div
      className={`w-full h-full bg-white border-r border-slate-200 flex flex-col relative ${isDragging ? 'ring-2 ring-blue-400 ring-inset' : ''
        }`}
      onDrop={handleDrop}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-slate-200">
        <h2 className="text-sm font-semibold text-slate-900">Documents</h2>
        <button
          onClick={onToggleCollapse}
          className="p-1 hover:bg-slate-100 rounded transition-colors"
          title="Collapse panel"
        >
          <ChevronLeft className="w-5 h-5 text-slate-600" />
        </button>
      </div>

      {/* Add Documents Button */}
      <div className="px-3 pt-3 pb-2">
        <button
          onClick={handleAddClick}
          disabled={uploading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
        >
          {uploading ? (
            <>
              <Upload className="w-4 h-4 animate-pulse" />
              Uploading...
            </>
          ) : (
            <>
              <Plus className="w-4 h-4" />
              Add documents
            </>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          multiple
          onChange={handleFileInput}
          className="hidden"
        />
      </div>

      {/* Inline upload errors */}
      {uploadErrors.length > 0 && (
        <div className="px-3 pb-2 space-y-1">
          {uploadErrors.map((err) => (
            <div
              key={err.id}
              className="flex items-start gap-2 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700"
            >
              <span className="flex-1">{err.message}</span>
              <button
                onClick={() => dismissError(err.id)}
                className="flex-shrink-0 p-0.5 hover:bg-red-100 rounded"
                aria-label="Dismiss error"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Document List */}
      <DocumentList
        onDocumentSelect={onDocumentSelect}
        refreshTrigger={refreshTrigger}
        enabledDocuments={enabledDocuments}
        onDocumentToggle={onDocumentToggle}
        onDocumentsLoaded={handleDocumentsLoaded}
      />

      {/* Drag and Drop Overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-blue-50 bg-opacity-90 border-4 border-dashed border-blue-400 rounded-lg flex items-center justify-center pointer-events-none z-10">
          <div className="text-center">
            <Upload className="w-12 h-12 text-blue-600 mx-auto mb-2" />
            <p className="text-lg font-medium text-blue-900">Drop PDF files here</p>
            <p className="text-sm text-blue-700 mt-1">Max 20 MB per file</p>
          </div>
        </div>
      )}
    </div>
  );
}
