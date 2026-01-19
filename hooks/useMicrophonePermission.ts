
import { useCallback, useEffect, useRef, useState } from 'react';

export type MicPermissionState =
  | 'unknown'
  | 'granted'
  | 'blocked'
  | 'error';

export function useMicrophonePermission() {
  const [state, setState] = useState<MicPermissionState>('unknown');
  const [lastError, setLastError] = useState<Error | null>(null);

  const visibilityRecoveredRef = useRef(false);
  const requestingRef = useRef(false);

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

  // Request microphone access with hardened duplicate/overlay handling
  const requestPermission = useCallback(async () => {
    if (requestingRef.current) return false;
    requestingRef.current = true;

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      setState('granted');
      requestingRef.current = false;
      return true;
    } catch (err: any) {
      // Android/PWA transient overlay recovery
      if (!visibilityRecoveredRef.current) {
        try {
          await new Promise(res => setTimeout(res, 500));
          await navigator.mediaDevices.getUserMedia({ audio: true });
          setState('granted');
          requestingRef.current = false;
          return true;
        } catch {
          // fall through
        }
      }

      if (err?.name === 'NotAllowedError') {
        setState('blocked');
      } else {
        setState('error');
        setLastError(err);
      }

      requestingRef.current = false;
      return false;
    }
  }, []);

  // One-time permission anchor (run once on mount)
  useEffect(() => {
    checkExistingPermission();
  }, [checkExistingPermission]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        visibilityRecoveredRef.current = true;

        // If we previously thought we were blocked, re-check safely
        if (state === 'blocked') {
          checkExistingPermission();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () =>
      document.removeEventListener('visibilitychange', handleVisibility);
  }, [state, checkExistingPermission]);

  return {
    state,
    lastError,
    checkExistingPermission,
    requestPermission,
  };
}