import {test,expect,type Page} from '@playwright/test';
async function fixture(page:Page) {
 await page.route('**/src/lib/firebase.ts*',route=>route.fulfill({contentType:'text/javascript',body:`export const auth={currentUser:{uid:'test-owner'}};export const firebaseConfigured=true;export const db=null;export const requireCurrentUser=()=>auth.currentUser;export const watchAuth=(cb)=>{cb(auth.currentUser);return()=>{}};export const signOut=async()=>{};export const signInWithGoogle=async()=>{};export const signInWithEmail=async()=>{};export const signUpWithEmail=async()=>{};`}));
 await page.route('**/src/lib/recordings.ts*',route=>route.fulfill({contentType:'text/javascript',body:`
 const titles=['Product walkthrough','A quick update for the team','Design feedback · Homepage','How to get started','A better way to share ideas','Friday progress update'];
 function thumbnail(i){const c=document.createElement('canvas');c.width=640;c.height=360;const x=c.getContext('2d');const g=x.createLinearGradient(0,0,640,360);g.addColorStop(0,['#e9dafa','#d9e7f5','#f8dfd7'][i%3]);g.addColorStop(1,['#c9b9ef','#aacce6','#f1c7b7'][i%3]);x.fillStyle=g;x.fillRect(0,0,640,360);x.fillStyle='#ffffffaa';x.beginPath();x.roundRect(55,45,530,270,12);x.fill();x.fillStyle='#665776';x.font='bold 24px sans-serif';x.fillText(titles[i],85,100);for(let j=0;j<3;j++){x.fillStyle=['#b5a0d9','#d3c7e7','#e5dff0'][j];x.fillRect(85,135+j*48,400-j*65,20);}return c.toDataURL('image/jpeg');}
 const videos=titles.map((title,i)=>({id:'example-'+i,title,description:'A short walkthrough with everything you need to get started.',ownerUid:'test-owner',createdAt:{toDate:()=>new Date(2026,8,9-i)},durationSec:47+i*19,thumbnail:thumbnail(i),videoUrl:'https://example.test/video.mp4'}));
 export async function listRecordings(){return {items:videos,hasMore:false};}export async function renameRecording(id,title){videos.find(v=>v.id===id).title=title;}export async function getRecording(){return videos[0];}export async function createRecording(){return 'example-new';}
 `}));
 await page.goto('/');
}
async function mount(page:Page,component='/src/App.tsx',named='default') {
 await page.evaluate(async({component,named})=>{
  const {default:React}=await import('/node_modules/.vite/deps/react.js' as string);
  const {default:{createRoot}}=await import('/node_modules/.vite/deps/react-dom_client.js' as string);
  const module=await import(component);document.body.innerHTML='<div id="test-root"></div>';
  createRoot(document.getElementById('test-root')!).render(React.createElement(module[named],{id:'example-0'}));
 },{component,named});
}
test('library dashboard, recording dialog and responsive viewer are usable',async({page})=>{
 await page.setViewportSize({width:1440,height:950});await fixture(page);await mount(page);
 await expect(page.getByText('Product walkthrough',{exact:true})).toBeVisible();
 await page.screenshot({path:'test-results/library-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'New recording',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();
 await page.screenshot({path:'test-results/recording-dialog.png'});await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/library-mobile.png',fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.setViewportSize({width:1440,height:950});await page.goto('/');await mount(page,'/src/components/SharePage.tsx','SharePage');
 await expect(page.getByRole('heading',{name:'Product walkthrough'})).toBeVisible();await page.screenshot({path:'test-results/viewer-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/viewer-mobile.png',fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('a real IndexedDB draft survives a reload and opens with its saved edit',async({page})=>{
 await fixture(page);
 await page.evaluate(async()=>{
  const c=document.createElement('canvas');c.width=320;c.height=180;const ctx=c.getContext('2d')!;ctx.fillStyle='#8150d2';ctx.fillRect(0,0,320,180);
  const stream=c.captureStream(30);const recorder=new MediaRecorder(stream,{mimeType:'video/webm'});const chunks:Blob[]=[];
  recorder.ondataavailable=e=>chunks.push(e.data);
  const blob=await new Promise<Blob>(resolve=>{recorder.onstop=()=>resolve(new Blob(chunks,{type:'video/webm'}));let frame=0;const paint=setInterval(()=>{ctx.fillStyle=frame++%2?'white':'#8150d2';ctx.fillRect(0,0,320,180);},50);recorder.start();setTimeout(()=>{clearInterval(paint);recorder.stop();},1200);});
  stream.getTracks().forEach(t=>t.stop());
  const {saveDraft}=await import('/src/lib/drafts.ts' as string);
  await saveDraft({id:'persistent-draft',ownerUid:'test-owner',blob,title:'Saved on this device',description:'Survives reload',createdAt:Date.now(),updatedAt:Date.now(),clips:[{id:'c1',start:0.1,end:0.8}]});
 });
 await page.reload();await mount(page);await page.getByRole('tab',{name:/Drafts on this device/}).click();
 await expect(page.getByRole('button',{name:'Saved on this device',exact:true})).toBeVisible();await page.getByRole('button',{name:'Continue editing',exact:true}).click();
 await expect(page.getByLabel('Video title')).toHaveValue('Saved on this device',{timeout:60000});
 await expect(page.locator('.tl-clip-len')).toHaveText('0.7s',{timeout:60000});
});
