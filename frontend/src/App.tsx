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
  const [enabledDocuments, setEnabledDocuments] = useState<Set<string>>(new Set());

  // Test API client on mount
  useEffect(() => {
    apiClient.healthCheck().then(res => {
      console.log('✅ API Health Check:', res);
    }).catch(err => {
      console.error('❌ API Health Check Failed:', err);
    });
  }, []);

  const handleDocumentSelect = (document: Document) => {
    setActiveDocument(document);
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
        />

        {/* Right Panel - Viewer */}
        <ViewerPanel
          collapsed={rightPanelCollapsed}
          onToggleCollapse={() => setRightPanelCollapsed(!rightPanelCollapsed)}
          activeDocument={activeDocument}
        />
      </div>
    </div>
  );
}

export default App;
