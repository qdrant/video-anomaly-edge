'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { DatasetId, DatasetInfo } from './types';
import { getDatasets } from './api';

interface DatasetContextType {
  currentDataset: DatasetId;
  setCurrentDataset: (dataset: DatasetId) => void;
  datasets: DatasetInfo[];
  loading: boolean;
}

const DatasetContext = createContext<DatasetContextType | undefined>(undefined);

export function DatasetProvider({ children }: { children: ReactNode }) {
  const [currentDataset, setCurrentDataset] = useState<DatasetId>('shanghaitech');
  const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDatasets() {
      try {
        const data = await getDatasets();
        setDatasets(data);
      } catch (err) {
        console.error('Failed to load datasets:', err);
      } finally {
        setLoading(false);
      }
    }
    loadDatasets();
  }, []);

  return (
    <DatasetContext.Provider value={{ currentDataset, setCurrentDataset, datasets, loading }}>
      {children}
    </DatasetContext.Provider>
  );
}

export function useDataset() {
  const context = useContext(DatasetContext);
  if (context === undefined) {
    throw new Error('useDataset must be used within a DatasetProvider');
  }
  return context;
}
