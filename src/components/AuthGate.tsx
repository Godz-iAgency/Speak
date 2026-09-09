import { useEffect, useState, type ReactNode } from 'react';
import { watchAuth, firebaseConfigured, signOut } from '../lib/firebase';
import { Login } from './Login';
import type { User } from 'firebase/auth';

function SignOutBar({ user }: { user: User }) {
  return (
    <div className="signout-bar">
      <span className="signout-email">{user.email ?? 'Signed in'}</span>
      <button className="signout-btn" onClick={() => signOut()}>
        Sign out
      </button>
    </div>
  );
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [checked, setChecked] = useState(!firebaseConfigured);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (!firebaseConfigured) return;
    return watchAuth((u) => {
      setUser(u);
      setChecked(true);
    });
  }, []);

  if (!firebaseConfigured) {
    return (
      <div className="app">
        <div className="home">
          <div className="home-icon-wrap">
            <img src="/speak-icon.png" alt="" className="home-icon" />
          </div>
          <h1>speak.</h1>
          <p className="home-error">This deployment isn't connected to Firebase yet.</p>
        </div>
      </div>
    );
  }

  if (!checked) {
    return (
      <div className="app">
        <div className="prep-loading">
          <div className="prep-bar">
            <div className="prep-bar-fill" />
          </div>
        </div>
      </div>
    );
  }

  if (!user) return <Login />;

  return (
    <>
      <SignOutBar user={user} />
      {children}
    </>
  );
}
