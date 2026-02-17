// Types for the prototype

export interface Document {
  id: string;
  name: string;
  shortName: string;
  pages: number;
}

export interface Reference {
  docId: string;
  page: number;
  label: string;
  highlightText?: string[];  // Text strings to highlight on the page
  highlightArea?: {          // Legacy: rectangle-based highlighting
    top: number;    // percentage from top
    left: number;   // percentage from left
    width: number;  // percentage width
    height: number; // percentage height
  };
}

export interface ChatMessage {
  id: string;
  type: 'user' | 'assistant';
  text: string;
  references?: Reference[];
  timestamp: Date;
}

export interface ChatSession {
  id: string;
  name: string;
  lastMessage: string;
  lastAccessedAt: Date;
  archived: boolean;
  messages: ChatMessage[];
}

export interface Scenario {
  id: string;
  title: string;
  description: string;
  documents: string[];
  steps: ChatMessage[];
}

export interface AppState {
  selectedScenario: string;
  currentStepIndex: number;
  activeDocumentId: string | null;
  activePage: number;
  activeHighlight: Reference | null;
  enabledDocuments: Set<string>;
  leftPaneCollapsed: boolean;
  rightPaneCollapsed: boolean;
}
