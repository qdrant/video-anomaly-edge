'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import FeedPlayer, { FeedPlayerHandle } from './FeedPlayer';
import { getFeed, getIncident, chatWithVideo } from '@/lib/api';
import { FeedManifest, Incident, IncidentDetail, SimilarIncident, DatasetId } from '@/lib/types';
import { AnomalyTypeBadge } from './HybridScoringUI';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface VideoModalProps {
  incident: Incident & { dataset_id: DatasetId };
  feedLabel: string;
  runId: string;
  onClose: () => void;
  onConfirm: () => void;
  onDismiss: () => void;
  onInvestigate: () => void;
}

type TabId = 'chat' | 'similar';

export default function VideoModal({ incident, feedLabel, runId, onClose, onConfirm, onDismiss, onInvestigate }: VideoModalProps) {
  const [feed, setFeed] = useState<FeedManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const playerRef = useRef<FeedPlayerHandle>(null);
  const [activeTab, setActiveTab] = useState<TabId>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [incidentDetail, setIncidentDetail] = useState<IncidentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    async function loadFeed() {
      setLoading(true);
      setError(null);
      try {
        const manifest = await getFeed(incident.feed_id, incident.dataset_id);
        setFeed(manifest);
      } catch (err) {
        setError('Failed to load feed');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadFeed();
  }, [incident.feed_id, incident.dataset_id]);

  useEffect(() => {
    async function loadDetail() {
      setDetailLoading(true);
      try {
        const detail = await getIncident(incident.incident_id, incident.dataset_id, runId);
        setIncidentDetail(detail);
      } catch (err) {
        console.error('Failed to load incident detail:', err);
      } finally {
        setDetailLoading(false);
      }
    }
    loadDetail();
  }, [incident.incident_id, incident.dataset_id, runId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const startTime = Math.max(0, incident.feed_t_start_ms - 3000);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || chatLoading) return;

    const userMsg: ChatMessage = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setChatLoading(true);

    try {
      const res = await chatWithVideo(text, incident.dataset_id, incident.feed_id, incident.feed_t_start_ms);
      setMessages(prev => [...prev, { role: 'assistant', content: res.answer }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Failed to get a response. Try again.' }]);
    } finally {
      setChatLoading(false);
    }
  }, [input, chatLoading, incident]);

  const severityColor = incident.severity >= 70 ? 'text-red-400' : incident.severity >= 40 ? 'text-yellow-400' : 'text-green-400';
  const severityBg = incident.severity >= 70 ? 'bg-red-500/20' : incident.severity >= 40 ? 'bg-yellow-500/20' : 'bg-green-500/20';

  const BASE_TIME = new Date('2026-02-16T14:11:00');
  const formatTime = (ms: number) => {
    const time = new Date(BASE_TIME.getTime() + ms);
    return time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
  };

  const suggestedQuestions = ['What is happening in this scene?', 'Is this behavior normal?', 'Describe the people visible'];
  const similarIncidents = incidentDetail?.neighbors_anomaly ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-in fade-in duration-200" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-6xl mx-4 bg-slate-900 rounded-2xl border border-slate-700/50 overflow-hidden shadow-[0_0_60px_rgba(0,0,0,0.5)] flex flex-col animate-in zoom-in-95 slide-in-from-bottom-4 duration-300" style={{ maxHeight: '90vh' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center justify-center w-9 h-7 rounded font-mono font-bold text-sm ${severityBg} ${severityColor}`}>{incident.severity}</span>
            {incident.anomaly_type && <AnomalyTypeBadge type={incident.anomaly_type} size="xs" />}
            <span className="text-sm text-slate-300 font-medium">{feedLabel}</span>
            <span className="text-xs text-slate-500 font-mono">{formatTime(incident.feed_t_start_ms)} - {formatTime(incident.feed_t_end_ms)}</span>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex flex-col md:flex-row flex-1 min-h-0">
          <div className="flex-1 bg-black flex flex-col min-h-[200px] md:min-h-0">
            {loading && <div className="flex items-center justify-center h-[400px]"><div className="w-10 h-10 border-2 border-slate-700 border-t-red-500 rounded-full animate-spin" /></div>}
            {error && <div className="flex items-center justify-center h-[400px] text-red-400 text-sm">{error}</div>}
            {feed && <FeedPlayer ref={playerRef} feed={feed} initialFeedTime={startTime} autoPlay showOverlay />}
          </div>

          <div className="w-full md:w-80 border-t md:border-t-0 md:border-l border-slate-800 flex flex-col bg-slate-950 max-h-[40vh] md:max-h-none">
            <div className="flex gap-1 p-2 shrink-0">
              <button onClick={() => setActiveTab('chat')} className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === 'chat' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}>Chat</button>
              <button onClick={() => setActiveTab('similar')} className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === 'similar' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}>
                Similar
                {similarIncidents.length > 0 && <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${activeTab === 'similar' ? 'bg-blue-500/30 text-blue-300' : 'bg-slate-700 text-slate-400'}`}>{similarIncidents.length}</span>}
              </button>
            </div>

            {activeTab === 'chat' ? (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  {messages.length === 0 && (
                    <div className="text-center py-6">
                      <div className="text-slate-500 text-sm mb-3">Ask about this incident</div>
                      <div className="space-y-2">
                        {suggestedQuestions.map((q) => (
                          <button key={q} onClick={() => setInput(q)} className="block w-full text-left px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs text-slate-300 transition-colors">{q}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[90%] px-3 py-2 rounded-lg text-sm ${msg.role === 'user' ? 'bg-red-600/30 text-white' : 'bg-slate-800 text-slate-200'}`}>{msg.content}</div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="flex justify-start">
                      <div className="px-3 py-2 bg-slate-800 rounded-lg">
                        <div className="flex gap-1">
                          <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
                <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="p-3 border-t border-slate-800 shrink-0">
                  <div className="flex gap-2">
                    <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about this incident..." className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm placeholder-slate-500 focus:outline-none focus:border-slate-600" />
                    <button type="submit" disabled={!input.trim() || chatLoading} className="px-3 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-40 rounded-lg text-sm font-medium transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-3">
                {detailLoading ? (
                  <div className="flex items-center justify-center py-8"><div className="w-6 h-6 border-2 border-slate-700 border-t-red-500 rounded-full animate-spin" /></div>
                ) : similarIncidents.length === 0 ? (
                  <div className="text-center py-8"><div className="text-slate-500 text-sm">No similar incidents found</div><p className="text-xs text-slate-600 mt-1">This might be a unique event</p></div>
                ) : (
                  <div className="space-y-2">
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-2.5 mb-3"><p className="text-xs text-slate-400">Incidents with similar visual patterns (powered by Qdrant vector search).</p></div>
                    {similarIncidents.map((inc, i) => (
                      <div key={inc.incident_id} className="flex items-center gap-2.5 p-2.5 bg-slate-800 rounded-lg">
                        <div className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-xs font-mono shrink-0">{i + 1}</div>
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-mono font-bold text-xs shrink-0 ${inc.severity >= 70 ? 'bg-red-500/20 text-red-400' : inc.severity >= 40 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400'}`}>{inc.severity}</div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate">{inc.feed_label}</div>
                          <div className="text-xs text-slate-400">{formatTime(inc.feed_t_start_ms)}</div>
                        </div>
                        <div className="text-right shrink-0"><div className="text-xs font-mono text-green-400">{inc.similarity}%</div></div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-800 bg-slate-950/50 shrink-0">
          <div className="text-sm text-slate-400 truncate max-w-xs">{incident.label && <span>{incident.label}</span>}</div>
          <div className="flex items-center gap-2">
            <button onClick={onDismiss} className="px-4 py-2 bg-green-500/15 hover:bg-green-500/25 text-green-400 border border-green-500/20 hover:border-green-500/40 rounded-lg text-sm font-medium transition-all">Dismiss</button>
            <button onClick={onInvestigate} className="px-4 py-2 bg-yellow-500/15 hover:bg-yellow-500/25 text-yellow-400 border border-yellow-500/20 hover:border-yellow-500/40 rounded-lg text-sm font-medium transition-all">Investigate</button>
            <button onClick={onConfirm} className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 hover:border-red-500/50 rounded-lg text-sm font-medium transition-all">Escalate</button>
          </div>
        </div>
      </div>
    </div>
  );
}
