import {test,expect,vi,afterEach,beforeEach} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
const mocks=vi.hoisted(()=>({list:vi.fn(),rename:vi.fn(async()=>{}),drafts:vi.fn(async()=>[]),remove:vi.fn(async()=>{})}));
vi.mock('../src/lib/firebase',()=>({auth:{currentUser:{uid:'owner'}}}));
vi.mock('../src/lib/recordings',()=>({listRecordings:mocks.list,renameRecording:mocks.rename}));
vi.mock('../src/lib/drafts',()=>({listDrafts:mocks.drafts,deleteDraft:mocks.remove,getDraft:vi.fn()}));
import {Library} from '../src/components/Library';
afterEach(cleanup);
beforeEach(()=>{vi.clearAllMocks();mocks.list.mockResolvedValue({items:[{id:'one',title:'Design review',durationSec:15,createdAt:{toDate:()=>new Date()},videoUrl:'https://example.test/v'}],hasMore:false});mocks.drafts.mockResolvedValue([]);});
test('library loads named videos, filters and persists a rename',async()=>{
 render(<Library onRecord={vi.fn()} onResume={vi.fn()}/>);await screen.findByText('Design review');
 fireEvent.change(screen.getByLabelText('Filter videos by title'),{target:{value:'missing'}});expect(screen.queryByText('Design review')).toBeNull();
 fireEvent.change(screen.getByLabelText('Filter videos by title'),{target:{value:''}});fireEvent.click(screen.getByRole('button',{name:'Rename'}));
 fireEvent.change(screen.getByLabelText('Title'),{target:{value:'Team update'}});fireEvent.click(screen.getByRole('button',{name:'Save title'}));
 await screen.findByText('Team update');expect(mocks.rename).toHaveBeenCalledWith('one','Team update');
});
test('draft removal requires a concrete confirmation and is scoped to the owner',async()=>{
 mocks.drafts.mockResolvedValue([{id:'draft',title:'Private draft',updatedAt:1}]);
 render(<Library onRecord={vi.fn()} onResume={vi.fn()}/>);await screen.findByText('Design review');fireEvent.click(screen.getByRole('tab',{name:/Drafts/}));
 fireEvent.click(screen.getByRole('button',{name:'Delete draft'}));expect(mocks.remove).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Keep draft'}));expect(mocks.remove).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Delete draft'}));fireEvent.click(screen.getAllByRole('button',{name:'Delete draft'}).at(-1)!);
 await waitFor(()=>expect(mocks.remove).toHaveBeenCalledWith('draft','owner'));
});
