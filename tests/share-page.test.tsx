import {test,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
vi.mock('../src/lib/firebase',()=>({firebaseConfigured:true}));
vi.mock('../src/lib/recordings',()=>({getRecording:async()=>({title:'A quick walkthrough',description:'Here is the context.',videoUrl:'https://example.test/video.mp4',durationSec:90})}));
import {SharePage} from '../src/components/SharePage';
afterEach(cleanup);
test('viewer honors timestamp links and copies the current playback timestamp',async()=>{
 window.history.replaceState({},'', '/v/test?t=12');const writeText=vi.fn(async()=>{});Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText}});
 const view=render(<SharePage id="test"/>);await screen.findByRole('heading',{name:'A quick walkthrough'});
 const video=view.container.querySelector('video')!;Object.defineProperty(video,'duration',{value:90,configurable:true});fireEvent.loadedMetadata(video);expect(video.currentTime).toBe(12);
 video.currentTime=25;fireEvent.timeUpdate(video);fireEvent.click(screen.getByRole('checkbox',{name:'Start at 0:25'}));fireEvent.click(screen.getByRole('button',{name:'Copy link'}));
 await waitFor(()=>expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/v/test?t=25')));
 fireEvent.change(screen.getByRole('combobox',{name:'Playback speed'}),{target:{value:'1.5'}});expect(video.playbackRate).toBe(1.5);
});
