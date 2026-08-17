const { chromium } = require('playwright-core');
const path = require('path');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 468, height: 820 }, deviceScaleFactor: 2 });
  const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.goto('file://' + path.resolve('web/index.html'));
  await p.waitForTimeout(800);
  await p.click('#missionBtn'); await p.waitForTimeout(300);
  await p.click('#launchBtn'); await p.waitForTimeout(400);
  await p.mouse.click(234, 400);
  await p.waitForTimeout(2500);
  await p.screenshot({path:'/tmp/hero-merged.png'});
  console.log('errors', errs.length); errs.slice(0,3).forEach(e=>console.log(' ',e));
  await b.close();
})();
