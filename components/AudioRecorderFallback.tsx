import React, { useRef } from 'react';

type Props = {
  onAudioSelected: (file: File) => void;
  onCancel: () => void;
};

export const AudioRecorderFallback: React.FC<Props> = ({
  onAudioSelected,
  onCancel,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onAudioSelected(file);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
    >
      <div className="w-full sm:max-w-md bg-slate-950 border border-slate-800 rounded-2xl p-5">
        <h2 className="text-lg font-semibold text-white mb-2">
          Record a voice message
        </h2>

        <p className="text-sm text-slate-400 mb-4">
          This uses your phone’s system recorder and works even when live
          microphone access is blocked.
        </p>

        <input
          ref={inputRef}
          type="file"
          accept="audio/*"
          capture
          onChange={handleChange}
          className="hidden"
        />

        <div className="flex flex-col gap-3">
          <button
            onClick={() => inputRef.current?.click()}
            className="w-full rounded-lg px-4 py-2 border border-emerald-800 bg-emerald-950/60 text-emerald-400 font-semibold hover:bg-emerald-900/60 transition"
          >
            Start recording
          </button>

          <button
            onClick={onCancel}
            className="w-full rounded-lg px-4 py-2 border border-slate-800 bg-transparent text-slate-400 hover:text-white transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};