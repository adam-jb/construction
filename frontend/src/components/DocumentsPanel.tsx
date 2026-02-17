import { useState, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, Plus, Upload } from 'lucide-react';
import DocumentList from './DocumentList';
import apiClient from '../api/client';
import type { Document } from '../api/types';

interface DocumentsPanelProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onDocumentSelect?: (document: Document) => void;
  enabledDocuments: Set<string>;
  onDocumentToggle: (documentId: string) => void;
}

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  // TODO: Add UI to select document type
  const documentType: 'code' | 'standard' | 'reference' | 'specification' = 'standard';

  const validateFile = (file: File): string | null => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return 'Only PDF files are supported';
    }
    const maxSize = 100 * 1024 * 1024; // 100MB
    if (file.size > maxSize) {
      return 'File size must be less than 100MB';
    }
    return null;
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setUploading(true);
    
    for (const file of Array.from(files)) {
      const error = validateFile(file);
      if (error) {
        alert(`${file.name}: ${error}`);
        continue;
      }

      try {
        await apiClient.uploadDocument(file, documentType);
      } catch (err) {
        alert(`Failed to upload ${file.name}`);
      }
    }

    setUploading(false);
    setRefreshTrigger(prev => prev + 1);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    uploadFiles(e.dataTransfer.files);
  }, [documentType]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    // Only set dragging to false if we're leaving the panel entirely
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    uploadFiles(e.target.files);
    e.target.value = ''; // Reset input
  }, [documentType]);

  const handleAddClick = () => {
    fileInputRef.current?.click();
  };

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

  return (
    <div 
      className={`w-96 bg-white border-r border-slate-200 flex flex-col ${
        isDragging ? 'bg-blue-50' : ''
      }`}
      onDrop={handleDrop}
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

      {/* Document List */}
      <DocumentList
        onDocumentSelect={onDocumentSelect}
        refreshTrigger={refreshTrigger}
        enabledDocuments={enabledDocuments}
        onDocumentToggle={onDocumentToggle}
      />

      {/* Drag and Drop Overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-blue-50 bg-opacity-90 border-4 border-dashed border-blue-400 rounded-lg flex items-center justify-center pointer-events-none z-10">
          <div className="text-center">
            <Upload className="w-12 h-12 text-blue-600 mx-auto mb-2" />
            <p className="text-lg font-medium text-blue-900">Drop PDF files here</p>
            <p className="text-sm text-blue-700 mt-1">Max 100MB per file</p>
          </div>
        </div>
      )}
    </div>
  );
}
