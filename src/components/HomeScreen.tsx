import { useState } from 'react';
import { useDialogFocus } from '../lib/useDialogFocus';
import { Library } from './Library';
import type { Draft } from '../lib/drafts';
import type { RecorderOptions } from '../lib/useScreenRecorder';
import { CameraIcon, CheckIcon, MicIcon, RecordIcon } from './icons';

interface HomeScreenProps {
  onStart: (opts: RecorderOptions) => void;
  error: string | null;
  busy?: boolean;
  onResume: (draft: Draft) => void;
  extensionAvailable?: boolean;
}

interface OptionProps {
  on: boolean;
  onToggle: () => void;
  icon: React.ReactNode;
  label: string;
}

function Option({ on, onToggle, icon, label }: OptionProps) {
  return (
    <button type="button" className={`option ${on ? 'option-on' : ''}`} onClick={onToggle} aria-pressed={on}>
      <span className="option-icon">{icon}</span>
      <span className="option-label">{label}</span>
      <span className="option-check">
        <CheckIcon size={13} />
      </span>
    </button>
  );
}

export function HomeScreen({ onStart, error, busy, onResume, extensionAvailable = false }: HomeScreenProps) {
  const [setupOpen, setSetupOpen] = useState(Boolean(error || busy));
  const [includeWebcam, setIncludeWebcam] = useState(true);
  const [includeMic, setIncludeMic] = useState(true);
  const dialogRef = useDialogFocus(setupOpen, () => setSetupOpen(false), busy);
  const screenCaptureSupported = typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getDisplayMedia);

  return (
    <div className="workspace">
      <aside className="workspace-sidebar">
        <a className="workspace-brand" href="/"><img src="/speak-icon.png" alt=""/>speak.</a>
        <span className="workspace-label">PERSONAL WORKSPACE</span>
        <span className="workspace-nav-active"><span aria-hidden="true">▦</span> My library</span>
        <div className="sidebar-note"><strong>A little video.<br/>A lot less back-and-forth.</strong><p>Record. Share. Be Heard.</p></div>
      </aside>
      <main className="workspace-main"><Library onRecord={() => setSetupOpen(true)} onResume={onResume}/></main>
      {setupOpen && <div className="dialog-backdrop"><div ref={dialogRef} className="home recorder-dialog" role="dialog" aria-modal="true" aria-labelledby="recorder-title">
      <button className="dialog-close" aria-label="Close recording setup" disabled={busy} onClick={() => setSetupOpen(false)}>×</button>
      <div className="home-icon-wrap">
        <img src="/speak-icon.png" alt="" className="home-icon" />
      </div>
      <h2 id="recorder-title">{screenCaptureSupported ? 'Let’s make a video' : 'Open Speak on a computer to record'}</h2>
      <p className="home-subtitle">{screenCaptureSupported ? 'A quick hello is worth a thousand messages.' : 'Your recordings and shared videos still work on this phone or tablet.'}</p>

      {screenCaptureSupported ? <>
      <div className="home-options">
        <Option
          on={includeWebcam}
          onToggle={() => setIncludeWebcam((v) => !v)}
          icon={<CameraIcon size={18} />}
          label="Camera bubble"
        />
        <Option
          on={includeMic}
          onToggle={() => setIncludeMic((v) => !v)}
          icon={<MicIcon size={18} />}
          label="Microphone"
        />
      </div>

      <button className="btn btn-primary btn-large" disabled={busy} onClick={() => onStart({ includeWebcam, includeMic })}>
        <RecordIcon size={15} />
        Choose what to share
      </button>

      {error && <p className="home-error">{error}</p>}

      <p className={`extension-availability ${extensionAvailable ? 'extension-availability-on' : ''}`}>
        {extensionAvailable
          ? 'Speak Companion is connected. Your camera bubble will follow you onto browser pages.'
          : 'For a Loom-style bubble while using browser pages, add the Speak Companion extension in Chrome or Edge.'}
      </p>

      <p className="home-hint">
        Pick a screen, window, or tab. You'll get a preview to position your camera first. Recording only starts when
        you press the button, after a 3&#8209;2&#8209;1 countdown.
      </p>
      </> : <>
        <div className="mobile-recording-note">
          Mobile browsers do not provide the screen-capture access Speak needs. Use desktop Chrome or Edge to record, then view, organize, and share here on any device.
        </div>
        <button className="btn btn-secondary btn-large" onClick={() => setSetupOpen(false)}>Back to my library</button>
      </>}
      </div></div>}
    </div>
  );
}
