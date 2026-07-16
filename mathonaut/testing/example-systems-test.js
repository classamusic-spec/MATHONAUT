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
let T=0;
try{Object.defineProperty(globalThis,'performance',{value:{now:()=>T},configurable:true});}
catch(e){globalThis.performance.now=()=>T;}
const {JSDOM}=require('jsdom');
const dom=new JSDOM('<!doctype html><body><div id="root"></div></body>',{pretendToBeVisual:true});
const {window}=dom;
global.window=window;global.document=window.document;global.navigator=window.navigator;
window.performance={now:()=>T};
const THREE=require('three');
let scn=null;
class FakeRenderer{constructor(){this.info={render:{calls:0,triangles:0}};}setPixelRatio(){}setSize(){}render(s){scn=s;}dispose(){}}
THREE.WebGLRenderer=FakeRenderer;
const ctxStub=new Proxy({},{get:(t,k)=>{
  if(k==='createLinearGradient'||k==='createRadialGradient')return()=>({addColorStop(){}});
  return typeof k==='string'?()=>{}:undefined;}});
window.HTMLCanvasElement.prototype.getContext=function(){return ctxStub;};
let rafCbs=[];
window.requestAnimationFrame=global.requestAnimationFrame=cb=>{rafCbs.push(cb);return 1;};
window.cancelAnimationFrame=global.cancelAnimationFrame=()=>{};
// in-memory storage so save/persist round-trips
const store={};
window.storage={get:async k=>store[k]?{key:k,value:store[k]}:(()=>{throw new Error('nf')})(),
                set:async(k,v)=>{store[k]=v;return{key:k,value:v}}};
const {MARKUP,createGame}=require('./game.cjs');
const root=window.document.getElementById('root');
root.innerHTML=MARKUP;
Object.defineProperty(root,'clientWidth',{value:390});
Object.defineProperty(root,'clientHeight',{value:844});
const errors=[];
const dispose=createGame(root,THREE);
const $=id=>root.querySelector('#'+id);
const tapRaw=el=>(typeof el==='string'?$(el):el).dispatchEvent(new window.Event('touchend',{cancelable:true}));
const settle=(n=8)=>{for(let i=0;i<n;i++)frame();};
const tap=el=>{tapRaw(el);settle();};
const key=k=>window.dispatchEvent(new window.KeyboardEvent('keydown',{key:k}));
const frame=()=>{T+=16.7;const c=rafCbs;rafCbs=[];
  c.forEach(cb=>{try{cb(T);}catch(e){errors.push('TICK: '+e.stack.split('\n').slice(0,3).join(' | '));}});};
const D=()=>window.__THREE_GAME_DIAGNOSTICS__;
const steerTo=l=>{const d=D();if(l==null||l===d.lane)return;key(l<d.lane?'ArrowLeft':'ArrowRight');};
const runCine=()=>{let g=0;while(g++<900){frame();if(D()&&D().state!=='CINE'&&D().state!=='BRIEF')break;}};
const wallet=()=>+$('totStars').textContent;
function beamState(){let b=null;scn.traverse(o=>{if(!b&&o.geometry&&o.geometry.type==='CylinderGeometry'&&o.geometry.parameters.height===80)b=o;});return b;}

