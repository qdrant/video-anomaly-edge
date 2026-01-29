'use client';

import { useState } from 'react';
import { generateVideoReport, VideoReportResponse } from '@/lib/api';
import { DatasetId } from '@/lib/types';

interface VideoReportProps {
  videoId: string;
  dataset: DatasetId;
  onClose?: () => void;
}

export function VideoReport({ videoId, dataset, onClose }: VideoReportProps) {
  const [report, setReport] = useState<VideoReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerateReport() {
    setLoading(true);
    setError(null);

    try {
      const data = await generateVideoReport(videoId, dataset);
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Report generation failed');
    } finally {
      setLoading(false);
    }
  }

  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  function getSeverityColor(severity: number): string {
    if (severity >= 70) return 'bg-red-500';
    if (severity >= 40) return 'bg-yellow-500';
    return 'bg-green-500';
  }

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <div>
          <h3 className="font-medium text-white">Video Report</h3>
          <p className="text-sm text-gray-400">{videoId}</p>
        </div>
        <div className="flex gap-2">
          {!report && (
            <button
              onClick={handleGenerateReport}
              disabled={loading}
              className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-500 disabled:opacity-50 transition"
            >
              {loading ? 'Generating...' : 'Generate Report'}
            </button>
          )}
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
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-900/30 text-red-300">
          {error}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="p-8 flex flex-col items-center justify-center">
          <svg className="w-8 h-8 animate-spin text-blue-500 mb-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-gray-400">Generating report...</p>
        </div>
      )}

      {/* Report Content */}
      {report && (
        <div className="p-4 space-y-6">
          {/* Summary */}
          <div>
            <h4 className="text-sm font-medium text-gray-400 mb-2">Summary</h4>
            <p className="text-white">{report.summary}</p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-gray-800 rounded-lg p-3">
              <p className="text-xs text-gray-500">Duration</p>
              <p className="text-lg font-semibold text-white">
                {formatTime(report.total_duration_sec)}
              </p>
            </div>
            <div className="bg-gray-800 rounded-lg p-3">
              <p className="text-xs text-gray-500">Segments</p>
              <p className="text-lg font-semibold text-white">
                {report.segment_count}
              </p>
            </div>
            <div className="bg-gray-800 rounded-lg p-3">
              <p className="text-xs text-gray-500">Anomalies</p>
              <p className={`text-lg font-semibold ${report.anomaly_count > 0 ? 'text-red-400' : 'text-green-400'}`}>
                {report.anomaly_count}
              </p>
            </div>
          </div>

          {/* Dataset Context */}
          {report.dataset_context && (
            <div className="bg-gray-800/50 rounded-lg p-3">
              <h4 className="text-sm font-medium text-gray-400 mb-2">Dataset Context</h4>
              <p className="text-sm text-gray-300 mb-1">
                <span className="text-gray-500">Scene:</span> {report.dataset_context.scene_description}
              </p>
              <p className="text-sm text-gray-300">
                <span className="text-gray-500">Expected anomalies:</span> {report.dataset_context.example_anomalies}
              </p>
            </div>
          )}

          {/* Key Events */}
          {report.key_events && report.key_events.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-400 mb-2">Key Events</h4>
              <div className="space-y-2">
                {report.key_events.map((event, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 bg-gray-800 rounded-lg p-3"
                  >
                    <div className="flex-shrink-0">
                      <span className="text-sm text-gray-400">
                        {formatTime(event.time_sec)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">
                        {event.description}
                      </p>
                    </div>
                    <div className={`w-2 h-2 rounded-full ${getSeverityColor(event.severity)}`} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Timeline */}
          {report.timeline && report.timeline.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-400 mb-2">Timeline</h4>
              <div className="relative">
                {/* Timeline bar */}
                <div className="h-8 bg-gray-800 rounded-lg overflow-hidden flex">
                  {report.timeline.map((segment, i) => {
                    const width = ((segment.end_sec - segment.start_sec) / report.total_duration_sec) * 100;
                    return (
                      <div
                        key={i}
                        style={{ width: `${Math.max(width, 0.5)}%` }}
                        className={`h-full ${
                          segment.is_anomaly
                            ? getSeverityColor(segment.severity)
                            : 'bg-gray-700'
                        } border-r border-gray-900/50`}
                        title={`${formatTime(segment.start_sec)} - ${segment.description || 'Normal'}`}
                      />
                    );
                  })}
                </div>
                {/* Time markers */}
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>0:00</span>
                  <span>{formatTime(report.total_duration_sec)}</span>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Red/yellow = anomalies | Gray = normal
              </p>
            </div>
          )}

          {/* Regenerate Button */}
          <div className="pt-4 border-t border-gray-700">
            <button
              onClick={handleGenerateReport}
              disabled={loading}
              className="px-3 py-1.5 bg-gray-700 text-white text-sm rounded hover:bg-gray-600 disabled:opacity-50 transition"
            >
              Regenerate Report
            </button>
          </div>
        </div>
      )}

      {/* Initial State */}
      {!report && !loading && !error && (
        <div className="p-8 text-center">
          <svg className="w-12 h-12 mx-auto text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-gray-400 mb-4">
            Generate a comprehensive report for this video including summary, timeline, and key events.
          </p>
          <button
            onClick={handleGenerateReport}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition"
          >
            Generate Report
          </button>
        </div>
      )}
    </div>
  );
}

export default VideoReport;
