import { useEffect, useState } from 'react';
import { getRecording, type RecordingDoc } from '../lib/recordings';
import { firebaseConfigured } from '../lib/firebase';

interface SharePageProps {
  id: string;
}

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; rec: RecordingDoc };

function formatDuration(s: number) {
  if (!Number.isFinite(s)) return '';
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

const notConfiguredState: LoadState = {
  status: 'error',
  message: 'This deployment is not connected to a database yet.',
};

export function SharePage({ id }: SharePageProps) {
  // firebaseConfigured is a module-level constant, so this can be decided once
  // up front rather than flipped from inside an effect.
  const [state, setState] = useState<LoadState>(firebaseConfigured ? { status: 'loading' } : notConfiguredState);

  useEffect(() => {
    if (!firebaseConfigured) return;
    let cancelled = false;
    getRecording(id)
      .then((rec) => {
        if (cancelled) return;
        if (!rec) {
          setState({ status: 'error', message: "This recording doesn't exist or was removed." });
        } else {
          setState({ status: 'ready', rec });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ status: 'error', message: err instanceof Error ? err.message : 'Failed to load this recording.' });
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="app app-editing">
      <div className="editor">
        <div className="editor-main">
          {state.status === 'loading' && (
            <div className="prep-loading">
              <div className="prep-bar">
                <div className="prep-bar-fill" />
              </div>
              <p className="editor-preparing">Loading recording…</p>
            </div>
          )}

          {state.status === 'error' && (
            <div className="prep-loading">
              <p className="home-error">{state.message}</p>
              <a className="btn btn-primary" href="/" style={{ marginTop: 20 }}>
                Go to speak.
              </a>
            </div>
          )}

          {state.status === 'ready' && (
            <>
              <div className="editor-stage">
                <video src={state.rec.videoUrl} controls autoPlay className="editor-video" />
              </div>
              <div className="editor-controls">
                <span className="editor-final">
                  Length <strong>{formatDuration(state.rec.durationSec)}</strong>
                </span>
                <a className="btn btn-primary" href="/" style={{ marginLeft: 'auto' }}>
                  Record your own
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
