import { useState } from 'react';
import { Send, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';

interface ChatPaneProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export default function ChatPane({ collapsed, onToggleCollapse }: ChatPaneProps) {
  const [query, setQuery] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isProcessing) return;

    setIsProcessing(true);
    console.log('Submit query:', query);
    
    setTimeout(() => {
      setIsProcessing(false);
      setQuery('');
    }, 2000);
  };

  return (
    <div className="flex-1 flex flex-col bg-white min-w-0">
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Chat</h2>
        <button
          onClick={onToggleCollapse}
          className="p-1 hover:bg-slate-100 rounded transition-colors"
          title={collapsed ? "Expand viewer" : "Collapse viewer"}
        >
          {collapsed ? <ChevronLeft className="w-5 h-5 text-slate-600" /> : <ChevronRight className="w-5 h-5 text-slate-600" />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto">
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
        </div>
      </div>

      <div className="border-t border-slate-200 px-6 py-2 bg-slate-50">
        <p className="text-xs text-slate-500 text-center">
          Project Machine may be inaccurate; please double check responses
        </p>
      </div>

      <div className="border-t border-slate-200 p-4 bg-white">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
          <div className="flex gap-3">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask about building codes, standards, or specifications..."
              disabled={isProcessing}
              className="flex-1 px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-400"
            />
            <button
              type="submit"
              disabled={!query.trim() || isProcessing}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  <span>Send</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
