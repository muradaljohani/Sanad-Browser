'use strict';
// A public, unauthenticated live probe, separate from deterministic release gates.
// Bot/consent/network walls are recorded as inconclusive, never as ad-blocking success.
const { _electron: electron } = require('playwright');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const output = path.join(__dirname, '..', 'test-results');
const url = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sanad-youtube-live-'));
  fs.mkdirSync(output, { recursive: true });
  const report = { testedAt: new Date().toISOString(), url, version: require('../package.json').version, result: 'inconclusive', samples: [], limits: 'One public video, fresh signed-out profile, one network/region. No inference that ads were served or that all campaigns are blocked.' };
  let app;
  try {
    app = await electron.launch({ args: ['--no-sandbox', path.join(__dirname, '..')], env: { ...process.env, SANAD_BROWSER_TEST_MODE: '1', SANAD_BROWSER_TEST_PROFILE: profile, SANAD_BROWSER_TEST_URL: url }, timeout: 30000 });
    const shell = await app.firstWindow();
    await shell.waitForFunction(() => Boolean(window.sanadBrowser));
    const inspect = () => app.evaluate(async ({ webContents }) => {
      const wc = webContents.getAllWebContents().find(item => item.getURL().startsWith('https://www.youtube.com/'));
      if (!wc) return { pending: true };
      return wc.executeJavaScript(`(() => {
        const p=document.querySelector('#movie_player'),v=p?.querySelector('video'),r=p?.getPlayerResponse?.()||window.ytInitialPlayerResponse;
        if(v) { v.muted=true; v.play().catch(()=>{}); }
        return {url:location.href,title:document.title,hook:typeof window.__sanadYoutubeDataV1?.setEnabled==='function',playability:r?.playabilityStatus?.status||null,
          error:(document.querySelector('yt-playability-error-supported-renderers')?.innerText||document.querySelector('#error-screen')?.innerText||'').slice(0,500),
          ad:!!p&&(p.classList.contains('ad-showing')||p.classList.contains('ad-interrupting')),time:v?.currentTime||0,duration:Number.isFinite(v?.duration)?v.duration:null,paused:v?.paused??null,
          node:typeof require,bridge:typeof window.sanadBrowser,adMetadata:!!(r?.adPlacements?.length||r?.adSlots?.length||r?.playerAds?.length)};
      })()`, true).catch(error => ({ pending: true, error: error.message.slice(0,200) }));
    });
    for (let n=0;n<15;n++) { await wait(2000); const sample=await inspect(); report.samples.push(sample); if (sample.playability && sample.playability !== 'OK' && sample.error) break; }
    const playing=report.samples.filter(s=>s.playability==='OK'&&s.paused===false&&s.time>0.2);
    if (playing.length>=2 && Math.max(...playing.map(s=>s.time))-Math.min(...playing.map(s=>s.time))>0.5) {
      report.result=!report.samples.some(s=>s.ad||s.adMetadata) && playing.every(s=>s.hook && s.node==='undefined' && s.bridge==='undefined') ? 'playback-observed-no-ad-in-samples' : 'playback-observed-needs-review';
    }
    await app.evaluate(({webContents}, filename) => { const wc=webContents.getAllWebContents().find(item=>item.getURL().startsWith('https://www.youtube.com/')); if(wc) return wc.capturePage().then(image=>require('node:fs').writeFileSync(filename,image.toPNG())); }, path.join(output,'youtube-live.png'));
  } catch(error) { report.error=error.message.slice(0,2000); }
  finally {
    if(app) await app.close();
    fs.rmSync(profile,{recursive:true,force:true});
    fs.writeFileSync(path.join(output,'youtube-live.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report));
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
