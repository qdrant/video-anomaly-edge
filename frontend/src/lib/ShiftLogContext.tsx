'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface ShiftLogEntry {
  id: string;
  timestamp: Date;
  type: 'alert' | 'action' | 'question' | 'decision' | 'clip' | 'note';
  message: string;
  incidentId?: string;
  timeRange?: { start: number; end: number };
  metadata?: Record<string, any>;
}

interface ShiftLogContextType {
  entries: ShiftLogEntry[];
  addEntry: (entry: Omit<ShiftLogEntry, 'id' | 'timestamp'>) => void;
  clearLog: () => void;
  logAlert: (message: string, incidentId?: string) => void;
  logAction: (message: string, metadata?: Record<string, any>) => void;
  logQuestion: (question: string, incidentId?: string) => void;
  logDecision: (decision: string, incidentId: string, status: 'confirmed' | 'false_alarm' | 'investigating') => void;
  logClip: (message: string, timeRange: { start: number; end: number }) => void;
}

const ShiftLogContext = createContext<ShiftLogContextType | undefined>(undefined);

export function ShiftLogProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<ShiftLogEntry[]>([]);

  const addEntry = useCallback((entry: Omit<ShiftLogEntry, 'id' | 'timestamp'>) => {
    const newEntry: ShiftLogEntry = {
      ...entry,
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
    };
    setEntries(prev => [newEntry, ...prev]);
  }, []);

  const clearLog = useCallback(() => {
    setEntries([]);
  }, []);

  const logAlert = useCallback((message: string, incidentId?: string) => {
    addEntry({ type: 'alert', message, incidentId });
  }, [addEntry]);

  const logAction = useCallback((message: string, metadata?: Record<string, any>) => {
    addEntry({ type: 'action', message, metadata });
  }, [addEntry]);

  const logQuestion = useCallback((question: string, incidentId?: string) => {
    addEntry({ type: 'question', message: question, incidentId });
  }, [addEntry]);

  const logDecision = useCallback((decision: string, incidentId: string, status: 'confirmed' | 'false_alarm' | 'investigating') => {
    addEntry({
      type: 'decision',
      message: decision,
      incidentId,
      metadata: { status }
    });
  }, [addEntry]);

  const logClip = useCallback((message: string, timeRange: { start: number; end: number }) => {
    addEntry({ type: 'clip', message, timeRange });
  }, [addEntry]);

  return (
    <ShiftLogContext.Provider value={{
      entries,
      addEntry,
      clearLog,
      logAlert,
      logAction,
      logQuestion,
      logDecision,
      logClip,
    }}>
      {children}
    </ShiftLogContext.Provider>
  );
}

export function useShiftLog() {
  const context = useContext(ShiftLogContext);
  if (context === undefined) {
    throw new Error('useShiftLog must be used within ShiftLogProvider');
  }
  return context;
}
