import { useState } from 'react';
import type { RecorderOptions } from '../lib/useScreenRecorder';
import { CameraIcon, CheckIcon, MicIcon, RecordIcon } from './icons';

interface HomeScreenProps {
  onStart: (opts: RecorderOptions) => void;
  error: string | null;
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

export function HomeScreen({ onStart, error }: HomeScreenProps) {
  const [includeWebcam, setIncludeWebcam] = useState(true);
  const [includeMic, setIncludeMic] = useState(true);

  return (
    <div className="home">
      <div className="home-icon-wrap">
        <img src="/speak-icon.png" alt="" className="home-icon" />
      </div>
      <h1>speak.</h1>
      <p className="home-subtitle">Record. Share. Be Heard.</p>

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

      <button className="btn btn-primary btn-large" onClick={() => onStart({ includeWebcam, includeMic })}>
        <RecordIcon size={15} />
        Choose what to share
      </button>

      {error && <p className="home-error">{error}</p>}

      <p className="home-hint">
        Pick a screen, window, or tab. You'll get a preview to position your camera first. Recording only starts when
        you press the button, after a 3&#8209;2&#8209;1 countdown.
      </p>
    </div>
  );
}
