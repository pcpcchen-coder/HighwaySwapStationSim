import {build} from 'esbuild';
import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Use a real entry module so the JSX runtime is resolved and bundled, including
// the bootstrap. A stdin TSX snippet previously emitted an unbound global React.
const project=fileURLToPath(new URL('..',import.meta.url));
const output=path.resolve(process.argv[2]??path.join(project,'outputs/HighwaySwapSim-0.7.0-offline.html'));
const settings={absWorkingDir:project,bundle:true,write:false,platform:'browser',target:'es2020',format:'iife',jsx:'automatic',minify:true,loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"production"'}};
const worker=(await build({...settings,entryPoints:['simulation-worker/worker.ts']})).outputFiles[0].text;
let replaced=0;
const result=await build({...settings,entryPoints:['offline/entry.tsx'],metafile:true,plugins:[{name:'inline-offline-worker',setup(b){
 b.onLoad({filter:/components\/simulator\/workbench\.tsx$/},async({path:sourcePath})=>{
  const source=await readFile(sourcePath,'utf8');
  const constructor="new Worker(new URL('../../simulation-worker/worker.ts',import.meta.url),{type:'module'})";
  if(source.split(constructor).length!==2)throw Error('Expected one simulation Worker constructor');
  replaced++;
  return {contents:source.replace(constructor,'new Worker(__offlineWorkerURL)')+'\nconst __offlineWorkerURL=URL.createObjectURL(new Blob(['+JSON.stringify(worker)+'],{type:"text/javascript"}));',loader:'tsx'};
 });
}}]});
if(replaced!==1)throw Error('Worker constructor replacement failed');
const js=result.outputFiles[0].text;
if(/import\.meta|import\(/.test(js)||Object.values(result.metafile.outputs).some(o=>o.imports.length))throw Error('Offline bundle has external module imports');
const assets=path.join(project,'dist/client/assets');
const css=(await Promise.all((await readdir(assets)).filter(n=>n.endsWith('.css')).sort().map(n=>readFile(path.join(assets,n),'utf8')))).join('\n');
if(!css.includes('.load-preset-cards'))throw Error('Missing current CSS; run npm run build first');
const sha=execFileSync('git',['rev-parse','--verify','HEAD'],{cwd:project,encoding:'utf8'}).trim();
const escapeScript=s=>s.replace(/<\/script/gi,'<\\/script');
const startup=`window.addEventListener('error',function(e){var root=document.getElementById('root');if(root&&!root.querySelector('.app-shell')){root.textContent='離線程式啟動失敗：'+(e.message||'未知錯誤')+'。請重新下載最新離線版。';root.setAttribute('role','alert');}});`;
const html=`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="highwayswapsim-source" content="${sha}"><meta name="highwayswapsim-offline-build" content="2026-09-18-bootstrap-fix"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; worker-src blob:; img-src data: blob:; font-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'"><title>HighwaySwapSim 0.7.0 · 單檔離線版（啟動修正版）</title><link rel="icon" href="data:,"><style>${css}</style></head><body class="antialiased"><aside style="padding:8px 24px;background:#e8f3ff;color:#123757;font:14px system-ui">單檔離線版 · ENGINE 0.7.0 · 啟動修正版 2026-09-18 · 修改後請匯出 JSON 保存；結果 XLSX 保存上次測算快照。工程文件連結需連網。</aside><div id="root"><p style="padding:24px">正在載入測算介面…</p></div><noscript>請啟用瀏覽器 JavaScript 以執行測算。</noscript><script>${escapeScript(startup+js)}</script></body></html>`;
await mkdir(path.dirname(output),{recursive:true});
await writeFile(output,html);
console.log(JSON.stringify({output,source:sha,bytes:Buffer.byteLength(html),workerBytes:Buffer.byteLength(worker)}));
