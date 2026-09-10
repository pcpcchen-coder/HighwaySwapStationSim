import test from 'node:test';
import assert from 'node:assert/strict';
import {completeProject} from '../packages/detailed-model/project.ts';
import {referenceLayout,referenceWire,NODE_WIDTH as W,NODE_HEIGHT as H} from '../packages/reference-layout/index.ts';
import {v04Project} from '../packages/detailed-verification/index.ts';
import {simulate} from '../packages/station-engine/index.ts';
import {exportWorkbook,importWorkbook} from '../packages/io/index.ts';

test('reference diagram retains every equipment identity, rating and wire without node overlap',()=>{
 const p=completeProject(),before=structuredClone(p),nodes=referenceLayout(p.topology);
 assert.deepEqual(p,before);assert.equal(nodes.length,p.topology.nodes.length);
 const strip=({x,y,...rest}:typeof nodes[number])=>rest;
 assert.deepEqual(nodes.map(strip),p.topology.nodes.map(strip));
 for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){const a=nodes[i],b=nodes[j];assert.ok(!(a.x<b.x+W&&a.x+W>b.x&&a.y<b.y+H&&a.y+H>b.y),`${a.id} overlaps ${b.id}`);}
 for(const e of p.topology.edges){const a=nodes.find(n=>n.id===e.source)!,b=nodes.find(n=>n.id===e.target)!;assert.ok(a&&b);assert.doesNotMatch(referenceWire(a,b).path,/NaN|undefined/);}
 const n=(id:string)=>nodes.find(n=>n.id===id)!;
 assert.ok(n('A-passenger').x<n('A-rack-0').x&&n('A-rack-0').x<n('A-stack').x);
 assert.ok(n('B-passenger').x>n('B-rack-0').x&&n('B-rack-0').x>n('B-stack').x);
 assert.equal(n('A-bus-sst').y,n('B-bus-sst').y);assert.equal(n('A-bus-pcs').y,n('B-bus-pcs').y);
 assert.ok(n('A-ess-source').x>n('A-stack').x&&n('A-ess-source').x<n('B-stack').x);
});

test('layout-only exported coordinates preserve three-day engine output and XLSX input round-trip',()=>{
 const p=v04Project(),result=simulate(p),changed={...p,topology:{...p.topology,nodes:referenceLayout(p.topology).map(n=>({...n,x:n.x/1.45,y:n.y/1.95}))}};
 const rerun=simulate(changed);
 const {parameterSnapshot:a,...restA}=result,{parameterSnapshot:b,...restB}=rerun;
 assert.deepEqual(restB,restA);
 assert.deepEqual(importWorkbook(exportWorkbook(changed,rerun)),rerun.parameterSnapshot);
});
