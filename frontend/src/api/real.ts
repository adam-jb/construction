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
    throw new APIError(response.status, error.message || 'API request failed');
  }
  return response.json();
}

export const realAPI = {
  // Health Check
  async healthCheck() {
    const response = await fetch(`${API_V1}/health`);
    return handleResponse(response);
  },

  // Document Management
  async listDocuments(params?: {
    page?: number;
    pageSize?: number;
    type?: string;
  }): Promise<PaginatedResponse<Document>> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.pageSize) searchParams.set('pageSize', params.pageSize.toString());
    if (params?.type) searchParams.set('type', params.type);

    const response = await fetch(`${API_V1}/documents?${searchParams}`);
    return handleResponse(response);
  },

  async uploadDocument(
    file: File,
    type: string
  ): Promise<DocumentUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);

    const response = await fetch(`${API_V1}/documents`, {
      method: 'POST',
      body: formData,
    });
    return handleResponse(response);
  },

  async getDocument(documentId: string): Promise<Document> {
    const response = await fetch(`${API_V1}/documents/${documentId}`);
    return handleResponse(response);
  },

  async deleteDocument(documentId: string): Promise<void> {
    const response = await fetch(`${API_V1}/documents/${documentId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new APIError(response.status, 'Failed to delete document');
    }
  },

  async getDocumentPage(
    documentId: string,
    pageNumber: number
  ): Promise<PageData> {
    const response = await fetch(
      `${API_V1}/documents/${documentId}/pages/${pageNumber}`
    );
    return handleResponse(response);
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
    return handleResponse(response);
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
