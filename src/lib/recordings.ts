import { addDoc, collection, doc, getDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from './firebase';

export interface RecordingDoc {
  ownerUid: string;
  createdAt: Timestamp;
  durationSec: number;
  sizeBytes: number;
  b2Key: string;
  videoUrl: string;
}

export interface NewRecording {
  ownerUid: string;
  durationSec: number;
  sizeBytes: number;
  b2Key: string;
  videoUrl: string;
}

function requireDb() {
  if (!db) throw new Error('Firebase is not configured.');
  return db;
}

export async function createRecording(data: NewRecording): Promise<string> {
  const ref = await addDoc(collection(requireDb(), 'recordings'), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getRecording(id: string): Promise<RecordingDoc | null> {
  const snap = await getDoc(doc(requireDb(), 'recordings', id));
  return snap.exists() ? (snap.data() as RecordingDoc) : null;
}
