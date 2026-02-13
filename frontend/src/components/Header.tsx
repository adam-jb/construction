export default function Header() {
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
    </header>
  );
}
