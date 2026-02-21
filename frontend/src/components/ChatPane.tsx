import { useState, useEffect, useMemo } from 'react';
import { Send, Loader2, ChevronLeft, ChevronRight, ArrowLeft, Archive, MoreVertical, Copy, ThumbsUp, ThumbsDown, Edit2, Check } from 'lucide-react';
import { marked } from 'marked';
import katex from 'katex';
import { ChatSession, ChatMessage, Document, Reference } from '../types';
import apiClient from '../api/client';

// Function to render LaTeX math in text
function renderMath(text: string): string {
  // Replace display math $$...$$ first
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (match, math) => {
    try {
      return katex.renderToString(math.trim(), { displayMode: true, throwOnError: false });
    } catch (e) {
      return match;
    }
  });
  
  // Replace inline math $...$
  text = text.replace(/\$([^\$\n]+?)\$/g, (match, math) => {
    try {
      return katex.renderToString(math.trim(), { displayMode: false, throwOnError: false });
    } catch (e) {
      return match;
    }
  });
  
  return text;
}

// Component to display reference badges with deduplication and collapse
function ReferenceBadges({ references, onReferenceClick, getDocumentName, activeHighlight }: {
  references: Reference[];
  onReferenceClick?: (reference: Reference) => void;
  getDocumentName: (docId: string) => string;
  activeHighlight?: Reference | null;
}) {
  const [showAll, setShowAll] = useState(false);
  
  // Deduplicate references by documentId + page
  const uniqueRefs = useMemo(() => {
    const seen = new Map<string, Reference>();
    references.forEach(ref => {
      const key = `${ref.documentId}-${ref.page}`;
      if (!seen.has(key)) {
        seen.set(key, ref);
      }
    });
    return Array.from(seen.values());
  }, [references]);
  
  const INITIAL_SHOW = 8;
  const displayRefs = showAll ? uniqueRefs : uniqueRefs.slice(0, INITIAL_SHOW);
  const hasMore = uniqueRefs.length > INITIAL_SHOW;
  
  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        {displayRefs.map((ref, idx) => {
          const docName = getDocumentName(ref.documentId);
          const isActive = activeHighlight && 
            activeHighlight.documentId === ref.documentId && 
            activeHighlight.page === ref.page;
          
          return (
            <button
              key={`${ref.documentId}-${ref.page}-${idx}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Reference clicked:', ref);
                onReferenceClick?.(ref);
              }}
              className={`group text-xs px-2 py-1 border rounded transition-all cursor-pointer relative ${
                isActive 
                  ? 'bg-yellow-100 text-yellow-900 border-yellow-400 ring-2 ring-yellow-300 font-semibold shadow-md' 
                  : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100 hover:border-purple-300'
              }`}
              title={ref.excerpt ? ref.excerpt.substring(0, 100) : `${docName}, Page ${ref.page}`}
            >
              <span className="flex items-center gap-1">
                {isActive && <span className="text-yellow-600">▶</span>}
                <span className={isActive ? 'font-bold' : 'font-medium'}>{docName}</span>
                <span className={isActive ? 'text-yellow-600' : 'text-purple-500'}>•</span>
                <span>p.{ref.page}</span>
              </span>
              {!isActive && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-purple-400 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </button>
          );
        })}
      </div>
      {hasMore && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="mt-2 text-xs text-purple-600 hover:text-purple-800 font-medium hover:underline"
        >
          {showAll ? `Show less (-${uniqueRefs.length - INITIAL_SHOW})` : `Show ${uniqueRefs.length - INITIAL_SHOW} more references`}
        </button>
      )}
    </div>
  );
}

interface ChatPaneProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onReferenceClick?: (reference: Reference) => void;
  enabledDocuments?: Set<string>;
  activeHighlight?: Reference | null;
}

// AI Thinking indicator component
function AIThinkingIndicator() {
  const steps = [
    'Reading documents',
    'Checking standards database',
    'Formulating the response',
    'Final checks',
    'Highlighting the required sections'
  ];

  return (
    <div className="flex gap-3 py-4">
      <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center flex-shrink-0">
        <Loader2 className="w-5 h-5 text-slate-600 animate-spin" />
      </div>
      <div className="flex-1 space-y-2">
        {steps.map((step, idx) => (
          <div key={idx} className="flex items-center gap-2 text-sm text-slate-600">
            <div className="w-4 h-4 rounded-full border-2 border-slate-300 flex items-center justify-center">
              {idx < 2 && <Check className="w-3 h-3 text-slate-600" />}
            </div>
            <span>{step}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Message bubble component
function MessageBubble({ message, onCopy, onFeedback, onReferenceClick, documents, activeHighlight }: { 
  message: ChatMessage; 
  onCopy: (text: string) => void;
  onFeedback: (messageId: string, type: 'up' | 'down') => void;
  onReferenceClick?: (reference: Reference) => void;
  documents?: Document[];
  activeHighlight?: Reference | null;
}) {
  const [showActions, setShowActions] = useState(false);
  
  // Parse citations from text and create clickable inline citations
  const processedContent = useMemo(() => {
    if (message.type !== 'assistant') return message.text;
    
    // First render LaTeX math, then parse markdown
    const textWithMath = renderMath(message.text);
    let html = marked.parse(textWithMath, { breaks: true, gfm: true }) as string;
    
    // Find citation patterns like [5.1, Page 26] or [Section 5.3, Page 27]
    // and make them clickable
    if (message.references && message.references.length > 0) {
      // Pattern: [anything, Page NN] or [anything p.NN]
      const citationPattern = /\[([^\]]+?)(?:,\s*(?:Page|p\.)\s*(\d+))\]/gi;
      
      html = html.replace(citationPattern, (match, section, page) => {
        const pageNum = parseInt(page);
        // Try to find matching reference
        const ref = message.references?.find(r => 
          r.page === pageNum && (r.section?.includes(section.trim()) || r.label?.includes(section.trim()))
        ) || message.references?.[0]; // Fallback to first ref if no exact match
        
        if (ref) {
          const refData = JSON.stringify(ref).replace(/"/g, '&quot;');
          return `<button 
            class="citation-link text-purple-700 hover:text-purple-900 hover:underline font-medium cursor-pointer transition-colors" 
            data-ref='${refData}'
            onclick="window.handleCitationClick(this)"
          >${match}</button>`;
        }
        return match;
      });
    }
    
    return html;
  }, [message.text, message.type, message.references]);
  
  // Get document name for reference
  const getDocumentName = (docId: string) => {
    const doc = documents?.find(d => d.id === docId);
    return doc?.shortName || doc?.name || 'Document';
  };
  
  if (message.type === 'user') {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[80%] bg-slate-900 text-white px-4 py-3 rounded-2xl rounded-tr-sm">
          <p className="text-sm whitespace-pre-wrap">{message.text}</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="flex gap-3 mb-6 group"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center flex-shrink-0">
        <span className="text-sm font-semibold text-slate-700">B_</span>
      </div>
      <div className="flex-1 min-w-0">
        <div 
          className="text-sm text-slate-800 leading-relaxed prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: processedContent }}
          onClick={(e) => {
            // Handle citation clicks within the content
            const target = e.target as HTMLElement;
            if (target.classList.contains('citation-link')) {
              const refData = target.getAttribute('data-ref');
              if (refData) {
                try {
                  const ref = JSON.parse(refData);
                  onReferenceClick?.(ref);
                } catch (err) {
                  console.error('Failed to parse citation reference:', err);
                }
              }
            }
          }}
        />
        {message.references && message.references.length > 0 && (
          <ReferenceBadges 
            references={message.references} 
            onReferenceClick={onReferenceClick}
            getDocumentName={getDocumentName}
            activeHighlight={activeHighlight}
          />
        )}
        <div className={`flex items-center gap-1 mt-2 transition-opacity ${showActions ? 'opacity-100' : 'opacity-0'}`}>
          <button
            onClick={() => onCopy(message.text)}
            className="p-1.5 hover:bg-slate-100 rounded transition-colors"
            title="Copy"
          >
            <Copy className="w-3.5 h-3.5 text-slate-500" />
          </button>
          <button
            onClick={() => onFeedback(message.id, 'up')}
            className="p-1.5 hover:bg-slate-100 rounded transition-colors"
            title="Good response"
          >
            <ThumbsUp className="w-3.5 h-3.5 text-slate-500" />
          </button>
          <button
            onClick={() => onFeedback(message.id, 'down')}
            className="p-1.5 hover:bg-slate-100 rounded transition-colors"
            title="Bad response"
          >
            <ThumbsDown className="w-3.5 h-3.5 text-slate-500" />
          </button>
        </div>
      </div>
    </div>
  );
}

// Session list item component
function SessionListItem({ 
  session, 
  onSelect, 
  onArchive,
  onRename 
}: { 
  session: ChatSession; 
  onSelect: () => void; 
  onArchive: () => void;
  onRename: (newName: string) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(session.name);

  const handleRename = () => {
    if (editName.trim()) {
      onRename(editName.trim());
      setEditing(false);
    }
  };

  const timeAgo = (date: Date) => {
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="group relative">
      <button
        onClick={onSelect}
        className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors border-b border-slate-100"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {editing ? (
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={handleRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename();
                  if (e.key === 'Escape') setEditing(false);
                }}
                className="text-sm font-medium text-slate-900 border border-blue-500 rounded px-1 py-0.5 w-full"
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <div className="text-sm font-medium text-slate-900 truncate">{session.name}</div>
            )}
            <div className="text-xs text-slate-500 truncate mt-1">{session.lastMessage}</div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className="text-xs text-slate-400">{timeAgo(session.lastAccessedAt)}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              className="p-1 opacity-0 group-hover:opacity-100 hover:bg-slate-200 rounded transition-all"
            >
              <MoreVertical className="w-4 h-4 text-slate-500" />
            </button>
          </div>
        </div>
      </button>
      
      {showMenu && (
        <>
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setShowMenu(false)}
          />
          <div className="absolute right-4 top-12 w-40 bg-white border border-slate-200 rounded-lg shadow-lg z-20 py-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditing(true);
                setShowMenu(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              <Edit2 className="w-4 h-4" />
              Rename
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onArchive();
                setShowMenu(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              <Archive className="w-4 h-4" />
              Archive
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function ChatPane({ collapsed, onToggleCollapse, onReferenceClick, enabledDocuments, activeHighlight }: ChatPaneProps) {
  const [query, setQuery] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  
  // Calculate document count from enabled documents
  const documentCount = enabledDocuments?.size || 0;

  // Load sessions from localStorage on mount
  useEffect(() => {
    const savedSessions = localStorage.getItem('chatSessions');
    if (savedSessions) {
      try {
        const parsed = JSON.parse(savedSessions);
        // Convert date strings back to Date objects
        const sessionsWithDates = parsed.map((s: any) => ({
          ...s,
          lastAccessedAt: new Date(s.lastAccessedAt),
          messages: s.messages.map((m: any) => ({
            ...m,
            timestamp: new Date(m.timestamp)
          }))
        }));
        setSessions(sessionsWithDates);
      } catch (e) {
        console.error('Failed to load sessions from localStorage:', e);
      }
    }
  }, []);

  // Save sessions to localStorage whenever they change
  useEffect(() => {
    if (sessions.length > 0) {
      localStorage.setItem('chatSessions', JSON.stringify(sessions));
    }
  }, [sessions]);

  // Load documents for better reference display
  useEffect(() => {
    apiClient.listDocuments().then(res => {
      setDocuments(res.items);
    }).catch(err => {
      console.error('Failed to load documents:', err);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isProcessing) return;

    const userQuery = query.trim();
    setIsProcessing(true);
    
    // Create or update session
    if (!activeSession) {
      const newSession: ChatSession = {
        id: `session-${Date.now()}`,
        name: userQuery.substring(0, 50),
        lastMessage: userQuery,
        lastAccessedAt: new Date(),
        archived: false,
        messages: []
      };
      setActiveSession(newSession);
    }
    
    // Add user message
    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      type: 'user',
      text: userQuery,
      timestamp: new Date()
    };
    
    setActiveSession(prev => prev ? {
      ...prev,
      messages: [...prev.messages, userMessage]
    } : null);
    
    setQuery('');
    
    try {
      // Build conversation history for API
      const currentMessages = activeSession?.messages || [];
      const allMessages: Array<{role: 'user' | 'assistant'; content: string; references: any[]}> = [
        ...currentMessages.map(msg => ({
          role: (msg.type === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: msg.text,
          references: msg.references || []
        })),
        {
          role: 'user' as const,
          content: userQuery,
          references: []
        }
      ];

      // Call real API
      const response = await apiClient.query({
        messages: allMessages
      });

      // Add AI response
      const aiMessage: ChatMessage = {
        id: response.queryId || `msg-${Date.now()}-ai`,
        type: 'assistant',
        text: response.answer,
        timestamp: new Date(),
        references: response.references?.map(ref => ({
          documentId: ref.documentId,
          page: ref.page,
          label: ref.label,
          excerpt: ref.excerpt,
          highlightText: ref.highlightText
        }))
      };
      
      setActiveSession(prev => prev ? {
        ...prev,
        messages: [...prev.messages, aiMessage],
        lastMessage: userQuery,
        lastAccessedAt: new Date()
      } : null);
      
    } catch (error) {
      console.error('Query failed:', error);
      
      // Add error message
      const errorMessage: ChatMessage = {
        id: `msg-${Date.now()}-error`,
        type: 'assistant',
        text: `Sorry, I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`,
        timestamp: new Date()
      };
      
      setActiveSession(prev => prev ? {
        ...prev,
        messages: [...prev.messages, errorMessage],
        lastMessage: userQuery,
        lastAccessedAt: new Date()
      } : null);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    // TODO: Show toast notification
  };

  const handleFeedback = (messageId: string, type: 'up' | 'down') => {
    console.log('Feedback:', messageId, type);
    // TODO: Send feedback to backend
  };

  const handleArchive = (sessionId: string) => {
    setSessions(prev => prev.map(s => 
      s.id === sessionId ? { ...s, archived: true } : s
    ));
    if (activeSession?.id === sessionId) {
      setActiveSession(null);
    }
  };

  const handleRename = (sessionId: string, newName: string) => {
    setSessions(prev => prev.map(s => 
      s.id === sessionId ? { ...s, name: newName } : s
    ));
    if (activeSession?.id === sessionId) {
      setActiveSession(prev => prev ? { ...prev, name: newName } : null);
    }
  };

  const handleBackToSessions = () => {
    if (activeSession && !sessions.find(s => s.id === activeSession.id)) {
      setSessions(prev => [activeSession, ...prev]);
    } else if (activeSession) {
      setSessions(prev => prev.map(s => 
        s.id === activeSession.id ? activeSession : s
      ));
    }
    setActiveSession(null);
  };

  const hasMessages = activeSession && activeSession.messages.length > 0;
  const recentSessions = sessions.filter(s => !s.archived).slice(0, 3);

  return (
    <div className="flex-1 flex flex-col bg-white min-w-0">
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {activeSession && (
            <button
              onClick={handleBackToSessions}
              className="p-1 hover:bg-slate-100 rounded transition-colors mr-1"
              title="Back to sessions"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
          )}
          <h2 className="text-sm font-semibold text-slate-900">
            {activeSession ? activeSession.name : 'Chat'}
          </h2>
        </div>
        <button
          onClick={onToggleCollapse}
          className="p-1 hover:bg-slate-100 rounded transition-colors"
          title={collapsed ? "Expand viewer" : "Collapse viewer"}
        >
          {collapsed ? <ChevronLeft className="w-5 h-5 text-slate-600" /> : <ChevronRight className="w-5 h-5 text-slate-600" />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!activeSession ? (
          // Session list view
          <div className="h-full flex flex-col">
            {recentSessions.length > 0 && (
              <div className="border-b border-slate-200">
                <div className="px-4 py-2 text-xs font-semibold text-slate-500 uppercase">
                  Recent sessions
                </div>
                {recentSessions.map(session => (
                  <SessionListItem
                    key={session.id}
                    session={session}
                    onSelect={() => setActiveSession(session)}
                    onArchive={() => handleArchive(session.id)}
                    onRename={(newName) => handleRename(session.id, newName)}
                  />
                ))}
              </div>
            )}
            
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-12">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                Chat to your documents
              </h3>
              <p className="text-sm text-slate-500 max-w-md mb-4">
                AI responses may be inaccurate
              </p>
              
              {/* Example prompts */}
              <div className="w-full max-w-md space-y-2 mb-6">
                <p className="text-xs font-semibold text-slate-600 text-left">Try:</p>
                {[
                  'What does this code say about fire loading?',
                  'Is there a later version of this code available?',
                  'Are there any other codes I should be reading?',
                  'Please summarise this document'
                ].map((prompt, idx) => (
                  <button
                    key={idx}
                    onClick={() => setQuery(prompt)}
                    className="w-full text-left px-4 py-2 text-sm text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          // Active chat view
          <div className="p-6 max-w-3xl mx-auto">
            {hasMessages ? (
              <>
                {activeSession.messages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    onCopy={handleCopy}
                    onFeedback={handleFeedback}
                    onReferenceClick={onReferenceClick}
                    documents={documents}
                    activeHighlight={activeHighlight}
                  />
                ))}
                {isProcessing && <AIThinkingIndicator />}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center py-12">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">
                  Ask a question about your documents
                </h3>
                <p className="text-sm text-slate-500 max-w-md">
                  Get AI-powered answers with citations from building codes, standards, and specifications
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 px-6 py-2 bg-slate-50">
        <p className="text-xs text-slate-500 text-center">
          Baseline may be inaccurate; please double check responses
        </p>
      </div>

      <div className="border-t border-slate-200 p-4 bg-white">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Start typing..."
              disabled={isProcessing}
              className="w-full px-4 py-3 pr-24 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-400"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
              <span className="text-xs text-slate-500">{documentCount} documents</span>
              <button
                type="submit"
                disabled={!query.trim() || isProcessing}
                className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
