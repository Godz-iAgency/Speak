import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

let app: App | null = null;

/**
 * FIREBASE_SERVICE_ACCOUNT holds the full JSON key downloaded from Firebase
 * Console -> Project settings -> Service accounts -> Generate new private key,
 * stored as one env var (paste the whole file's contents). Server-only —
 * never prefixed with VITE_, so it never reaches the browser bundle.
 */
function getAdminApp(): App {
  if (app) return app;
  const existing = getApps()[0];
  if (existing) {
    app = existing;
    return app;
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set.');

  const serviceAccount = JSON.parse(raw);
  app = initializeApp({ credential: cert(serviceAccount) });
  return app;
}

/** Verifies the Authorization: Bearer <idToken> header, returning the caller's uid. */
export async function requireUid(authHeader: string | undefined): Promise<string> {
  const idToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) throw new Error('Missing Authorization header.');

  const decoded = await getAuth(getAdminApp()).verifyIdToken(idToken);
  return decoded.uid;
}
