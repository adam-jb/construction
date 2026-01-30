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
  highlightArea?: {
    top: number;    // percentage from top
    left: number;   // percentage from left
    width: number;  // percentage width
    height: number; // percentage height
  };
}

export interface ChatMessage {
  type: 'user' | 'assistant';
  text: string;
  references?: Reference[];
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
