/** Candidate integration regressions. Copy to tests/detailed-io.test.ts.
 * Inputs are synthetic, never installed equipment data. No source fixture mutation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Project } from '../packages/contracts/index.ts';
import { completeProject } from '../packages/detailed-model/project.ts';
import { defaultDetailedConfig, defaultNodePhysics } from '../packages/detailed-model/defaults.ts';
import { detailedReadiness } from '../packages/detailed-model/readiness.ts';
import { simulateDetailed } from '../packages/detailed-model/engine.ts';
import { physicsPolicy, type PolicyState } from '../packages/detailed-model/policy.ts';
import { exportDetailedCSV, exportDetailedJSON, importDetailedProfile } from '../packages/detailed-profile/index.ts';
import { exportEquipmentJSON, importEquipmentProfile } from '../packages/equipment-profile/index.ts';
import { exportWorkbook, importWorkbook, unzipStored, zipStored } from '../packages/io/index.ts';
import { csvRecords, csvCell } from '../packages/tabular/index.ts';
import { engineeringProject } from '../packages/engineering/index.ts';
import { defaultExtendedFinance } from '../packages/extended-finance/index.ts';
import { parseProject } from '../packages/schemas/index.ts';
import { makeNode } from '../plugins/equipment/index.ts';
import { v05Project } from '../packages/detailed-verification/index.ts';

const near=(a:number,b:number,tolerance=1e-6)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=tolerance,`${a} != ${b}`);
const textCSV=(rows:string[][])=>'\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';
const parsedCSV=(text:string)=>csvRecords(text.replace(/^\uFEFF/,''),100001);

function variedDraft():Project {
 const p=completeProject(),c=p.detailed!;
 c.physics[0].temperatureC=25.125;c.physics[0].ambientC=null;c.physics[0].currentLimitA=0;c.physics[0].rampKWPerMinute=.0625;
 Object.assign(c.physics[0].curve,{enabled:false,points:[{x:0,y:.9},{x:1,y:.974}],temperatureCoefficientPerC:-.001,standbyKW:0});
 c.physics[0].faultSchedule=[{fromMinute:20.25,toMinute:21.75,currentA:null}];
 c.storage[0].initialSOC=null;c.storage[0].initialSOH=.975;c.storage[0].policy.reserveSOC=0;
 c.solar[0].profile=[{atMinute:0,irradianceWm2:0,cellTemperatureC:null},{atMinute:700.25,irradianceWm2:850.125,cellTemperatureC:42.5}];
 c.solar[0].export!.unitPrice=0;c.solar[0].export!.efficiency=null;
 c.service.truckSlotOverrides=[{enabled:false,slot:{id:'A-rack-0',sink:'A-rack-0',battery:{id:'待填電池, "A"\n🚚',family:'truck-A',capacityKWh:null,soh:.95,initialSOC:0},chargeKW:0,chargeEfficiency:null}}];
 c.service.profiles=[{id:'後續車種',enabled:false,capacityKWh:null,soh:null,chargeEfficiency:null,bands:null,temperatureBands:null}];
 c.dispatch.communicationOutages=[{fromMinute:.25,toMinute:.5}];
 c.construction=[{atMinute:120.25,equipmentId:p.topology.nodes[0].id,enabled:false,params:{'limit/phase~A':0}}];
 c.finance.calendar.startDate='2026-09-09';c.finance.calendar.utcOffsetMinutes=480;
 c.finance.tax.otherTaxPerMonth=0;c.finance.tax.incomeTaxRate=null;c.finance.assets[0].unitPurchaseCost=12345.6789;
 c.finance.assets[0].name='=設備, "額定"\n站A';c.finance.workingCapital.releaseAtHorizon=true;
 c.assumptions.push({id:'a/~b',status:'USER_CONFIRMED',note:"'=公式文字, \"中文\"\n🚚 與 null/0 不可混淆"});
 return p;
}

test('detailed JSON and CSV preserve every nested editable field, null, zero, false, Unicode, curve and order',()=>{
 const source=variedDraft(),before=structuredClone(source);
 for(const format of ['json','csv'] as const){const text=format==='json'?exportDetailedJSON(source):exportDetailedCSV(source),restored=importDetailedProfile(source,text,format);assert.deepEqual(restored,source);assert.notEqual(restored.detailed,source.detailed);assert.deepEqual(source,before);assert.equal(restored.detailed!.solar[0].export!.unitPrice,0);assert.equal(restored.detailed!.solar[0].export!.efficiency,null);}
 const rows=parsedCSV(exportDetailedCSV(source));assert.ok(rows.some(row=>row[0].includes('limit~1phase~0A')),'JSON pointer must escape / and ~');
 assert.ok(rows.every(row=>row.every(cell=>!/^\s*[=+@-]/.test(cell))),'CSV raw cells may not start spreadsheet formulas');
});

test('detailed settings import replaces only detailed settings and keeps the current project demand, topology and run controls',()=>{
 const source=variedDraft(),target=completeProject();target.name='保留當前場景';target.seed=9001;target.arrival='SEEDED';target.services[0].gridPrice=.123456;target.finance.capex=987654;const before=structuredClone(target);
 for(const format of ['json','csv'] as const){const imported=importDetailedProfile(target,format==='json'?exportDetailedJSON(source):exportDetailedCSV(source),format);assert.deepEqual(imported.detailed,source.detailed);for(const key of Object.keys(target) as (keyof Project)[])if(key!=='detailed')assert.equal(imported[key],target[key],`preserve ${key}`);assert.deepEqual(target,before);}
});

test('null survives an enabled incomplete model draft but readiness and simulation refuse to silently treat it as zero',()=>{
 const p=completeProject(),m=p.detailed!.physics.find(m=>p.topology.nodes.some(n=>n.id===m.nodeId&&n.type==='sst'))!;m.curve.enabled=true;m.curve.ratedOutputKW=null;m.temperatureC=null;
 for(const format of ['json','csv'] as const){const restored=importDetailedProfile(p,format==='json'?exportDetailedJSON(p):exportDetailedCSV(p),format);assert.equal(restored.detailed!.physics.find(n=>n.nodeId===m.nodeId)!.curve.ratedOutputKW,null);const missing=detailedReadiness(restored);assert.ok(missing.some(i=>i.path.includes(m.nodeId)&&i.path.includes('ratedOutputKW')));assert.throws(()=>simulateDetailed(restored));}
});

test('an unused future equipment record can remain editable in a draft; activating it requires real topology and data',()=>{
 const p=quietProject();p.detailed!.physics.push(defaultNodePhysics('future-equipment'));
 for(const format of ['json','csv'] as const){const restored=importDetailedProfile(p,format==='json'?exportDetailedJSON(p):exportDetailedCSV(p),format);assert.equal(restored.detailed!.physics.at(-1)!.nodeId,'future-equipment');assert.deepEqual(detailedReadiness(restored),[]);}
 p.detailed!.physics.at(-1)!.curve.enabled=true;assert.ok(detailedReadiness(p).some(i=>i.path.includes('future-equipment')));
});

test('strict detailed JSON rejects unknown fields, wrong types, duplicates and invalid values atomically',()=>{
 const p=variedDraft(),before=structuredClone(p),text=exportDetailedJSON(p);
 const mutations:((file:any)=>void)[]=[f=>f.unknown=1,f=>f.settings.typo=true,f=>f.settings.physics[0].curve.ratedOutptKW=100,f=>f.settings.physics[0].curve.standbyKW='0',f=>f.settings.physics[0].curve.points=[{x:1,y:.9},{x:0,y:.8}],f=>f.settings.storage[0].config.chargeEfficiency=1.1,f=>f.settings.finance.tax.extraUnknown=0,f=>f.settings.physics.push(structuredClone(f.settings.physics[0])),f=>f.settings.solar[0].profile.push(structuredClone(f.settings.solar[0].profile[0]))];
 for(const mutate of mutations){const raw=JSON.parse(text);raw.settings.dispatch.forecastMinutes=17;mutate(raw);assert.throws(()=>importDetailedProfile(p,JSON.stringify(raw),'json'));assert.deepEqual(p,before,'late invalid row cannot partly apply earlier changes');}
});

test('strict detailed CSV rejects missing, duplicate, dangling and malicious structure without partial changes',()=>{
 const p=variedDraft(),before=structuredClone(p),original=parsedCSV(exportDetailedCSV(p));
 const path='/settings/physics/0/currentLimitA';
 const mutations:((rows:string[][])=>void)[]=[rows=>rows.push([...rows.find(r=>r[0]===path)!]),rows=>{const i=rows.findIndex(r=>r[0]===path);rows.splice(i,1);},rows=>rows.push(['/unreferenced','value','0']),rows=>{rows.find(r=>r[0]===path)![1]='unknown';},rows=>{rows.find(r=>r[0]===path)![2]='"invalid number"';},rows=>{rows.find(r=>r[0]==='/settings/physics')![2]='999';},rows=>{rows.find(r=>r[0]===path)![2]='{}';},rows=>{rows.find(r=>r[0]==='/settings/dispatch')![2]='["__proto__"]';}];
 for(const mutate of mutations){const rows=structuredClone(original);rows.find(r=>r[0]==='/settings/dispatch/forecastMinutes')![2]='17';mutate(rows);assert.throws(()=>importDetailedProfile(p,textCSV(rows),'csv'));assert.deepEqual(p,before);}
});

test('CSV clearing a scalar records null, while explicitly typing zero records zero',()=>{
 const p=variedDraft(),path='/settings/physics/0/currentLimitA';for(const [cell,expected]of [['',null],['0',0]] as const){const rows=parsedCSV(exportDetailedCSV(p));rows.find(r=>r[0]===path)![2]=cell;const restored=importDetailedProfile(p,textCSV(rows),'csv');assert.equal(restored.detailed!.physics[0].currentLimitA,expected);}
});

test('complete equipment JSON includes detailed settings and preserves current demand and project-level finance',()=>{
 const source=variedDraft(),target=completeProject(),before=structuredClone(target);target.services[0].gridPrice=.2345;target.finance.capex=120000;target.seed=444;
 const imported=importEquipmentProfile(target,exportEquipmentJSON(source),'json').project;assert.deepEqual(imported.detailed,source.detailed);assert.deepEqual(imported.topology,source.topology);assert.equal(imported.services,target.services);assert.equal(imported.finance,target.finance);assert.equal(imported.seed,444);
 const bad=JSON.parse(exportEquipmentJSON(source));bad.settings.detailed.physics[0].unknownKey=true;const frozen=structuredClone(target);assert.throws(()=>importEquipmentProfile(target,JSON.stringify(bad),'json'));assert.deepEqual(target,frozen);assert.deepEqual(before.detailed,target.detailed);
});

/** A one-day ideal feeder with full truck inventory and one controlled AC load.
 * Both rack nodes exist for fleet validation; no service event is invented.
 */
