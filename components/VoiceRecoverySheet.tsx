

import React, { useEffect, useState } from 'react';

type Props = {
  open: boolean;
  onRetry: () => void;
  onRecordFallback: () => void;
  onReset: () => void;
};

export const VoiceRecoverySheet: React.FC<Props> = ({
  open,
  onRetry,
  onRecordFallback,
  onReset,
}) => {
  const [visibleKey, setVisibleKey] = useState(0);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        setVisibleKey((k) => k + 1);
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () =>
      document.removeEventListener('visibilitychange', handleVisibility);
  }, []);
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 touch-manipulation"
    >
      <div
        key={visibleKey}
        className="w-full sm:max-w-md bg-slate-950 border border-slate-800 rounded-2xl p-5"
      >
        <h2 className="text-lg font-semibold text-white mb-2">
          Microphone unavailable
        </h2>

        <p className="text-sm text-slate-400 mb-4">
          Android blocked microphone access because another app is drawing over
          this app. This can happen even when nothing is visibly on screen.
        </p>

        <div className="flex flex-col gap-3">
          <button
            onClick={onRetry}
            className="w-full rounded-lg px-4 py-2 border border-emerald-800 bg-emerald-950/60 text-emerald-400 font-semibold hover:bg-emerald-900/60 transition"
          >
            Try again
          </button>

          <button
            onClick={onRecordFallback}
            className="w-full rounded-lg px-4 py-2 border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 transition"
          >
            Record a voice message instead
          </button>

          <button
            onClick={onReset}
            className="w-full rounded-lg px-4 py-2 border border-slate-800 bg-transparent text-slate-400 hover:text-white transition"
          >
            Restart voice session
          </button>
        </div>
      </div>
    </div>
  );
};