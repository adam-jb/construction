import { useState, useEffect } from 'react';
import Header from './components/Header';
import DocumentsPanel from './components/DocumentsPanel';
import ChatPane from './components/ChatPane';
import ViewerPanel from './components/ViewerPanel';
import apiClient from './api/client';
import type { Document, Reference } from './api/types';

function App() {
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [activeDocument, setActiveDocument] = useState<Document | null>(null);
  const [activeDocumentPage, setActiveDocumentPage] = useState<number>(1);
  const [activeHighlight, setActiveHighlight] = useState<Reference | null>(null);
  const [enabledDocuments, setEnabledDocuments] = useState<Set<string>>(new Set());
  const [documents, setDocuments] = useState<Document[]>([]);

  // Test API client on mount and load documents
  useEffect(() => {
    apiClient.healthCheck().then(res => {
      console.log('✅ API Health Check:', res);
    }).catch(err => {
      console.error('❌ API Health Check Failed:', err);
    });

    apiClient.listDocuments().then(res => {
      setDocuments(res.items);
    }).catch(err => {
      console.error('Failed to load documents:', err);
    });
  }, []);

  const handleDocumentSelect = (document: Document) => {
    setActiveDocument(document);
    setActiveDocumentPage(1);
    setActiveHighlight(null); // Clear highlight when manually selecting document
    setRightPanelCollapsed(false);
  };

  const handleDocumentToggle = (documentId: string) => {
    setEnabledDocuments(prev => {
      const newSet = new Set(prev);
      if (newSet.has(documentId)) {
        newSet.delete(documentId);
      } else {
        newSet.add(documentId);
      }
      return newSet;
    });
  };

  const handleReferenceClick = (reference: Reference) => {
    console.log('🔍 Reference click:', reference);
    console.log('📚 Available documents:', documents.map(d => ({ id: d.id, name: d.shortName, keyPrefix: d.keyPrefix })));
    // Try to find by keyPrefix first (references use keyPrefix), then fall back to id
    const doc = documents.find(d => d.keyPrefix === reference.documentId) || documents.find(d => d.id === reference.documentId);
    if (doc) {
      console.log('✅ Found document:', doc.shortName, 'page:', reference.page, 'highlight:', reference.highlightText);
      setActiveDocument(doc);
      setActiveDocumentPage(reference.page);
      setActiveHighlight(reference);
      setRightPanelCollapsed(false);
    } else {
      console.error('❌ Document not found with ID or keyPrefix:', reference.documentId);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      <Header />
      
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Documents */}
        <DocumentsPanel
          collapsed={leftPanelCollapsed}
          onToggleCollapse={() => setLeftPanelCollapsed(!leftPanelCollapsed)}
          onDocumentSelect={handleDocumentSelect}
          enabledDocuments={enabledDocuments}
          onDocumentToggle={handleDocumentToggle}
        />

        {/* Center Panel - Chat */}
        <ChatPane
          collapsed={rightPanelCollapsed}
          onToggleCollapse={() => setRightPanelCollapsed(!rightPanelCollapsed)}
          onReferenceClick={handleReferenceClick}
          enabledDocuments={enabledDocuments}
          activeHighlight={activeHighlight}
        />

        {/* Right Panel - Viewer */}
        <ViewerPanel
          collapsed={rightPanelCollapsed}
          onToggleCollapse={() => setRightPanelCollapsed(!rightPanelCollapsed)}
          activeDocument={activeDocument}
          initialPage={activeDocumentPage}
          activeHighlight={activeHighlight}
        />
      </div>
    </div>
  );
}

export default App;
