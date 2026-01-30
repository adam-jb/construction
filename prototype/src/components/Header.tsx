import { BookOpen, ChevronDown } from 'lucide-react';
import { Scenario } from '../types';

interface HeaderProps {
  scenarios: Scenario[];
  selectedScenario: string;
  onScenarioChange: (id: string) => void;
}

export default function Header({ scenarios, selectedScenario, onScenarioChange }: HeaderProps) {
  const current = scenarios.find(s => s.id === selectedScenario);

  return (
    <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-primary-700 rounded-lg flex items-center justify-center">
          <BookOpen className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-slate-900">CodeCompass</h1>
          <p className="text-xs text-slate-500">Construction code assistant</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative">
          <label className="text-xs text-slate-500 block mb-1">Demo Scenario</label>
          <div className="relative">
            <select
              value={selectedScenario}
              onChange={(e) => onScenarioChange(e.target.value)}
              className="appearance-none bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 pr-8 text-sm font-medium text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer"
            >
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        <div className="text-right">
          <p className="text-xs text-slate-400">Prototype Demo</p>
          <p className="text-xs text-slate-500">{current?.description}</p>
        </div>
      </div>
    </header>
  );
}
