'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Incident, SimilarIncident, NeighborNormal, DatasetId } from '@/lib/types';
import { chatWithVideo, getChatStatus } from '@/lib/api';

interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  actions?: CopilotAction[];
  timeRange?: { start: number; end: number };
  evidence?: string[];
}

interface CopilotAction {
  label: string;
  type: 'seek' | 'compare' | 'search' | 'report' | 'confirm' | 'dismiss';
  payload: any;
}

interface OpsCopilotProps {
  currentTimeMs: number;
  currentIncident: Incident | null;
  similarIncidents: SimilarIncident[];
  nearestNormal: NeighborNormal[];
  selectedRange: { start: number; end: number } | null;
  dataset?: DatasetId;
  feedId?: string;
  onSeek: (timeMs: number) => void;
  onSeekRelative: (deltaMs: number) => void;
  onSetPlaybackRate: (rate: number) => void;
  onOpenIncident: (incidentId: string) => void;
  onSearchSimilar: () => void;
  onShowNearestNormal: () => void;
  onConfirmIncident: (incidentId: string) => void;
  onDismissIncident: (incidentId: string) => void;
  onCreateClip: (start: number, end: number) => void;
  onLogEntry: (message: string) => void;
}

// Quick action chips at the top
const QUICK_ACTIONS = [
  { id: 'what', label: 'What happened here?', icon: '?' },
  { id: 'similar', label: 'Show similar', icon: '=' },
  { id: 'normal', label: 'Compare to normal', icon: '~' },
];

