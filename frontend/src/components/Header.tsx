import { useState } from 'react';
import { Settings, MessageSquare, HelpCircle, LogOut } from 'lucide-react';

export default function Header() {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 flex items-center justify-center">
          <img src="/favicon.svg" alt="Project Machine" className="w-9 h-9" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Project Machine</h1>
          <p className="text-xs text-slate-500">Construction code assistant</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button className="px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
          Feedback
        </button>
        
        <div className="relative">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            title="Settings"
          >
            <Settings className="w-5 h-5 text-slate-600" />
          </button>

          {showSettings && (
            <>
              <div 
                className="fixed inset-0 z-10" 
                onClick={() => setShowSettings(false)}
              />
              
              <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-slate-200 rounded-lg shadow-lg z-20 py-1">
                <button className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                  <HelpCircle className="w-4 h-4" />
                  Help
                </button>
                <button className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                  <MessageSquare className="w-4 h-4" />
                  Send feedback
                </button>
                <div className="my-1 border-t border-slate-200" />
                <button className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                  <LogOut className="w-4 h-4" />
                  Log out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
