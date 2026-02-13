/**
 * Document Management Types
 */

export interface Document {
  id: string;
  name: string;
  shortName: string;
  type: DocumentType;
  pages: number;
  uploadedAt: Date;
  status: DocumentStatus;
  metadata?: DocumentMetadata;
}

export type DocumentType = 'code' | 'standard' | 'reference' | 'specification';

export type DocumentStatus = 'uploading' | 'processing' | 'ready' | 'error';

export interface DocumentMetadata {
  fileSize: number;
  author?: string;
  version?: string;
  publishDate?: string;
  tags?: string[];
}

export interface DocumentUploadRequest {
  file: File;
  type: DocumentType;
  metadata?: Partial<DocumentMetadata>;
}

export interface DocumentUploadResponse {
  documentId: string;
  status: DocumentStatus;
  estimatedProcessingTime?: number; // seconds
}

export interface PageData {
  documentId: string;
  pageNumber: number;
  imageUrl?: string;
  textContent?: string;
  annotations?: Annotation[];
}

export interface Annotation {
  id: string;
  type: 'highlight' | 'note' | 'reference';
  position: AnnotationPosition;
  content?: string;
}

export interface AnnotationPosition {
  top: number;    // percentage from top
  left: number;   // percentage from left
  width: number;  // percentage width
  height: number; // percentage height
}
