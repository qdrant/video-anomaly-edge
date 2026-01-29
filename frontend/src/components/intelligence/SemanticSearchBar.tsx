'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

interface SemanticSearchBarProps {
  onSearch: (query: string) => void;
  onClear: () => void;
  isSearching: boolean;
  placeholder?: string;
}

// Suggested queries for quick access
const SUGGESTED_QUERIES = [
  { label: 'Person running', query: 'person running quickly' },
  { label: 'Unusual movement', query: 'unusual or abnormal movement' },
  { label: 'Crowd gathering', query: 'crowd of people gathering' },
  { label: 'Empty scene', query: 'empty hallway with no people' },
  { label: 'Fast motion', query: 'fast sudden movement' },
  { label: 'Walking normally', query: 'person walking normally' },
];

export default function SemanticSearchBar({
  onSearch,
  onClear,
  isSearching,
  placeholder = 'What are we watching for?',
}: SemanticSearchBarProps) {
  const [query, setQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Handle click outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim() && !isSearching) {
      onSearch(query.trim());
      setShowSuggestions(false);
    }
  }, [query, isSearching, onSearch]);

  const handleSuggestionClick = useCallback((suggestionQuery: string) => {
    setQuery(suggestionQuery);
    onSearch(suggestionQuery);
    setShowSuggestions(false);
  }, [onSearch]);

  const handleClear = useCallback(() => {
    setQuery('');
    onClear();
    inputRef.current?.focus();
  }, [onClear]);

  return (
    <div ref={containerRef} className="relative">
      <form onSubmit={handleSubmit}>
        <div className="relative">
          {/* Search icon */}
          <div className="absolute left-3 top-1/2 -translate-y-1/2">
            {isSearching ? (
              <div className="w-4 h-4 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            )}
          </div>

          {/* Input */}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setShowSuggestions(true)}
            placeholder={placeholder}
            disabled={isSearching}
            className="w-full pl-10 pr-20 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 disabled:opacity-50 transition-all"
          />

          {/* Right side buttons */}
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {query && (
              <button
                type="button"
                onClick={handleClear}
                className="p-1 text-slate-400 hover:text-white transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
            <button
              type="submit"
              disabled={!query.trim() || isSearching}
              className="px-3 py-1 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-700 disabled:text-slate-500 text-slate-900 text-xs font-medium rounded transition-colors"
            >
              Scan
            </button>
          </div>
        </div>
      </form>

      {/* Suggestions dropdown */}
      {showSuggestions && !isSearching && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-slate-800 border border-slate-700 rounded-xl shadow-xl overflow-hidden z-20">
          <div className="px-4 py-2 text-xs text-slate-400 border-b border-slate-700">
            Suggested queries
          </div>
          <div className="p-2">
            {SUGGESTED_QUERIES.map((suggestion) => (
              <button
                key={suggestion.query}
                onClick={() => handleSuggestionClick(suggestion.query)}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-slate-700 rounded-lg transition-colors"
              >
                <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <span className="text-slate-300">{suggestion.label}</span>
                <span className="ml-auto text-xs text-slate-500">{suggestion.query}</span>
              </button>
            ))}
          </div>

          <div className="px-4 py-2 text-xs text-slate-500 border-t border-slate-700 bg-slate-900/50">
            Tip: Describe what you're looking for in natural language
          </div>
        </div>
      )}
    </div>
  );
}
