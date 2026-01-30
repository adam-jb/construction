import { useState } from 'react';
import { scenarios, documents } from './data/mockData';
import { Reference, AppState } from './types';
import SourcesPane from './components/SourcesPane';
import ChatPane from './components/ChatPane';
import DocumentViewer from './components/DocumentViewer';
import Header from './components/Header';

function App() {
  const [state, setState] = useState<AppState>({
    selectedScenario: scenarios[0].id,
    currentStepIndex: 0,
    activeDocumentId: null,
    activePage: 1,
    activeHighlight: null,
    enabledDocuments: new Set(documents.map(d => d.id)),
    leftPaneCollapsed: false,
    rightPaneCollapsed: false,
  });

  const currentScenario = scenarios.find(s => s.id === state.selectedScenario)!;
  const visibleMessages = currentScenario.steps.slice(0, state.currentStepIndex + 1);

  const handleScenarioChange = (scenarioId: string) => {
    setState(prev => ({
      ...prev,
      selectedScenario: scenarioId,
      currentStepIndex: 0,
      activeDocumentId: null,
      activePage: 1,
      activeHighlight: null,
    }));
  };

  const handleNextStep = () => {
    if (state.currentStepIndex < currentScenario.steps.length - 1) {
      setState(prev => ({
        ...prev,
        currentStepIndex: prev.currentStepIndex + 1,
      }));
    }
  };

  const handlePrevStep = () => {
    if (state.currentStepIndex > 0) {
      setState(prev => ({
        ...prev,
        currentStepIndex: prev.currentStepIndex - 1,
        activeHighlight: null,
      }));
    }
  };

  const handleReferenceClick = (ref: Reference) => {
    setState(prev => ({
      ...prev,
      activeDocumentId: ref.docId,
      activePage: ref.page,
      activeHighlight: ref,
      rightPaneCollapsed: false,
    }));
  };

  const handleDocumentToggle = (docId: string) => {
    setState(prev => {
      const newEnabled = new Set(prev.enabledDocuments);
      if (newEnabled.has(docId)) {
        newEnabled.delete(docId);
      } else {
        newEnabled.add(docId);
      }
      return { ...prev, enabledDocuments: newEnabled };
    });
  };

  const handlePageChange = (page: number) => {
    setState(prev => ({
      ...prev,
      activePage: page,
      activeHighlight: null,
    }));
  };

  const toggleLeftPane = () => {
    setState(prev => ({ ...prev, leftPaneCollapsed: !prev.leftPaneCollapsed }));
  };

  const toggleRightPane = () => {
    setState(prev => ({ ...prev, rightPaneCollapsed: !prev.rightPaneCollapsed }));
  };

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      <Header
        scenarios={scenarios}
        selectedScenario={state.selectedScenario}
        onScenarioChange={handleScenarioChange}
      />
      
      <div className="flex-1 flex overflow-hidden">
        {/* Left Pane - Sources */}
        <SourcesPane
          documents={documents}
          enabledDocuments={state.enabledDocuments}
          onDocumentToggle={handleDocumentToggle}
          collapsed={state.leftPaneCollapsed}
          onToggleCollapse={toggleLeftPane}
          scenarioDocuments={currentScenario.documents}
        />

        {/* Center Pane - Chat */}
        <ChatPane
          messages={visibleMessages}
          onReferenceClick={handleReferenceClick}
          activeHighlight={state.activeHighlight}
          enabledDocuments={state.enabledDocuments}
          currentStep={state.currentStepIndex}
          totalSteps={currentScenario.steps.length}
          onNextStep={handleNextStep}
          onPrevStep={handlePrevStep}
        />

        {/* Right Pane - Document Viewer */}
        <DocumentViewer
          documents={documents}
          activeDocumentId={state.activeDocumentId}
          activePage={state.activePage}
          activeHighlight={state.activeHighlight}
          collapsed={state.rightPaneCollapsed}
          onToggleCollapse={toggleRightPane}
          onPageChange={handlePageChange}
        />
      </div>
    </div>
  );
}

export default App;