function quietProject(loadKW=0):Project {
 const p=engineeringProject();p.mode='CONSTRAINED';p.strategy='IMMEDIATE';p.horizonDays=1;p.equipmentSchedule=[];p.name='詳細模型獨立I/O與控制回歸';
 p.services=p.services.filter(r=>r.day===0).map(r=>({...r,swapCount:0,swapKWh:0,chargeCount:0,chargeKWh:0,gridPrice:1,swapFee:0,chargeFee:0,swapTotalRaw:1,chargeTotalRaw:1}));
 for(const s of ['A','B'] as const)p.station[s]={batteries:1,capacityKWh:100,readySOC:1,returnSOC:.2,bays:1,swapMinutes:7.5,guns:1,gunKW:100,chargePoolKW:100,batteryChargeKW:100,auxiliaryKW:0};
 p.engineering!.pcsSlotsPerSite=0;p.efficiency={mode:'ASSEMBLY',sst:1,transformer:1,pcs:1,charger:1,sstSource:1,pcsSource:1};
 p.topology={nodes:[makeNode('grid','A-grid','A',0,0,{kva:1000,pf:1}),makeNode('transformer','A-transformer','A',0,0,{kva:1000,pf:1}),makeNode('lv-bus','A-lv','A',0,0,{kw:1000}),makeNode('ac-load','A-test-load','A',0,0,{kw:1000}),makeNode('rack','A-rack-0','A',0,0,{kw:100}),makeNode('rack','B-rack-0','B',0,0,{kw:100})],edges:[['A-grid','A-transformer'],['A-transformer','A-lv'],['A-lv','A-test-load']].map(([source,target])=>({id:`${source}>${target}`,source,target,enabled:true}))};
 p.detailed=defaultDetailedConfig(p);const c=p.detailed;c.physics=[];c.storage=[];c.solar=[];c.backup=[];c.loads=[{nodeId:'A-test-load',idleKW:loadKW,perActiveJobKW:0,hourlyKW:null,perEnabledSST:false}];c.service={useHourlyTruckDemand:false,truckSlotOverrides:[],passenger:[],profiles:[],swapArrivals:[],chargeArrivals:[]};c.topology={sharedDD:false,sharingMode:'SIMULTANEOUS',pcsRatingKW:1600,busTies:[]};c.finance=defaultExtendedFinance(p.topology.nodes);c.construction=[];c.dispatch.communicationOutages=[];
 return p;
}

