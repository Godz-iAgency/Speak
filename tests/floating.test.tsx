import {test,expect,vi,afterEach} from 'vitest';
import {renderHook,act,cleanup} from '@testing-library/react';
import {useFloatingControls} from '../src/lib/useFloatingControls';
afterEach(()=>{cleanup();delete (window as any).documentPictureInPicture;});
test('unsupported floating controls safely do nothing',async()=>{
 const {result}=renderHook(()=>useFloatingControls(true));
 await act(()=>result.current.open()); expect(result.current.supported).toBe(false);expect(result.current.pip).toBeNull();
});
test('closing floating controls restores fallback and stopping closes child',async()=>{
 const child=new EventTarget() as any; child.document=document.implementation.createHTMLDocument();child.close=vi.fn(()=>child.dispatchEvent(new Event('pagehide')));
 (window as any).documentPictureInPicture={requestWindow:vi.fn(async()=>child)};
 const {result,rerender}=renderHook(({active})=>useFloatingControls(active),{initialProps:{active:true}});
 await act(()=>result.current.open());expect(result.current.pip).toBe(child);
 act(()=>child.dispatchEvent(new Event('pagehide')));expect(result.current.pip).toBeNull();
 await act(()=>result.current.open());rerender({active:false});expect(child.close).toHaveBeenCalled();expect(result.current.pip).toBeNull();
});
test('late floating window is closed if setup was cancelled',async()=>{
 let resolve:any;const child={close:vi.fn()};
 (window as any).documentPictureInPicture={requestWindow:()=>new Promise(r=>resolve=r)};
 const {result,rerender}=renderHook(({active})=>useFloatingControls(active),{initialProps:{active:true}});
 let pending:any;act(()=>{pending=result.current.open();});rerender({active:false});
 await act(async()=>{resolve(child);await pending;});expect(child.close).toHaveBeenCalled();
});
