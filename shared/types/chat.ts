/**
 * Chat and Message Types
 */

import { Reference } from './references';
import { ReasoningStep } from './queries';

export interface ChatMessage {
  id: string;
  type: 'user' | 'assistant' | 'system';
  content: string;
  references?: Reference[];
  reasoning?: ReasoningStep[];
  timestamp: Date;
  metadata?: MessageMetadata;
}

export interface MessageMetadata {
  processingTime?: number;
  tokensUsed?: number;
  model?: string;
  error?: string;
}

export interface ChatSession {
  id: string;
  userId: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
  metadata?: SessionMetadata;
}

export interface SessionMetadata {
  documentsUsed: string[];
  totalQueries: number;
  averageResponseTime?: number;
}

export interface Scenario {
  id: string;
  title: string;
  description: string;
  documents: string[];
  steps: ChatMessage[];
}
