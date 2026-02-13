/**
 * Reference and Citation Types
 */

export interface Reference {
  id: string;
  documentId: string;
  documentName: string;
  page: number;
  section?: string;
  label: string;
  excerpt: string;
  highlightText?: string[];
  highlightArea?: HighlightArea;
  confidence?: number;
  context?: string;
}

export interface HighlightArea {
  top: number;    // percentage from top
  left: number;   // percentage from left
  width: number;  // percentage width
  height: number; // percentage height
}

export interface Citation {
  referenceId: string;
  inlineText: string;
  position: number; // character position in answer
}

export interface CrossReference {
  sourceDocId: string;
  sourcePage: number;
  sourceSection: string;
  targetDocId: string;
  targetPage: number;
  targetSection: string;
  relationshipType: 'cites' | 'supersedes' | 'amends' | 'clarifies';
}
