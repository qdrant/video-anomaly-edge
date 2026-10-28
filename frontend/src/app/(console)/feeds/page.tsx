'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '@/lib/AppContext';
import { ShiftLogProvider, useShiftLog } from '@/lib/ShiftLogContext';
import { getFeeds, getIncidentDetail, getDatasets, getFeed, getIncidents } from '@/lib/api';
import { FeedSummary, FeedManifest, Incident, Window, SimilarIncident, NeighborNormal, IncidentDetail, DatasetId } from '@/lib/types';

// Extended feed with dataset info
interface MultiDatasetFeed extends FeedSummary {
  dataset: DatasetId;
}

// Playback speed multiplier to normalize perceived speed across datasets
const PLAYBACK_RATES: Record<string, number> = {
  avenue: 1.0,      // 25fps - normal speed
  ucsd_ped1: 1.0,   // Quad Walkway
  ucsd_ped2: 2.5,   // Library Plaza
  shanghaitech: 1.0, // Research Building
};
import FeedPlayer from '@/components/FeedPlayer';
import ContinuousTimeline from '@/components/ContinuousTimeline';
import AlertQueue from '@/components/AlertQueue';
import OpsCopilot from '@/components/OpsCopilot';
import ShiftLog from '@/components/ShiftLog';
import CameraPanel from '@/components/CameraPanel';
import AnomalyMeter from '@/components/AnomalyMeter';
import ActiveIncidentCard from '@/components/ActiveIncidentCard';

