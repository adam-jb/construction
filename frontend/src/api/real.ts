/**
 * Real API Implementation
 * 
 * Makes actual HTTP requests to the backend API.
 * Used when VITE_USE_MOCK_API=false
 */

import type {
  Document,
  DocumentUploadResponse,
  QueryRequest,
  QueryResponse,
  PageData,
  Reference,
  PaginatedResponse,
} from '@construction-ai/shared';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const API_V1 = `${API_BASE_URL}/api/v1`;

class APIError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'APIError';
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({
      message: response.statusText,
    }));
    throw new APIError(response.status, error.message || error.detail || 'API request failed');
  }
  return response.json();
}

// Backend returns list<DocumentResponse>, we need to wrap in PaginatedResponse
function wrapDocumentsInPagination(docs: any[]): PaginatedResponse<Document> {
  const mappedDocs: Document[] = docs.map(doc => ({
    id: doc.id,
    name: doc.name,
    shortName: doc.code || doc.id,
    type: 'standard' as const, // Backend doesn't return type yet
    pages: doc.pages,
    uploadedAt: new Date(), // Backend doesn't return this yet
    status: doc.status as 'uploading' | 'processing' | 'ready' | 'error',
  }));

  return {
    items: mappedDocs,
    total: mappedDocs.length,
    page: 1,
    pageSize: mappedDocs.length,
    hasMore: false,
  };
}

export const realAPI = {
  // Health Check
  async healthCheck() {
    const response = await fetch(`${API_V1}/health`);
    return handleResponse(response);
  },

  // Document Management
  async listDocuments(): Promise<PaginatedResponse<Document>> {
    // Backend doesn't support pagination yet, returns simple array
    const response = await fetch(`${API_V1}/documents`);
    const docs = await handleResponse<any[]>(response);
    return wrapDocumentsInPagination(docs);
  },

  async uploadDocument(
    file: File,
    _type: string
  ): Promise<DocumentUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    // Backend doesn't use type parameter yet

    const response = await fetch(`${API_V1}/documents`, {
      method: 'POST',
      body: formData,
    });
    return handleResponse(response);
  },

  async getDocument(documentId: string): Promise<Document> {
    const response = await fetch(`${API_V1}/documents/${documentId}`);
    const doc = await handleResponse<any>(response);
    return {
      id: doc.id,
      name: doc.name,
      shortName: doc.code || doc.id,
      type: 'standard' as const,
      pages: doc.pages,
      uploadedAt: new Date(),
      status: doc.status as 'uploading' | 'processing' | 'ready' | 'error',
    };
  },

  async deleteDocument(documentId: string): Promise<void> {
    const response = await fetch(`${API_V1}/documents/${documentId}`, {
      method: 'DELETE',
    });
    if (!response.ok && response.status !== 204) {
      throw new APIError(response.status, 'Failed to delete document');
    }
  },

  async getDocumentPage(
    documentId: string,
    pageNumber: number
  ): Promise<PageData> {
    // Backend doesn't have this endpoint yet - mock for now
    return {
      documentId,
      pageNumber,
      textContent: 'Page content not yet available from backend',
    };
  },

  // Query
  async query(request: QueryRequest): Promise<QueryResponse> {
    const response = await fetch(`${API_V1}/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });
    const backendResponse = await handleResponse<any>(response);
    
    // Map backend response to frontend types
    return {
      queryId: backendResponse.queryId || 'unknown',
      answer: backendResponse.answer,
      references: (backendResponse.references || []).map((ref: any) => ({
        id: ref.id,
        documentId: ref.doc_id || ref.documentId || '',
        documentName: ref.doc_name || ref.title || '',
        page: ref.page || 0,
        section: ref.section_code || '',
        label: `[${ref.section_code || 'ref'}]`,
        excerpt: ref.extract || ref.excerpt || '',
        highlightText: ref.highlightText,
        confidence: ref.confidence,
      })),
      processingTime: backendResponse.processingTime,
    };
  },

  // References
  async getReference(referenceId: string): Promise<Reference> {
    const response = await fetch(`${API_V1}/references/${referenceId}`);
    return handleResponse(response);
  },

  async getReferenceContext(referenceId: string, depth: number = 2) {
    const response = await fetch(
      `${API_V1}/references/${referenceId}/context?depth=${depth}`
    );
    return handleResponse(response);
  },
};

export default realAPI;
