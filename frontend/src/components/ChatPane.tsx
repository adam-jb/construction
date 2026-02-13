import { MessageSquare, ChevronLeft, ChevronRight, User, Bot, ExternalLink } from 'lucide-react';
import { ChatMessage, Reference } from '../types';
import { useTypewriter } from '../hooks/useTypewriter';

interface ChatPaneProps {
  messages: ChatMessage[];
  onReferenceClick: (ref: Reference) => void;
  activeHighlight: Reference | null;
  enabledDocuments: Set<string>;
  currentStep: number;
  totalSteps: number;
  onNextStep: () => void;
  onPrevStep: () => void;
}

export default function ChatPane({
  messages,
  onReferenceClick,
  activeHighlight,
  enabledDocuments,
  currentStep,
  totalSteps,
  onNextStep,
  onPrevStep,
}: ChatPaneProps) {
  return (
    <div className="flex-1 flex flex-col bg-slate-50 min-w-0">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-slate-600" />
          <h2 className="font-semibold text-slate-800">Conversation</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onPrevStep}
            disabled={currentStep === 0}
            className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Previous step"
          >
            <ChevronLeft className="w-4 h-4 text-slate-600" />
          </button>
          <span className="text-sm text-slate-500 min-w-[60px] text-center">
            {currentStep + 1} / {totalSteps}
          </span>
          <button
            onClick={onNextStep}
            disabled={currentStep >= totalSteps - 1}
            className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Next step"
          >
            <ChevronRight className="w-4 h-4 text-slate-600" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message, idx) => (
          <MessageBubble
            key={idx}
            message={message}
            onReferenceClick={onReferenceClick}
            activeHighlight={activeHighlight}
            enabledDocuments={enabledDocuments}
            isLatest={idx === messages.length - 1}
          />
        ))}
      </div>

      {/* Step indicator */}
      {currentStep < totalSteps - 1 && (
        <div className="p-4 border-t border-slate-200 bg-white">
          <button
            onClick={onNextStep}
            className="w-full py-2.5 px-4 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
          >
            Continue conversation
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function MessageBubble({
  message,
  onReferenceClick,
  activeHighlight,
  enabledDocuments,
  isLatest,
}: {
  message: ChatMessage;
  onReferenceClick: (ref: Reference) => void;
  activeHighlight: Reference | null;
  enabledDocuments: Set<string>;
  isLatest: boolean;
}) {
  const isUser = message.type === 'user';
  
  // Apply typewriter effect only to the latest message
  const { displayedText, isComplete } = useTypewriter(
    isLatest ? message.text : message.text,
    isLatest ? (isUser ? 50 : 20) : 0, // Faster for AI, slower for user
    isLatest ? 100 : 0 // Small delay before starting
  );

  // Show full text if not latest, otherwise show typewriter text
  const textToShow = isLatest ? displayedText : message.text;

  // Filter references to only show enabled documents
  const visibleRefs = message.references?.filter(r => enabledDocuments.has(r.docId)) || [];

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
          isUser ? 'bg-slate-200' : 'bg-primary-100'
        }`}
      >
        {isUser ? (
          <User className="w-4 h-4 text-slate-600" />
        ) : (
          <Bot className="w-4 h-4 text-primary-700" />
        )}
      </div>

      <div className={`flex-1 max-w-[85%] ${isUser ? 'text-right' : ''}`}>
        <div
          className={`inline-block text-left rounded-2xl px-4 py-3 ${
            isUser
              ? 'bg-primary-600 text-white'
              : 'bg-white border border-slate-200 text-slate-700'
          }`}
        >
          <div className="text-sm whitespace-pre-wrap leading-relaxed">
            <FormattedText 
              text={textToShow}
              references={message.references}
              onReferenceClick={onReferenceClick}
              activeHighlight={activeHighlight}
              enabledDocuments={enabledDocuments}
            />
            {isLatest && !isComplete && (
              <span className="typewriter-cursor" />
            )}
          </div>
        </div>

        {/* Reference list - now only show if there are references not already inline */}
        {visibleRefs.length > 0 && (!isLatest || isComplete) && (
          <div className="mt-2 flex flex-wrap gap-2">
            {visibleRefs.map((ref, idx) => {
              const isActive =
                activeHighlight?.docId === ref.docId &&
                activeHighlight?.page === ref.page &&
                activeHighlight?.label === ref.label;

              return (
                <button
                  key={idx}
                  onClick={() => onReferenceClick(ref)}
                  className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-all ${
                    isActive
                      ? 'bg-yellow-100 border-yellow-300 text-yellow-800 border'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border border-transparent'
                  }`}
                >
                  <ExternalLink className="w-3 h-3" />
                  <span className="font-medium">{ref.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function FormattedText({ text, references, onReferenceClick, activeHighlight, enabledDocuments }: { 
  text: string;
  references?: Reference[];
  onReferenceClick: (ref: Reference) => void;
  activeHighlight: Reference | null;
  enabledDocuments: Set<string>;
}) {
  // Simple markdown-like formatting with inline reference support
  const lines = text.split('\n');
  
  const renderLineWithReferences = (line: string, lineIdx: number) => {
    // Match patterns like [1], [2], etc.
    const refPattern = /\[(\d+)\]/g;
    const parts: (string | JSX.Element)[] = [];
    let lastIndex = 0;
    let match;

    while ((match = refPattern.exec(line)) !== null) {
      const refNum = parseInt(match[1]);
      const ref = references?.find(r => r.label.startsWith(`[${refNum}]`));
      
      // Add text before the reference
      if (match.index > lastIndex) {
        parts.push(line.substring(lastIndex, match.index));
      }
      
      // Add the reference as a clickable element
      if (ref && enabledDocuments.has(ref.docId)) {
        const isActive =
          activeHighlight?.docId === ref.docId &&
          activeHighlight?.page === ref.page &&
          activeHighlight?.label === ref.label;
        
        parts.push(
          <button
            key={`ref-${lineIdx}-${refNum}`}
            onClick={() => onReferenceClick(ref)}
            className={`inline-flex items-center justify-center w-6 h-5 text-xs font-medium rounded transition-all ${
              isActive
                ? 'bg-yellow-200 text-yellow-900 border border-yellow-400'
                : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
            }`}
            title={ref.label.replace(/^\[\d+\]\s*/, '')}
          >
            {refNum}
          </button>
        );
      } else {
        parts.push(match[0]); // Just show the text if ref not found
      }
      
      lastIndex = match.index + match[0].length;
    }
    
    // Add remaining text after last reference
    if (lastIndex < line.length) {
      parts.push(line.substring(lastIndex));
    }
    
    return parts.length > 0 ? parts : line;
  };
  
  return (
    <>
      {lines.map((line, idx) => {
        const content = renderLineWithReferences(line, idx);
        
        // Headers
        if (line.startsWith('**') && line.endsWith('**')) {
          return (
            <p key={idx} className="font-semibold mt-2 first:mt-0">
              {content}
            </p>
          );
        }
        
        // Bold inline
        if (line.includes('**')) {
          const renderBoldParts = (parts: (string | JSX.Element)[]) => {
            return parts.map((part, i) => {
              if (typeof part === 'string') {
                const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
                return boldParts.map((bp, j) =>
                  bp.startsWith('**') ? (
                    <strong key={`${i}-${j}`}>{bp.replace(/\*\*/g, '')}</strong>
                  ) : (
                    <span key={`${i}-${j}`}>{bp}</span>
                  )
                );
              }
              return part;
            });
          };
          
          return (
            <p key={idx} className="mt-1 first:mt-0">
              {Array.isArray(content) ? renderBoldParts(content) : content}
            </p>
          );
        }

        // Tables (simple)
        if (line.startsWith('|')) {
          return (
            <p key={idx} className="font-mono text-xs mt-1 first:mt-0">
              {content}
            </p>
          );
        }

        // List items
        if (line.startsWith('- ')) {
          return (
            <p key={idx} className="ml-4 mt-1 first:mt-0">
              • {Array.isArray(content) ? content.slice(0).map((c, i) => 
                typeof c === 'string' ? c.slice(i === 0 ? 2 : 0) : c
              ) : typeof content === 'string' ? content.slice(2) : content}
            </p>
          );
        }

        // Empty lines
        if (!line.trim()) {
          return <br key={idx} />;
        }

        return (
          <p key={idx} className="mt-1 first:mt-0">
            {content}
          </p>
        );
      })}
    </>
  );
}
