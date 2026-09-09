import { test, expect } from '@playwright/test';

test('real MediaRecorder captures changing detached canvas; controls, edit and MP4 work', async ({page}) => {
  const errors: string[] = []; page.on('pageerror', e=>errors.push(e.message));
  await page.goto('/');
  await page.evaluate(async()=>{
    // Mount the real app in an isolated test document, without contacting Auth.
    const {default: React} = await import('/node_modules/.vite/deps/react.js' as string);
    const {default: {createRoot}} = await import('/node_modules/.vite/deps/react-dom_client.js' as string);
    const {default: App} = await import('/src/App.tsx' as string);
    document.body.innerHTML = '<div id="test-root"></div>';
    const source=document.createElement('canvas'); source.width=640;source.height=360;
    const ctx=source.getContext('2d')!;
    let n=0;setInterval(()=>{ctx.fillStyle=n++%2?'#ef4444':'#2563eb';ctx.fillRect(0,0,640,360);ctx.fillStyle='white';ctx.font='48px sans-serif';ctx.fillText(String(n),40,100);},50);
    Object.defineProperty(navigator.mediaDevices,'getDisplayMedia',{value:async()=>source.captureStream(30),configurable:true});
    createRoot(document.getElementById('test-root')!).render(React.createElement(React.StrictMode,null,React.createElement(App)));
  });
  await page.getByRole('button',{name:'Camera bubble'}).click();
  await page.getByRole('button',{name:'Microphone',exact:true}).click();
  await page.getByRole('button',{name:'Choose what to share'}).click();
  await expect(page.locator('.live-preview-canvas')).toBeVisible();
  await page.getByRole('button',{name:'Start recording',exact:true}).click();
  await expect(page.locator('.live-preview-canvas')).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'You’re recording'})).toBeVisible();
  await page.waitForTimeout(1600);
  const floated = await page.evaluate(()=>{
    const pip=(window as any).documentPictureInPicture?.window;
    if (!pip) return false;
    const pause=pip.document.querySelector('button[aria-label="Pause"]');
    if (!pause) throw new Error('Floating pause control missing');
    pause.click(); return true;
  });
  console.log('Native floating controls available:',floated);
  if (!floated) await page.getByRole('button',{name:'Pause',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Recording paused'})).toBeVisible();
  if (floated) await page.evaluate(()=> (window as any).documentPictureInPicture.window.document.querySelector('button[aria-label="Resume"]').click());
  else await page.getByRole('button',{name:'Resume',exact:true}).click();
  await page.waitForTimeout(1600);
  await page.getByRole('button',{name:'Stop',exact:true}).click();

  await expect(page.getByRole('button',{name:'Export MP4'})).toBeEnabled({timeout:60000});
  const video=page.locator('.editor-video');
  const metadata=await video.evaluate((v:HTMLVideoElement)=>({duration:v.duration,width:v.videoWidth,height:v.videoHeight}));
  expect(metadata.duration).toBeGreaterThan(2);expect(metadata.width).toBe(640);
  const samples=await video.evaluate(async(v:HTMLVideoElement)=>{
    const c=document.createElement('canvas'); c.width=640;c.height=360;const ctx=c.getContext('2d')!;
    const values=[];
    for(const time of [.2,.8,1.4,2.0]) { await new Promise<void>(resolve=>{v.onseeked=()=>resolve();v.currentTime=time;});ctx.drawImage(v,0,0);values.push([...ctx.getImageData(45,70,100,40).data].reduce((a,b)=>a+b,0)); }
    return values;
  });
  expect(new Set(samples).size).toBeGreaterThan(1);
  await page.getByRole('button',{name:'Export MP4'}).click();
  await expect(page.getByText('Your MP4 is ready')).toBeVisible({timeout:60000});
  await page.locator('.tl-clip').click({position:{x:100,y:30}});
  await page.getByRole('button',{name:'Split',exact:true}).click();
  await expect(page.locator('.tl-clip')).toHaveCount(2);
  await expect(page.getByText('Your MP4 is ready')).toHaveCount(0);
  await page.getByRole('button',{name:'Export MP4'}).click();
  await page.getByRole('button',{name:'Cancel export'}).click();
  await expect(page.getByRole('button',{name:'Export MP4',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Export MP4',exact:true}).click();
  await expect(page.getByText('Your MP4 is ready')).toBeVisible({timeout:60000});
  await page.screenshot({path:'test-results/editor-verified.png'});
  expect(errors).toEqual([]);
});
