import { useState, useEffect } from 'react';
import Header from './components/Header';
import DocumentsPanel from './components/DocumentsPanel';
import ChatPane from './components/ChatPane';
import ViewerPanel from './components/ViewerPanel';
import apiClient from './api/client';
import type { Document } from './api/types';

function App() {
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [activeDocument, setActiveDocument] = useState<Document | null>(null);
  const [activeDocumentPage, setActiveDocumentPage] = useState<number>(1);
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

  const handleReferenceClick = (documentId: string, page?: number) => {
    console.log('🔍 Reference click - looking for document:', documentId);
    console.log('📚 Available documents:', documents.map(d => ({ id: d.id, name: d.shortName, keyPrefix: d.keyPrefix })));
    // Try to find by keyPrefix first (references use keyPrefix), then fall back to id
    const doc = documents.find(d => d.keyPrefix === documentId) || documents.find(d => d.id === documentId);
    if (doc) {
      console.log('✅ Found document:', doc.shortName, 'page:', page);
      setActiveDocument(doc);
      setActiveDocumentPage(page || 1);
      setRightPanelCollapsed(false);
    } else {
      console.error('❌ Document not found with ID or keyPrefix:', documentId);
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
        />

        {/* Right Panel - Viewer */}
        <ViewerPanel
          collapsed={rightPanelCollapsed}
          onToggleCollapse={() => setRightPanelCollapsed(!rightPanelCollapsed)}
          activeDocument={activeDocument}
          initialPage={activeDocumentPage}
        />
      </div>
    </div>
  );
}

export default App;
