import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, cleanup } from '@testing-library/react';
import { StrictMode } from 'react';
import { useScreenRecorder } from '../src/lib/useScreenRecorder';
const loop = vi.hoisted(() => ({ stop: vi.fn(), frame: null as any }));
vi.mock('../src/lib/frameLoop', () => ({ startFrameLoop: (_fps: number, cb: any) => { loop.frame = cb; return {stop: loop.stop}; } }));
let tracks: any[]; let recorders: any[];
class Stream {
  tracks: any[];
  constructor(t = [{kind:'video', readyState:'live',stop:vi.fn()}]) {this.tracks=t; tracks.push(...t);}
  getTracks() {return this.tracks;}
  getVideoTracks() {return this.tracks.filter(t=>t.kind==='video');}
  getAudioTracks() {return this.tracks.filter(t=>t.kind==='audio');}
}
class Recorder {
  static isTypeSupported() {return true;}
  state = 'inactive'; mimeType='video/webm'; onstop: any; ondataavailable: any;
  constructor() {recorders.push(this);}
  start() {this.state='recording';}
  stop() {this.state='inactive'; this.ondataavailable?.({data:new Blob(['frames'])}); this.onstop?.();}
  pause() {this.state='paused';} resume() {this.state='recording';}
}
beforeEach(() => {
  vi.useFakeTimers(); tracks=[]; recorders=[];
  vi.stubGlobal('MediaStream', Stream); vi.stubGlobal('MediaRecorder', Recorder);
  vi.stubGlobal('AudioContext', class { resume=vi.fn(async()=>{}); close=vi.fn(async()=>{}); createMediaStreamDestination=()=>({stream:new Stream([])}); });
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getDisplayMedia:vi.fn(async()=>new Stream()),getUserMedia:vi.fn(async()=>new Stream())}});
  vi.spyOn(HTMLMediaElement.prototype,'play').mockResolvedValue();
  Object.defineProperty(HTMLVideoElement.prototype,'videoWidth',{configurable:true,get:()=>3840});
  Object.defineProperty(HTMLVideoElement.prototype,'videoHeight',{configurable:true,get:()=>2160});
  Object.defineProperty(HTMLVideoElement.prototype,'readyState',{configurable:true,get:()=>2});
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({drawImage:vi.fn()} as any);
  HTMLCanvasElement.prototype.captureStream = () => new Stream() as any;
});
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
test('StrictMode starts exactly once, detached canvas survives, pause excludes paused time, stop cleans tracks',async()=>{
  const {result}=renderHook(()=>useScreenRecorder(),{wrapper:StrictMode});
  await act(async()=>{await result.current.arm({includeWebcam:false,includeMic:false});});
  const canvas=result.current.canvasRef.current!; expect(canvas.width).toBe(1920); expect(canvas.isConnected).toBe(false);
  act(()=>result.current.beginRecording()); await act(async()=>{vi.advanceTimersByTime(3000);});
  expect(recorders).toHaveLength(1); expect(result.current.status).toBe('recording');
  act(()=>{vi.advanceTimersByTime(1250);result.current.pause();});
  expect(result.current.elapsedMs).toBe(1250);
  act(()=>{vi.advanceTimersByTime(5000);result.current.resume();});
  act(()=>vi.advanceTimersByTime(1000)); expect(result.current.elapsedMs).toBe(2250);
  act(()=>result.current.stop()); expect(result.current.recordedBlob?.size).toBeGreaterThan(0);
  expect(tracks.every(t=>t.stop.mock.calls.length)).toBe(true); expect(loop.stop).toHaveBeenCalled();
});
test('unmount during permission request stops late stream',async()=>{
  let resolve: any; navigator.mediaDevices.getDisplayMedia=vi.fn(()=>new Promise(r=>resolve=r));
  const {result,unmount}=renderHook(()=>useScreenRecorder()); let pending: any;
  act(()=>{pending=result.current.arm({includeWebcam:false,includeMic:false});}); unmount();
  const stream=new Stream(); await act(async()=>{resolve(stream);await pending;});
  expect(stream.getTracks()[0].stop).toHaveBeenCalled();
});
test('browser stop during countdown cancels capture',async()=>{
  const {result}=renderHook(()=>useScreenRecorder()); await act(async()=>{await result.current.arm({includeWebcam:false,includeMic:false});});
  act(()=>result.current.beginRecording()); act(()=>tracks[0].onended());
  act(()=>vi.advanceTimersByTime(5000)); expect(recorders).toHaveLength(0); expect(result.current.status).toBe('idle');
});
test('permission rejection returns a recoverable error',async()=>{
  navigator.mediaDevices.getDisplayMedia=vi.fn().mockRejectedValue(new Error('Permission denied'));
  const {result}=renderHook(()=>useScreenRecorder()); await act(async()=>{await result.current.arm({includeWebcam:false,includeMic:false});});
  expect(result.current.status).toBe('error'); expect(result.current.error).toBe('Permission denied');
});
