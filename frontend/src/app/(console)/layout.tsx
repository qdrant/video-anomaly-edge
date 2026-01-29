'use client';

import { Suspense, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Navbar from '@/components/layout/Navbar';
import WelcomeModal from '@/components/WelcomeModal';
import { AppProvider, useApp } from '@/lib/AppContext';

function ConsoleLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { closeDrawer, navigateToFeed, incidents, feedId, timeMs } = useApp();

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case 'Escape':
          closeDrawer();
          break;
        case ' ':
          // Space for play/pause - handled by video player
          break;
        case 'g':
          // Go shortcuts
          const waitForNext = () => {
            const handler = (e2: KeyboardEvent) => {
              window.removeEventListener('keydown', handler);
              switch (e2.key) {
                case 'o': router.push('/overview'); break;
                case 'i': router.push('/incidents'); break;
                case '/': router.push('/search'); break;
              }
            };
            window.addEventListener('keydown', handler);
            setTimeout(() => window.removeEventListener('keydown', handler), 1000);
          };
          waitForNext();
          break;
        case '?':
          showKeyboardShortcuts();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [router, closeDrawer]);

  const isReportPage = pathname === '/report';

  return (
    <div className={`flex flex-col bg-slate-900 text-white ${isReportPage ? 'min-h-screen' : 'h-screen'}`}>
      <WelcomeModal />
      <Navbar />
      <main className={`flex-1 ${isReportPage ? 'overflow-y-auto' : 'min-h-0 overflow-hidden'}`}>
        {children}
      </main>
    </div>
  );
}

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-slate-700 border-t-red-500 rounded-full animate-spin" />
      </div>
    }>
      <AppProvider>
        <ConsoleLayoutInner>{children}</ConsoleLayoutInner>
      </AppProvider>
    </Suspense>
  );
}

function showKeyboardShortcuts() {
  alert(`
Keyboard Shortcuts:

Navigation:
  g o  - Go to Overview
  g i  - Go to Incidents
  g /  - Go to Search

Video:
  Space  - Play/Pause
  J/L    - Seek back/forward

Other:
  Esc    - Close drawer
  ?      - Show shortcuts
`);
}
