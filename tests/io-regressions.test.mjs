// Copy to tests/io-regressions.test.mjs; run from repository root with node --test.
import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const repo=process.env.AUDIT_PROJECT_ROOT??process.cwd();
const fromRepo=path=>import(pathToFileURL(resolve(repo,path)).href);
const {defaultProject}=await fromRepo('packages/reference/index.ts');
const {replay}=await fromRepo('packages/station-engine/index.ts');
const {exportWorkbook,importWorkbook}=await fromRepo('packages/io/index.ts');

test('XLSX preserves a Unicode surrogate pair spanning the former JSON chunk boundary',()=>{
 const p=replay(defaultProject()).parameterSnapshot;
 p.sources=[{id:'unicode-boundary',status:'ASSUMPTION',note:''}];
 const empty=JSON.stringify(p),noteStart=empty.indexOf('"note":"')+'"note":"'.length;
 const padding=(15999-noteStart%16000+16000)%16000;
 p.sources[0].note='x'.repeat(padding)+'😀';
 const r=replay(p),snapshot=r.parameterSnapshot;
 // A real non-BMP character begins at the last UTF-16 unit of the old 16000-unit chunk.
 assert.equal(JSON.stringify(snapshot).indexOf('😀')%16000,15999);
 const restored=importWorkbook(exportWorkbook(snapshot,r));
 assert.deepEqual(restored,snapshot);
 assert.ok(restored.sources[0].note.endsWith('😀'));
 assert.ok(!restored.sources[0].note.includes('\uFFFD'));
});

test('XLSX import rejects truncation even when a valid Project_JSON sheet survives',()=>{
 const r=replay(defaultProject()),snapshot=r.parameterSnapshot,full=exportWorkbook(snapshot,r);
 assert.deepEqual(importWorkbook(full),snapshot);
 const view=new DataView(full.buffer,full.byteOffset,full.byteLength),decoder=new TextDecoder();
 let offset=0,projectEnd=-1;
 while(offset+30<=full.length&&view.getUint32(offset,true)===0x04034b50){
  const length=view.getUint32(offset+18,true),nameLength=view.getUint16(offset+26,true),extraLength=view.getUint16(offset+28,true);
  const name=decoder.decode(full.subarray(offset+30,offset+30+nameLength));
  offset+=30+nameLength+extraLength+length;
  if(name==='xl/worksheets/sheet1.xml'){projectEnd=offset;break;}
 }
 assert.ok(projectEnd>0&&projectEnd<full.length-22,'Expected a Project_JSON local entry before the remaining sheets');
 // Original importer accepted both and silently ignored the missing archive tail.
 assert.throws(()=>importWorkbook(full.slice(0,full.length-22)),undefined,'Missing end-of-central-directory record must fail');
 assert.throws(()=>importWorkbook(full.slice(0,projectEnd)),undefined,'Missing later sheets and central directory must fail');
});
