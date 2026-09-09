import {test,expect,vi,beforeEach} from 'vitest';
import handler from '../api/sign-upload';
vi.mock('../api/_firebaseAdmin.js',()=>({requireUid:vi.fn(async()=>{throw new Error('private config detail');})}));
test('signing endpoint rejects methods and hides internal auth errors',async()=>{
 const res:any={setHeader:vi.fn(),status:vi.fn().mockReturnThis(),json:vi.fn()};
 await handler({method:'GET'} as any,res);expect(res.status).toHaveBeenCalledWith(405);expect(res.setHeader).toHaveBeenCalledWith('Allow','POST');
 await handler({method:'POST',headers:{}} as any,res);expect(res.status).toHaveBeenCalledWith(401);expect(res.json).toHaveBeenLastCalledWith({error:'Unauthorized'});
});
const {createRecording}=vi.hoisted(()=>({createRecording:vi.fn(async()=> 'id')}));
vi.mock('../src/lib/firebase',()=>({requireCurrentUser:()=>({uid:'test',getIdToken:async()=> 'test-token'})}));
vi.mock('../src/lib/recordings',()=>({createRecording}));
import {uploadRecording} from '../src/lib/upload';
let xhr:any;
beforeEach(()=>{
 xhr=null; createRecording.mockClear();
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({uploadUrl:'https://example.test/upload',key:'key',publicUrl:'https://example.test/video'})})));
 vi.stubGlobal('XMLHttpRequest',class{constructor(){return xhr={upload:{},status:200,open(){},setRequestHeader(){},send(){}};}});
});
test('network failure never creates metadata',async()=>{
 const pending=uploadRecording(new Blob(['x'],{type:'video/mp4'}),1);
 const rejection=expect(pending).rejects.toThrow('network error');await vi.waitFor(()=>expect(xhr?.onerror).toBeTypeOf('function'));xhr.onerror();await rejection;expect(createRecording).not.toHaveBeenCalled();
});
test('metadata is created only after a successful PUT',async()=>{
 const pending=uploadRecording(new Blob(['x'],{type:'video/mp4'}),1);
 await vi.waitFor(()=>expect(xhr?.onload).toBeTypeOf('function'));xhr.onload();await expect(pending).resolves.toBe('id');expect(createRecording).toHaveBeenCalledWith(expect.objectContaining({ownerUid:'test',durationSec:1,sizeBytes:1}));
});
