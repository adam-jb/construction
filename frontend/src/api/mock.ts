/**
 * Mock API Implementation
 * 
 * Provides realistic mock responses for frontend development.
 * Matches the OpenAPI specification exactly.
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

// Simulated delay for realistic API feel
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Mock data
const mockDocuments: Document[] = [
  {
    id: 'as1170-2',
    name: 'AS 1170.2 - Wind Actions',
    shortName: 'AS 1170.2',
    type: 'standard',
    pages: 150,
    status: 'ready',
    uploadedAt: new Date('2024-01-15'),
  },
  {
    id: 'as3600',
    name: 'AS 3600 - Concrete Structures',
    shortName: 'AS 3600',
    type: 'code',
    pages: 250,
    status: 'ready',
    uploadedAt: new Date('2024-01-10'),
  },
];

const mockQueryResponses: Record<string, QueryResponse> = {
  'wind load': {
    queryId: 'query-1',
    answer: 'Wind load factors for structures are specified in AS 1170.2. For terrain category 2, the wind speed multiplier varies based on height above ground. The basic wind speed must be multiplied by terrain, height, shielding, and topographic factors.',
    references: [
      {
        id: 'ref-1',
        documentId: 'as1170-2',
        documentName: 'AS 1170.2',
        page: 45,
        section: '5.3.2',
        label: 'Wind Load Factors',
        excerpt: 'For structures in terrain category 2, the wind speed multiplier...',
        highlightText: ['wind speed multiplier', 'terrain category 2'],
        confidence: 0.95,
      },
    ],
    reasoning: [
      {
        step: 1,
        description: 'Searched vector database for wind load related content',
        action: 'search',
      },
      {
        step: 2,
        description: 'Traversed graph to find related standards',
        action: 'graph_traverse',
      },
      {
        step: 3,
        description: 'Synthesized answer using GPT-4',
        action: 'synthesize',
      },
    ],
    confidence: 0.92,
    processingTime: 1420,
  },
};

export const mockAPI = {
  // Health Check
  async healthCheck() {
    await delay(100);
    return {
      status: 'healthy' as const,
      version: '0.1.0',
      services: [
        { name: 'neo4j', status: 'up' as const, responseTime: 12 },
        { name: 'vector_search', status: 'up' as const, responseTime: 45 },
        { name: 'openai', status: 'up' as const, responseTime: 230 },
      ],
      timestamp: new Date(),
    };
  },

  // Document Management
  async listDocuments(params?: {
    page?: number;
    pageSize?: number;
    type?: string;
  }): Promise<PaginatedResponse<Document>> {
    await delay(300);
    
    const page = params?.page || 1;
    const pageSize = params?.pageSize || 20;
    
    let filtered = mockDocuments;
    if (params?.type) {
      filtered = mockDocuments.filter(d => d.type === params.type);
    }
    
    return {
      items: filtered,
      total: filtered.length,
      page,
      pageSize,
      hasMore: false,
    };
  },

  async uploadDocument(
    _file: File,
    _type: string
  ): Promise<DocumentUploadResponse> {
    await delay(2000); // Simulate upload time
    
    return {
      documentId: `doc-${Date.now()}`,
      status: 'processing',
      estimatedProcessingTime: 180,
    };
  },

  async getDocument(documentId: string): Promise<Document> {
    await delay(200);
    
    const doc = mockDocuments.find(d => d.id === documentId);
    if (!doc) {
      throw new Error('Document not found');
    }
    
    return doc;
  },

  async deleteDocument(_documentId: string): Promise<void> {
    await delay(500);
    // Mock deletion
  },

  async getDocumentPage(
    documentId: string,
    pageNumber: number
  ): Promise<PageData> {
    await delay(400);
    
    return {
      documentId,
      pageNumber,
      imageUrl: `https://placehold.co/800x1000/eee/333?text=Page+${pageNumber}`,
      textContent: `Mock text content for page ${pageNumber}...`,
      annotations: [],
    };
  },

  // Query
  async query(request: QueryRequest): Promise<QueryResponse> {
    await delay(1500); // Simulate AI processing time
    
    // Find matching mock response
    const queryLower = request.query.toLowerCase();
    for (const [key, response] of Object.entries(mockQueryResponses)) {
      if (queryLower.includes(key)) {
        return {
          ...response,
          queryId: `query-${Date.now()}`,
        };
      }
    }
    
    // Default response
    return {
      queryId: `query-${Date.now()}`,
      answer: `Mock answer for: "${request.query}". This is a simulated response demonstrating the system's capability to provide detailed answers with citations to specific code sections.`,
      references: [
        {
          id: `ref-${Date.now()}`,
          documentId: mockDocuments[0].id,
          documentName: mockDocuments[0].name,
          page: Math.floor(Math.random() * 100) + 1,
          section: '5.3',
          label: 'Related Section',
          excerpt: 'Mock excerpt from the document...',
          confidence: 0.85,
        },
      ],
      reasoning: [
        {
          step: 1,
          description: 'Generated query embedding',
          action: 'search',
        },
        {
          step: 2,
          description: 'Performed vector similarity search',
          action: 'search',
        },
        {
          step: 3,
          description: 'Synthesized answer',
          action: 'synthesize',
        },
      ],
      processingTime: 1500,
    };
  },

  // References
  async getReference(referenceId: string): Promise<Reference> {
    await delay(200);
    
    return {
      id: referenceId,
      documentId: 'as1170-2',
      documentName: 'AS 1170.2',
      page: 45,
      section: '5.3.2',
      label: 'Wind Load Factors',
      excerpt: 'For structures in terrain category 2, the wind speed multiplier varies based on height above ground...',
      confidence: 0.95,
    };
  },

  async getReferenceContext(referenceId: string, _depth: number = 2) {
    await delay(400);
    
    return {
      nodes: [
        {
          id: referenceId,
          type: 'section' as const,
          label: 'Wind Load Factors',
          documentId: 'as1170-2',
          page: 45,
        },
        {
          id: 'related-1',
          type: 'section' as const,
          label: 'Terrain Categories',
          documentId: 'as1170-2',
          page: 46,
        },
      ],
      edges: [
        {
          id: 'edge-1',
          source: referenceId,
          target: 'related-1',
          type: 'references' as const,
          label: 'References',
        },
      ],
      focusNodeId: referenceId,
    };
  },
};

export default mockAPI;
