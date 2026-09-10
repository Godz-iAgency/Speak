import { useCallback, useEffect, useRef, useState } from 'react';
import { useDialogFocus } from '../lib/useDialogFocus';
import { auth } from '../lib/firebase';
import { listRecordings, renameRecording, type LibraryRecording } from '../lib/recordings';
import { deleteDraft, getDraft, listDrafts, type Draft, type DraftSummary } from '../lib/drafts';
import { formatDuration, shareLink } from '../lib/videoDetails';
import { CopyIcon, PlayIcon, RecordIcon } from './icons';
import type { QueryDocumentSnapshot } from 'firebase/firestore';

interface LibraryProps { onRecord: () => void; onResume: (draft: Draft) => void; }
export function Library({ onRecord, onResume }: LibraryProps) {
  const [videos, setVideos] = useState<LibraryRecording[]>([]);
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [loading, setLoading] = useState(Boolean(auth?.currentUser));
  const [more, setMore] = useState(false);
  const [filter, setFilter] = useState('');
  const [tab, setTab] = useState<'videos' | 'drafts'>('videos');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [renaming, setRenaming] = useState<LibraryRecording | null>(null);
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<DraftSummary | null>(null);
  const dialogRef = useDialogFocus(Boolean(renaming || removing), () => {setRenaming(null);setRemoving(null);}, saving);
  const cursor = useRef<QueryDocumentSnapshot | undefined>(undefined);
  const alive = useRef(true);
  const request = useRef(0);
  const uid = auth?.currentUser?.uid;
  const load = useCallback(async (append = false) => {
    const version = ++request.current;
    if (!uid) return;
    const [cloud, local] = await Promise.allSettled([listRecordings(append ? cursor.current : undefined), listDrafts(uid)]);
    if (!alive.current || version !== request.current) return;
    if (cloud.status === 'fulfilled') {
      setError('');
      const page = cloud.value;
      setVideos(previous => append ? [...previous, ...page.items.filter(item => !previous.some(v => v.id === item.id))] : page.items);
      cursor.current = page.cursor; setMore(page.hasMore);
    } else setError('Your shared videos could not be loaded. Check your connection and try again.');
    if (local.status === 'fulfilled') setDrafts(local.value);
    else setNotice('Local drafts are unavailable in this browser.');
    setLoading(false);
  }, [uid]);
  useEffect(() => {
    alive.current = true;
    void load();
    return () => { alive.current = false; };
  }, [load]);
  const resume = async (draft: DraftSummary) => {
    if (!uid || saving) return;
    setSaving(true);
    try {
      const saved = await getDraft(draft.id, uid);
      if (!alive.current) return;
      if (saved) onResume(saved); else setNotice('That draft is no longer available on this device.');
    } catch {if (alive.current) setNotice('The draft could not be opened. Please try again.');}
    finally {if (alive.current) setSaving(false);}
  };
  const copy = async (id: string) => {
    try { await navigator.clipboard.writeText(shareLink(id)); setNotice('Link copied. Anyone with the link can watch.'); }
    catch { setNotice('Open the video and copy its address to share it.'); }
  };
  const rename = async () => {
    if (!renaming || !title.trim() || saving) return;
    setSaving(true);
    try {
      await renameRecording(renaming.id, title);
      if (!alive.current) return;
      setVideos(items => items.map(item => item.id === renaming.id ? {...item, title: title.trim()} : item));
      setRenaming(null);
    } catch { setNotice('The title could not be saved. Please try again.'); }
    finally { if (alive.current) setSaving(false); }
  };
  const remove = async () => {
    if (!removing || !uid || saving) return;
    setSaving(true);
    try { await deleteDraft(removing.id, uid); setDrafts(items => items.filter(d => d.id !== removing.id)); setRemoving(null); }
    catch { setNotice('The draft could not be removed.'); }
    finally { setSaving(false); }
  };
  const needle = filter.trim().toLowerCase();
  const matches = (item: {title?: string}) => (item.title || 'Untitled video').toLowerCase().includes(needle);
  return <section className="library" aria-label="Video library">
    <div className="library-heading"><div><span className="eyebrow">YOUR WORKSPACE</span><h1>My library</h1><p>One place for everything you have to say.</p></div>
      <button className="btn btn-primary" onClick={onRecord}><RecordIcon size={16}/> New recording</button>
    </div>
    <div className="library-toolbar">
      <div className="library-tabs" role="tablist" aria-label="Library sections">
        <button role="tab" aria-selected={tab === 'videos'} onClick={() => setTab('videos')}>Shared videos <span>{videos.length}{more ? '+' : ''}</span></button>
        <button role="tab" aria-selected={tab === 'drafts'} onClick={() => setTab('drafts')}>Drafts on this device <span>{drafts.length}</span></button>
      </div>
      <input type="search" aria-label="Filter videos by title" placeholder="Filter by title…" value={filter} onChange={e => setFilter(e.target.value)}/>
    </div>
    {notice && <p className="workspace-notice" role="status">{notice}</p>}
    {error && <div className="workspace-notice" role="alert">{error} <button className="text-button" onClick={() => {setLoading(true);void load();}}>Try again</button></div>}
    {loading && videos.length === 0 && tab === 'videos' ? <div className="library-empty" role="status">Loading your library…</div> :
      tab === 'videos' ? <>
        <div className="video-grid">{videos.filter(matches).map(video => <article className="video-card" key={video.id}>
          <a className="video-cover" href={shareLink(video.id)} aria-label={`Watch ${video.title || 'Untitled video'}`}>
            {video.thumbnail ? <img src={video.thumbnail} alt="" loading="lazy"/> : <span className="video-cover-art"><PlayIcon size={32}/></span>}
            <span className="video-duration">{formatDuration(video.durationSec)}</span><span className="video-play"><PlayIcon size={22}/></span>
          </a>
          <div className="video-card-info"><a href={shareLink(video.id)}>{video.title || 'Untitled video'}</a><p>{video.createdAt?.toDate?.().toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}) || 'Just shared'} · Anyone with the link</p>
            <div className="video-card-actions"><button onClick={() => void copy(video.id)}><CopyIcon size={14}/> Copy link</button><button onClick={() => {setRenaming(video);setTitle(video.title || 'Untitled video');}}>Rename</button></div>
          </div>
        </article>)}</div>
        {!videos.filter(matches).length && !error && <div className="library-empty"><span className="empty-symbol"><PlayIcon size={28}/></span><h2>{filter ? 'No matching videos' : 'Your next great idea belongs here'}</h2><p>{filter ? 'Try another title or load more videos.' : 'Record a walkthrough, a quick update, or a hello. Share it when you’re ready.'}</p>{!filter && <button className="btn btn-secondary" onClick={onRecord}>Record your first video</button>}</div>}
        {more && <button className="btn btn-secondary library-more" disabled={loading} onClick={() => {setLoading(true);void load(true);}}>{loading ? 'Loading…' : 'Load more videos'}</button>}
      </> : <>
        <p className="library-caption">Private drafts stay in this browser until you share. Clearing browser data removes them.</p>
        <div className="video-grid">{drafts.filter(matches).map(draft => <article className="video-card" key={draft.id}>
          <button className="video-cover draft-cover" disabled={saving} onClick={() => void resume(draft)} aria-label={`Continue editing ${draft.title}`}><span className="video-cover-art"><PlayIcon size={32}/></span><span className="draft-label">DRAFT</span></button>
          <div className="video-card-info"><button className="draft-title" disabled={saving} onClick={() => void resume(draft)}>{draft.title}</button><p>Edited {new Date(draft.updatedAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})} · Only on this device</p><div className="video-card-actions"><button disabled={saving} onClick={() => void resume(draft)}>Continue editing</button><button onClick={() => setRemoving(draft)}>Delete draft</button></div></div>
        </article>)}</div>
        {!drafts.filter(matches).length && <div className="library-empty"><h2>{filter ? 'No matching drafts' : 'Nothing unfinished'}</h2><p>Finished recordings save here while you edit.</p></div>}
      </>}
    {renaming && <div className="dialog-backdrop" ref={dialogRef}><form className="workspace-dialog" role="dialog" aria-modal="true" aria-labelledby="rename-title" onSubmit={e=>{e.preventDefault();void rename();}}><h2 id="rename-title">Rename video</h2><label>Title<input autoFocus value={title} maxLength={160} onChange={e=>setTitle(e.target.value)}/></label><div><button type="button" className="btn btn-ghost" disabled={saving} onClick={()=>setRenaming(null)}>Cancel</button><button className="btn btn-primary" disabled={saving || !title.trim()}>{saving?'Saving…':'Save title'}</button></div></form></div>}
    {removing && <div className="dialog-backdrop" ref={dialogRef}><div className="workspace-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-title"><h2 id="delete-title">Delete this draft?</h2><p>“{removing.title}” will be removed from this device. This cannot be undone.</p><div><button className="btn btn-ghost" disabled={saving} onClick={()=>setRemoving(null)}>Keep draft</button><button className="btn btn-danger" disabled={saving} onClick={()=>void remove()}>Delete draft</button></div></div></div>}
  </section>;
}
