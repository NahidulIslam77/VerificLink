import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

/**
 * Browser-side proctoring. Every violation is reported to the server, which owns the count, the
 * score penalty and the invalidation decision — nothing here can be used to *improve* a result.
 *
 * Detects: tab switch, window blur, leaving fullscreen, copy/cut/paste/right-click, devtools shortcuts,
 * multiple displays (Chromium), camera loss, and (where the browser ships the FaceDetector API) missing
 * or multiple faces. Browsers without FaceDetector fall back to camera-presence only; that is reported honestly.
 */
export function useProctor({ active, assessmentId, videoRef, onServerState }) {
  const [faceMode, setFaceMode] = useState('pending'); // pending | tracking | unsupported
  const [fullscreenLost, setFullscreenLost] = useState(false);
  const [lastWarning, setLastWarning] = useState('');
  const cb = useRef(onServerState);
  cb.current = onServerState;

  const report = useCallback(async (type, detail) => {
    try {
      const s = await api.event(assessmentId, type, detail);
      cb.current?.(s);
    } catch { /* transient network error: the server clock and grading are authoritative anyway */ }
  }, [assessmentId]);

  useEffect(() => {
    if (!active) return undefined;
    const fsEnforced = !!document.fullscreenElement; // only enforce if the browser actually went fullscreen
    const violate = (type, msg, detail) => { setLastWarning(msg); report(type, detail); };

    const onVis = () => { if (document.hidden) violate('tab_hidden', 'Tab switch detected'); };
    const onBlur = () => violate('window_blur', 'The test window lost focus');
    const onFs = () => {
      if (fsEnforced && !document.fullscreenElement) { setFullscreenLost(true); violate('fullscreen_exit', 'You left fullscreen'); }
      else setFullscreenLost(false);
    };
    const block = (type, label) => (e) => { e.preventDefault(); violate(type, `${label} is disabled during the test`); };
    const onCopy = block('copy', 'Copying');
    const onCut = block('cut', 'Cutting');
    const onPaste = block('paste', 'Pasting');
    const onMenu = block('contextmenu', 'Right-click');
    const onKey = (e) => {
      const k = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      if (k === 'f12' || (mod && e.shiftKey && ['i', 'j', 'c'].includes(k)) || (mod && k === 'u')) {
        e.preventDefault();
        violate('devtools_shortcut', 'Developer-tool shortcuts are disabled');
      } else if (mod && ['c', 'v', 'x'].includes(k)) {
        e.preventDefault(); // the copy/paste events above do the reporting
      }
    };

    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', onBlur);
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);
    document.addEventListener('paste', onPaste);
    document.addEventListener('contextmenu', onMenu);
    document.addEventListener('keydown', onKey, true);

    const checkDisplays = () => { if (window.screen?.isExtended) violate('multiple_displays', 'A second display was detected'); };
    checkDisplays();
    const displayTimer = setInterval(checkDisplays, 20000);

    const track = videoRef.current?.srcObject?.getVideoTracks?.()[0];
    const onTrackEnd = () => violate('camera_lost', 'Camera was disconnected');
    track?.addEventListener('ended', onTrackEnd);

    let faceTimer;
    let misses = 0;
    if ('FaceDetector' in window && track) {
      try {
        const detector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 3 });
        setFaceMode('tracking');
        faceTimer = setInterval(async () => {
          const v = videoRef.current;
          if (!v || v.readyState < 2) return;
          try {
            const faces = await detector.detect(v);
            if (faces.length === 0) {
              misses += 1;
              if (misses >= 3) { misses = 0; violate('no_face', 'No face detected in the camera'); }
            } else {
              misses = 0;
              if (faces.length > 1) violate('multiple_faces', 'More than one face detected');
            }
          } catch { /* detector hiccup */ }
        }, 2000);
      } catch { setFaceMode('unsupported'); }
    } else {
      setFaceMode('unsupported');
      report('face_tracking_unavailable');
    }

    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('fullscreenchange', onFs);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('contextmenu', onMenu);
      document.removeEventListener('keydown', onKey, true);
      clearInterval(displayTimer);
      clearInterval(faceTimer);
      track?.removeEventListener('ended', onTrackEnd);
    };
  }, [active, report, videoRef]);

  return { faceMode, fullscreenLost, lastWarning, clearWarning: () => setLastWarning('') };
}
