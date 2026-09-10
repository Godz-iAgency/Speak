import { useEffect, useRef, useState } from 'react';
import { getRecording, type RecordingDoc } from '../lib/recordings';
import { firebaseConfigured } from '../lib/firebase';
import { formatDuration, shareLink } from '../lib/videoDetails';
import { CheckIcon, CopyIcon, RecordIcon } from './icons';

interface SharePageProps { id: string; }
type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; rec: RecordingDoc };
export function SharePage({ id }: SharePageProps) {
  const [state, setState] = useState<LoadState>(firebaseConfigured ? {status:'loading'} : {status:'error',message:'This deployment is not connected to a database yet.'});
  const [time, setTime] = useState(0);
  const [fromHere, setFromHere] = useState(false);
  const [speed, setSpeed] = useState('1');
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  const [mediaError, setMediaError] = useState(false);
  const video = useRef<HTMLVideoElement | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!firebaseConfigured) return;
    let active = true;
    getRecording(id).then(rec => {
      if (!active) return;
      if (!rec) setState({status:'error',message:'This video no longer exists, or the link is incorrect.'});
      else if (!rec.videoUrl?.startsWith('https://')) setState({status:'error',message:'This video has an invalid playback address.'});
      else setState({status:'ready',rec});
    }).catch(() => {if (active) setState({status:'error',message:'We couldn’t load this video. Check your connection and try again.'});});
    return () => {active=false;};
  }, [id]);
  useEffect(() => {
    const previous = document.title;
    if (state.status === 'ready') document.title = (state.rec.title || 'Untitled video') + ' · speak.';
    return () => {document.title=previous;};
  }, [state]);
  useEffect(() => () => {if (copyTimer.current) clearTimeout(copyTimer.current);}, []);
  const copy = async () => {
    setCopyError('');
    try {await navigator.clipboard.writeText(shareLink(id, fromHere ? time : 0));setCopied(true);if(copyTimer.current)clearTimeout(copyTimer.current);copyTimer.current=setTimeout(()=>setCopied(false),2000);}
    catch {setCopyError('Select and copy the link below.');}
  };
  const metadata = () => {
    const v=video.current;if (!v) return;
    const start=Number(new URLSearchParams(window.location.search).get('t'));
    if (Number.isFinite(start) && start>0 && Number.isFinite(v.duration)) v.currentTime=Math.min(start,Math.max(0,v.duration-0.1));
    v.playbackRate=Number(speed);
  };
  return <div className="watch-page">
    <header className="watch-nav"><a className="workspace-brand" href="/"><img src="/speak-icon.png" alt=""/>speak.</a><a className="btn btn-secondary btn-small" href="/app"><RecordIcon size={14}/> Record a video</a></header>
    {state.status === 'loading' && <main className="watch-loading" role="status"><div className="prep-bar"><div className="prep-bar-fill"/></div><p>Getting your video ready…</p></main>}
    {state.status === 'error' && <main className="library-empty"><h1>This video isn’t available</h1><p role="alert">{state.message}</p><button className="btn btn-secondary" onClick={()=>window.location.reload()}>Try again</button></main>}
    {state.status === 'ready' && <main className="watch-layout"><article className="watch-content">
      <div className="watch-player"><video ref={video} src={state.rec.videoUrl} poster={state.rec.thumbnail || undefined} controls playsInline preload="metadata" onLoadedMetadata={metadata} onTimeUpdate={()=>setTime(video.current?.currentTime || 0)} onError={()=>setMediaError(true)}/></div>
      {mediaError && <p className="home-error" role="alert">Playback failed. Check your connection, then <button className="text-button" onClick={()=>{setMediaError(false);video.current?.load();}}>reload the video</button>.</p>}
      <div className="watch-player-tools"><span>{formatDuration(time)} / {formatDuration(state.rec.durationSec)}</span><label>Playback speed<select aria-label="Playback speed" value={speed} onChange={e=>{setSpeed(e.target.value);if(video.current)video.current.playbackRate=Number(e.target.value);}}>{['0.5','0.75','1','1.25','1.5','1.75','2'].map(rate=><option key={rate} value={rate}>{rate}×</option>)}</select></label></div>
      <h1>{state.rec.title || 'Untitled video'}</h1><p className="watch-byline">Shared with speak. <span>·</span> {state.rec.createdAt?.toDate?.().toLocaleDateString(undefined,{month:'long',day:'numeric',year:'numeric'}) || 'Just now'} <span>·</span> {formatDuration(state.rec.durationSec)}</p>
      {state.rec.description ? <p className="watch-description">{state.rec.description}</p> : <p className="watch-description watch-description-empty">A message worth watching.</p>}
    </article><aside className="watch-share"><span className="eyebrow">PASS IT ON</span><h2>Better shared.</h2><p>Send this video to someone who needs to see it.</p><button className="btn btn-primary" onClick={()=>void copy()}>{copied?<CheckIcon size={16}/>:<CopyIcon size={16}/>} {copied?'Link copied':'Copy link'}</button><label className="timestamp-toggle"><input type="checkbox" checked={fromHere} onChange={e=>setFromHere(e.target.checked)}/> Start at {formatDuration(time)}</label><input className="share-link-input" aria-label="Video link" readOnly value={shareLink(id,fromHere?time:0)} onFocus={e=>e.target.select()}/>{copyError && <p role="status">{copyError}</p>}<div className="watch-permission"><span aria-hidden="true">↗</span> Anyone with the link can watch</div><div className="watch-cta"><strong>Say it with a video.</strong><p>Skip the long message. Show what you mean.</p><a href="/app">Make your own with speak. →</a></div></aside></main>}
    <footer className="watch-footer">Record. Share. Be Heard.</footer>
  </div>;
}
