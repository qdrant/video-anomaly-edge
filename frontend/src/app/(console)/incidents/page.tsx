'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { getIncidents, getFeeds, updateIncidentStatus, getDatasets } from '@/lib/api';
import { Incident, FeedSummary, DatasetId } from '@/lib/types';
import { useApp } from '@/lib/AppContext';
import VideoModal from '@/components/VideoModal';
import { AnomalyTypeBadge, ScoringMethodBadge, ConfidenceBadge } from '@/components/HybridScoringUI';

// Extended incident with dataset info
interface IncidentWithDataset extends Incident {
  dataset_id: DatasetId;
}

const FEED_LOCATIONS: Record<string, { name: string; zone: string }> = {
  shanghaitech_scene_01: { name: 'Main Entrance', zone: 'Zone A' },
  shanghaitech_scene_02: { name: 'East Gate', zone: 'Zone A' },
  shanghaitech_scene_03: { name: 'Library Plaza', zone: 'Zone A' },
  shanghaitech_scene_04: { name: 'Quad Walkway', zone: 'Zone A' },
  shanghaitech_scene_05: { name: 'Research Building', zone: 'Zone B' },
  shanghaitech_scene_06: { name: 'Parking Lot', zone: 'Zone B' },
  shanghaitech_scene_07: { name: 'North Path', zone: 'Zone B' },
  shanghaitech_scene_08: { name: 'South Corridor', zone: 'Zone B' },
  shanghaitech_scene_09: { name: 'West Gate', zone: 'Zone C' },
  shanghaitech_scene_10: { name: 'Cafeteria Area', zone: 'Zone C' },
  shanghaitech_scene_11: { name: 'Sports Field', zone: 'Zone C' },
  shanghaitech_scene_12: { name: 'Admin Building', zone: 'Zone C' },
};

const getZoneForFeed = (feedId: string): string => FEED_LOCATIONS[feedId]?.zone || 'Unknown';
const getSceneForFeed = (feedId: string): string => FEED_LOCATIONS[feedId]?.name || feedId;

type SortField = 'severity' | 'time' | 'feed' | 'duration' | 'type';
type SortDir = 'asc' | 'desc';
type StatusFilter = 'all' | 'new' | 'confirmed' | 'false_alarm' | 'investigating';

