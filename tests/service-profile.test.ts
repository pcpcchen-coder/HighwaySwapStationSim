import test from 'node:test';
import assert from 'node:assert/strict';
import { exportServiceCSV, exportServiceJSON, importServiceProfile, parseServiceFile, SERVICE_COLUMNS, demandWarnings, recalculateSwapDemand, updateServiceValue } from '../packages/service-profile/index.ts';
import { verificationCases } from '../packages/verification/cases.ts';
import { engineeringProject } from '../packages/engineering/index.ts';
import { simulate } from '../packages/station-engine/index.ts';
import type { Project, ServiceRow } from '../packages/contracts/index.ts';
const profile=(p:Project,rows:ServiceRow[])=>JSON.stringify({format:'HighwaySwapSim.ServiceProfile',version:1,dayBase:1,horizonDays:p.horizonDays,rows:rows.map(r=>({...r,day:r.day+1}))});
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);

test('demand CSV/JSON roundtrip preserves every day, raw prices, nulls and non-demand configuration',()=>{
 const p=verificationCases()[0].project;p.services[0].idleRaw=0;p.services[0].swapTotalRaw=.987654321;p.services.at(-1)!.chargeTotalRaw=1.23456789;
 for(const format of ['csv','json'] as const){const text=format==='csv'?exportServiceCSV(p):exportServiceJSON(p),imported=importServiceProfile(p,text,format,'replace');assert.deepEqual(imported.project,p);assert.equal(imported.project.topology,p.topology);assert.equal(imported.project.station,p.station);assert.equal(imported.rows,144);}
 const quoted='\uFEFF'+exportServiceCSV(p).replace(/^\uFEFF/,'').trim().split('\r\n').map(line=>line.split(',').map(c=>`"${c}"`).join(',')).join('\r\n')+'\r\n\r\n';
 assert.deepEqual(parseServiceFile(quoted,'csv',3),p.services);
 assert.equal(JSON.parse(exportServiceJSON(p)).rows[0].day,1);assert.equal(JSON.parse(exportServiceJSON(p)).rows.at(-1).day,3);
});

test('partial imports update keys atomically and reversed files retain seeded event order',()=>{
 const p=verificationCases()[1].project;p.arrival='SEEDED';p.seed=713;p.billing='SOURCE_DISPLAY_PRICE';
 const index=p.services.findIndex(r=>r.day===1&&r.station==='B'&&r.hour===12),row={...p.services[index],chargeCount:4,chargeKWh:100,chargeTotalRaw:1.17};
 const manual={...p,services:p.services.map((r,i)=>i===index?row:r)},actual=importServiceProfile(p,profile(p,[row]),'json').project;
 assert.deepEqual(actual,manual);assert.equal(actual.services[0],p.services[0]);assert.equal(actual.arrival,'SEEDED');assert.equal(actual.seed,713);assert.equal(actual.billing,'SOURCE_DISPLAY_PRICE');
 const reversed=importServiceProfile(p,profile(p,[...manual.services].reverse()),'json','replace').project;
 assert.deepEqual(reversed.services,manual.services);assert.deepEqual(simulate(actual),simulate(manual));assert.deepEqual(simulate(reversed),simulate(manual));
});

