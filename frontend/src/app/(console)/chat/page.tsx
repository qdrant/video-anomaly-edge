'use client';

import { useState, useRef, useEffect } from 'react';
import { chatWithCorpus, getCorpusStats, ChatMessage, ChatClipMatch, CorpusStats } from '@/lib/api';
import { useApp } from '@/lib/AppContext';
import { AnomalyTypeBadge } from '@/components/HybridScoringUI';
import { AnomalyType } from '@/lib/types';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  matches?: ChatClipMatch[];
  queryType?: 'corpus' | 'dataset' | 'clip';
  timestamp: Date;
}

export default function ChatPage() {
  const { dataset, navigateToFeed } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<CorpusStats | null>(null);
  const [selectedDataset, setSelectedDataset] = useState<string>('all');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadStats() {
      try { const s = await getCorpusStats(); setStats(s); }
      catch (err) { console.error('Failed to load stats:', err); }
    }
    loadStats();
  }, []);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  useEffect(() => {
    if (messages.length === 0 && stats) {
      setMessages([{
        id: 'welcome', role: 'assistant',
        content: `Welcome to the Video Corpus Chat. I can help you search across **${stats.total_clips} clips** from ${Object.keys(stats.datasets).length} datasets.\n\nTry asking things like:\n- "Show me all running incidents"\n- "What anomalies are in ucsd_ped2?"\n- "Find clips with bicycles"\n- "What's happening in test_01_003?"`,
        timestamp: new Date(),
      }]);
    }
  }, [stats, messages.length]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    const userMessage: Message = { id: Date.now().toString(), role: 'user', content: input, timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    try {
      const history: ChatMessage[] = messages.filter(m => m.id !== 'welcome').slice(-10).map(m => ({ role: m.role, content: m.content }));
      const response = await chatWithCorpus(input, { dataset: selectedDataset !== 'all' ? selectedDataset : undefined, history });
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'assistant', content: response.answer, matches: response.matches, queryType: response.query_type, timestamp: new Date() }]);
    } catch (err) {
      console.error('Chat error:', err);
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'assistant', content: 'Sorry, something went wrong. Please try again.', timestamp: new Date() }]);
    } finally { setLoading(false); }
  };

  const handleClipClick = (match: ChatClipMatch) => { navigateToFeed(`${match.dataset_id}_master`, 0, undefined); };

  const suggestedQueries = ['Show me all running incidents', 'What anomalies are in ucsd_ped2?', 'Find clips with bicycles', 'Show me crowd panic events', 'What unusual activity exists?'];

  return (
    <div className="h-full flex flex-col bg-slate-900">
      <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Video Corpus Chat</h1>
          <p className="text-sm text-slate-400">Search and query across {stats?.total_clips || '...'} clips from all datasets</p>
        </div>
        <select value={selectedDataset} onChange={(e) => setSelectedDataset(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm">
          <option value="all">All Datasets</option>
          {stats && Object.keys(stats.datasets).map(ds => (<option key={ds} value={ds}>{ds} ({stats.datasets[ds].clips} clips)</option>))}
        </select>
      </div>

      {stats && (
        <div className="px-6 py-3 border-b border-slate-800 bg-slate-950 flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2"><span className="text-slate-500">Total Clips:</span><span className="font-mono font-bold">{stats.total_clips}</span></div>
          <div className="flex items-center gap-2"><span className="text-slate-500">Anomalies:</span><span className="font-mono font-bold text-red-400">{stats.total_anomalies}</span></div>
          <div className="flex items-center gap-2"><span className="text-slate-500">Datasets:</span><span className="font-mono">{Object.keys(stats.datasets).length}</span></div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.map((message) => (
          <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-xl p-4 ${message.role === 'user' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-100'}`}>
              <div className="prose prose-invert prose-sm max-w-none">
                {message.content.split('\n').map((line, i) => (<p key={i} className="my-1">{line.split('**').map((part, j) => j % 2 === 1 ? <strong key={j}>{part}</strong> : part)}</p>))}
              </div>
              {message.matches && message.matches.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-700">
                  <div className="text-xs text-slate-400 mb-2">Matching clips ({message.matches.length}):</div>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {message.matches.slice(0, 5).map((match) => (
                      <button key={match.clip_id} onClick={() => handleClipClick(match)} className="w-full text-left p-2 bg-slate-900/50 rounded-lg hover:bg-slate-700/50 transition-colors">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs text-blue-400">{match.clip_id}</span>
                          {match.is_anomaly && match.anomaly_type && <AnomalyTypeBadge type={match.anomaly_type as AnomalyType} size="xs" />}
                        </div>
                        <p className="text-xs text-slate-400 mt-1 line-clamp-2">{match.description}</p>
                        <div className="flex items-center gap-2 mt-1 text-xs">
                          <span className="text-slate-500">{match.dataset_id}</span>
                          {match.is_anomaly && <span className="text-red-400">Score: {(match.anomaly_score * 100).toFixed(1)}%</span>}
                        </div>
                      </button>
                    ))}
                    {message.matches.length > 5 && <div className="text-xs text-slate-500 text-center py-1">+{message.matches.length - 5} more matches</div>}
                  </div>
                </div>
              )}
              <div className="text-xs text-slate-500 mt-2">{message.timestamp.toLocaleTimeString()}</div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-slate-800 rounded-xl p-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:0.1s]" />
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:0.2s]" />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {messages.length <= 1 && (
        <div className="px-6 pb-4">
          <div className="text-xs text-slate-500 mb-2">Try asking:</div>
          <div className="flex flex-wrap gap-2">
            {suggestedQueries.map((q) => (<button key={q} onClick={() => setInput(q)} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-full text-sm text-slate-300 transition-colors">{q}</button>))}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="p-4 border-t border-slate-800 bg-slate-950">
        <div className="flex gap-3">
          <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about the video corpus..." className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm placeholder:text-slate-500 focus:outline-none focus:border-blue-500" disabled={loading} />
          <button type="submit" disabled={loading || !input.trim()} className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-xl font-medium transition-colors">{loading ? 'Thinking...' : 'Send'}</button>
        </div>
      </form>
    </div>
  );
}
