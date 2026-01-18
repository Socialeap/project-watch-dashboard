

import { useCallback, useEffect, useState } from 'react';

export type MicPermissionState =
  | 'unknown'
  | 'granted'
  | 'blocked'
  | 'error';

export function useMicrophonePermission() {
  const [state, setState] = useState<MicPermissionState>('unknown');
  const [lastError, setLastError] = useState<Error | null>(null);

  // Check if permission was already granted (no prompt needed)
  const checkExistingPermission = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasGrantedMic = devices.some(
        d => d.kind === 'audioinput' && d.label
      );
      if (hasGrantedMic) {
        setState('granted');
        return true;
      }
      return false;
    } catch (err) {
      setLastError(err as Error);
      setState('error');
      return false;
    }
  }, []);

  // Request microphone access with silent retry
  const requestPermission = useCallback(async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      setState('granted');
      return true;
    } catch (err: any) {
      // Silent retry for transient Android overlay states
      try {
        await new Promise(res => setTimeout(res, 400));
        await navigator.mediaDevices.getUserMedia({ audio: true });
        setState('granted');
        return true;
      } catch (retryErr: any) {
        setLastError(retryErr);
        if (retryErr?.name === 'NotAllowedError') {
          setState('blocked');
        } else {
          setState('error');
        }
        return false;
      }
    }
  }, []);

  // One-time permission anchor (run once on mount)
  useEffect(() => {
    checkExistingPermission();
  }, [checkExistingPermission]);

  return {
    state,
    lastError,
    checkExistingPermission,
    requestPermission,
  };
}