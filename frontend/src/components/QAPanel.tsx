'use client';

import { useState } from 'react';
import { askClipQuestion, askVideoQuestion, ClipQAResponse, VideoQAResponse } from '@/lib/api';
import { DatasetId } from '@/lib/types';

interface QAPanelProps {
  dataset: DatasetId;
  clipId?: string;
  videoId?: string;
  onClose?: () => void;
}

export function QAPanel({ dataset, clipId, videoId, onClose }: QAPanelProps) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<ClipQAResponse | VideoQAResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<{ q: string; a: string }>>([]);

  const mode = clipId ? 'clip' : videoId ? 'video' : null;

  const suggestedQuestions = clipId
    ? [
        'What is happening in this clip?',
        'Is there any unusual activity?',
        'How many people are visible?',
        'What are the people doing?',
      ]
    : videoId
    ? [
        'Summarize what happens in this video',
        'Are there any anomalies detected?',
        'What is the most significant event?',
        'How many incidents were detected?',
      ]
    : [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim() || !mode) return;

    setLoading(true);
    setError(null);

    try {
      let response: ClipQAResponse | VideoQAResponse;

      if (mode === 'clip' && clipId) {
        response = await askClipQuestion(clipId, question, dataset);
      } else if (mode === 'video' && videoId) {
        response = await askVideoQuestion(videoId, question, dataset);
      } else {
        throw new Error('No clip or video specified');
      }

      setAnswer(response);
      setHistory((prev) => [...prev, { q: question, a: response.answer }]);
      setQuestion('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Q&A failed');
    } finally {
      setLoading(false);
    }
  }

  function handleSuggestedQuestion(q: string) {
    setQuestion(q);
  }

  if (!mode) {
    return (
      <div className="p-4 text-gray-500">
        Select a clip or video to ask questions about.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-900 rounded-lg border border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <div>
          <h3 className="font-medium text-white">Ask Pegasus</h3>
          <p className="text-sm text-gray-400">
            {mode === 'clip' ? `Clip: ${clipId}` : `Video: ${videoId}`}
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Suggested Questions */}
      {suggestedQuestions.length > 0 && history.length === 0 && (
        <div className="px-4 py-3 border-b border-gray-700">
          <p className="text-xs text-gray-500 mb-2">Suggested questions:</p>
          <div className="flex flex-wrap gap-2">
            {suggestedQuestions.map((q) => (
              <button
                key={q}
                onClick={() => handleSuggestedQuestion(q)}
                className="px-2 py-1 text-xs bg-gray-800 text-gray-300 rounded hover:bg-gray-700 transition"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Chat History */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {history.map((item, i) => (
          <div key={i} className="space-y-2">
            <div className="flex justify-end">
              <div className="bg-blue-600 text-white px-3 py-2 rounded-lg max-w-[80%]">
                {item.q}
              </div>
            </div>
            <div className="flex justify-start">
              <div className="bg-gray-800 text-gray-100 px-3 py-2 rounded-lg max-w-[80%]">
                {item.a}
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-800 text-gray-400 px-3 py-2 rounded-lg">
              <span className="animate-pulse">Analyzing...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-900/50 text-red-200 px-3 py-2 rounded-lg">
            {error}
          </div>
        )}

        {answer && 'relevant_clips' in answer && answer.relevant_clips.length > 0 && (
          <div className="mt-4 p-3 bg-gray-800 rounded-lg">
            <p className="text-xs text-gray-500 mb-2">Relevant clips:</p>
            <div className="space-y-1">
              {answer.relevant_clips.map((clip) => (
                <div key={clip.clip_id} className="text-xs text-gray-400">
                  <span className="text-gray-300">{clip.clip_id}</span>
                  {clip.anomaly_type && (
                    <span className="ml-2 px-1 py-0.5 bg-red-900/50 text-red-300 rounded">
                      {clip.anomaly_type}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-gray-700">
        <div className="flex gap-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask a question..."
            className="flex-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {loading ? (
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
          </button>
        </div>
        {answer && (
          <p className="mt-2 text-xs text-gray-500">
            Latency: {answer.latency_ms.toFixed(0)}ms | Confidence: {answer.confidence}
          </p>
        )}
      </form>
    </div>
  );
}

export default QAPanel;