export default function OpsCopilot({
  currentTimeMs,
  currentIncident,
  similarIncidents,
  nearestNormal,
  selectedRange,
  dataset = 'avenue',
  feedId,
  onSeek,
  onSeekRelative,
  onSetPlaybackRate,
  onOpenIncident,
  onSearchSimilar,
  onShowNearestNormal,
  onConfirmIncident,
  onDismissIncident,
  onCreateClip,
  onLogEntry,
}: OpsCopilotProps) {
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Check if Twelve Labs is available
  useEffect(() => {
    getChatStatus().then(status => {
      setAiAvailable(status.pegasus_available);
    }).catch(() => setAiAvailable(false));
  }, []);

  // Format time for display
  const formatTime = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Process user input and generate response
  const processInput = useCallback(async (input: string) => {
    const lowerInput = input.toLowerCase().trim();

    // Add user message
    const userMessage: CopilotMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: input,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    setIsProcessing(true);
    onLogEntry(`Question: "${input}"`);

    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 300));

    // Parse intent and generate response
    let response: CopilotMessage;

    // Seek commands
    if (lowerInput.match(/rewind\s*(\d+)/)) {
      const seconds = parseInt(lowerInput.match(/rewind\s*(\d+)/)![1]);
      onSeekRelative(-seconds * 1000);
      response = {
        id: `msg_${Date.now()}_resp`,
        role: 'assistant',
        content: `Rewound ${seconds} seconds.`,
        timestamp: new Date(),
        actions: [
          { label: 'Rewind more', type: 'seek', payload: { delta: -seconds * 1000 } },
          { label: 'Play', type: 'seek', payload: { rate: 1 } },
        ],
      };
    }
    else if (lowerInput.match(/forward\s*(\d+)/) || lowerInput.match(/skip\s*(\d+)/)) {
      const match = lowerInput.match(/(?:forward|skip)\s*(\d+)/);
      const seconds = parseInt(match![1]);
      onSeekRelative(seconds * 1000);
      response = {
        id: `msg_${Date.now()}_resp`,
        role: 'assistant',
        content: `Skipped forward ${seconds} seconds.`,
        timestamp: new Date(),
      };
    }
    else if (lowerInput.includes('slow') || lowerInput.includes('0.5x')) {
      onSetPlaybackRate(0.5);
      response = {
        id: `msg_${Date.now()}_resp`,
        role: 'assistant',
        content: 'Playback slowed to 0.5x.',
        timestamp: new Date(),
        actions: [
          { label: '0.25x', type: 'seek', payload: { rate: 0.25 } },
          { label: 'Normal', type: 'seek', payload: { rate: 1 } },
        ],
      };
    }
    else if (lowerInput.includes('normal speed') || lowerInput.includes('1x')) {
      onSetPlaybackRate(1);
      response = {
        id: `msg_${Date.now()}_resp`,
        role: 'assistant',
        content: 'Playback at normal speed.',
        timestamp: new Date(),
      };
    }
    // Peak/severity commands
    else if (lowerInput.includes('peak') || lowerInput.includes('most severe') || lowerInput.includes('worst')) {
      if (currentIncident) {
        const peakTime = currentIncident.feed_t_start_ms + (currentIncident.feed_t_end_ms - currentIncident.feed_t_start_ms) / 2;
        onSeek(peakTime);
        response = {
          id: `msg_${Date.now()}_resp`,
          role: 'assistant',
          content: `Jumped to peak severity at ${formatTime(peakTime)}. Severity: ${currentIncident.severity}.`,
          timestamp: new Date(),
          timeRange: { start: currentIncident.feed_t_start_ms, end: currentIncident.feed_t_end_ms },
          actions: [
            { label: 'See 10s before', type: 'seek', payload: { time: currentIncident.feed_t_start_ms - 10000 } },
            { label: 'Show similar', type: 'search', payload: {} },
          ],
        };
      } else {
        response = {
          id: `msg_${Date.now()}_resp`,
          role: 'assistant',
          content: 'No incident currently selected. Select an incident from the queue first.',
          timestamp: new Date(),
        };
      }
    }
    // Before spike/incident
    else if (lowerInput.includes('before') && (lowerInput.includes('spike') || lowerInput.includes('incident') || lowerInput.includes('alert'))) {
      if (currentIncident) {
        const beforeTime = Math.max(0, currentIncident.feed_t_start_ms - 10000);
        onSeek(beforeTime);
        response = {
          id: `msg_${Date.now()}_resp`,
          role: 'assistant',
          content: `Jumped to 10s before incident start (${formatTime(beforeTime)}).`,
          timestamp: new Date(),
          timeRange: { start: beforeTime, end: currentIncident.feed_t_start_ms },
          actions: [
            { label: 'Play through', type: 'seek', payload: { rate: 1 } },
            { label: 'Step forward', type: 'seek', payload: { delta: 1000 } },
          ],
        };
      } else {
        response = {
          id: `msg_${Date.now()}_resp`,
          role: 'assistant',
          content: 'No incident selected. Click an incident from the queue.',
          timestamp: new Date(),
        };
      }
    }
    // Similar incidents
    else if (lowerInput.includes('similar')) {
      onSearchSimilar();
      if (similarIncidents.length > 0) {
        response = {
          id: `msg_${Date.now()}_resp`,
          role: 'assistant',
          content: `Found ${similarIncidents.length} similar incidents. Top matches:`,
          timestamp: new Date(),
          evidence: similarIncidents.slice(0, 3).map(s =>
            `${s.feed_label} @ ${formatTime(s.feed_t_start_ms)} (${Math.round(s.similarity * 100)}% similar)`
          ),
          actions: similarIncidents.slice(0, 3).map(s => ({
            label: `Jump to ${formatTime(s.feed_t_start_ms)}`,
            type: 'seek' as const,
            payload: { incidentId: s.incident_id, time: s.feed_t_start_ms },
          })),
        };
      } else {
        response = {
          id: `msg_${Date.now()}_resp`,
          role: 'assistant',
          content: 'No similar incidents found in the database.',
          timestamp: new Date(),
        };
      }
    }
    // Normal comparison
    else if (lowerInput.includes('normal') || lowerInput.includes('typical') || lowerInput.includes('baseline')) {
      onShowNearestNormal();
      if (nearestNormal.length > 0) {
        response = {
          id: `msg_${Date.now()}_resp`,
          role: 'assistant',
          content: `Here's what normal looks like for comparison. Found ${nearestNormal.length} similar normal segments.`,
          timestamp: new Date(),
          evidence: nearestNormal.slice(0, 3).map(n =>
            `Normal segment (${Math.round(n.similarity * 100)}% similar)`
          ),
        };
      } else {
        response = {
          id: `msg_${Date.now()}_resp`,
          role: 'assistant',
          content: 'Searching for normal reference segments...',
          timestamp: new Date(),
        };
      }
    }
    // What happened / explain
    else if (lowerInput.includes('what') && (lowerInput.includes('happen') || lowerInput.includes('going on') || lowerInput.includes('this'))) {
      if (currentIncident) {
        const duration = Math.round((currentIncident.feed_t_end_ms - currentIncident.feed_t_start_ms) / 1000);
        response = {
          id: `msg_${Date.now()}_resp`,
          role: 'assistant',
          content: `Anomaly detected from ${formatTime(currentIncident.feed_t_start_ms)} to ${formatTime(currentIncident.feed_t_end_ms)}.`,
          timestamp: new Date(),
          timeRange: { start: currentIncident.feed_t_start_ms, end: currentIncident.feed_t_end_ms },
          evidence: [
            `Duration: ${duration}s`,
            `Severity: ${currentIncident.severity}/100`,
            `Status: ${currentIncident.status === 'new' ? 'Awaiting review' : currentIncident.status}`,
            currentIncident.label ? `Label: ${currentIncident.label}` : 'No label assigned',
          ],
          actions: [
            { label: 'Show similar', type: 'search', payload: {} },
            { label: 'Compare to normal', type: 'compare', payload: {} },
            { label: 'Jump to start', type: 'seek', payload: { time: currentIncident.feed_t_start_ms } },
          ],
        };
      } else if (selectedRange) {
        response = {
          id: `msg_${Date.now()}_resp`,
          role: 'assistant',
          content: `Analyzing selected range: ${formatTime(selectedRange.start)} - ${formatTime(selectedRange.end)}`,
          timestamp: new Date(),
          timeRange: selectedRange,
          evidence: [
            `Duration: ${Math.round((selectedRange.end - selectedRange.start) / 1000)}s`,
            'Checking for anomalies in this range...',
          ],
        };
      } else {
        response = {
          id: `msg_${Date.now()}_resp`,
          role: 'assistant',
          content: `Current position: ${formatTime(currentTimeMs)}. Select a range or incident to analyze.`,
          timestamp: new Date(),
        };
      }
    }
    // Create clip
    else if (lowerInput.includes('clip') || lowerInput.includes('save') || lowerInput.includes('export')) {
      if (selectedRange || currentIncident) {
        const range = selectedRange || (currentIncident ? { start: currentIncident.feed_t_start_ms, end: currentIncident.feed_t_end_ms } : null);
        if (range) {
          onCreateClip(range.start, range.end);
          response = {
            id: `msg_${Date.now()}_resp`,
            role: 'assistant',
            content: `Clip created: ${formatTime(range.start)} - ${formatTime(range.end)}`,
            timestamp: new Date(),
            timeRange: range,
            actions: [
              { label: 'Copy link', type: 'report', payload: { action: 'copy' } },
              { label: 'Add to report', type: 'report', payload: { action: 'add' } },
            ],
          };
        } else {
          response = {
            id: `msg_${Date.now()}_resp`,
            role: 'assistant',
            content: 'Select a range on the timeline first.',
            timestamp: new Date(),
          };
        }
      } else {
        response = {
          id: `msg_${Date.now()}_resp`,
          role: 'assistant',
          content: 'Select a range on the timeline or an incident to create a clip.',
          timestamp: new Date(),
        };
      }
    }
    // Confirm/dismiss
    else if (lowerInput.includes('confirm') || lowerInput.includes('real')) {
      if (currentIncident) {
        onConfirmIncident(currentIncident.incident_id);
        response = {
          id: `msg_${Date.now()}_resp`,
          role: 'assistant',
          content: `Incident confirmed and logged. Moving to next in queue.`,
          timestamp: new Date(),
        };
      } else {
        response = {
          id: `msg_${Date.now()}_resp`,
          role: 'assistant',
          content: 'No incident selected to confirm.',
          timestamp: new Date(),
        };
      }
    }
    else if (lowerInput.includes('dismiss') || lowerInput.includes('false') || lowerInput.includes('ignore')) {
      if (currentIncident) {
        onDismissIncident(currentIncident.incident_id);
        response = {
          id: `msg_${Date.now()}_resp`,
          role: 'assistant',
          content: `Marked as false alarm. Moving to next in queue.`,
          timestamp: new Date(),
        };
      } else {
        response = {
          id: `msg_${Date.now()}_resp`,
          role: 'assistant',
          content: 'No incident selected to dismiss.',
          timestamp: new Date(),
        };
      }
    }
    // Help
    else if (lowerInput.includes('help') || lowerInput === '?') {
      response = {
        id: `msg_${Date.now()}_resp`,
        role: 'assistant',
        content: 'Here are some things I can help with:',
        timestamp: new Date(),
        evidence: [
          '"Rewind 15 seconds" - Seek backwards',
          '"Show me what happened before the spike" - Jump to incident start',
          '"Slow this down" - Set 0.5x playback',
          '"Show similar incidents" - Find matching patterns',
          '"Compare to normal" - Show baseline behavior',
          '"What\'s happening here?" - Explain current segment',
          '"Make a clip" - Save current selection',
          '"Confirm" / "Dismiss" - Label the incident',
        ],
      };
    }
    // Default: Use Twelve Labs Marengo for real video Q&A
    else {
      try {
        const qaResponse = await chatWithVideo(
          input,
          dataset,
          feedId,
          currentTimeMs
        );

        response = {
          id: `msg_${Date.now()}_resp`,
          role: 'assistant',
          content: qaResponse.answer,
          timestamp: new Date(),
          evidence: qaResponse.source === 'twelvelabs'
            ? ['Analyzed using Twelve Labs Marengo']
            : ['Based on corpus search'],
          actions: [
            { label: 'Show similar', type: 'search', payload: {} },
            { label: 'Jump to incident', type: 'seek', payload: { time: currentTimeMs } },
          ],
        };
      } catch (err) {
        response = {
          id: `msg_${Date.now()}_resp`,
          role: 'assistant',
          content: `I can help you analyze video, find similar incidents, and control playback. Try asking "What's happening in this scene?" or "Show similar incidents".`,
          timestamp: new Date(),
          actions: [
            { label: 'What happened?', type: 'search', payload: {} },
            { label: 'Show similar', type: 'search', payload: {} },
          ],
        };
      }
    }

    setMessages(prev => [...prev, response]);
    setIsProcessing(false);
  }, [currentTimeMs, currentIncident, similarIncidents, nearestNormal, selectedRange, dataset, feedId, onSeek, onSeekRelative, onSetPlaybackRate, onSearchSimilar, onShowNearestNormal, onConfirmIncident, onDismissIncident, onCreateClip, onLogEntry]);

  // Handle quick action click
  const handleQuickAction = (actionId: string) => {
    switch (actionId) {
      case 'what':
        processInput('What happened here?');
        break;
      case 'similar':
        processInput('Show similar incidents');
        break;
      case 'normal':
        processInput('Compare to normal');
        break;
    }
  };

  // Handle action button click
  const handleActionClick = (action: CopilotAction) => {
    switch (action.type) {
      case 'seek':
        if (action.payload.time !== undefined) {
          onSeek(action.payload.time);
        } else if (action.payload.delta !== undefined) {
          onSeekRelative(action.payload.delta);
        } else if (action.payload.rate !== undefined) {
          onSetPlaybackRate(action.payload.rate);
        } else if (action.payload.incidentId) {
          onOpenIncident(action.payload.incidentId);
        }
        break;
      case 'search':
        onSearchSimilar();
        break;
      case 'compare':
        onShowNearestNormal();
        break;
    }
  };

  // Handle form submit
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim() && !isProcessing) {
      processInput(inputValue.trim());
      setInputValue('');
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-950">
      {/* Header */}
      <div className="p-4 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="font-bold">Video Q&A</h2>
            <p className="text-xs text-slate-400">
              {aiAvailable ? 'Powered by Twelve Labs Marengo' : 'Ask questions about the footage'}
            </p>
          </div>
          {aiAvailable && (
            <div className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded-full">
              AI
            </div>
          )}
        </div>
      </div>

      {/* Quick Action Chips */}
      <div className="px-4 py-3 border-b border-slate-800 flex gap-2 flex-wrap">
        {QUICK_ACTIONS.map(action => (
          <button
            key={action.id}
            onClick={() => handleQuickAction(action.id)}
            disabled={isProcessing}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-full text-xs font-medium transition-colors disabled:opacity-50"
          >
            <span className="mr-1.5 text-slate-400">{action.icon}</span>
            {action.label}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-8 text-slate-500">
            <svg className="w-12 h-12 mx-auto mb-3 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <div className="font-medium">Ready to assist</div>
            <p className="text-xs text-slate-600 mt-1">Ask a question or use the chips above</p>
          </div>
        )}

        {messages.map(msg => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[85%] ${msg.role === 'user' ? 'order-2' : ''}`}>
              {/* Message bubble */}
              <div className={`rounded-lg px-3 py-2 ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-100'
              }`}>
                <p className="text-sm">{msg.content}</p>

                {/* Evidence list */}
                {msg.evidence && msg.evidence.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {msg.evidence.map((item, i) => (
                      <li key={i} className="text-xs text-slate-300 flex items-start gap-1.5">
                        <span className="text-slate-500 mt-0.5">•</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                )}

                {/* Time range indicator */}
                {msg.timeRange && (
                  <div className="mt-2 px-2 py-1 bg-slate-900/50 rounded text-xs font-mono text-slate-400">
                    {formatTime(msg.timeRange.start)} → {formatTime(msg.timeRange.end)}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              {msg.actions && msg.actions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {msg.actions.map((action, i) => (
                    <button
                      key={i}
                      onClick={() => handleActionClick(action)}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-xs font-medium transition-colors"
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Timestamp */}
              <div className={`text-xs text-slate-500 mt-1 ${msg.role === 'user' ? 'text-right' : ''}`}>
                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}

        {isProcessing && (
          <div className="flex justify-start">
            <div className="bg-slate-800 rounded-lg px-4 py-2">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-slate-800">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Ask about this footage..."
            disabled={isProcessing}
            className="flex-1 px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm placeholder-slate-500 focus:outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || isProcessing}
            className="p-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
        <div className="text-xs text-slate-500 mt-2 text-center">
          Try: "rewind 10 seconds" • "show similar" • "what happened?"
        </div>
      </form>
    </div>
  );
}
