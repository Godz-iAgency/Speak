import { HomeScreen } from './components/HomeScreen';
import { RecordingBar } from './components/RecordingBar';
import { LivePreview } from './components/LivePreview';
import { Editor } from './components/Editor';
import { RecordIcon } from './components/icons';
import { useScreenRecorder } from './lib/useScreenRecorder';

function App() {
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
    webcamEnabled,
    camPos,
    camSize,
    setCamPos,
    setCamSize,
  } = useScreenRecorder();

  if (status === 'stopped' && recordedBlob) {
    return (
      <div className="app app-editing">
        <Editor blob={recordedBlob} onDiscard={reset} />
      </div>
    );
  }

  const isSetup = status === 'ready';
  const isLive = status === 'recording' || status === 'paused';

  if (isSetup || status === 'countdown' || isLive) {
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
          topOverlay={
            isLive ? (
              <RecordingBar
                elapsedMs={elapsedMs}
                isPaused={status === 'paused'}
                onPause={pause}
                onResume={resume}
                onStop={stop}
              />
            ) : isSetup ? (
              <span className="stage-setup-pill">Set up your shot, nothing is recording yet</span>
            ) : null
          }
          bottomOverlay={
            isSetup ? (
              <div className="stage-start-actions">
                <button className="btn btn-ghost" onClick={cancelSetup}>
                  Cancel
                </button>
                <button className="btn btn-primary btn-start" onClick={beginRecording}>
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
    <div className="app">
      <HomeScreen onStart={arm} error={error} />
    </div>
  );
}

export default App;