async function playMission(){
  tap('launchBtn');runCine();settle();
  let f=0;const info={beamWarns:0,beamFires:0,bossHitsTaken:0};
  let lastVis=false;
  while(f++<160000){
    frame();const d=D();
    const b=beamState();
    if(b&&b.visible&&!lastVis)info.beamWarns++;
    if(b&&b.visible&&b.material.opacity>0.6)info.beamFires++;
    lastVis=b?b.visible:false;
    if(d.state==='RUN'&&f%5===0){
      const danger=[d.beamLane,d.beamLane2].filter(x=>x!=null&&x>=0);
      const imminent=d.threatLane===d.lane&&d.odActive<=0;
      if(danger.includes(d.lane)&&d.odActive<=0){
        // vacate the beam lane
        const safe=[0,1,2].filter(l=>!danger.includes(l));
        steerTo(safe.includes(d.gateLane)?d.gateLane:safe[0]);
      }
      else if(imminent)steerTo(d.lane===2?1:d.lane+1);
      else if(d.gateLane!=null&&!danger.includes(d.gateLane))steerTo(d.gateLane);
      else if(d.phase==='quantity'&&d.qtyHave<d.qtyNeed&&d.starLane!=null)steerTo(d.starLane);
      else if(d.phase==='quantity'&&d.qtyHave>=d.qtyNeed&&d.starLane===d.lane)steerTo(d.lane===2?1:d.lane+1);
      if(d.od>=1&&d.odActive<=0)tap('odBtn');
    }
    if(d.state==='FAIL'){await new Promise(r=>setTimeout(r,780));settle();return{fail:true,info};}
    if(d.state==='WIN'){await new Promise(r=>setTimeout(r,980));settle();return{win:true,info};}
  }
  return{timeout:true,info};
}

(async()=>{
  await new Promise(r=>setTimeout(r,60));frame();frame();
  console.log('== #4 ECONOMY ==');
  console.log('starting wallet:',wallet());
  const sws=[...root.querySelectorAll('.sw')];
  console.log('color swatches:',sws.length,'| owned/free:',sws.filter(s2=>!s2.classList.contains('buyable')).length);
  console.log('prices shown:',sws.filter(s2=>s2.querySelector('.pr')).map(s2=>s2.querySelector('.pr').textContent).join(', '));
  const ufoBtn=root.querySelectorAll('.shipbtn')[1];
  console.log('UFO locked at start:',ufoBtn.classList.contains('locked'),'| price:',ufoBtn.querySelector('.pr')?.textContent);
  tap(ufoBtn);
  console.log('buy UFO with 0 stars -> still locked:',ufoBtn.classList.contains('locked'),'(rejected correctly)');

  console.log('== #5 MISSION MODIFIERS ==');
  for(let m=0;m<4;m++){
    tap('missionBtn');
    console.log('  mission '+(m+1)+': '+$('brTitle').textContent+' | '+$('brGalaxy').textContent);
    console.log('     rule: '+$('brRule').textContent);
    const before=wallet();
    const r=await playMission();
    const after=wallet();
    console.log('     result:',r.win?'WIN':r.fail?'FAIL':'timeout',
      '| earned:',after-before,'★ | wallet:',after);
    if(m===0)console.log('     boss beam telegraphs:',r.info.beamWarns,'| fire frames:',r.info.beamFires);
    if(r.win){tap('homeBtn1');}else{tap('homeBtn2');}
  }

  console.log('== #4 PURCHASE WITH EARNED STARS ==');
  const w=wallet();
  console.log('wallet now:',w);
  const sw2=[...root.querySelectorAll('.sw')].find(s2=>s2.classList.contains('buyable'));
  if(sw2){
    const price=+sw2.querySelector('.pr').textContent.replace(' ★','');
    tap(sw2);
    const bought=!sw2.classList.contains('buyable')||wallet()===w-price;
    console.log('bought color for',price,'★ ->',bought?'SUCCESS':'rejected','| wallet:',wallet());
  }
  const ufo2=root.querySelectorAll('.shipbtn')[1];
  if(ufo2.classList.contains('locked')){
    tap(ufo2);
    console.log('UFO purchase attempt -> locked:',ufo2.classList.contains('locked'),'| wallet:',wallet());
  }
  console.log('save persisted:',!!store['mathonaut-save']);
  const sv=JSON.parse(store['mathonaut-save']||'{}');
  console.log('  saved wallet:',sv.stars,'| colorsOwned:',JSON.stringify(sv.colorsOwned),'| shipsOwned:',JSON.stringify(sv.shipsOwned));
  console.log('errors:',errors.length);errors.slice(0,5).forEach(e=>console.log('  ',e));
  dispose();
})();
