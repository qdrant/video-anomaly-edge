'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useApp } from '@/lib/AppContext';
import { Incident, IncidentDetail, FeedSummary, FeedManifest, DatasetId, DatasetInfo } from '@/lib/types';
import { getIncident, getIncidents, updateIncidentStatus, getFeeds, getFeed, getDatasets } from '@/lib/api';
import FeedPlayer, { FeedPlayerHandle } from '@/components/FeedPlayer';

// Zone descriptions
const ZONE_DESCRIPTIONS: Record<string, string> = {
  'Zone A': 'Front/central campus public area — open plazas and primary pedestrian circulation',
  'Zone B': 'Research + circulation spine — roadway edges and main pedestrian routes',
  'Zone C': 'West/services + admin/recreation — open plazas and perimeter paths',
};

// Map feeds to campus locations with descriptions
const CAMPUS_LOCATIONS: Record<string, { name: string; zone: string; description: string }> = {
  shanghaitech_scene_01: { name: 'Main Entrance', zone: 'Zone A', description: 'Paved forecourt, multiple approach lines' },
  shanghaitech_scene_02: { name: 'East Gate', zone: 'Zone A', description: 'Glass façade, sidewalk and curb lane' },
  shanghaitech_scene_03: { name: 'Library Plaza', zone: 'Zone A', description: 'Roadway with zebra crossing' },
  shanghaitech_scene_04: { name: 'Quad Walkway', zone: 'Zone A', description: 'Tiled courtyard, benches and trees' },
  shanghaitech_scene_05: { name: 'Research Building', zone: 'Zone B', description: 'Road edge, raised walkway with railings' },
  shanghaitech_scene_06: { name: 'Parking Lot', zone: 'Zone B', description: 'Building entrance and curb lane' },
  shanghaitech_scene_07: { name: 'North Path', zone: 'Zone B', description: 'Curving roadway with crosswalk' },
  shanghaitech_scene_08: { name: 'South Corridor', zone: 'Zone B', description: 'Busy pedestrian corridor' },
  shanghaitech_scene_09: { name: 'West Gate', zone: 'Zone C', description: 'Paved approach near building edge' },
  shanghaitech_scene_10: { name: 'Cafeteria Area', zone: 'Zone C', description: 'Open plaza with benches' },
  shanghaitech_scene_11: { name: 'Sports Field', zone: 'Zone C', description: 'Access path and road edge' },
  shanghaitech_scene_12: { name: 'Admin Building', zone: 'Zone C', description: 'Tiled plaza, trees and lamp post' },
  shanghaitech: { name: 'Campus', zone: 'Zone A', description: 'Full campus overview' },
};

// Extract dataset from feed_id (e.g., "avenue_master" -> "avenue")
function getDatasetFromFeedId(feedId: string): string {
  const parts = feedId.split('_');
  if (parts.length >= 2 && parts[parts.length - 1] === 'master') {
    return parts.slice(0, -1).join('_');
  }
  return parts[0];
}

// Playback speed multiplier to normalize perceived speed across datasets
const PLAYBACK_RATES: Record<string, number> = {
  shanghaitech: 1.0,
};

interface CameraFeed {
  dataset: DatasetId;
  location: string;
  zone: string;
  feedSummary: FeedSummary;
  manifest?: FeedManifest;
  startOffset?: number; // Start offset in ms (for clips that begin with anomaly)
}

// Start offsets for datasets that begin with abnormal behavior
const DATASET_START_OFFSETS: Record<string, number> = {
  // Add offsets here if needed
};

// Extended incident with dataset info for multi-dataset view
interface CampusIncident extends Incident {
  dataset: DatasetId;
}

