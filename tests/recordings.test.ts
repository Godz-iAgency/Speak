import {test,expect,vi,beforeEach} from 'vitest';
const mocks=vi.hoisted(()=>({getDocs:vi.fn(),addDoc:vi.fn(async()=>({id:'new-video'})),updateDoc:vi.fn()}));
vi.mock('../src/lib/firebase',()=>({db:{},requireCurrentUser:()=>({uid:'signed-in-owner'})}));
vi.mock('firebase/firestore',()=>({
 getDocs:mocks.getDocs,addDoc:mocks.addDoc,updateDoc:mocks.updateDoc,
 collection:(_:unknown,name:string)=>name,doc:(_:unknown,name:string,id:string)=>({name,id}),getDoc:vi.fn(),
 where:(...args:unknown[])=>({where:args}),orderBy:(...args:unknown[])=>({orderBy:args}),limit:(count:number)=>({limit:count}),
 startAfter:(cursor:unknown)=>({startAfter:cursor}),query:(...args:unknown[])=>args,serverTimestamp:()=> 'server-time',Timestamp:class {},
}));
import {listRecordings,cleanDetails,renameRecording} from '../src/lib/recordings';
beforeEach(()=>vi.clearAllMocks());
test('library queries are owner-scoped, newest first and bounded with a cursor',async()=>{
 const cursor={id:'last-page'};mocks.getDocs.mockResolvedValue({docs:[{id:'video',data:()=>({title:'Hello'})}],size:1});
 const result=await listRecordings(cursor as any);
 expect(mocks.getDocs).toHaveBeenCalledWith(['recordings',{where:['ownerUid','==','signed-in-owner']},{orderBy:['createdAt','desc']},{limit:24},{startAfter:cursor}]);
 expect(result.items).toEqual([{id:'video',title:'Hello'}]);expect(result.hasMore).toBe(false);
});
test('metadata bounds text and permits only small embedded JPEG thumbnails',()=>{
 expect(cleanDetails({title:'  ',description:'x'.repeat(2100),thumbnail:'https://tracker.example/pixel'})).toEqual({title:'Untitled video',description:'x'.repeat(2000),thumbnail:''});
 expect(cleanDetails({title:'x'.repeat(170),thumbnail:'data:image/jpeg;base64,abc'}).title).toHaveLength(160);
 expect(cleanDetails({thumbnail:'data:image/jpeg;base64,'+'x'.repeat(60000)}).thumbnail).toBe('');
});
test('renaming updates only the trimmed title',async()=>{
 await renameRecording('video','  New title  ');
 expect(mocks.updateDoc).toHaveBeenCalledWith({name:'recordings',id:'video'},{title:'New title'});
});
