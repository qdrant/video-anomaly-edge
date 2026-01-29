'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function WelcomeModal() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const hasSeenWelcome = localStorage.getItem('hasSeenWelcome');
    if (!hasSeenWelcome) {
      setIsOpen(true);
    }
  }, []);

  const handleClose = () => {
    localStorage.setItem('hasSeenWelcome', 'true');
    setIsOpen(false);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={handleClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="w-full max-w-2xl bg-slate-900 rounded-2xl shadow-2xl border border-slate-700 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="relative px-8 pt-8 pb-6 bg-gradient-to-br from-slate-800 to-slate-900">
              <div className="absolute top-4 right-4">
                <button
                  onClick={handleClose}
                  className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center shadow-lg shadow-red-500/30">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-white">Avenue Anomaly Detection</h1>
                  <p className="text-slate-400">AI-powered surveillance analytics</p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="px-8 py-6 space-y-6">
              <p className="text-slate-300 leading-relaxed">
                This demo showcases real-time anomaly detection in surveillance footage using
                state-of-the-art multimodal AI and vector search technology.
              </p>

              {/* How it works */}
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-white">How It Works</h2>

                <div className="grid gap-3">
                  <div className="flex gap-4 p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
                    <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-blue-400 font-bold">1</span>
                    </div>
                    <div>
                      <div className="font-medium text-white">Video Embedding</div>
                      <p className="text-sm text-slate-400">
                        Video clips are processed through <span className="text-blue-400 font-medium">Twelve Labs Marengo</span> to
                        generate rich multimodal embeddings that capture visual semantics.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4 p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
                    <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-purple-400 font-bold">2</span>
                    </div>
                    <div>
                      <div className="font-medium text-white">Vector Search</div>
                      <p className="text-sm text-slate-400">
                        Embeddings are indexed in <span className="text-purple-400 font-medium">Qdrant</span> for
                        lightning-fast similarity search across millions of video segments.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4 p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
                    <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-red-400 font-bold">3</span>
                    </div>
                    <div>
                      <div className="font-medium text-white">Anomaly Detection</div>
                      <p className="text-sm text-slate-400">
                        Clips are scored by comparing against a baseline of normal activity.
                        Outliers trigger alerts with explainable context.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4 pt-2">
                <div className="text-center p-4 bg-slate-800/30 rounded-xl">
                  <div className="text-2xl font-bold text-white">35M+</div>
                  <div className="text-xs text-slate-400">Embeddings indexed</div>
                </div>
                <div className="text-center p-4 bg-slate-800/30 rounded-xl">
                  <div className="text-2xl font-bold text-white">&lt;50ms</div>
                  <div className="text-xs text-slate-400">Search latency</div>
                </div>
                <div className="text-center p-4 bg-slate-800/30 rounded-xl">
                  <div className="text-2xl font-bold text-white">94%</div>
                  <div className="text-xs text-slate-400">F1 Score</div>
                </div>
              </div>

              {/* Powered by */}
              <div className="pt-4 border-t border-slate-700">
                <div className="text-xs text-slate-500 mb-3">Powered by</div>
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <img src="/qdrant-logo-white.svg" alt="Qdrant" className="h-6 object-contain" />
                  </div>
                  <span className="text-slate-600">+</span>
                  <div className="flex items-center gap-2">
                    <img src="/twelvelabs-logo.png" alt="Twelve Labs" className="h-6 object-contain invert" />
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-8 py-4 bg-slate-800/50 border-t border-slate-700">
              <button
                onClick={handleClose}
                className="w-full py-3 bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 rounded-xl font-semibold text-white transition-all shadow-lg shadow-red-500/20"
              >
                Explore the Demo
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
