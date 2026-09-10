import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFloatingControls } from './lib/useFloatingControls';
import { HomeScreen } from './components/HomeScreen';
import { RecordingBar } from './components/RecordingBar';
import { FloatingRecorder } from './components/FloatingRecorder';
import { LivePreview } from './components/LivePreview';
const Editor = lazy(() => import('./components/Editor').then(m => ({ default: m.Editor })));
import { RecordIcon } from './components/icons';
import type { Draft } from './lib/drafts';
import { useScreenRecorder } from './lib/useScreenRecorder';
import { useRecorderExtension } from './lib/useRecorderExtension';

function App() {
  const [resumedDraft, setResumedDraft] = useState<Draft | null>(null);
  const {
    status,
    error,
    elapsedMs,
    countdown,
    arm,
    beginRecording,
    cancelSetup,
    stop,
    pause,
    resume,
    reset,
    recordedBlob,
    canvasRef,
    webcamStream,
    webcamEnabled,
    captureLabel,
    captureSurface,
    camPos,
    camSize,
    setCamPos,
    setCamSize,
    setExternalOverlayActive,
    captureCameraFrame,
  } = useScreenRecorder();

  const isLive = status === 'recording' || status === 'paused';
  const [extensionOverlayActive, setExtensionOverlayActive] = useState(false);
  const handleOverlayChange = useCallback((active: boolean) => {
    setExtensionOverlayActive(active);
    setExternalOverlayActive(active && captureSurface === 'browser');
  }, [captureSurface, setExternalOverlayActive]);
  const { available: extensionAvailable } = useRecorderExtension({
    status,
    elapsedMs,
    countdown,
    webcamEnabled,
    captureLabel,
    captureSurface,
    camPos,
    camSize,
    captureCameraFrame,
    onPause: pause,
    onResume: resume,
    onStop: stop,
    onPosition: setCamPos,
    onSize: setCamSize,
    onOverlayChange: handleOverlayChange,
  });
  const { pip, open, supported } = useFloatingControls(isLive || status === 'countdown' || status === 'ready', webcamEnabled);
  useEffect(() => {
    if (!isLive) return;
    const keydown = (e: KeyboardEvent) => {
      if (e.repeat || !e.altKey || !e.shiftKey) return;
      if (e.code === 'KeyS') { e.preventDefault(); stop(); }
      if (e.code === 'KeyP') { e.preventDefault(); if (status === 'paused') resume(); else pause(); }
    };
    window.addEventListener('keydown', keydown);
    pip?.addEventListener('keydown', keydown);
    return () => { window.removeEventListener('keydown', keydown); pip?.removeEventListener('keydown', keydown); };
  }, [isLive, status, pip, stop, pause, resume]);

  if (isLive || status === 'countdown') {
    const controls = isLive ? <RecordingBar elapsedMs={elapsedMs} isPaused={status === 'paused'} onPause={pause} onResume={resume} onStop={stop} />
      : <div className="recording-bar">Starting in {countdown}… <button className="btn btn-small" onClick={cancelSetup}>Cancel</button></div>;
    return <div className="app"><div className="recording-away">
      <h1>{status === 'countdown' ? 'Get ready' : status === 'paused' ? 'Recording paused' : 'You’re recording'}</h1>
      <p>Switch to the tab or app you’re sharing and use it directly.</p>
      <p>Stop with the browser’s sharing bar, or return here for controls.</p>
      <p>Alt + Shift + P pauses or resumes; Alt + Shift + S stops while Speak or its floating controls have focus.</p>
      {extensionOverlayActive && captureSurface === 'browser' && <p className="extension-live-note">Your Speak bubble is live on the browser tab you are recording.</p>}
      {supported && !pip && <button className="btn btn-secondary" onClick={() => void open()}>Float controls</button>}
    </div><div className="recording-dock">{controls}</div>{pip && createPortal(
      <FloatingRecorder
        stream={webcamEnabled ? webcamStream : null}
        elapsedMs={elapsedMs}
        isPaused={status === 'paused'}
        countdown={status === 'countdown' ? countdown : null}
        onPause={pause}
        onResume={resume}
        onStop={stop}
        onCancel={cancelSetup}
      />,
      pip.document.body,
    )}</div>;
  }

  if (resumedDraft || (status === 'stopped' && recordedBlob)) {
    return (
      <div className="app app-editing">
        <Suspense fallback={<p>Opening editor…</p>}><Editor key={resumedDraft?.id || "new"} blob={resumedDraft?.blob || recordedBlob!} initialDraft={resumedDraft || undefined} onDiscard={() => {setResumedDraft(null);reset();}} /></Suspense>
      </div>
    );
  }

  const isSetup = status === 'ready';

  if (isSetup) {
    return (
      <div className="app app-stage">
        <LivePreview
          canvasRef={canvasRef}
          webcamEnabled={webcamEnabled}
          camPos={camPos}
          camSize={camSize}
          onCamPosChange={setCamPos}
          onCamSizeChange={setCamSize}
          countdown={countdown}
          topOverlay={<div className="stage-setup-stack"><span className="stage-setup-pill">Set up your shot, nothing is recording yet</span>{extensionAvailable && <span className="extension-ready-pill">Companion connected</span>}</div>}
          bottomOverlay={
            isSetup ? (
              <div className="stage-start-actions">
                <button className="btn btn-ghost" onClick={cancelSetup}>
                  Cancel
                </button>
                <button className="btn btn-primary btn-start" onClick={() => { beginRecording(); if (!extensionOverlayActive || captureSurface !== 'browser') void open(); }}>
                  <RecordIcon size={15} />
                  Start recording
                </button>
              </div>
            ) : null
          }
        />
      </div>
    );
  }

  return (
    <div className="app app-workspace">
      <HomeScreen onStart={arm} error={error} busy={status === 'requesting'} onResume={setResumedDraft} extensionAvailable={extensionAvailable} />
    </div>
  );
}

export default App;