export default function OverviewPage() {
  const playerRefs = useRef<Map<string, FeedPlayerHandle>>(new Map());
  const {
    runId,
    drawerIncidentId,
    loading,
    openDrawer,
    closeDrawer,
  } = useApp();

  const [selectedIncident, setSelectedIncident] = useState<IncidentDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [allCameras, setAllCameras] = useState<CameraFeed[]>([]);
  const [allIncidents, setAllIncidents] = useState<CampusIncident[]>([]);
  const [mainCameraKey, setMainCameraKey] = useState<string | null>(null);
  const [feedTimes, setFeedTimes] = useState<Map<string, number>>(new Map());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [hideReviewed, setHideReviewed] = useState(false);

  // Reset to grid view when Overview nav is clicked
  useEffect(() => {
    const handler = () => setMainCameraKey(null);
    window.addEventListener('reset-overview', handler);
    return () => window.removeEventListener('reset-overview', handler);
  }, []);

  // Load feeds and incidents from ShanghaiTech (all 12 scenes)
  useEffect(() => {
    async function loadAllDatasets() {
      try {
        const cameras: CameraFeed[] = [];
        const incidents: CampusIncident[] = [];

        // Load ShanghaiTech feeds (all scenes for camera grid)
        try {
          const feedsIndex = await getFeeds('shanghaitech' as DatasetId);
          // Get scene feeds (non-master)
          const sceneFeeds = feedsIndex.feeds.filter(f => !f.feed_id.includes('_master'));

          // Take all scene feeds
          for (const feed of sceneFeeds) {
            const campusLocation = CAMPUS_LOCATIONS[feed.feed_id] || { name: feed.label, zone: 'Zone X' };
            cameras.push({
              dataset: 'shanghaitech' as DatasetId,
              location: campusLocation.name,
              zone: campusLocation.zone,
              feedSummary: feed,
              startOffset: DATASET_START_OFFSETS[feed.feed_id] || 0,
            });
          }

          // Load incidents for shanghaitech
          const incidentsResponse = await getIncidents('shanghaitech' as DatasetId, { runId });
          const datasetIncidents = incidentsResponse.incidents.map(inc => ({
            ...inc,
            dataset: 'shanghaitech' as DatasetId,
          }));
          incidents.push(...datasetIncidents);
        } catch (err) {
          console.error('Failed to load ShanghaiTech data:', err);
        }

        setAllCameras(cameras);
        // Sort all incidents by severity (highest first)
        setAllIncidents(incidents.sort((a, b) => b.severity - a.severity));
      } catch (err) {
        console.error('Failed to load datasets:', err);
      }
    }
    loadAllDatasets();
  }, [runId]);

  // Load feed manifests for all cameras
  useEffect(() => {
    async function loadManifests() {
      const updatedCameras = await Promise.all(
        allCameras.map(async (cam) => {
          if (cam.manifest) return cam;
          try {
            const manifest = await getFeed(cam.feedSummary.feed_id, cam.dataset);
            return { ...cam, manifest };
          } catch (err) {
            console.error(`Failed to load manifest for ${cam.feedSummary.feed_id}:`, err);
            return cam;
          }
        })
      );

      if (updatedCameras.some((c, i) => c.manifest !== allCameras[i]?.manifest)) {
        setAllCameras(updatedCameras);
      }
    }

    if (allCameras.length > 0) {
      loadManifests();
    }
  }, [allCameras]);

  // Get incidents per feed for badges
  const incidentsByFeed = useMemo(() => {
    const map: Record<string, CampusIncident[]> = {};
    allIncidents.forEach(inc => {
      if (!map[inc.feed_id]) map[inc.feed_id] = [];
      map[inc.feed_id].push(inc);
    });
    return map;
  }, [allIncidents]);

  // Top incidents sorted by severity (already sorted in state)
  const topIncidents = useMemo(() =>
    hideReviewed
      ? allIncidents.filter(i => i.status === 'new' || i.status === 'investigating')
      : allIncidents,
    [allIncidents, hideReviewed]
  );

  const currentIncidentIndex = topIncidents.findIndex(i => i.incident_id === drawerIncidentId);

  // Find the selected incident from allIncidents to get its dataset
  const selectedCampusIncident = useMemo(() =>
    allIncidents.find(i => i.incident_id === drawerIncidentId),
    [allIncidents, drawerIncidentId]
  );

  // Load incident detail when drawerIncidentId changes
  useEffect(() => {
    if (!drawerIncidentId || !selectedCampusIncident) {
      setSelectedIncident(null);
      return;
    }

    async function loadIncident() {
      setLoadingDetail(true);
      try {
        const data = await getIncident(drawerIncidentId!, selectedCampusIncident!.dataset, runId);
        setSelectedIncident(data);
      } catch (err) {
        console.error('Failed to load incident:', err);
      } finally {
        setLoadingDetail(false);
      }
    }
    loadIncident();
  }, [drawerIncidentId, selectedCampusIncident, runId]);

  // Handle camera selection
  const handleCameraSelect = useCallback((cameraKey: string) => {
    setMainCameraKey(cameraKey);
  }, []);

  // Handle incident click
  const handleIncidentClick = useCallback((incident: CampusIncident) => {
    openDrawer(incident.incident_id);
    // Find camera for this feed using incident's dataset
    const cameraKey = `${incident.dataset}:${incident.feed_id}`;
    setMainCameraKey(cameraKey);

    setTimeout(() => {
      const playerRef = playerRefs.current.get(cameraKey);
      playerRef?.seekAndPlay(incident.feed_t_start_ms);
    }, 100);
  }, [openDrawer]);

  // Handle status update
  const handleStatusUpdate = async (status: 'confirmed' | 'false_alarm' | 'investigating') => {
    if (!selectedIncident || !selectedCampusIncident) return;
    try {
      await updateIncidentStatus(selectedIncident.incident_id, status, selectedCampusIncident.dataset, runId);
      setSelectedIncident({ ...selectedIncident, status });
      // Update in allIncidents too
      setAllIncidents(prev => prev.map(inc =>
        inc.incident_id === selectedIncident.incident_id
          ? { ...inc, status }
          : inc
      ));
      setTimeout(() => closeDrawer(), 500);
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  // Handle time update from a feed
  const handleFeedTimeUpdate = useCallback((cameraKey: string, timeMs: number) => {
    setFeedTimes(prev => new Map(prev).set(cameraKey, timeMs));
  }, []);

  // Format time as time of day (starting at 2:11 PM on Feb 16, 2026)
  const BASE_TIME = new Date('2026-02-16T14:11:00');
  const formatTime = (ms: number) => {
    const time = new Date(BASE_TIME.getTime() + ms);
    return time.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  // Set ref for a feed player
  const setPlayerRef = useCallback((cameraKey: string, ref: FeedPlayerHandle | null) => {
    if (ref) {
      playerRefs.current.set(cameraKey, ref);
    } else {
      playerRefs.current.delete(cameraKey);
    }
  }, []);

  if (loading && allCameras.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-slate-700 border-t-red-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col md:flex-row overflow-hidden">
      {/* Main Content - Camera Grid */}
      <div className="flex-1 flex flex-col min-w-0 p-4 gap-3 overflow-hidden">
        {mainCameraKey ? (
          <>
            {/* Focused View: Main Camera Large + Others Bottom */}
            {(() => {
              const mainCamera = allCameras.find(c => `${c.dataset}:${c.feedSummary.feed_id}` === mainCameraKey);
              // Show other cameras from the same zone
              const zoneCameras = allCameras.filter(c =>
                c.zone === mainCamera?.zone && `${c.dataset}:${c.feedSummary.feed_id}` !== mainCameraKey
              );
              const otherCameras = zoneCameras.length > 0 ? zoneCameras : allCameras.filter(c => `${c.dataset}:${c.feedSummary.feed_id}` !== mainCameraKey);

              return (
                <>
                  {/* Back bar */}
                  <div className="shrink-0 flex items-center gap-3 px-1 py-2">
                    <button
                      onClick={() => setMainCameraKey(null)}
                      className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-medium transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                      All Cameras
                    </button>
                    <span className="text-slate-600">|</span>
                    <span className="text-xs text-cyan-400 font-semibold uppercase tracking-wide">{mainCamera?.zone}</span>
                    <span className="text-sm font-medium text-white">{mainCamera?.location}</span>
                  </div>

                  {/* Main Camera - Large */}
                  <div className="flex-1 min-h-0 relative">
                    {mainCamera?.manifest ? (
                      <>
                        <FeedPlayer
                          ref={(ref) => setPlayerRef(`${mainCamera.dataset}:${mainCamera.feedSummary.feed_id}`, ref)}
                          feed={mainCamera.manifest}
                          initialFeedTime={feedTimes.get(`${mainCamera.dataset}:${mainCamera.feedSummary.feed_id}`) || mainCamera.startOffset || 0}
                          onFeedTimeUpdate={(t) => handleFeedTimeUpdate(`${mainCamera.dataset}:${mainCamera.feedSummary.feed_id}`, t)}
                          autoPlay={true}
                          showOverlay={true}
                          compact={true}
                          playbackRate={PLAYBACK_RATES[mainCamera.dataset] || 1.0}
                        />
                        {/* Feed time overlay */}
                        <div className="absolute bottom-16 left-4 bg-black/80 backdrop-blur-sm px-4 py-2.5 rounded-lg border border-slate-700/50">
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-red-400 font-medium">● LIVE</span>
                            <span className="text-slate-600">|</span>
                            <span className="text-sm font-mono text-slate-300">{formatTime(feedTimes.get(`${mainCamera.dataset}:${mainCamera.feedSummary.feed_id}`) || 0)}</span>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="h-full bg-slate-800 rounded-lg flex items-center justify-center">
                        <div className="w-8 h-8 border-2 border-slate-600 border-t-slate-400 rounded-full animate-spin" />
                      </div>
                    )}
                  </div>

                  {/* Secondary Cameras - Same Zone */}
                  <div className="shrink-0 grid grid-cols-2 md:grid-cols-3 gap-2 h-32 md:h-44">
                    {otherCameras.map((camera) => {
                      const cameraKey = `${camera.dataset}:${camera.feedSummary.feed_id}`;
                      const feedIncidents = incidentsByFeed[camera.feedSummary.feed_id] || [];

                      return (
                        <div
                          key={cameraKey}
                          onClick={() => handleCameraSelect(cameraKey)}
                          className="relative rounded-lg overflow-hidden bg-slate-800 ring-1 ring-slate-700 hover:ring-2 hover:ring-red-500 transition-all cursor-pointer"
                        >
                          {camera.manifest ? (
                            <FeedPlayer
                              ref={(ref) => setPlayerRef(cameraKey, ref)}
                              feed={camera.manifest}
                              initialFeedTime={feedTimes.get(cameraKey) || camera.startOffset || 0}
                              onFeedTimeUpdate={(t) => handleFeedTimeUpdate(cameraKey, t)}
                              autoPlay={true}
                              showOverlay={false}
                              compact={true}
                              playbackRate={PLAYBACK_RATES[camera.dataset] || 1.0}
                            />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="w-6 h-6 border-2 border-slate-600 border-t-slate-400 rounded-full animate-spin" />
                            </div>
                          )}

                          {/* Bottom gradient bar */}
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent pt-5 pb-1.5 px-2 pointer-events-none">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse shrink-0" />
                                <span className="text-xs text-cyan-400 font-semibold uppercase tracking-wide shrink-0">{camera.zone}</span>
                                <span className="text-xs text-slate-400 shrink-0">&middot;</span>
                                <span className="text-xs text-white font-medium truncate">{camera.location}</span>
                              </div>
                              {feedIncidents.length > 0 && (
                                <span className="ml-1 px-1.5 py-0.5 bg-red-500/90 rounded text-xs font-bold shrink-0">
                                  {feedIncidents.length}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </>
        ) : (
          /* Default Grid View */
          <div className="h-full grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 lg:grid-rows-3 gap-1">
            {allCameras.map((camera) => {
              const cameraKey = `${camera.dataset}:${camera.feedSummary.feed_id}`;
              const feedIncidents = incidentsByFeed[camera.feedSummary.feed_id] || [];

              return (
                <div
                  key={cameraKey}
                  onClick={() => handleCameraSelect(cameraKey)}
                  className="relative rounded-lg overflow-hidden bg-slate-800 hover:ring-2 hover:ring-red-500 transition-all cursor-pointer"
                >
                  {camera.manifest ? (
                    <FeedPlayer
                      ref={(ref) => setPlayerRef(cameraKey, ref)}
                      feed={camera.manifest}
                      initialFeedTime={feedTimes.get(cameraKey) || camera.startOffset || 0}
                      onFeedTimeUpdate={(t) => handleFeedTimeUpdate(cameraKey, t)}
                      autoPlay={true}
                      showOverlay={false}
                      compact={true}
                      playbackRate={PLAYBACK_RATES[camera.dataset] || 1.0}
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-6 h-6 border-2 border-slate-600 border-t-slate-400 rounded-full animate-spin" />
                    </div>
                  )}

                  {/* Bottom gradient bar */}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent pt-6 pb-2 px-2.5 pointer-events-none">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse shrink-0" />
                        <span className="text-xs text-cyan-400 font-semibold uppercase tracking-wide shrink-0">{camera.zone}</span>
                        <span className="text-xs text-slate-400 shrink-0">&middot;</span>
                        <span className="text-xs text-white font-medium truncate">{camera.location}</span>
                      </div>
                      {feedIncidents.length > 0 && (
                        <span className="ml-1.5 px-1.5 py-0.5 bg-red-500/90 rounded text-xs font-bold shrink-0">
                          {feedIncidents.length}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Right Rail: Top Incidents */}
      <div className={`${sidebarCollapsed ? 'w-12' : 'w-full md:w-80 lg:w-96'} border-l border-slate-800 flex flex-col bg-slate-950 transition-all duration-300 relative`}>
        {sidebarCollapsed ? (
          <div className="flex-1 flex flex-col items-center pt-4 pb-4 gap-2">
            <button
              onClick={() => setSidebarCollapsed(false)}
              className="w-7 h-7 bg-slate-800 border border-slate-700 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-all"
            >
              <svg className="w-4 h-4 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            {allIncidents.filter(i => i.status === 'new').length > 0 && (
              <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                {allIncidents.filter(i => i.status === 'new').length}
              </div>
            )}
          </div>
        ) : drawerIncidentId && selectedIncident ? (
          <>
            <div className="p-4 border-b border-slate-800">
              <div className="flex items-center justify-between">
                <button
                  onClick={closeDrawer}
                  className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Back
                </button>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500">
                    {currentIncidentIndex + 1} of {topIncidents.length}
                  </span>
                  <button
                    onClick={() => setSidebarCollapsed(true)}
                    className="w-7 h-7 bg-slate-800 border border-slate-700 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-all"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {loadingDetail ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-slate-700 border-t-red-500 rounded-full animate-spin" />
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                <div className="p-4 border-b border-slate-800">
                  <div className="flex items-center gap-4">
                    <div className={`w-16 h-16 rounded-xl flex flex-col items-center justify-center ${
                      selectedIncident.severity >= 70 ? 'bg-red-500/20' :
                      selectedIncident.severity >= 40 ? 'bg-yellow-500/20' :
                      'bg-green-500/20'
                    }`}>
                      <span className={`text-2xl font-mono font-bold ${
                        selectedIncident.severity >= 70 ? 'text-red-400' :
                        selectedIncident.severity >= 40 ? 'text-yellow-400' :
                        'text-green-400'
                      }`}>
                        {selectedIncident.severity}
                      </span>
                      <span className="text-xs text-slate-400 uppercase">Severity</span>
                    </div>
                    <div className="flex-1">
                      <div className="font-medium">{selectedIncident.label || 'Anomaly Detected'}</div>
                      <div className="text-sm text-slate-400">
                        {formatTime(selectedIncident.feed_t_start_ms)} - {formatTime(selectedIncident.feed_t_end_ms)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-4 space-y-3 text-sm">
                  {selectedIncident.label && (
                    <p className="text-slate-300 text-sm leading-relaxed">
                      {selectedIncident.label}
                    </p>
                  )}
                  {(() => {
                    const loc = CAMPUS_LOCATIONS[selectedIncident.feed_id] || CAMPUS_LOCATIONS[getDatasetFromFeedId(selectedIncident.feed_id)];
                    return loc?.description ? (
                      <p className="text-slate-500 text-xs leading-relaxed italic">
                        {loc.description}
                      </p>
                    ) : null;
                  })()}
                  <div className="flex justify-between">
                    <span className="text-slate-400">Location</span>
                    <span className="text-white">{CAMPUS_LOCATIONS[selectedIncident.feed_id]?.name || CAMPUS_LOCATIONS[getDatasetFromFeedId(selectedIncident.feed_id)]?.name || selectedIncident.feed_label}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Zone</span>
                    <span className="text-white">{CAMPUS_LOCATIONS[selectedIncident.feed_id]?.zone || CAMPUS_LOCATIONS[getDatasetFromFeedId(selectedIncident.feed_id)]?.zone || 'Unknown'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Duration</span>
                    <span className="text-white font-mono">
                      {((selectedIncident.feed_t_end_ms - selectedIncident.feed_t_start_ms) / 1000).toFixed(1)}s
                    </span>
                  </div>
                </div>
              </div>
            )}

            {(selectedIncident.status === 'new' || selectedIncident.status === 'investigating') && (
              <div className="p-4 border-t border-slate-800 space-y-2">
                <button
                  onClick={() => handleStatusUpdate('confirmed')}
                  className="w-full py-2.5 bg-red-500 hover:bg-red-600 rounded-lg font-medium transition-colors text-sm"
                >
                  Escalate
                </button>
                {selectedIncident.status === 'new' && (
                  <button
                    onClick={() => handleStatusUpdate('investigating')}
                    className="w-full py-2.5 bg-yellow-600 hover:bg-yellow-500 rounded-lg font-medium transition-colors text-sm"
                  >
                    Needs Investigation
                  </button>
                )}
                <button
                  onClick={() => handleStatusUpdate('false_alarm')}
                  className="w-full py-2.5 bg-slate-700 hover:bg-slate-600 rounded-lg font-medium transition-colors text-sm"
                >
                  Dismiss
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="p-4 border-b border-slate-800">
              <div className="flex items-center justify-between">
                <h2 className="font-bold">Campus Alerts</h2>
                <div className="flex items-center gap-2">
                  {allIncidents.filter(i => i.status === 'new').length > 0 && (
                    <span className="px-2 py-0.5 bg-red-500 text-white text-xs font-bold rounded-full">
                      {allIncidents.filter(i => i.status === 'new').length} new
                    </span>
                  )}
                  <button
                    onClick={() => setSidebarCollapsed(true)}
                    className="w-7 h-7 bg-slate-800 border border-slate-700 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-all"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {allCameras.length} cameras &middot; {new Set(allCameras.map(c => c.zone)).size} zones &middot; {allIncidents.length} alerts
              </p>
              <label className="flex items-center gap-2 mt-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hideReviewed}
                  onChange={(e) => setHideReviewed(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-800 text-red-500 focus:ring-red-500"
                />
                <span className="text-xs text-slate-400">Hide reviewed</span>
              </label>
            </div>

            <div className="flex-1 overflow-y-auto">
              {topIncidents.length > 0 ? (
                <div className="divide-y divide-slate-800">
                  {topIncidents.map((incident, i) => {
                    const location = CAMPUS_LOCATIONS[incident.feed_id] || CAMPUS_LOCATIONS[getDatasetFromFeedId(incident.feed_id)];
                    return (
                      <div
                        key={incident.incident_id}
                        className={`p-3 transition-colors cursor-pointer border-l-4 ${
                          incident.status === 'confirmed' ? 'border-l-red-500 bg-red-950/60 hover:bg-red-950/80' :
                          incident.status === 'false_alarm' ? 'border-l-green-500 bg-green-950/60 hover:bg-green-950/80' :
                          incident.status === 'investigating' ? 'border-l-yellow-500 bg-yellow-950/60 hover:bg-yellow-950/80' :
                          'border-l-orange-500 bg-slate-900 hover:bg-slate-800'
                        } ${incident.incident_id === drawerIncidentId ? '!bg-slate-800' : ''}`}
                        onClick={() => handleIncidentClick(incident)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-xs font-mono">
                            {i + 1}
                          </div>
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-mono font-bold text-sm ${
                            incident.severity >= 70 ? 'bg-red-500/20 text-red-400' :
                            incident.severity >= 40 ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-green-500/20 text-green-400'
                          }`}>
                            {incident.severity}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">
                              {incident.label || location?.name || incident.feed_id}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-slate-400 truncate">
                                {location?.name} &middot; {location?.zone}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              {incident.status !== 'new' && (
                                <span className={`px-1.5 py-0.5 text-xs rounded font-medium ${
                                  incident.status === 'confirmed' ? 'bg-red-500/20 text-red-400' :
                                  incident.status === 'false_alarm' ? 'bg-green-500/20 text-green-400' :
                                  incident.status === 'investigating' ? 'bg-yellow-500/20 text-yellow-400' :
                                  ''
                                }`}>
                                  {incident.status === 'confirmed' ? 'Escalated' :
                                   incident.status === 'false_alarm' ? 'False Alarm' :
                                   incident.status === 'investigating' ? 'Needs Investigation' : ''}
                                </span>
                              )}
                              {incident.anomaly_type && (
                                <span className="px-1.5 py-0.5 bg-slate-700 text-slate-300 text-xs rounded capitalize">
                                  {incident.anomaly_type.replace('_', ' ')}
                                </span>
                              )}
                              <span className="text-xs text-slate-500 font-mono">
                                {formatTime(incident.feed_t_start_ms)} &middot; {Math.round(incident.duration_ms / 1000)}s
                              </span>
                            </div>
                            {location?.description && (
                              <div className="text-xs text-slate-600 mt-0.5 truncate">{location.description}</div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-4 text-center text-slate-500">
                  No incidents detected
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
