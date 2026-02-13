/**
 * Query and Search Types
 */

import { Reference } from './references';

export interface QueryRequest {
  query: string;
  documentIds?: string[];
  filters?: QueryFilters;
  options?: QueryOptions;
}

export interface QueryFilters {
  documentTypes?: string[];
  dateRange?: {
    start: Date;
    end: Date;
  };
  sections?: string[];
}

export interface QueryOptions {
  maxResults?: number;
  includeReasoning?: boolean;
  includeGraphContext?: boolean;
  stream?: boolean;
}

export interface QueryResponse {
  queryId: string;
  answer: string;
  references: Reference[];
  reasoning?: ReasoningStep[];
  graphContext?: GraphContext;
  confidence?: number;
  processingTime?: number; // milliseconds
}

export interface ReasoningStep {
  step: number;
  description: string;
  action: 'search' | 'graph_traverse' | 'synthesize' | 'verify';
  details?: Record<string, any>;
}

export interface GraphContext {
  nodes: GraphNode[];
  edges: GraphEdge[];
  focusNodeId?: string;
}

export interface GraphNode {
  id: string;
  type: 'document' | 'section' | 'clause' | 'table' | 'figure';
  label: string;
  documentId?: string;
  page?: number;
  properties?: Record<string, any>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: 'references' | 'contains' | 'cites' | 'supersedes' | 'related';
  label?: string;
}

export interface StreamChunk {
  type: 'token' | 'reference' | 'reasoning' | 'complete';
  content: string | Reference | ReasoningStep;
  timestamp: number;
}