test('XLSX preserves the exact detailed snapshot and repeat simulation, rejects mixed old result/new draft',()=>{
 const p=quietProject(10);p.detailed!.physics=[defaultNodePhysics('A-transformer')];p.detailed!.physics[0].curve.points=[{x:0,y:.8},{x:1,y:.98}];p.detailed!.physics[0].curve.temperatureCoefficientPerC=-.001;
 const before=structuredClone(p),r=simulateDetailed(p),bytes=exportWorkbook(p,r),restored=importWorkbook(bytes);assert.deepEqual(restored,parseProject(p));assert.deepEqual(simulateDetailed(restored),r);assert.deepEqual(p,before);
 const changed=structuredClone(p);changed.detailed!.loads[0].idleKW=20;assert.throws(()=>exportWorkbook(changed,r),/SNAPSHOT/);
 const files=unzipStored(bytes),workbook=files['xl/workbook.xml'];
 const byName=new Map([...workbook.matchAll(/<sheet name="([^"]+)" sheetId="(\d+)"/g)].map(m=>[m[1],files[`xl/worksheets/sheet${m[2]}.xml`]]));
 for(const name of ['Detailed_Settings','Service_Detail','Battery_Inventory','Service_Events','Storage_Ledger','Electrical_Readings','PV_Ledger','Export_Meters','Switching_Events','Inventory_Flows','Site_Energy_Boundary','Monthly_Bills','Inventory_Valuation','Lifecycle_Cashflows','Finance_Missing','Finance_Summary'])assert.ok(byName.get(name),`missing readable detailed worksheet ${name}`);
 assert.ok(byName.get('Detailed_Settings')!.includes('/physics/0/curve/temperatureCoefficientPerC'));assert.ok(byName.get('Detailed_Settings')!.includes('-0.001'));assert.ok(byName.get('Detailed_Settings')!.includes('null'));assert.ok(byName.get('Finance_Missing')!.includes('MISSING'));
 // Every named sheet resolves to a real XML worksheet, preserving legacy indices.
 for(const [,id]of workbook.matchAll(/sheetId="(\d+)"/g))assert.ok(files[`xl/worksheets/sheet${id}.xml`]);
});

test('an XLSX whose embedded detailed JSON contains unknown fields is rejected even with a valid ZIP checksum',()=>{
 const p=quietProject(),r=simulateDetailed(p),files=unzipStored(exportWorkbook(p,r));
 const altered=structuredClone(p) as Project&{detailed:Record<string,unknown>};altered.detailed.unrecognized='must reject';
 const xml=JSON.stringify(altered).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
 files['xl/worksheets/sheet1.xml']=`<?xml version="1.0"?><worksheet><sheetData><row><c t="inlineStr"><is><t xml:space="preserve">${xml}</t></is></c></row></sheetData></worksheet>`;
 assert.throws(()=>importWorkbook(zipStored(files)));assert.equal(Object.hasOwn(p.detailed!,'unrecognized'),false);
});

test('four-day PV and storage XLSX contains actual ledger rows and restores an identical independently validated run',()=>{
 const p=v05Project(),r=simulateDetailed(p),bytes=exportWorkbook(p,r),restored=importWorkbook(bytes),again=simulateDetailed(restored);assert.deepEqual(again,r);
 near(again.totals.gridKWh,50);near(again.detailedResult!.energy.pvKWh,400);near(again.totals.lossKWh,114);near(again.detailedResult!.energy.storageInitialKWh,70);near(again.detailedResult!.energy.storageFinalKWh,70);
 const files=unzipStored(bytes),byName=new Map([...files['xl/workbook.xml'].matchAll(/<sheet name="([^"]+)" sheetId="(\d+)"/g)].map(m=>[m[1],files[`xl/worksheets/sheet${m[2]}.xml`]]));
 for(const [name,values]of [['Storage_Ledger',r.detailedResult!.storage],['PV_Ledger',r.detailedResult!.pv],['Switching_Events',r.detailedResult!.switching],['Inventory_Flows',r.detailedResult!.inventory]] as const){assert.ok(values.length>0,`${name} must exercise nonempty data`);const xml=byName.get(name)!;assert.equal([...xml.matchAll(/<row r="/g)].length,values.length+1,`${name} may not omit a ledger row`);assert.ok(!xml.includes('NaN')&&!xml.includes('Infinity'));}
});

test('compensation and transformer losses are each counted once and replace the old constant efficiency',()=>{
 const p=quietProject(80);p.efficiency.transformer=.5;
 const tx=defaultNodePhysics('A-transformer');tx.temperatureC=20;tx.loadPowerFactor=.8;Object.assign(tx.transformer,{enabled:true,ratedKVA:1000,noLoadKW:2,ratedCopperKW:10,noLoadKvar:0,ratedLeakageKvar:0,ratedCopperTemperatureC:20,windingTemperatureC:20,copperResistanceAlphaPerC:0});
 p.topology.nodes.push(makeNode('compensation','A-compensation','A',0,0,{kvar:60}));const comp=defaultNodePhysics('A-compensation');comp.loadPowerFactor=.8;Object.assign(comp.compensation,{enabled:true,maximumKvar:60,targetPowerFactor:1,stepKvar:1,lossKWPerKvar:.01,allowLeading:false});p.detailed!.physics=[tx,comp];
 const r=simulateDetailed(p),expectedInput=80+.6+2+10*(80.6/1000)**2;near(r.totals.gridKWh,expectedInput*24);near(r.detailedResult!.energy.auxiliaryKWh,80*24);near(r.totals.lossKWh,(expectedInput-80)*24);near(r.totals.maxBalanceResidual,0);
 near(r.componentEnergy.filter(e=>e.nodeId==='A-transformer').reduce((s,e)=>s+e.lossKWh,0),(expectedInput-80)*24);
});

test('an initially overheated component is blocked before the first allocation',()=>{
 const p=quietProject(10),m=defaultNodePhysics('A-transformer');m.temperatureC=100;m.ambientC=100;Object.assign(m.thermal,{enabled:true,thermalResistanceCPerKW:1,heatCapacityKWhPerC:1,maximumConductorC:80,ampacityByAmbientC:[{x:0,y:1},{x:200,y:1}]});p.detailed!.physics=[m];const r=simulateDetailed(p);near(r.totals.gridKWh,0);near(r.detailedResult!.energy.auxiliaryKWh,0);const trace=r.powerTrace!.nodes.find(n=>n.nodeId==='A-transformer')!;assert.equal(trace.samples[0][0],0);assert.ok(trace.samples.every(s=>s[1]===0&&s[2]===0),'overheat must not allow an initial minute of power');
});

test('ramp rate uses actual fractional elapsed minutes rather than granting a full-minute step at each event',()=>{
 const p=quietProject(40),m=defaultNodePhysics('A-transformer');m.rampKWPerMinute=60;p.detailed!.physics=[m];p.equipmentSchedule=[{atMinute:.25,equipmentId:'A-rack-0',enabled:true},{atMinute:.5,equipmentId:'A-rack-0',enabled:true}];
 const state:PolicyState={caps:new Map(),temperatures:new Map(),slotEta:new Map(),sourcePrices:new Map(),lastOutput:new Map([['A-transformer',20]]),minutesSinceLast:.125};const tx=p.topology.nodes.find(n=>n.id==='A-transformer')!;near(physicsPolicy(p,state).capacity!(tx),27.5);
 const r=simulateDetailed(p),samples=r.powerTrace!.nodes.find(n=>n.nodeId==='A-transformer')!.samples;const at=(t:number)=>samples.filter(s=>s[0]<=t+1e-9).at(-1)!;near(at(0)[2],0);near(at(.25)[2],15);near(at(.5)[2],30);near(at(1)[2],40);
 const firstMinute=.25*0/60+.25*15/60+.5*30/60,expected=40*(24-1/60)+firstMinute;near(r.totals.gridKWh,expected);near(r.detailedResult!.energy.auxiliaryKWh,expected);near(r.totals.maxBalanceResidual,0);
});