function FeedsPageContent() {
  const {
    dataset,
    runId,
    feedId,
    timeMs,
    currentFeed,
    incidents,
    drawerIncidentId,
    loading,
    setFeed,
    setTime,
    openDrawer,
    closeDrawer,
    navigateToFeed,
  } = useApp();

  const { entries, logAlert, logAction, logQuestion, logDecision, logClip, clearLog } = useShiftLog();

  const [feedsList, setFeedsList] = useState<MultiDatasetFeed[]>([]);
  const [selectedFeed, setSelectedFeed] = useState<MultiDatasetFeed | null>(null);
  const [localFeedManifest, setLocalFeedManifest] = useState<FeedManifest | null>(null);
  const [allIncidents, setAllIncidents] = useState<Incident[]>([]);
  const [currentWindow, setCurrentWindow] = useState<Window | null>(null);
  const [externalSeekTime, setExternalSeekTime] = useState<number>(timeMs);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [selectedRange, setSelectedRange] = useState<{ start: number; end: number } | null>(null);
  const [currentIncidentDetail, setCurrentIncidentDetail] = useState<IncidentDetail | null>(null);
  const [rightPanelTab, setRightPanelTab] = useState<'copilot' | 'explain'>('copilot');
  const [showShiftLog, setShowShiftLog] = useState(false);
  const [patrolMode, setPatrolMode] = useState(false);
  const [autoFollow, setAutoFollow] = useState(true);
  const [leftPanelView, setLeftPanelView] = useState<'cameras' | 'alerts'>('alerts');
  const [currentAnomalyScore, setCurrentAnomalyScore] = useState(0);

  const playerRef = useRef<{ play: () => void; pause: () => void; setRate: (r: number) => void } | null>(null);

  // Get current incident from incidents list
  const currentIncident = incidents.find(i => i.incident_id === drawerIncidentId) || null;

  // Load feeds and incidents from ALL datasets
  useEffect(() => {
    async function loadAllFeeds() {
      try {
        const datasets = await getDatasets();
        const availableDatasets = datasets.filter(d => d.available);

        const allFeeds: MultiDatasetFeed[] = [];
        const allInc: Incident[] = [];

        for (const ds of availableDatasets) {
          try {
            const feedsIndex = await getFeeds(ds.id as DatasetId);
            const feedsWithDataset = feedsIndex.feeds.map(f => ({
              ...f,
              dataset: ds.id as DatasetId,
              label: f.label.replace(' - All Clips', ` (${ds.name})`),
            }));
            allFeeds.push(...feedsWithDataset);

            // Load incidents for this dataset
            const incidentsRes = await getIncidents(ds.id as DatasetId, { runId });
            allInc.push(...incidentsRes.incidents);
          } catch (err) {
            console.error(`Failed to load feeds for ${ds.id}:`, err);
          }
        }

        setFeedsList(allFeeds);
        setAllIncidents(allInc.sort((a, b) => b.severity - a.severity));

        // Auto-select first feed if none selected
        if (allFeeds.length > 0 && !selectedFeed) {
          handleCameraSelect(allFeeds[0]);
        }
      } catch (err) {
        console.error('Failed to load feeds:', err);
      }
    }
    loadAllFeeds();
  }, [runId]);

  // Load incident detail when drawer opens
  useEffect(() => {
    async function loadIncidentDetail() {
      if (!drawerIncidentId) {
        setCurrentIncidentDetail(null);
        return;
      }
      try {
        const detail = await getIncidentDetail(drawerIncidentId, dataset, runId);
        setCurrentIncidentDetail(detail);
      } catch (err) {
        console.error('Failed to load incident detail:', err);
      }
    }
    loadIncidentDetail();
  }, [drawerIncidentId, dataset, runId]);

  // Update anomaly score from current window
  useEffect(() => {
    if (currentWindow) {
      setCurrentAnomalyScore(currentWindow.severity / 100);
    }
  }, [currentWindow]);

  // Patrol mode: auto-rotate through feeds with incidents
  useEffect(() => {
    if (!patrolMode || !autoFollow) return;

    const interval = setInterval(() => {
      // Find feeds with recent activity
      const activeFeed = feedsList.find(f => f.incident_count > 0 && f.feed_id !== feedId);
      if (activeFeed) {
        setFeed(activeFeed.feed_id);
        logAction(`Patrol: Switched to ${activeFeed.label}`);
      }
    }, 30000); // Rotate every 30s if no incidents

    return () => clearInterval(interval);
  }, [patrolMode, autoFollow, feedsList, feedId, setFeed, logAction]);

  // Auto-follow: jump to feed when new incident detected
  useEffect(() => {
    if (!autoFollow) return;

    const newIncidents = incidents.filter(i => i.status === 'new');
    if (newIncidents.length > 0) {
      const latest = newIncidents[0];
      if (latest.feed_id !== feedId) {
        // Switch to feed with new incident
        setFeed(latest.feed_id);
        setExternalSeekTime(Math.max(0, latest.feed_t_start_ms - 10000));
        logAction(`Auto-follow: New incident on ${latest.feed_id}`);
      }
    }
  }, [incidents, autoFollow, feedId, setFeed, logAction]);

  // Handle timeline seek
  const handleSeek = useCallback((ms: number) => {
    setExternalSeekTime(ms);
    setTime(ms);
    logAction(`Seeked to ${formatTime(ms)}`);
  }, [setTime, logAction]);

  // Handle relative seek
  const handleSeekRelative = useCallback((deltaMs: number) => {
    const newTime = Math.max(0, timeMs + deltaMs);
    setExternalSeekTime(newTime);
    setTime(newTime);
  }, [timeMs, setTime]);

  // Handle playback rate change
  const handleSetPlaybackRate = useCallback((rate: number) => {
    setPlaybackRate(rate);
    playerRef.current?.setRate(rate);
    logAction(`Playback ${rate}x`);
  }, [logAction]);

  // Handle time update from player
  const handleTimeUpdate = useCallback((ms: number) => {
    setTime(ms);
  }, [setTime]);

  // Handle incident click - jump to time + open drawer (Investigate mode)
  const handleIncidentClick = useCallback((incident: Incident) => {
    // Auto-rewind 10s before incident start
    const preRoll = Math.max(0, incident.feed_t_start_ms - 10000);
    setExternalSeekTime(preRoll);
    setTime(preRoll);
    openDrawer(incident.incident_id);
    logAlert(`Investigating: Severity ${incident.severity} at ${formatTime(incident.feed_t_start_ms)}`, incident.incident_id);
    setRightPanelTab('copilot');
  }, [setTime, openDrawer, logAlert]);

  // Handle confirm incident
  const handleConfirmIncident = useCallback((incidentId: string) => {
    // In real app, this would call API
    logDecision(`Confirmed as real incident`, incidentId, 'confirmed');
    // Move to next incident
    const currentIdx = incidents.findIndex(i => i.incident_id === incidentId);
    const nextIncident = incidents.find((i, idx) => idx > currentIdx && i.status === 'new');
    if (nextIncident) {
      handleIncidentClick(nextIncident);
    } else {
      closeDrawer();
    }
  }, [incidents, logDecision, handleIncidentClick, closeDrawer]);

  // Handle dismiss incident
  const handleDismissIncident = useCallback((incidentId: string) => {
    logDecision(`Dismissed as false alarm`, incidentId, 'false_alarm');
    // Move to next incident
    const currentIdx = incidents.findIndex(i => i.incident_id === incidentId);
    const nextIncident = incidents.find((i, idx) => idx > currentIdx && i.status === 'new');
    if (nextIncident) {
      handleIncidentClick(nextIncident);
    } else {
      closeDrawer();
    }
  }, [incidents, logDecision, handleIncidentClick, closeDrawer]);

  // Handle range selection on timeline
  const handleRangeSelect = useCallback((startMs: number, endMs: number) => {
    setSelectedRange({ start: startMs, end: endMs });
    logAction(`Selected range ${formatTime(startMs)} - ${formatTime(endMs)}`);
  }, [logAction]);

  // Handle create clip
  const handleCreateClip = useCallback((start: number, end: number) => {
    logClip(`Clip saved: ${formatTime(start)} - ${formatTime(end)}`, { start, end });
    // In real app, this would generate a shareable link
  }, [logClip]);

  // Handle export clip from incident card
  const handleExportClip = useCallback((incidentId: string) => {
    const incident = incidents.find(i => i.incident_id === incidentId);
    if (incident) {
      logClip(`Exported incident clip: ${formatTime(incident.feed_t_start_ms)} - ${formatTime(incident.feed_t_end_ms)}`, {
        start: incident.feed_t_start_ms,
        end: incident.feed_t_end_ms,
      });
    }
  }, [incidents, logClip]);

  // Handle jump to similar incident
  const handleJumpToSimilar = useCallback((targetFeedId: string, targetTimeMs: number, incidentId: string) => {
    if (targetFeedId === feedId) {
      // Same feed, just seek
      setExternalSeekTime(targetTimeMs);
      setTime(targetTimeMs);
      openDrawer(incidentId);
    } else {
      // Different feed, navigate
      navigateToFeed(targetFeedId, targetTimeMs, incidentId);
    }
    logAction(`Jumped to similar incident ${incidentId}`);
  }, [feedId, setTime, openDrawer, navigateToFeed, logAction]);

  // Handle camera select from CameraPanel
  const handleCameraSelect = useCallback(async (feed: MultiDatasetFeed | string) => {
    const feedObj = typeof feed === 'string'
      ? feedsList.find(f => f.feed_id === feed)
      : feed;

    if (!feedObj) return;

    setSelectedFeed(feedObj);
    logAction(`Switched to camera: ${feedObj.label}`);

    // Load the feed manifest from the correct dataset
    try {
      const manifest = await getFeed(feedObj.feed_id, feedObj.dataset);
      setLocalFeedManifest(manifest);
    } catch (err) {
      console.error('Failed to load feed manifest:', err);
    }
  }, [feedsList, logAction]);

  // Handle export shift log
  const handleExportLog = useCallback(() => {
    const logText = entries.map(e =>
      `${e.timestamp.toISOString()} [${e.type.toUpperCase()}] ${e.message}`
    ).join('\n');

    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shift-log-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [entries]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case 'n':
        case 'N':
          // Next incident
          const nextIncident = incidents.find(i => i.status === 'new');
          if (nextIncident) handleIncidentClick(nextIncident);
          break;
        case 'p':
        case 'P':
          // Previous incident
          if (currentIncident) {
            const idx = incidents.findIndex(i => i.incident_id === currentIncident.incident_id);
            if (idx > 0) handleIncidentClick(incidents[idx - 1]);
          }
          break;
        case 'c':
          if (!e.metaKey && !e.ctrlKey && currentIncident) {
            handleConfirmIncident(currentIncident.incident_id);
          }
          break;
        case 'f':
          if (!e.metaKey && !e.ctrlKey && currentIncident) {
            handleDismissIncident(currentIncident.incident_id);
          }
          break;
        case 'j':
        case 'J':
          handleSeekRelative(-5000);
          break;
        case 'l':
        case 'L':
          handleSeekRelative(5000);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [incidents, currentIncident, handleIncidentClick, handleConfirmIncident, handleDismissIncident, handleSeekRelative]);

  if (loading && !localFeedManifest) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-slate-700 border-t-red-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Main Three-Panel Layout */}
      <div className="flex-1 flex min-h-0">
        {/* Left Panel: Cameras / Alerts */}
        <div className="w-72 border-r border-slate-800 flex-shrink-0 flex flex-col">
          {/* Tab Switcher */}
          <div className="flex border-b border-slate-800">
            <button
              onClick={() => setLeftPanelView('alerts')}
              className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors ${
                leftPanelView === 'alerts'
                  ? 'text-white border-b-2 border-red-500 bg-slate-900/50'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Alerts
              {incidents.filter(i => i.status === 'new').length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 bg-red-500 text-white text-xs rounded-full">
                  {incidents.filter(i => i.status === 'new').length}
                </span>
              )}
            </button>
            <button
              onClick={() => setLeftPanelView('cameras')}
              className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors ${
                leftPanelView === 'cameras'
                  ? 'text-white border-b-2 border-blue-500 bg-slate-900/50'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Cameras
              <span className="ml-1.5 text-slate-500">({feedsList.length})</span>
            </button>
          </div>

          {/* Panel Content */}
          <div className="flex-1 overflow-hidden">
            {leftPanelView === 'alerts' ? (
              <AlertQueue
                incidents={allIncidents}
                currentIncidentId={drawerIncidentId}
                currentTimeMs={timeMs}
                onIncidentClick={handleIncidentClick}
                onConfirm={handleConfirmIncident}
                onDismiss={handleDismissIncident}
              />
            ) : (
              <CameraPanel
                feeds={feedsList}
                currentFeedId={selectedFeed?.feed_id || null}
                incidents={allIncidents}
                patrolMode={patrolMode}
                autoFollow={autoFollow}
                onSelectFeed={(id) => handleCameraSelect(id)}
                onTogglePatrol={() => setPatrolMode(!patrolMode)}
                onToggleAutoFollow={() => setAutoFollow(!autoFollow)}
              />
            )}
          </div>
        </div>

        {/* Center: Video + Timeline */}
        <div className="flex-1 flex flex-col min-w-0 bg-slate-900">
          {localFeedManifest ? (
            <>
              {/* Feed Header - Compact */}
              <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* Mode indicator */}
                  <div className={`flex items-center gap-1.5 px-2 py-1 rounded ${
                    patrolMode ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800'
                  }`}>
                    <div className={`w-2 h-2 rounded-full ${patrolMode ? 'bg-blue-500 animate-pulse' : 'bg-green-500'}`} />
                    <span className="text-xs font-medium">{patrolMode ? 'Patrol Mode' : 'Manual'}</span>
                  </div>
                  <h1 className="font-semibold">
                    {selectedFeed?.label || localFeedManifest.label}
                  </h1>
                </div>

                {/* Status badges */}
                <div className="flex items-center gap-3">
                  {currentWindow?.is_anomaly && (
                    <span className="px-2.5 py-1 bg-red-500/20 text-red-400 rounded text-xs font-medium animate-pulse">
                      Anomaly Active
                    </span>
                  )}
                  <span className="text-xs text-slate-400 font-mono">
                    {formatTime(timeMs)} / {formatTime(localFeedManifest.duration_ms)}
                  </span>
                </div>
              </div>

              {/* Video Player + Anomaly Meter */}
              <div className="flex-1 p-4 min-h-0 flex gap-4">
                {/* Video */}
                <div className="flex-1 h-full">
                  <FeedPlayer
                    feed={localFeedManifest}
                    initialFeedTime={externalSeekTime}
                    onFeedTimeUpdate={handleTimeUpdate}
                    onWindowChange={setCurrentWindow}
                    autoPlay={true}
                    showOverlay={true}
                    playbackRate={PLAYBACK_RATES[selectedFeed?.dataset || 'shanghaitech'] || 1.0}
                  />
                </div>

                {/* Anomaly Meter */}
                <div className="flex-shrink-0">
                  <AnomalyMeter
                    score={currentAnomalyScore}
                    thresholdWatch={0.03}
                    thresholdIncident={0.045}
                    maxScore={0.1}
                    size="lg"
                    showLabels={true}
                    vertical={true}
                    onAlertEnter={() => logAction('Alert threshold crossed')}
                  />
                </div>
              </div>

              {/* Timeline - Enhanced */}
              <div className="px-4 pb-4">
                <ContinuousTimeline
                  durationMs={localFeedManifest.duration_ms}
                  windows={localFeedManifest.windows}
                  incidents={allIncidents.filter(i => i.feed_id === selectedFeed?.feed_id)}
                  currentTimeMs={timeMs}
                  onSeek={handleSeek}
                  onIncidentClick={handleIncidentClick}
                  onRangeSelect={handleRangeSelect}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
              <svg className="w-16 h-16 mb-4 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <div className="font-medium">Select a feed to start patrol</div>
              <p className="text-sm text-slate-600 mt-1">Choose from the alert queue on the left</p>
            </div>
          )}
        </div>

        {/* Right Panel: Ops Copilot / Active Incident */}
        <div className="w-96 border-l border-slate-800 flex-shrink-0 flex flex-col">
          {/* Tab Switcher */}
          <div className="flex border-b border-slate-800">
            <button
              onClick={() => setRightPanelTab('copilot')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                rightPanelTab === 'copilot'
                  ? 'text-white border-b-2 border-blue-500 bg-slate-900/50'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Copilot
            </button>
            <button
              onClick={() => setRightPanelTab('explain')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors relative ${
                rightPanelTab === 'explain'
                  ? 'text-white border-b-2 border-red-500 bg-slate-900/50'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Incident
              {currentIncident && (
                <span className="ml-1.5 px-1.5 py-0.5 bg-red-500 text-white text-xs rounded-full">
                  Active
                </span>
              )}
            </button>
          </div>

          {/* Panel Content */}
          <div className="flex-1 overflow-hidden">
            {rightPanelTab === 'copilot' ? (
              <OpsCopilot
                currentTimeMs={timeMs}
                currentIncident={currentIncident}
                similarIncidents={currentIncidentDetail?.neighbors_anomaly || []}
                nearestNormal={currentIncident?.neighbors_normal || []}
                selectedRange={selectedRange}
                dataset={selectedFeed?.dataset || 'shanghaitech'}
                feedId={selectedFeed?.feed_id}
                onSeek={handleSeek}
                onSeekRelative={handleSeekRelative}
                onSetPlaybackRate={handleSetPlaybackRate}
                onOpenIncident={(id) => openDrawer(id)}
                onSearchSimilar={() => setRightPanelTab('explain')}
                onShowNearestNormal={() => setRightPanelTab('explain')}
                onConfirmIncident={handleConfirmIncident}
                onDismissIncident={handleDismissIncident}
                onCreateClip={handleCreateClip}
                onLogEntry={logQuestion}
              />
            ) : currentIncident ? (
              <ActiveIncidentCard
                incident={currentIncident}
                detail={currentIncidentDetail}
                onConfirm={handleConfirmIncident}
                onDismiss={handleDismissIncident}
                onJumpToTime={handleSeek}
                onJumpToSimilar={handleJumpToSimilar}
                onExportClip={handleExportClip}
              />
            ) : (
              <EvidencePanel
                incident={currentIncident}
                incidentDetail={currentIncidentDetail}
                onJumpToSimilar={handleJumpToSimilar}
              />
            )}
          </div>
        </div>
      </div>

      {/* Bottom: Shift Log */}
      <div className="shrink-0 border-t border-slate-800">
        <button
          onClick={() => setShowShiftLog(!showShiftLog)}
          className="w-full flex items-center justify-between px-4 py-1.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors"
        >
          <span className="font-medium">Shift Log</span>
          <svg className={`w-3.5 h-3.5 transition-transform ${showShiftLog ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </button>
        {showShiftLog && (
          <ShiftLog
            entries={entries}
            onClear={clearLog}
            onExport={handleExportLog}
          />
        )}
      </div>
    </div>
  );
}

// Evidence Panel - Shows similar incidents and nearest normal
function EvidencePanel({
  incident,
  incidentDetail,
  onJumpToSimilar,
}: {
  incident: Incident | null;
  incidentDetail: IncidentDetail | null;
  onJumpToSimilar: (feedId: string, timeMs: number, incidentId: string) => void;
}) {
  if (!incident) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-500 p-4">
        <svg className="w-12 h-12 mb-3 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <div className="font-medium text-center">No incident selected</div>
        <p className="text-xs text-slate-600 mt-1 text-center">Select an incident to view evidence</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      {/* Incident Summary */}
      <div className="p-4 border-b border-slate-800">
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-12 h-12 rounded-lg flex items-center justify-center font-mono font-bold text-xl ${
            incident.severity >= 70 ? 'bg-red-500/20 text-red-400' :
            incident.severity >= 40 ? 'bg-yellow-500/20 text-yellow-400' :
            'bg-green-500/20 text-green-400'
          }`}>
            {incident.severity}
          </div>
          <div>
            <div className="font-medium">{incident.label || 'Anomaly Detected'}</div>
            <div className="text-xs text-slate-400 font-mono">
              {formatTime(incident.feed_t_start_ms)} — {formatTime(incident.feed_t_end_ms)}
            </div>
          </div>
        </div>
      </div>

      {/* Similar Incidents */}
      <div className="p-4 border-b border-slate-800">
        <h3 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
          <span>Similar Incidents</span>
          <span className="text-xs text-slate-500">({incidentDetail?.neighbors_anomaly?.length || 0})</span>
        </h3>
        {incidentDetail?.neighbors_anomaly && incidentDetail.neighbors_anomaly.length > 0 ? (
          <div className="space-y-2">
            {incidentDetail.neighbors_anomaly.slice(0, 5).map((similar) => (
              <button
                key={similar.incident_id}
                onClick={() => onJumpToSimilar(similar.feed_id, similar.feed_t_start_ms, similar.incident_id)}
                className="w-full p-2 bg-slate-800/50 hover:bg-slate-800 rounded-lg text-left transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{similar.feed_label}</span>
                  <span className="text-xs text-slate-400">{Math.round(similar.similarity * 100)}% match</span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5 font-mono">
                  {formatTime(similar.feed_t_start_ms)} • Severity {similar.severity}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-sm text-slate-500 text-center py-4">
            No similar incidents found
          </div>
        )}
      </div>

      {/* Nearest Normal */}
      <div className="p-4">
        <h3 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
          <span>Normal Reference</span>
          <span className="text-xs text-slate-500">({incident.neighbors_normal?.length || 0})</span>
        </h3>
        {incident.neighbors_normal && incident.neighbors_normal.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {incident.neighbors_normal.slice(0, 6).map((normal, i) => (
              <div
                key={i}
                className="aspect-video bg-slate-800 rounded overflow-hidden relative group"
              >
                {normal.thumb_url ? (
                  <img src={normal.thumb_url} alt="Normal reference" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-600">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1">
                  <span className="text-xs text-slate-300">{Math.round(normal.similarity * 100)}%</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-slate-500 text-center py-4">
            No normal references available
          </div>
        )}
      </div>
    </div>
  );
}

// Format time helper
function formatTime(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

// Wrap with ShiftLogProvider
export default function FeedsPage() {
  return (
    <ShiftLogProvider>
      <FeedsPageContent />
    </ShiftLogProvider>
  );
}