export default function IncidentsPage() {
  const { dataset, runId } = useApp();

  const [incidents, setIncidents] = useState<IncidentWithDataset[]>([]);
  const [feeds, setFeeds] = useState<FeedSummary[]>([]);
  const [selectedRunId] = useState(runId);
  const [loading, setLoading] = useState(true);
  const [feedDatasetMap, setFeedDatasetMap] = useState<Record<string, DatasetId>>({});
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [videoIncident, setVideoIncident] = useState<IncidentWithDataset | null>(null);

  const [filters, setFilters] = useState({
    zone: 'all',
    scene: 'all',
    status: 'all' as StatusFilter,
    anomalyType: 'all',
    timeRange: 'all' as string,
    hideReviewed: false,
  });

  const [sortBy, setSortBy] = useState<SortField>('severity');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const datasets = await getDatasets();
        const availableDatasets = datasets.filter(d => d.available);

        const allIncidents: IncidentWithDataset[] = [];
        const allFeeds: FeedSummary[] = [];
        const feedMap: Record<string, DatasetId> = {};

        await Promise.all(
          availableDatasets.map(async (ds) => {
            try {
              const [incidentsRes, feedsRes] = await Promise.all([
                getIncidents(ds.id as DatasetId, { runId: selectedRunId }),
                getFeeds(ds.id as DatasetId),
              ]);
              incidentsRes.incidents.forEach(inc => {
                allIncidents.push({ ...inc, dataset_id: ds.id as DatasetId });
              });
              feedsRes.feeds.forEach(feed => {
                allFeeds.push(feed);
                feedMap[feed.feed_id] = ds.id as DatasetId;
              });
            } catch (err) {
              console.error(`Failed to load data for ${ds.id}:`, err);
            }
          })
        );

        setIncidents(allIncidents);
        setFeeds(allFeeds);
        setFeedDatasetMap(feedMap);
      } catch (err) {
        console.error('Failed to load incidents:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [dataset, selectedRunId]);

  const getFeedLabel = useCallback((feedId: string) => {
    const feed = feeds.find(f => f.feed_id === feedId);
    return feed?.label?.replace(' - All Clips', ' \u2014 Master Feed') || feedId;
  }, [feeds]);

  const filteredIncidents = useMemo(() => {
    return incidents
      .filter(i => {
        if (filters.zone !== 'all' && getZoneForFeed(i.feed_id) !== filters.zone) return false;
        if (filters.scene !== 'all' && i.feed_id !== filters.scene) return false;
        if (filters.status !== 'all' && i.status !== filters.status) return false;
        if (filters.hideReviewed && (i.status === 'confirmed' || i.status === 'false_alarm')) return false;
        if (filters.anomalyType !== 'all' && (i.anomaly_type || 'unknown') !== filters.anomalyType) return false;
        if (filters.timeRange !== 'all') {
          const [minMs, maxMs] = filters.timeRange.split('-').map(Number);
          if (i.feed_t_start_ms < minMs || i.feed_t_start_ms >= maxMs) return false;
        }
        return true;
      })
      .sort((a, b) => {
        let cmp = 0;
        if (sortBy === 'severity') cmp = a.severity - b.severity;
        else if (sortBy === 'time') cmp = a.feed_t_start_ms - b.feed_t_start_ms;
        else if (sortBy === 'feed') cmp = a.feed_id.localeCompare(b.feed_id);
        else if (sortBy === 'duration') cmp = a.duration_ms - b.duration_ms;
        else if (sortBy === 'type') cmp = (a.anomaly_type || '').localeCompare(b.anomaly_type || '');
        return sortDir === 'desc' ? -cmp : cmp;
      });
  }, [incidents, filters, sortBy, sortDir]);

  const handleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredIncidents.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredIncidents.map(i => i.incident_id)));
    }
  };

  const handleBatchAction = async (action: 'confirmed' | 'false_alarm' | 'investigating') => {
    for (const id of selectedIds) {
      const incident = incidents.find(i => i.incident_id === id);
      if (!incident) continue;
      try {
        await updateIncidentStatus(id, action, incident.dataset_id, selectedRunId);
      } catch (err) {
        console.error(`Failed to update ${id}:`, err);
      }
    }
    setIncidents(prev => prev.map(inc =>
      selectedIds.has(inc.incident_id) ? { ...inc, status: action } : inc
    ));
    setSelectedIds(new Set());
  };

  const handleJumpToFeed = useCallback((incident: IncidentWithDataset) => {
    setVideoIncident(incident);
  }, []);

  const handleVideoConfirm = useCallback(async () => {
    if (!videoIncident) return;
    try {
      await updateIncidentStatus(videoIncident.incident_id, 'confirmed', videoIncident.dataset_id, selectedRunId);
      setIncidents(prev => prev.map(i =>
        i.incident_id === videoIncident.incident_id ? { ...i, status: 'confirmed' } : i
      ));
    } catch (err) { console.error('Failed to confirm:', err); }
    setVideoIncident(null);
  }, [videoIncident, selectedRunId]);

  const handleVideoDismiss = useCallback(async () => {
    if (!videoIncident) return;
    try {
      await updateIncidentStatus(videoIncident.incident_id, 'false_alarm', videoIncident.dataset_id, selectedRunId);
      setIncidents(prev => prev.map(i =>
        i.incident_id === videoIncident.incident_id ? { ...i, status: 'false_alarm' } : i
      ));
    } catch (err) { console.error('Failed to dismiss:', err); }
    setVideoIncident(null);
  }, [videoIncident, selectedRunId]);

  const handleVideoInvestigate = useCallback(async () => {
    if (!videoIncident) return;
    try {
      await updateIncidentStatus(videoIncident.incident_id, 'investigating', videoIncident.dataset_id, selectedRunId);
      setIncidents(prev => prev.map(i =>
        i.incident_id === videoIncident.incident_id ? { ...i, status: 'investigating' } : i
      ));
    } catch (err) { console.error('Failed to mark investigating:', err); }
    setVideoIncident(null);
  }, [videoIncident, selectedRunId]);

  const stats = useMemo(() => {
    const total = incidents.length;
    const newCount = incidents.filter(i => i.status === 'new').length;
    const investigating = incidents.filter(i => i.status === 'investigating').length;
    const confirmed = incidents.filter(i => i.status === 'confirmed').length;
    const falseAlarms = incidents.filter(i => i.status === 'false_alarm').length;
    const avgSeverity = total > 0 ? Math.round(incidents.reduce((a, i) => a + i.severity, 0) / total) : 0;
    const byType: Record<string, number> = {};
    incidents.forEach(i => {
      const type = i.anomaly_type || 'unknown';
      byType[type] = (byType[type] || 0) + 1;
    });
    return { total, newCount, investigating, confirmed, falseAlarms, avgSeverity, byType };
  }, [incidents]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-slate-700 border-t-red-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col md:flex-row">
      {/* Filters sidebar */}
      <div className="hidden md:flex w-64 border-r border-slate-800 p-4 flex-col bg-slate-950">
        <h2 className="font-bold text-lg mb-4">Triage Queue</h2>

        <div className="mb-4">
          <label className="text-xs text-slate-500 block mb-2">Zone</label>
          <select value={filters.zone} onChange={(e) => setFilters(f => ({ ...f, zone: e.target.value, scene: 'all' }))} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm">
            <option value="all">All Zones</option>
            {Array.from(new Set(incidents.map(i => getZoneForFeed(i.feed_id)))).sort().map(zone => (
              <option key={zone} value={zone}>{zone} ({incidents.filter(i => getZoneForFeed(i.feed_id) === zone).length})</option>
            ))}
          </select>
        </div>

        <div className="mb-4">
          <label className="text-xs text-slate-500 block mb-2">Scene</label>
          <select value={filters.scene} onChange={(e) => setFilters(f => ({ ...f, scene: e.target.value }))} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm">
            <option value="all">All Scenes</option>
            {Array.from(new Set(incidents.filter(i => filters.zone === 'all' || getZoneForFeed(i.feed_id) === filters.zone).map(i => i.feed_id))).sort().map(feedId => (
              <option key={feedId} value={feedId}>{getSceneForFeed(feedId)} ({incidents.filter(i => i.feed_id === feedId).length})</option>
            ))}
          </select>
        </div>

        <div className="mb-4">
          <label className="text-xs text-slate-500 block mb-2">Status</label>
          <div className="space-y-1">
            {[
              { value: 'all', label: 'All', count: stats.total },
              { value: 'new', label: 'Needs Review', count: stats.newCount, color: 'orange' },
              { value: 'investigating', label: 'Needs Investigation', count: stats.investigating, color: 'yellow' },
              { value: 'confirmed', label: 'Escalated', count: stats.confirmed, color: 'red' },
              { value: 'false_alarm', label: 'False Alarm', count: stats.falseAlarms, color: 'green' },
            ].map(option => (
              <button
                key={option.value}
                onClick={() => setFilters(f => ({ ...f, status: option.value as StatusFilter }))}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                  filters.status === option.value ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <span>{option.label}</span>
                <span className={`px-1.5 py-0.5 rounded text-xs font-mono ${
                  option.color === 'orange' ? 'bg-orange-500/20 text-orange-400' :
                  option.color === 'yellow' ? 'bg-yellow-500/20 text-yellow-400' :
                  option.color === 'red' ? 'bg-red-500/20 text-red-400' :
                  option.color === 'green' ? 'bg-green-500/20 text-green-400' :
                  'bg-slate-700 text-slate-300'
                }`}>{option.count}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <label className="text-xs text-slate-500 block mb-2">Anomaly Type</label>
          <select value={filters.anomalyType} onChange={(e) => setFilters(f => ({ ...f, anomalyType: e.target.value }))} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm">
            <option value="all">All Types</option>
            {Object.entries(stats.byType).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
              <option key={type} value={type}>{type.replace('_', ' ')} ({count})</option>
            ))}
          </select>
        </div>

        <div className="flex-1" />

        <div className="p-3 bg-slate-800/50 rounded-lg space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-400">Avg Severity</span>
            <span className={`font-mono font-bold ${stats.avgSeverity >= 70 ? 'text-red-400' : stats.avgSeverity >= 40 ? 'text-yellow-400' : 'text-green-400'}`}>{stats.avgSeverity}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Showing</span>
            <span className="font-mono">{filteredIncidents.length} of {stats.total}</span>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col bg-slate-900">
        <div className="px-4 md:px-6 py-3 md:py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold">Incidents</h1>
            {stats.newCount > 0 && (
              <span className="px-2.5 py-1 bg-yellow-500/20 text-yellow-400 rounded-full text-sm font-medium">
                {stats.newCount} need review
              </span>
            )}
            <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
              <input type="checkbox" checked={filters.hideReviewed} onChange={(e) => setFilters(f => ({ ...f, hideReviewed: e.target.checked }))} className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-800 text-red-500 focus:ring-red-500" />
              Hide reviewed
            </label>
          </div>

          <div className="flex items-center gap-3">
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2 mr-2 px-3 py-1.5 bg-slate-800 rounded-lg">
                <span className="text-sm text-slate-400">{selectedIds.size} selected</span>
                <button onClick={() => handleBatchAction('confirmed')} className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white rounded text-sm transition-colors">Escalate</button>
                <button onClick={() => handleBatchAction('investigating')} className="px-3 py-1 bg-yellow-600 hover:bg-yellow-500 text-white rounded text-sm transition-colors">Needs Investigation</button>
                <button onClick={() => handleBatchAction('false_alarm')} className="px-3 py-1 bg-slate-600 hover:bg-slate-500 text-white rounded text-sm transition-colors">Dismiss</button>
                <button onClick={() => setSelectedIds(new Set())} className="p-1 hover:bg-slate-700 rounded transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            )}
            <select value={`${sortBy}-${sortDir}`} onChange={(e) => { const [by, dir] = e.target.value.split('-') as [SortField, SortDir]; setSortBy(by); setSortDir(dir); }} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm">
              <option value="severity-desc">Severity (High first)</option>
              <option value="severity-asc">Severity (Low first)</option>
              <option value="type-asc">Detection type (A-Z)</option>
              <option value="time-desc">Most recent</option>
              <option value="time-asc">Oldest first</option>
              <option value="duration-desc">Longest duration</option>
            </select>
            <div className="flex bg-slate-800 rounded-lg p-1">
              <button onClick={() => setViewMode('table')} className={`p-1.5 rounded transition-colors ${viewMode === 'table' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
              </button>
              <button onClick={() => setViewMode('cards')} className={`p-1.5 rounded transition-colors ${viewMode === 'cards' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-auto">
          {filteredIncidents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500">
              <svg className="w-16 h-16 mb-4 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <div className="text-lg font-medium">No incidents found</div>
              <p className="text-sm mt-1">Try adjusting your filters</p>
            </div>
          ) : viewMode === 'table' ? (
            <table className="w-full">
              <thead className="sticky top-0 bg-slate-900 z-10">
                <tr className="text-left text-xs text-slate-500 uppercase tracking-wider border-b border-slate-800">
                  <th className="py-3 px-6 w-10"><input type="checkbox" checked={selectedIds.size === filteredIncidents.length && filteredIncidents.length > 0} onChange={handleSelectAll} className="rounded bg-slate-800 border-slate-600" /></th>
                  <th className="py-3 px-2">Severity</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Feed</th>
                  <th className="py-3 px-4">Time</th>
                  <th className="py-3 px-4">Duration</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredIncidents.map((incident) => (
                  <tr key={incident.incident_id} className={`border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors cursor-pointer border-l-4 ${
                    incident.status === 'confirmed' ? 'border-l-red-700 bg-red-950/20' :
                    incident.status === 'false_alarm' ? 'border-l-green-700 bg-green-950/20' :
                    incident.status === 'investigating' ? 'border-l-yellow-700 bg-yellow-950/20' :
                    'border-l-transparent'
                  } ${selectedIds.has(incident.incident_id) ? 'ring-1 ring-inset ring-slate-600' : ''}`} onClick={() => handleJumpToFeed(incident)}>
                    <td className="py-3 px-6"><input type="checkbox" checked={selectedIds.has(incident.incident_id)} onChange={(e) => { e.stopPropagation(); handleSelect(incident.incident_id); }} onClick={(e) => e.stopPropagation()} className="rounded bg-slate-800 border-slate-600" /></td>
                    <td className="py-3 px-2"><span className={`inline-flex items-center justify-center w-10 h-8 rounded font-mono font-bold text-sm ${incident.severity >= 70 ? 'bg-red-500/20 text-red-400' : incident.severity >= 40 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400'}`}>{incident.severity}</span></td>
                    <td className="py-3 px-4">
                      <div className="flex flex-col gap-1">
                        {incident.anomaly_type && <AnomalyTypeBadge type={incident.anomaly_type} size="xs" />}
                        {incident.scoring_method && incident.scoring_method !== 'visual' && <ScoringMethodBadge method={incident.scoring_method} />}
                        {!incident.anomaly_type && !incident.scoring_method && <span className="text-xs text-slate-500">-</span>}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-sm">{getFeedLabel(incident.feed_id)}</div>
                      {incident.label && <div className="text-xs text-slate-500 truncate max-w-[200px]">{incident.label}</div>}
                    </td>
                    <td className="py-3 px-4 font-mono text-sm text-slate-400">{formatTime(incident.feed_t_start_ms)}</td>
                    <td className="py-3 px-4 text-sm text-slate-400">{formatDuration(incident.duration_ms)}</td>
                    <td className="py-3 px-4"><StatusBadge status={incident.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 p-6">
              {filteredIncidents.map((incident) => (
                <div key={incident.incident_id} className="rounded-xl overflow-hidden border border-slate-800 hover:border-slate-600 transition-all cursor-pointer" onClick={() => handleJumpToFeed(incident)}>
                  <div className="p-3 bg-slate-900">
                    <div className="flex items-center gap-3">
                      <span className={`inline-flex items-center justify-center w-10 h-8 rounded font-mono font-bold text-sm ${incident.severity >= 70 ? 'bg-red-500/20 text-red-400' : incident.severity >= 40 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400'}`}>{incident.severity}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{getFeedLabel(incident.feed_id)}</div>
                        {incident.label && <div className="text-xs text-slate-400 mt-0.5 truncate">{incident.label}</div>}
                      </div>
                      <StatusBadge status={incident.status} />
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-slate-500">{formatDuration(incident.duration_ms)}</span>
                      <span className="text-xs text-slate-500 font-mono">{formatTime(incident.feed_t_start_ms)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {videoIncident && (
        <VideoModal
          incident={videoIncident}
          feedLabel={getFeedLabel(videoIncident.feed_id)}
          runId={selectedRunId}
          onClose={() => setVideoIncident(null)}
          onConfirm={handleVideoConfirm}
          onDismiss={handleVideoDismiss}
          onInvestigate={handleVideoInvestigate}
        />
      )}
    </div>
  );
}

function StatusBadge({ status, className = '' }: { status: Incident['status']; className?: string }) {
  const styles: Record<string, string> = { new: 'bg-orange-500/20 text-orange-400', investigating: 'bg-yellow-500/20 text-yellow-400', confirmed: 'bg-red-500/20 text-red-400', false_alarm: 'bg-green-500/20 text-green-400' };
  const labels: Record<string, string> = { new: 'New', investigating: 'Needs Investigation', confirmed: 'Escalated', false_alarm: 'False Alarm' };
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${styles[status] || styles.new} ${className}`}>{labels[status] || status}</span>;
}

const FORMAT_BASE_TIME = new Date('2026-02-16T14:11:00');
function formatTime(ms: number): string {
  const time = new Date(FORMAT_BASE_TIME.getTime() + ms);
  return time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}
