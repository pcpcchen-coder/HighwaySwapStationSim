import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {JSDOM,VirtualConsole} from 'jsdom';
import {importWorkbook} from '../packages/io/index.ts';

const project=fileURLToPath(new URL('..',import.meta.url));
const artifact=process.env.OFFLINE_HTML_PATH??fileURLToPath(new URL('../outputs/offline-ui-test.html',import.meta.url));
if(!process.env.OFFLINE_HTML_PATH)execFileSync(process.execPath,['scripts/build-offline.mjs',artifact],{cwd:project,stdio:'pipe'});
const html=await readFile(artifact,'utf8');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate,label){const start=Date.now();while(!predicate()){if(Date.now()-start>60000)throw Error(`Timed out: ${label}`);await pause(20);}}

// DOM integration test for the actual delivered HTML, with no global React and
// no external resources. It is not a Chromium/Edge visual or CSP implementation.
function cloneInRealm(value,seen=new Map()){
 if(value===null||typeof value!=='object')return value;if(seen.has(value))return seen.get(value);
 const out=Array.isArray(value)?[]:{};seen.set(value,out);for(const key of Object.keys(value))out[key]=cloneInRealm(value[key],seen);return out;
}
function openOffline(contents){
 const errors=[],blobs=new Map(),downloads=[],messages=[];
 const virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',e=>{if(e.type==='unhandled-exception')errors.push(e.cause??e);});
 // Layout is not implemented by JSDOM; exercise the complete delivered JS and
 // markup without parsing the browser-only stylesheet. CSS remains in the file.
 const dom=new JSDOM(contents.replace(/<style>[\s\S]*?<\/style>/g,''),{url:'file:///offline/HighwaySwapSim.html',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole,beforeParse(window){
  window.structuredClone=window.eval('('+cloneInRealm.toString()+')');window.TextEncoder=TextEncoder;window.TextDecoder=TextDecoder;window.Blob=Blob;
  window.URL.createObjectURL=blob=>{const url=`blob:offline-${blobs.size}`;blobs.set(url,blob);return url;};window.URL.revokeObjectURL=()=>{};
  window.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
  window.ResizeObserver=class {observe(){}unobserve(){}disconnect(){}};
  window.HTMLElement.prototype.scrollIntoView=()=>{};
  window.SVGElement.prototype.getBBox=()=>({x:0,y:0,width:80,height:20});
  window.HTMLAnchorElement.prototype.click=function(){downloads.push({name:this.download,blob:blobs.get(this.href)});};
  window.Worker=class {
   constructor(url){assert.ok(blobs.has(url),'Worker must use the embedded Blob');this.ready=blobs.get(url).text().then(code=>{
    const self={postMessage:data=>{const received=window.structuredClone(data);messages.push(received);queueMicrotask(()=>{if(!this.stopped)this.onmessage?.({data:received});});}};
    this.self=self;this.context=vm.createContext({self,TextEncoder,TextDecoder,setTimeout,clearTimeout,console});vm.runInContext('globalThis.structuredClone=('+cloneInRealm.toString()+');',this.context);vm.runInContext(code,this.context);
   });}
   postMessage(data){this.ready.then(()=>{if(!this.stopped){this.context.__incomingJSON=JSON.stringify(data);const incoming=vm.runInContext('JSON.parse(__incomingJSON)',this.context);this.self.onmessage({data:incoming});}}).catch(error=>{errors.push(error);this.onerror?.({message:error.message});});}
   terminate(){this.stopped=true;}
  };
 }});
 return {dom,errors,downloads,messages};
}
const click=(window,text,role='button')=>{const elements=[...window.document.querySelectorAll(`[role="${role}"],${role==='button'?'button':'[data-not-used]'}`)];const element=elements.find(e=>e.textContent.trim()===text);assert.ok(element,`Missing ${role}: ${text}`);assert.ok(!element.disabled,`${text} disabled`);element.dispatchEvent(new window.MouseEvent('mousedown',{bubbles:true,button:0}));element.focus();element.dispatchEvent(new window.MouseEvent('mouseup',{bubbles:true,button:0}));element.click();};

