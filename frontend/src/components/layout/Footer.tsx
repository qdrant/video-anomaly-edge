'use client';

export default function Footer() {
  return (
    <footer className="bg-slate-950 border-t border-slate-800">
      <div className="px-4 lg:px-6 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-sm text-slate-500">
            <span>Powered by</span>
            <a href="https://qdrant.tech" target="_blank" rel="noopener noreferrer" className="flex items-center px-2.5 py-1 bg-slate-800/50 rounded-lg hover:bg-slate-800 transition-colors">
              <img src="/qdrant-logo-white.svg" alt="Qdrant" className="h-4 object-contain" />
            </a>
            <span className="text-slate-600">+</span>
            <a href="https://twelvelabs.io" target="_blank" rel="noopener noreferrer" className="flex items-center px-2.5 py-1 bg-slate-800/50 rounded-lg hover:bg-slate-800 transition-colors">
              <img src="/twelvelabs-logo.png" alt="Twelve Labs" className="h-4 object-contain invert" />
            </a>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <a
              href="https://github.com/qdrant/demo-surveillance-anomaly-detection"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-500 hover:text-slate-300 transition-colors"
            >
              GitHub
            </a>
            <span className="text-slate-600">v0.1.0</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
