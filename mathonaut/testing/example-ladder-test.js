// ---------------------------------------------------------------------------
// Example headless test — see testing/README.md
//
// Setup:
//   npm i three jsdom esbuild
//   npx esbuild ../prototype/Mathonaut.jsx --bundle --format=cjs \
//       --external:three --alias:react=./stub/react.js --outfile=./game.cjs
//   node example-ladder-test.js
//
// No browser and no GPU are required: three.js is real, the WebGLRenderer is faked,
// the clock is driven manually, and the game is played by a scripted auto-pilot.
// ---------------------------------------------------------------------------
// Does a child actually climb the ladder? Simulate a learner who is accurate
// at their level, then verify progression 1 -> 13 and the speed that comes with it.
let T=0;
try{Object.defineProperty(globalThis,'performance',{value:{now:()=>T},configurable:true});}
catch(e){globalThis.performance.now=()=>T;}
const {JSDOM}=require('jsdom');
const dom=new JSDOM('<!doctype html><body><div id="root"></div></body>',{pretendToBeVisual:true});
const {window}=dom;
global.window=window;global.document=window.document;global.navigator=window.navigator;
window.performance={now:()=>T};
const THREE=require('three');
class FR{constructor(){this.info={render:{calls:0,triangles:0}};}setPixelRatio(){}setSize(){}render(){}dispose(){}}
THREE.WebGLRenderer=FR;
const cs=new Proxy({},{get:(t,k)=>{
  if(k==='createLinearGradient'||k==='createRadialGradient')return()=>({addColorStop(){}});
  return typeof k==='string'?()=>{}:undefined;}});
window.HTMLCanvasElement.prototype.getContext=function(){return cs;};
let rafCbs=[];
window.requestAnimationFrame=global.requestAnimationFrame=cb=>{rafCbs.push(cb);return 1;};
window.cancelAnimationFrame=global.cancelAnimationFrame=()=>{};
const store={};
window.storage={get:async k=>store[k]?{key:k,value:store[k]}:(()=>{throw new Error('nf')})(),
                set:async(k,v)=>{store[k]=v;return{key:k,value:v}}};
const {MARKUP,createGame}=require('./game.cjs');
const root=window.document.getElementById('root');
root.innerHTML=MARKUP;
Object.defineProperty(root,'clientWidth',{value:390});
Object.defineProperty(root,'clientHeight',{value:844});
const errors=[];
createGame(root,THREE);
const $=id=>root.querySelector('#'+id);
const frame=()=>{T+=16.7;const c=rafCbs;rafCbs=[];c.forEach(cb=>{try{cb(T);}catch(e){errors.push(e.message);}});};
const settle=(n=8)=>{for(let i=0;i<n;i++)frame();};
const D=()=>window.__THREE_GAME_DIAGNOSTICS__;
const tap=id=>{$(id).dispatchEvent(new window.Event('touchend',{cancelable:true}));settle();};
const key=k=>window.dispatchEvent(new window.KeyboardEvent('keydown',{key:k}));
const steerTo=l=>{const d=D();if(l==null||l===d.lane)return;key(l<d.lane?'ArrowLeft':'ArrowRight');};

(async()=>{
  await new Promise(r=>setTimeout(r,60));settle();
  const seen=[];
  for(let m=0;m<14;m++){
    tap('missionBtn');
    const lvl=D().mathLevel, name=$('brLevel').textContent;
    tap('launchBtn');
    let g=0;while(g++<900){frame();if(D().state==='RUN')break;}
    let f=0,res='timeout';
    while(f++<200000){
      frame();const d=D();
      if(d.state==='RUN'&&f%5===0){
        const danger=[d.beamLane,d.beamLane2].filter(x=>x!=null&&x>=0);
        if(danger.includes(d.lane)&&d.odActive<=0){
          const safe=[0,1,2].filter(l=>!danger.includes(l));
          steerTo(safe.includes(d.gateLane)?d.gateLane:safe[0]);
        }
        else if(d.threatLane===d.lane&&d.odActive<=0)steerTo(d.lane===2?1:d.lane+1);
        else if(d.gateLane!=null&&!danger.includes(d.gateLane))steerTo(d.gateLane);
        else if(d.phase==='quantity'&&d.qtyHave<d.qtyNeed&&d.starLane!=null)steerTo(d.starLane);
        else if(d.phase==='quantity'&&d.qtyHave>=d.qtyNeed&&d.starLane===d.lane)steerTo(d.lane===2?1:d.lane+1);
        if(d.od>=1&&d.odActive<=0)tap('odBtn');
      }
      if(d.state==='FAIL'){res='FAIL';await new Promise(r=>setTimeout(r,800));settle();break;}
      if(d.state==='WIN'){res='WIN';await new Promise(r=>setTimeout(r,1000));settle();break;}
    }
    seen.push({lvl,name:name.replace('LV '+lvl+' · ',''),res,note:$('lvlNote').textContent});
    if(res==='WIN')tap('homeBtn1');else tap('homeBtn2');
  }
  console.log('A learner climbing the ladder, one mission per row:\n');
  seen.forEach(r=>console.log('  L'+String(r.lvl).padStart(2)+'  '+r.name.padEnd(22)+r.res.padEnd(6)+r.note));
  const levels=seen.map(r=>r.lvl);
  console.log('\nreached level:',Math.max(...levels),'of 13');
  console.log('progression monotonic-ish:',levels[levels.length-1]>levels[0]?'✓ climbs':'✗ stuck');
  console.log('errors:',errors.length);
})();
