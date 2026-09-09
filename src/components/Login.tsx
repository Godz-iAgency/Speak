import { useState } from 'react';
import { signInWithGoogle, signInWithEmail, signUpWithEmail } from '../lib/firebase';
import { ArrowLeftIcon, GoogleIcon, MailIcon } from './icons';

type Mode = 'signin' | 'signup';

function friendlyError(err: unknown): string {
  const code = err instanceof Error && 'code' in err ? String((err as { code: unknown }).code) : '';
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') return 'Wrong email or password.';
  if (code === 'auth/user-not-found') return 'No account with that email. Try creating one instead.';
  if (code === 'auth/email-already-in-use') return 'An account already exists with that email. Sign in instead.';
  if (code === 'auth/weak-password') return 'Password needs to be at least 6 characters.';
  if (code === 'auth/invalid-email') return "That doesn't look like a valid email.";
  if (code === 'auth/popup-closed-by-user') return '';
  return err instanceof Error ? err.message : 'Something went wrong.';
}

export function Login() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleGoogle = async () => {
    setBusy(true);
    setError('');
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'signin') {
        await signInWithEmail(email, password);
      } else {
        await signUpWithEmail(email, password);
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app">
      <a className="back-bar" href="/">
        <ArrowLeftIcon size={15} />
        Back
      </a>
      <div className="home">
        <div className="home-icon-wrap">
          <img src="/speak-icon.png" alt="" className="home-icon" />
        </div>
        <h1>speak.</h1>
        <p className="home-subtitle">Sign in to record and share.</p>

        <button className="btn btn-secondary btn-large google-btn" onClick={handleGoogle} disabled={busy}>
          <GoogleIcon size={18} />
          Continue with Google
        </button>

        <div className="login-divider">
          <span>or</span>
        </div>

        <form onSubmit={handleEmailSubmit} className="login-form">
          <label className="login-field">
            <MailIcon size={16} />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </label>
          <input
            className="gate-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === 'signup' ? 'Create a password' : 'Password'}
            required
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            minLength={6}
          />
          <button className="btn btn-primary btn-large" type="submit" disabled={busy}>
            {mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        {error && <p className="home-error">{error}</p>}

        <p className="login-switch">
          {mode === 'signin' ? (
            <>
              New here?{' '}
              <button type="button" onClick={() => setMode('signup')}>
                Create an account
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button type="button" onClick={() => setMode('signin')}>
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