test('offline HTML boots without a global React, switches all presets, computes and exports the current result',{timeout:120000},async()=>{
 const {dom,errors,downloads,messages}=openOffline(html),w=dom.window,doc=w.document;
 try{
  assert.equal(w.React,undefined);
  console.log('offline UI: script loaded',doc.querySelector('#root')?.textContent.slice(0,100),errors.map(e=>e.message));await until(()=>doc.querySelector('.app-shell'),'application startup');console.log('offline UI: mounted');await pause(100);assert.equal(doc.querySelector('#root[role="alert"]'),null);assert.deepEqual(errors,[]);
  click(w,'逐時案例','tab');await until(()=>doc.querySelector('.load-card'),'presets tab');
  for(const [label,count] of [['高負載',71],['中負載',51],['低負載',35]]){
   click(w,`載入${label}劇本`);await until(()=>doc.querySelector('.load-card.selected')?.textContent.includes(label),label);
   await pause(50);const inputs=[...doc.querySelectorAll('input[aria-label^="A "][aria-label$="總swapCount"]')];assert.equal(inputs.length,24);assert.equal(inputs.reduce((sum,input)=>sum+Number(input.value),0),count);
  }
  console.log('offline UI: three presets selected');click(w,'十年估算','tab');await until(()=>doc.querySelector('input[aria-label="2027 operatingDays"]'),'annual page');assert.match(doc.body.textContent,/需求與估計供應量/);assert.match(doc.body.textContent,/背景負載/);
  console.log('offline UI: annual page mounted');click(w,'執行測算');await until(()=>messages.length>0,'embedded worker result');assert.equal(messages[0].error,undefined);await until(()=>doc.body.textContent.includes('測算已完成，結果與參數快照已更新'),'result applied');
  console.log('offline UI: worker result applied');assert.ok(Math.abs(messages[0].result.totals.deliveredKWh-52212.536)<1e-6);
  click(w,'能量流驗算','tab');await until(()=>doc.querySelector('[data-node="A-rack-0"]'),'flow nodes');
  click(w,'結果 XLSX');assert.ok(downloads.at(-1)?.blob);const exported=importWorkbook(new Uint8Array(await downloads.at(-1).blob.arrayBuffer()));assert.equal(exported.loadPlan.activeLoad,'low');assert.equal(exported.services.reduce((sum,r)=>sum+r.swapCount,0),69);
  click(w,'JSON');const saved=JSON.parse(await downloads.at(-1).blob.text());assert.equal(saved.loadPlan.activeLoad,'low');assert.equal(saved.loadPlan.years.length,10);assert.equal(saved.detailed.topology.architecture,'SINGLE_BUS');assert.equal(saved.topology.nodes.filter(n=>n.type==='gun').length,12);assert.equal(saved.topology.nodes.filter(n=>n.type==='pcs').length,0);assert.equal(saved.topology.nodes.filter(n=>n.type==='acdc'&&n.params.eta===.9535).length,6);
  const efficiencyInput=()=>[...doc.querySelectorAll('label')].find(e=>e.textContent.includes('A-dd-0 AC/DC 整機效率'))?.querySelector('input');
  click(w,'效率比較','tab');await until(()=>efficiencyInput(),'AC/DC efficiency editor');
  const efficiency=efficiencyInput();assert.equal(Number(efficiency.value),95.35);
  Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set.call(efficiency,'94');efficiency.dispatchEvent(new w.Event('input',{bubbles:true}));efficiency.dispatchEvent(new w.Event('change',{bubbles:true}));efficiency.blur();await pause(100);
  click(w,'JSON');const edited=JSON.parse(await downloads.at(-1).blob.text());assert.equal(edited.topology.nodes.find(n=>n.id==='A-dd-0').params.eta,.94);
  assert.deepEqual(errors,[]);
 }finally{w.close();}
});

test('startup exception displays an actionable message rather than a blank root',async()=>{
 const failed=html.replace(/(<script>window\.addEventListener[\s\S]*?\}\);)/,'$1throw new Error("startup regression sentinel");');assert.notEqual(failed,html);
 const {dom}=openOffline(failed);try{await until(()=>dom.window.document.querySelector('#root[role="alert"]'),'startup error message');assert.match(dom.window.document.querySelector('#root').textContent,/startup regression sentinel/);}finally{dom.window.close();}
});
