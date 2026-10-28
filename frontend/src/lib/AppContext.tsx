'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { DatasetId, DatasetInfo, Run, FeedManifest, Incident } from './types';
import { getDatasets, getRuns, getFeed, getIncidents } from './api';

interface AppState {
  dataset: DatasetId;
  runId: string;
  feedId: string | null;
  timeMs: number;
  datasets: DatasetInfo[];
  runs: Run[];
  currentFeed: FeedManifest | null;
  incidents: Incident[];
  drawerIncidentId: string | null;
  loading: boolean;
}

interface AppContextType extends AppState {
  setDataset: (dataset: DatasetId) => void;
  setRun: (runId: string) => void;
  setFeed: (feedId: string) => void;
  setTime: (timeMs: number) => void;
  openDrawer: (incidentId: string) => void;
  closeDrawer: () => void;
  navigateToFeed: (feedId: string, timeMs?: number, incidentId?: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [dataset, setDatasetState] = useState<DatasetId>('shanghaitech' as DatasetId);
  const [runId, setRunIdState] = useState('baseline');
  const [feedId, setFeedIdState] = useState<string | null>(null);
  const [timeMs, setTimeMsState] = useState(0);
  const [drawerIncidentId, setDrawerIncidentId] = useState<string | null>(null);

  const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [currentFeed, setCurrentFeed] = useState<FeedManifest | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const urlDataset = searchParams.get('dataset') as DatasetId | null;
    const urlRun = searchParams.get('run');
    const urlFeed = searchParams.get('feed');
    const urlTime = searchParams.get('t');
    const urlIncident = searchParams.get('incident');

    if (urlDataset) setDatasetState(urlDataset);
    if (urlRun) setRunIdState(urlRun);
    if (urlFeed) setFeedIdState(urlFeed);
    if (urlTime) setTimeMsState(parseInt(urlTime) * 1000);
    if (urlIncident) setDrawerIncidentId(urlIncident);
  }, []);

  const updateURL = useCallback((updates: {
    dataset?: DatasetId;
    run?: string;
    feed?: string | null;
    time?: number;
    incident?: string | null;
  }) => {
    const params = new URLSearchParams(searchParams.toString());

    if (updates.dataset !== undefined) {
      params.set('dataset', updates.dataset);
    }
    if (updates.run !== undefined) {
      params.set('run', updates.run);
    }
    if (updates.feed !== undefined) {
      if (updates.feed) params.set('feed', updates.feed);
      else params.delete('feed');
    }
    if (updates.time !== undefined) {
      params.set('t', Math.round(updates.time / 1000).toString());
    }
    if (updates.incident !== undefined) {
      if (updates.incident) params.set('incident', updates.incident);
      else params.delete('incident');
    }

    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [pathname, router, searchParams]);

  useEffect(() => {
    async function loadDatasets() {
      try {
        const data = await getDatasets();
        setDatasets(data);
      } catch (err) {
        console.error('Failed to load datasets:', err);
      }
    }
    loadDatasets();
  }, []);

  useEffect(() => {
    async function loadRuns() {
      try {
        const data = await getRuns(dataset);
        setRuns(data.runs);
        if (!data.runs.find(r => r.run_id === runId)) {
          const defaultRun = data.runs.find(r => r.is_default) || data.runs[0];
          if (defaultRun) setRunIdState(defaultRun.run_id);
        }
      } catch (err) {
        console.error('Failed to load runs:', err);
        setRuns([]);
      }
    }
    loadRuns();
  }, [dataset]);

  useEffect(() => {
    async function loadFeed() {
      if (!feedId) {
        setCurrentFeed(null);
        setIncidents([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const [feed, incidentsRes] = await Promise.all([
          getFeed(feedId, dataset),
          getIncidents(dataset, { feedId, runId }),
        ]);
        setCurrentFeed(feed);
        setIncidents(incidentsRes.incidents);
      } catch (err) {
        console.error('Failed to load feed:', err);
        setCurrentFeed(null);
        setIncidents([]);
      } finally {
        setLoading(false);
      }
    }
    loadFeed();
  }, [feedId, dataset, runId]);

  useEffect(() => {
    if (!feedId && dataset) {
      setFeedIdState(`${dataset}_master`);
    }
  }, [dataset, feedId]);

  const setDataset = useCallback((newDataset: DatasetId) => {
    setDatasetState(newDataset);
    setFeedIdState(`${newDataset}_master`);
    setTimeMsState(0);
    setDrawerIncidentId(null);
    updateURL({ dataset: newDataset, feed: `${newDataset}_master`, time: 0, incident: null });
  }, [updateURL]);

  const setRun = useCallback((newRunId: string) => {
    setRunIdState(newRunId);
    updateURL({ run: newRunId });
  }, [updateURL]);

  const setFeed = useCallback((newFeedId: string) => {
    setFeedIdState(newFeedId);
    setTimeMsState(0);
    updateURL({ feed: newFeedId, time: 0 });
  }, [updateURL]);

  const setTime = useCallback((newTimeMs: number) => {
    setTimeMsState(newTimeMs);
  }, []);

  const openDrawer = useCallback((incidentId: string) => {
    setDrawerIncidentId(incidentId);
    updateURL({ incident: incidentId });
  }, [updateURL]);

  const closeDrawer = useCallback(() => {
    setDrawerIncidentId(null);
    updateURL({ incident: null });
  }, [updateURL]);

  const navigateToFeed = useCallback((targetFeedId: string, targetTimeMs?: number, incidentId?: string) => {
    setFeedIdState(targetFeedId);
    if (targetTimeMs !== undefined) setTimeMsState(targetTimeMs);
    if (incidentId) setDrawerIncidentId(incidentId);

    const params = new URLSearchParams();
    params.set('dataset', dataset);
    params.set('run', runId);
    params.set('feed', targetFeedId);
    if (targetTimeMs !== undefined) params.set('t', Math.round(targetTimeMs / 1000).toString());
    if (incidentId) params.set('incident', incidentId);

    router.push(`/feeds?${params.toString()}`);
  }, [dataset, runId, router]);

  const value: AppContextType = {
    dataset,
    runId,
    feedId,
    timeMs,
    datasets,
    runs,
    currentFeed,
    incidents,
    drawerIncidentId,
    loading,
    setDataset,
    setRun,
    setFeed,
    setTime,
    openDrawer,
    closeDrawer,
    navigateToFeed,
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
}

export function useCurrentRun(): Run | null {
  const { runs, runId } = useApp();
  return runs.find(r => r.run_id === runId) || null;
}

export function useCurrentMetrics() {
  const run = useCurrentRun();
  return run?.metrics || null;
}
