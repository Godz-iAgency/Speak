import { initializeApp, type FirebaseOptions } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const config: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseConfigured = Boolean(config.apiKey && config.projectId);

const app = firebaseConfigured ? initializeApp(config) : null;
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;

function requireAuth() {
  if (!auth) throw new Error('Firebase is not configured.');
  return auth;
}

export function watchAuth(callback: (user: User | null) => void): () => void {
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}

export function signInWithGoogle(): Promise<User> {
  const a = requireAuth();
  return signInWithPopup(a, new GoogleAuthProvider()).then((cred) => cred.user);
}

export function signInWithEmail(email: string, password: string): Promise<User> {
  const a = requireAuth();
  return signInWithEmailAndPassword(a, email, password).then((cred) => cred.user);
}

export function signUpWithEmail(email: string, password: string): Promise<User> {
  const a = requireAuth();
  return createUserWithEmailAndPassword(a, email, password).then((cred) => cred.user);
}

export function signOut(): Promise<void> {
  if (!auth) return Promise.resolve();
  return firebaseSignOut(auth);
}

/** Throws if called before a real sign-in has completed — callers reach this
 * point only from behind the Login gate, so a signed-out state here is a bug. */
export function requireCurrentUser(): User {
  const a = requireAuth();
  if (!a.currentUser) throw new Error('Not signed in.');
  return a.currentUser;
}