test('invalid import batches never mutate project and reject malformed, ambiguous or out-of-range values',()=>{
 const p=verificationCases()[0].project,before=structuredClone(p),base=JSON.parse(exportServiceJSON(p));
 const changes=[{day:0},{day:4},{hour:24},{station:'C'},{swapCount:-1},{swapCount:1.5},{swapCount:1001},{chargeKWh:-1},{gridPrice:null},{swapTotalRaw:'0.9'},{swapCount:0,swapKWh:100},{chargeCount:0,chargeKWh:100}];
 for(const change of changes){const bad=structuredClone(base);Object.assign(bad.rows[1],change);assert.throws(()=>importServiceProfile(p,JSON.stringify(bad),'json'));assert.deepEqual(p,before);}
 const duplicate=structuredClone(base);duplicate.rows.push(duplicate.rows[0]);assert.throws(()=>importServiceProfile(p,JSON.stringify(duplicate),'json'),/重複/);
 const unknown=structuredClone(base);unknown.rows[0].unexpected=1;assert.throws(()=>importServiceProfile(p,JSON.stringify(unknown),'json'),/欄位/);
 const csv=exportServiceCSV(p).replace(/^\uFEFF/,''),lines=csv.trim().split('\r\n');
 for(const bad of ['', 'NaN','Infinity','=1+1','0x20','"1,000"']){const cells=lines[1].split(',');cells[7]=bad;assert.throws(()=>importServiceProfile(p,[lines[0],cells.join(',')].join('\n'),'csv'));}
 assert.throws(()=>parseServiceFile(csv.replace('station','day'),'csv',3),/欄位/);assert.throws(()=>parseServiceFile('day,station,hour\n1,A,0','csv',3),/欄位/);
 assert.throws(()=>parseServiceFile(lines[0]+'\n"1,A,0','csv',3),/引號/);assert.throws(()=>parseServiceFile(' '.repeat(2*1024*1024+1),'csv',3),/2 MB/);
 const tooMany={...p,services:p.services.map(r=>({...r,swapCount:200,swapKWh:20000}))};assert.throws(()=>importServiceProfile(p,profile(p,tooMany.services),'json'),/20,000/);assert.deepEqual(p,before);
});

test('replace requires full coverage; merge does not resize days or erase omitted rows',()=>{
 const p=verificationCases()[0].project;assert.throws(()=>importServiceProfile(p,profile(p,p.services.slice(1)),'json','replace'),/144/);
 const partial=profile(p,[{...p.services[0],gridPrice:.123}]);const merged=importServiceProfile(p,partial,'json','merge').project;assert.equal(merged.services.length,144);assert.equal(merged.services[0].gridPrice,.123);assert.deepEqual(merged.services.slice(1),p.services.slice(1));
 const outside=profile({...p,horizonDays:4},[{...p.services[0],day:3}]);assert.throws(()=>importServiceProfile(p,outside,'json'),/連續天數/);assert.equal(p.horizonDays,3);
});

test('imported hourly events have independent expected arrival times, vehicle kWh, billing and grid totals',()=>{
 const p=verificationCases()[1].project;p.services=p.services.map(r=>({...r,chargeCount:0,chargeKWh:0}));
 const row={...p.services.find(r=>r.day===1&&r.station==='A'&&r.hour===12)!,chargeCount:4,chargeKWh:100,gridPrice:.5,chargeFee:.3,chargeTotalRaw:1.17};
 const imported=importServiceProfile(p,profile(p,[row]),'json').project;
 for(const [billing,revenue] of [['EXACT_COMPONENTS',80],['SOURCE_DISPLAY_PRICE',117]] as const){const result=simulate({...imported,billing});assert.deepEqual(result.transactions.map(t=>t.arrival),[2160,2175,2190,2205]);for(const t of result.transactions)near(t.requestedKWh,25);near(result.totals.deliveredKWh,100);near(result.totals.revenue,revenue);near(result.totals.gridKWh,1920/.98+100/(.98*.96*.95));assert.equal(result.totals.completed,4);}
});

test('manual values preserve raw prices and SOC conflicts require explicit recalculation',()=>{
 const p=engineeringProject(),before=structuredClone(p);const changed=updateServiceValue(p,'A',0,0,'swapFee',.42);assert.equal(changed.services[0].swapFee,.42);assert.equal(changed.services[0].swapTotalRaw,p.services[0].swapTotalRaw);
 assert.throws(()=>updateServiceValue(p,'A',0,0,'swapCount',1.5));assert.throws(()=>updateServiceValue(p,'A',0,0,'chargeKWh',NaN));assert.ok(demandWarnings(p,'A',0).some(w=>w.includes('SOC')));
 const roundtrip=importServiceProfile(p,exportServiceJSON(p),'json').project;assert.equal(roundtrip.services[0].swapKWh,p.services[0].swapKWh);
 const fixed=recalculateSwapDemand(roundtrip,'A',0);near(fixed.services[0].swapKWh,8*410.4);assert.equal(demandWarnings(fixed,'A',0).filter(w=>w.includes('SOC')).length,0);assert.deepEqual(fixed.services.filter(r=>r.station==='B'),p.services.filter(r=>r.station==='B'));assert.deepEqual(p,before);
 assert.equal(SERVICE_COLUMNS.length,13);
});
