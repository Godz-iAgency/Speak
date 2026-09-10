import type { Clip } from '../components/Timeline';
export interface Draft {
  id: string;
  ownerUid: string;
  blob: Blob;
  title: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  clips: Clip[];
  /** False until source metadata has initialized the timeline. */
  editsReady?: boolean;
}
export type DraftSummary = Omit<Draft, 'blob'>;
let opening: Promise<IDBDatabase> | null = null;
function openDatabase() {
  if (opening) return opening;
  opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('speak-drafts', 2);
    let blocked = false;
    request.onupgradeneeded = () => {
      const db = request.result;
      const drafts = db.objectStoreNames.contains('drafts') ? request.transaction!.objectStore('drafts') : db.createObjectStore('drafts', { keyPath: 'id' });
      if (!drafts.indexNames.contains('ownerUid')) drafts.createIndex('ownerUid', 'ownerUid');
      const media = db.createObjectStore('media', { keyPath: 'id' });
      // Migrate early drafts without duplicating the recording on every later edit.
      const cursor = drafts.openCursor();
      cursor.onsuccess = () => {
        const current = cursor.result;
        if (!current) return;
        const {blob, ...summary} = current.value;
        if (blob) {media.put({id:summary.id, ownerUid:summary.ownerUid, blob});current.update(summary);}
        current.continue();
      };
    };
    request.onsuccess = () => {
      if (blocked) {request.result.close();return;}
      const database = request.result;
      database.onversionchange = () => { database.close(); opening = null; };
      resolve(database);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => {blocked=true;reject(new Error('Close other Speak tabs and try again.'));};
  }).catch(error => {opening=null;throw error;});
  return opening;
}
export async function saveDraft(draft: Draft): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['drafts','media'], 'readwrite');
    const {blob,...summary}=draft;
    const media=transaction.objectStore('media');
    const existing=media.get(draft.id);
    existing.onsuccess=()=>{
      if (existing.result && existing.result.ownerUid !== draft.ownerUid) {transaction.abort();return;}
      if (!existing.result) media.put({id:draft.id,ownerUid:draft.ownerUid,blob});
      transaction.objectStore('drafts').put(summary);
    };
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || new Error('Draft could not be saved.'));
    transaction.onerror = () => reject(transaction.error);
  });
}
export async function listDrafts(ownerUid: string): Promise<DraftSummary[]> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction('drafts').objectStore('drafts').index('ownerUid').getAll(ownerUid);
    request.onsuccess = () => resolve((request.result as DraftSummary[]).sort((a,b) => b.updatedAt - a.updatedAt));
    request.onerror = () => reject(request.error);
  });
}
export async function getDraft(id: string, ownerUid: string): Promise<Draft | null> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction=database.transaction(['drafts','media']);
    const summary=transaction.objectStore('drafts').get(id),media=transaction.objectStore('media').get(id);
    transaction.oncomplete=()=>resolve(summary.result?.ownerUid===ownerUid && media.result?.ownerUid===ownerUid ? {...summary.result,blob:media.result.blob}:null);
    transaction.onabort=()=>reject(transaction.error);transaction.onerror=()=>reject(transaction.error);
  });
}
export async function deleteDraft(id: string, ownerUid: string): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['drafts','media'], 'readwrite');
    const store = transaction.objectStore('drafts');
    const request = store.get(id);
    request.onsuccess = () => { if (request.result?.ownerUid === ownerUid) {store.delete(id);transaction.objectStore('media').delete(id);} };
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
}
