import 'fake-indexeddb/auto';
import {test,expect,beforeEach} from 'vitest';
import {saveDraft,listDrafts,getDraft,deleteDraft,type Draft} from '../src/lib/drafts';
let seq=0;
const draft=(ownerUid:string,id:string):Draft=>({id,ownerUid,blob:new Blob(['video']),title:'Draft',description:'Context',createdAt:1,updatedAt:++seq,clips:[{id:'c0',start:1,end:5}]});
beforeEach(()=>{seq++;});
test('drafts retain edits and are listed only for their owner',async()=>{
 const owner='owner-'+seq,other='other-'+seq;await saveDraft(draft(owner,owner));await saveDraft(draft(other,other));
 const saved=await listDrafts(owner);expect(saved).toHaveLength(1);expect(saved[0]).not.toHaveProperty('blob');expect(await getDraft(owner,other)).toBeNull();expect(await getDraft(owner,owner)).not.toBeNull();expect(saved[0].clips).toEqual([{id:'c0',start:1,end:5}]);
 await saveDraft({...saved[0],blob:new Blob(['video']),title:'Renamed',clips:[]});expect((await listDrafts(owner))[0].title).toBe('Renamed');expect((await listDrafts(owner))[0].clips).toEqual([]);
});
test('deleting a draft does not remove a different owner’s draft',async()=>{
 const owner='delete-'+seq;await saveDraft(draft(owner,owner));await deleteDraft(owner,'someone-else');expect(await listDrafts(owner)).toHaveLength(1);
 await deleteDraft(owner,owner);expect(await listDrafts(owner)).toHaveLength(0);
});
