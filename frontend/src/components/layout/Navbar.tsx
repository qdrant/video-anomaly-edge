'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useApp } from '@/lib/AppContext';

const navItems = [
  { href: '/overview', label: 'Overview' },
  { href: '/incidents', label: 'Incidents' },
  { href: '/search', label: 'Search' },
  { href: '/intelligence', label: 'Intelligence', highlight: true },
];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const {
    dataset,
    runId,
    datasets,
    runs,
    incidents,
    setDataset,
    setRun
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [datasetDropdownOpen, setDatasetDropdownOpen] = useState(false);
  const [runDropdownOpen, setRunDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const datasetRef = useRef<HTMLDivElement>(null);
  const runRef = useRef<HTMLDivElement>(null);

  const incidentCount = incidents.filter(i => i.status === 'new').length;

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (datasetRef.current && !datasetRef.current.contains(e.target as Node)) {
        setDatasetDropdownOpen(false);
      }
      if (runRef.current && !runRef.current.contains(e.target as Node)) {
        setRunDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}&dataset=${dataset}`);
    }
  };

  const currentDataset = datasets.find(d => d.id === dataset);
  const currentRun = runs.find(r => r.run_id === runId);

  return (
    <nav className="bg-slate-950 border-b border-slate-800 sticky top-0 z-50">
      <div className="px-4 lg:px-6">
        <div className="flex items-center h-16">
          {/* Logo & Brand */}
          <div className="flex items-center gap-8">
            <Link href="/overview" className="flex items-center gap-3">
              <img src="/qdrant-brandmark-red.png" alt="Sentinel" className="w-9 h-9 rounded-xl object-contain" />
              <div className="hidden sm:block text-center">
                <div className="font-bold text-white text-lg tracking-tight leading-tight">Sentinel</div>
                <div className="text-xs text-slate-500">Surveillance Console</div>
              </div>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden lg:flex items-center gap-1">
              {navItems.map((item) => {
                const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
                const showBadge = item.href === '/incidents' && incidentCount > 0;
                const isHighlight = 'highlight' in item && item.highlight;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={item.href === '/overview' ? () => window.dispatchEvent(new CustomEvent('reset-overview')) : undefined}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors relative ${
                      isActive
                        ? isHighlight
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : 'bg-slate-800 text-white'
                        : isHighlight
                          ? 'text-amber-400 hover:bg-amber-500/10 border border-transparent hover:border-amber-500/20'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                    }`}
                  >
                    {item.label}
                    {showBadge && (
                      <span className="absolute -top-1 -right-1 min-w-[1.25rem] h-5 px-1.5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-bold">
                        {incidentCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Center: Powered by */}
          <div className="flex-1 hidden lg:flex items-center justify-center">
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <span className="text-base">Powered by</span>
              <a href="https://qdrant.tech" target="_blank" rel="noopener noreferrer" className="flex items-center px-3 py-1.5 bg-slate-800/50 rounded-lg hover:bg-slate-800 transition-colors">
                <img src="/qdrant-logo-white.svg" alt="Qdrant" className="h-5 object-contain" />
              </a>
              <span className="text-slate-600 text-base">+</span>
              <a href="https://twelvelabs.io" target="_blank" rel="noopener noreferrer" className="flex items-center px-3 py-1.5 bg-slate-800/50 rounded-lg hover:bg-slate-800 transition-colors">
                <img src="/twelvelabs-logo.png" alt="Twelve Labs" className="h-5 object-contain invert" />
              </a>
            </div>
          </div>

          {/* Right side controls */}
          <div className="flex items-center gap-3">
            {/* Search */}
            <form onSubmit={handleSearch} className="hidden md:block">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search incidents..."
                  className="w-48 lg:w-64 pl-9 pr-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-sm placeholder-slate-500 focus:outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500/30 focus:bg-slate-800/80 transition-all"
                />
              </div>
            </form>

            {/* Social links */}
            <div className="hidden md:flex items-center gap-1">
              <a
                href="https://x.com/qdaborai"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 text-slate-400 hover:text-white rounded-lg transition-colors"
                aria-label="X (Twitter)"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
              <a
                href="https://www.linkedin.com/company/qdrant"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 text-slate-400 hover:text-white rounded-lg transition-colors"
                aria-label="LinkedIn"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
              </a>
              <a
                href="https://www.youtube.com/@qdrant"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 text-slate-400 hover:text-white rounded-lg transition-colors"
                aria-label="YouTube"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                </svg>
              </a>
              <a
                href="https://github.com/qdrant/demo-surveillance-anomaly-detection"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 text-slate-400 hover:text-white rounded-lg transition-colors"
                aria-label="GitHub"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                </svg>
              </a>
            </div>

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 text-slate-400 hover:text-white rounded-lg"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-slate-800 bg-slate-950/95 backdrop-blur-xl">
          <div className="px-4 py-4 space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              const showBadge = item.href === '/incidents' && incidentCount > 0;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                  }`}
                >
                  {item.label}
                  {showBadge && (
                    <span className="min-w-[1.25rem] h-5 px-1.5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-bold">
                      {incidentCount}
                    </span>
                  )}
                </Link>
              );
            })}

            {/* Mobile search */}
            <form onSubmit={handleSearch} className="pt-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search incidents..."
                className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-sm placeholder-slate-500"
              />
            </form>
          </div>
        </div>
      )}
    </nav>
  );
}
