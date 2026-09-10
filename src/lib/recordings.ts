import { addDoc, collection, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, startAfter, Timestamp, updateDoc, where, type QueryConstraint, type QueryDocumentSnapshot } from 'firebase/firestore';
import { db, requireCurrentUser } from './firebase';

export interface RecordingDetails {
  title?: string;
  description?: string;
  thumbnail?: string;
}
export interface RecordingDoc extends RecordingDetails {
  ownerUid: string;
  createdAt: Timestamp;
  durationSec: number;
  sizeBytes: number;
  b2Key: string;
  videoUrl: string;
}
export type LibraryRecording = RecordingDoc & { id: string };
export type NewRecording = Omit<RecordingDoc, 'createdAt'>;
function requireDb() {
  if (!db) throw new Error('Firebase is not configured.');
  return db;
}
export function cleanDetails(details: RecordingDetails): Required<RecordingDetails> {
  return {
    title: details.title?.trim().slice(0, 160) || 'Untitled video',
    description: details.description?.trim().slice(0, 2000) || '',
    thumbnail: details.thumbnail?.startsWith('data:image/jpeg;base64,') && details.thumbnail.length <= 60000 ? details.thumbnail : '',
  };
}
export async function createRecording(data: NewRecording): Promise<string> {
  const ref = await addDoc(collection(requireDb(), 'recordings'), {
    ...data, ...cleanDetails(data), createdAt: serverTimestamp(),
  });
  return ref.id;
}
export async function getRecording(id: string): Promise<RecordingDoc | null> {
  const snap = await getDoc(doc(requireDb(), 'recordings', id));
  return snap.exists() ? (snap.data() as RecordingDoc) : null;
}
export async function listRecordings(cursor?: QueryDocumentSnapshot) {
  const uid = requireCurrentUser().uid;
  const constraints: QueryConstraint[] = [where('ownerUid', '==', uid), orderBy('createdAt', 'desc'), limit(24)];
  if (cursor) constraints.push(startAfter(cursor));
  const result = await getDocs(query(collection(requireDb(), 'recordings'), ...constraints));
  return {
    items: result.docs.map(s => ({ ...s.data(), id: s.id }) as LibraryRecording),
    cursor: result.docs.at(-1), hasMore: result.size === 24,
  };
}
export async function renameRecording(id: string, title: string): Promise<void> {
  requireCurrentUser();
  await updateDoc(doc(requireDb(), 'recordings', id), { title: cleanDetails({ title }).title });
}
