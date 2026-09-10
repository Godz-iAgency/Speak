import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
const mocks=vi.hoisted(()=>({upload:vi.fn(async()=> 'shared-id'),trim:vi.fn(async()=>new Blob(['mp4'],{type:'video/mp4'})),save:vi.fn(async()=>{})}));
vi.mock('../src/lib/firebase',()=>({auth:{currentUser:{uid:'owner'}},firebaseConfigured:true}));
vi.mock('../src/lib/ffmpeg',()=>({remuxForDuration:async(blob:Blob)=>blob,trimAndExport:mocks.trim,cancelExport:vi.fn(),isCancellation:()=>false}));
vi.mock('../src/lib/upload',()=>({uploadRecording:mocks.upload}));
vi.mock('../src/lib/drafts',()=>({saveDraft:mocks.save}));
import { Editor } from '../src/components/Editor';
beforeEach(()=>{
 vi.clearAllMocks(); URL.createObjectURL=vi.fn(()=> 'blob:video');URL.revokeObjectURL=vi.fn();
 vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});
 Object.defineProperty(HTMLVideoElement.prototype,'duration',{configurable:true,get:()=>10});
});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
const blob=new Blob(['webm'],{type:'video/webm'});
async function ready(initialDraft?:any) {
 const view=render(<Editor blob={blob} onDiscard={vi.fn()} initialDraft={initialDraft}/>);
 await waitFor(()=>expect(view.container.querySelector('.editor-video')).not.toBeNull());
 fireEvent.loadedMetadata(view.container.querySelector('.editor-video')!);return view;
}
test('Share video directly uploads untouched WebM and its title without an MP4 export',async()=>{
 await ready();fireEvent.change(screen.getByLabelText('Video title'),{target:{value:'Product walkthrough'}});
 fireEvent.click(screen.getByRole('button',{name:'Share video'}));
 await screen.findByRole('region',{name:'Video shared'});
 expect(mocks.trim).not.toHaveBeenCalled();expect(mocks.upload).toHaveBeenCalledWith(blob,10,expect.any(Function),expect.any(AbortSignal),expect.objectContaining({title:'Product walkthrough'}));
});
test('Share video renders edited clips automatically before uploading',async()=>{
 await ready({id:'draft',title:'Edited',description:'Context',createdAt:1,clips:[{id:'c9',start:2,end:7}]});
 fireEvent.click(screen.getByRole('button',{name:'Share video'}));await screen.findByRole('region',{name:'Video shared'});
 expect(mocks.trim).toHaveBeenCalledWith(blob,[{start:2,end:7}],expect.any(Function));expect(mocks.upload.mock.calls[0][0].type).toBe('video/mp4');
 expect(mocks.upload.mock.calls[0][1]).toBe(5);
});
test('an intentionally empty draft remains empty when reopened',async()=>{
 await ready({id:'empty',title:'Empty',description:'',createdAt:1,clips:[]});
 expect(screen.getByText(/Everything's been cut/)).toBeTruthy();expect((screen.getByRole('button',{name:'Share video'}) as HTMLButtonElement).disabled).toBe(true);
});
test('returning to the library flushes the named draft and current edits',async()=>{
 const back=vi.fn();const view=render(<Editor blob={blob} onDiscard={back}/>);
 await waitFor(()=>expect(view.container.querySelector('.editor-video')).not.toBeNull());fireEvent.loadedMetadata(view.container.querySelector('.editor-video')!);
 fireEvent.change(screen.getByLabelText('Video title'),{target:{value:'Keep this'}});
 fireEvent.click(screen.getByRole('button',{name:'← My library'}));
 await waitFor(()=>expect(back).toHaveBeenCalled());expect(mocks.save).toHaveBeenLastCalledWith(expect.objectContaining({ownerUid:'owner',blob,title:'Keep this',clips:[{id:'c0',start:0,end:10}]}));
});

test('a draft saved before metadata initializes recovers the full timeline',async()=>{
 await ready({id:'preparing',title:'Interrupted preparation',description:'',createdAt:1,clips:[],editsReady:false});
 fireEvent.click(screen.getByRole('button',{name:'Share video'}));
 await screen.findByRole('region',{name:'Video shared'});
 expect(mocks.upload.mock.calls[0][1]).toBe(10);
 expect(mocks.trim).not.toHaveBeenCalled();
});
