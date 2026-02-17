import { useState, useCallback } from 'react';
import { Upload, File, X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import apiClient from '../api/client';
import type { Document } from '../api/types';

interface UploadStatus {
  file: File;
  status: 'uploading' | 'processing' | 'success' | 'error';
  documentId?: string;
  progress?: number;
  error?: string;
  estimatedTime?: number;
}

interface DocumentUploadProps {
  onUploadComplete?: (document: Document) => void;
}

export default function DocumentUpload({ onUploadComplete }: DocumentUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploads, setUploads] = useState<UploadStatus[]>([]);
  const [documentType, setDocumentType] = useState<'code' | 'standard' | 'reference' | 'specification'>('standard');

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

  const uploadFile = async (file: File) => {
    // Add to uploads list
    const uploadStatus: UploadStatus = {
      file,
      status: 'uploading',
      progress: 0,
    };
    setUploads(prev => [...prev, uploadStatus]);

    try {
      // Call API
      const response = await apiClient.uploadDocument(file, documentType);
      
      // Update to processing
      setUploads(prev => prev.map(u => 
        u.file === file 
          ? { ...u, status: 'processing', documentId: response.documentId, estimatedTime: response.estimatedProcessingTime }
          : u
      ));

      // Poll for completion (in real app, this would be a proper polling mechanism)
      // For now, just simulate success after estimated time
      setTimeout(() => {
        setUploads(prev => prev.map(u => 
          u.file === file 
            ? { ...u, status: 'success' }
            : u
        ));

        // Fetch the document details
        if (response.documentId) {
          apiClient.getDocument(response.documentId).then(doc => {
            onUploadComplete?.(doc);
          }).catch(err => {
            console.error('Failed to fetch document:', err);
          });
        }
      }, (response.estimatedProcessingTime || 3) * 1000);

    } catch (error) {
      setUploads(prev => prev.map(u => 
        u.file === file 
          ? { ...u, status: 'error', error: error instanceof Error ? error.message : 'Upload failed' }
          : u
      ));
    }
  };

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) return;

    Array.from(files).forEach(file => {
      const error = validateFile(file);
      if (error) {
        setUploads(prev => [...prev, { file, status: 'error', error }]);
        return;
      }
      uploadFile(file);
    });
  }, [documentType]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
    e.target.value = ''; // Reset input
  }, [handleFiles]);

  const removeUpload = (file: File) => {
    setUploads(prev => prev.filter(u => u.file !== file));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  return (
    <div className="space-y-4">
      {/* Document Type Selector */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Document Type
        </label>
        <select
          value={documentType}
          onChange={(e) => setDocumentType(e.target.value as any)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="code">Code</option>
          <option value="standard">Standard</option>
          <option value="reference">Reference</option>
          <option value="specification">Specification</option>
        </select>
      </div>

      {/* Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          relative border-2 border-dashed rounded-xl p-8 text-center transition-all
          ${isDragging 
            ? 'border-blue-500 bg-blue-50' 
            : 'border-slate-300 hover:border-slate-400 bg-white'
          }
        `}
      >
        <input
          type="file"
          id="file-input"
          accept=".pdf"
          multiple
          onChange={handleFileInput}
          className="hidden"
        />
        
        <div className="flex flex-col items-center gap-3">
          <div className={`p-3 rounded-full ${isDragging ? 'bg-blue-100' : 'bg-slate-100'}`}>
            <Upload className={`w-8 h-8 ${isDragging ? 'text-blue-600' : 'text-slate-600'}`} />
          </div>
          
          <div>
            <p className="text-lg font-medium text-slate-700">
              {isDragging ? 'Drop files here' : 'Upload PDF Documents'}
            </p>
            <p className="text-sm text-slate-500 mt-1">
              Drag and drop or{' '}
              <label htmlFor="file-input" className="text-blue-600 hover:text-blue-700 cursor-pointer font-medium">
                browse files
              </label>
            </p>
          </div>

          <p className="text-xs text-slate-400">
            PDF only • Max 100MB
          </p>
        </div>
      </div>

      {/* Upload List */}
      {uploads.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-slate-700">Uploads</h3>
          <div className="space-y-2">
            {uploads.map((upload, index) => (
              <div
                key={index}
                className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-lg"
              >
                {/* Icon */}
                <div className="flex-shrink-0">
                  {upload.status === 'uploading' || upload.status === 'processing' ? (
                    <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                  ) : upload.status === 'success' ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : upload.status === 'error' ? (
                    <AlertCircle className="w-5 h-5 text-red-600" />
                  ) : (
                    <File className="w-5 h-5 text-slate-600" />
                  )}
                </div>

                {/* File Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {upload.file.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatFileSize(upload.file.size)}
                    {upload.status === 'processing' && upload.estimatedTime && (
                      <> • Processing (~{formatTime(upload.estimatedTime)} remaining)</>
                    )}
                    {upload.status === 'uploading' && <> • Uploading...</>}
                    {upload.status === 'success' && <> • Ready</>}
                    {upload.status === 'error' && upload.error && (
                      <span className="text-red-600"> • {upload.error}</span>
                    )}
                  </p>
                </div>

                {/* Remove Button */}
                <button
                  onClick={() => removeUpload(upload.file)}
                  className="flex-shrink-0 p-1 hover:bg-slate-100 rounded transition-colors"
                  title="Remove"
                >
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
