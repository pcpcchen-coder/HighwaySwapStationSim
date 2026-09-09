import {compareDetailedResult,auditLedgers} from '../scripts/verification/detailed-checks.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import type {Project,RunResult} from '../packages/contracts/index.ts';
import type {DetailedRun} from '../packages/detailed-model/contracts.ts';
import {detailedVerificationProjects,v04Project,v05Project,v06Project,pvExportGoldenProject} from '../packages/detailed-verification/index.ts';
import {simulateDetailed} from '../packages/detailed-model/engine.ts';
import {defaultNodePhysics} from '../packages/detailed-model/defaults.ts';
import {detailedTopology} from '../packages/detailed-model/topology.ts';
import {defaultPhysicalConfig} from '../packages/physical-models/schema.ts';
import {billMeterMonths,valueRunInventory} from '../packages/extended-finance/index.ts';
import {exportWorkbook,importWorkbook} from '../packages/io/index.ts';
import {exportEquipmentJSON,importEquipmentProfile} from '../packages/equipment-profile/index.ts';
import {parseProject} from '../packages/schemas/index.ts';
import oracleData from '../data/verification/detailed-expected.json' with {type:'json'};
const oracle=oracleData as {cases:any[];pvExportGolden:Record<string,string>};

for(const c of detailedVerificationProjects())test(`full Project ${c.id} matches independent Decimal oracle and every raw trace ledger`,t=>{
 const result=simulateDetailed(c.project),comparison=compareDetailedResult(c.id,result),ledgers=auditLedgers(result);
 t.diagnostic(JSON.stringify({id:c.id,comparison:comparison.checks,ledger:ledgers.checks,maxDelta:Math.max(comparison.maxDelta,ledgers.maxDelta)}));
});

const near=(a:number,b:number)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=1e-6,`${a} != ${b}`);
function zeroDemand(){const p=v04Project();p.detailed!.service.swapArrivals=[];p.detailed!.service.chargeArrivals=[];p.equipmentSchedule=[];return p;}

test('detailed zero demand, small fractional-minute delivery and full grid outage preserve stock and sources',()=>{
 const empty=simulateDetailed(zeroDemand());for(const key of ['deliveredKWh','requestedKWh','gridKWh','lossKWh','revenue','gridCost','completed'] as const)near(empty.totals[key],0);near(empty.totals.initialStoredKWh,200);near(empty.totals.finalStoredKWh,200);
 const p=zeroDemand();p.detailed!.service.chargeArrivals.push({id:'small',station:'A',atMinute:0,unitPrice:1,gunsRequired:1,energyKWh:1,profileId:null,initialSOC:null,targetSOC:null,temperatureC:null,temperatureSchedule:[],allowedGunIds:['A-external-gun']});
 const r=simulateDetailed(p);near(r.transactions[0].completion!,.75);near(r.totals.deliveredKWh,1);near(r.totals.gridKWh,1/(.98*.95));near(r.totals.lossKWh,1/(.98*.95)-1);assert.equal(r.totals.gridCost,1.07);
 const off=v04Project();off.topology.nodes.find(n=>n.id==='A-grid')!.enabled=false;const stopped=simulateDetailed(off);near(stopped.totals.gridKWh,0);near(stopped.totals.deliveredKWh,60);near(stopped.totals.initialStoredKWh,200);near(stopped.totals.finalStoredKWh,140);assert.equal(stopped.totals.completed,1);
});

test('detailed result exports the matching original Project despite schema key order and preserves the immutable snapshot',()=>{
 const p=v06Project(),before=structuredClone(p),r=simulateDetailed(p);
 assert.deepEqual(p,before,'simulation cannot mutate editable input');assert.deepEqual(r.parameterSnapshot,before);
 // Regression: parseProject property order formerly caused a false mismatch.
 assert.deepEqual(importWorkbook(exportWorkbook(p,r)),p);
 const equipment=importEquipmentProfile(p,exportEquipmentJSON(p),'json').project;assert.deepEqual(equipment,p);assert.deepEqual(parseProject(JSON.parse(JSON.stringify(p))),p);
 const snapshot=structuredClone(r.parameterSnapshot);p.detailed!.service.passenger[0].capacityKWh=200;assert.deepEqual(r.parameterSnapshot,snapshot);assert.throws(()=>exportWorkbook(p,r),/SNAPSHOT/);
});

test('SOC profile uses its 800V dynamic current limit instead of the legacy 637.56V gun setting',()=>{
 const p=zeroDemand();p.topology.nodes.find(n=>n.id==='A-grid')!.params.kva=2000;p.topology.nodes.find(n=>n.id==='A-sst')!.params.kw=1000;p.topology.nodes.find(n=>n.id==='A-dd')!.params.kw=1000;
 Object.assign(p.topology.nodes.find(n=>n.id==='A-external-gun')!.params,{kw:480,amps:600,vehicleVoltage:637.56});
 p.detailed!.service.profiles=[{id:'800V',enabled:true,capacityKWh:100,soh:1,chargeEfficiency:1,bands:[{fromSOC:0,toSOC:1,voltageV:800,maxKW:480,maxCurrentA:600}],temperatureBands:[{minC:0,maxC:60,multiplier:1}]}];
 p.detailed!.service.chargeArrivals=[{id:'profile',station:'A',atMinute:0,unitPrice:1,gunsRequired:1,energyKWh:null,profileId:'800V',initialSOC:0,targetSOC:1,temperatureC:20,temperatureSchedule:[],allowedGunIds:['A-external-gun']}];
 const r=simulateDetailed(p);near(r.transactions[0].completion!,12.5);near(Math.max(...r.componentEnergy.filter(n=>n.nodeId==='A-external-gun').map(n=>n.peakOutputKW)),480);near(r.totals.deliveredKWh,100);
});

test('ESS energy transferred into swap inventory is eliminated internally rather than treated as another external purchase',()=>{
 const p=zeroDemand();p.topology.nodes.find(n=>n.id==='A-grid')!.enabled=false;
 p.detailed!.service.truckSlotOverrides=[{enabled:true,slot:{id:'A-rack-0',sink:'A-rack-0',battery:{id:'empty',family:'truck-A',capacityKWh:100,soh:1,initialSOC:0},chargeKW:60,chargeEfficiency:1}}];
 p.detailed!.storage=[{id:'A-ess',station:'A',kind:'ESS',connectionNodeId:'A-bus-sst',config:{...defaultPhysicalConfig('storage'),enabled:true,capacityKWh:100,minSOC:0,maxSOC:1,chargeKW:100,dischargeKW:100,chargeEfficiency:1,dischargeEfficiency:1,selfDischargePerHour:0,calendarFadePerDay:0,cycleFadePerEquivalentCycle:0},initialSOC:1,initialSOH:1,policy:{mode:'SELF_CONSUMPTION',chargeBelow:null,dischargeAbove:null,reserveSOC:0,manualKW:null}}];
 p.topology=detailedTopology(p,p.topology);p.detailed!.finance.inventory.pools=[{poolId:'A-ess',openingValue:50,additionalConversionCost:0},{poolId:'A-truck',openingValue:0,additionalConversionCost:0},{poolId:'B-truck',openingValue:50,additionalConversionCost:0}];
 const r=simulateDetailed(p);near(r.totals.gridCost,0);near(r.totals.lossKWh,5);near(r.totals.finalStoredKWh,195);
 const value=valueRunInventory(r,p.detailed!.finance,r.detailedResult!.inventory);assert.deepEqual(value.issues,[]);near(value.energyExpense!,0);near(value.reconciliationResidual!,0);near(value.rows.find(row=>row.poolId==='A-truck')!.closingValue,50);near(value.rows.find(row=>row.poolId==='B-truck')!.closingValue,50);
});

test('cable physical loss and an additional node current limit apply simultaneously',()=>{
 const p=v04Project(),m=defaultNodePhysics('A-bus-coupler');m.currentLimitA=1;
 Object.assign(m.cable,{enabled:true,domain:'DC',sendingVoltageV:800,lengthM:150,conductorResistanceOhmPerKm:0,parallelRuns:1,referenceTemperatureC:20,conductorTemperatureC:20,resistanceAlphaPerC:0,ampacityA:1000,ampacityDerating:1,maxVoltageDropRatio:1});p.detailed!.physics=[m];
 const r=simulateDetailed(p);assert.ok(Math.max(...r.detailedResult!.electrical.map(e=>e.currentA))<=1+1e-6);assert.ok(r.transactions.filter(t=>t.station==='B').reduce((s,t)=>s+t.deliveredKWh,0)<120);near(r.totals.maxBalanceResidual,0);
});

test('PV export follows output limit and conversion losses, settles revenue, and cannot re-export grid purchases',()=>{
 const p=pvExportGoldenProject(),r=simulateDetailed(p),d=r.detailedResult!,e=oracle.pvExportGolden;
 near(r.totals.gridKWh,Number(e.gridImportKWh));near(d.energy.pvKWh,Number(e.pvGeneratedKWh));near(d.energy.exportKWh!,Number(e.exportKWh));near(d.energy.auxiliaryKWh,Number(e.localLoadKWh));near(r.totals.lossKWh,Number(e.lossKWh));near(d.pv.reduce((s,row)=>s+row.curtailedKWh,0),Number(e.curtailedKWh));
 assert.equal(r.totals.revenue,Number(e.exportRevenue));assert.equal(d.exports!.reduce((s,row)=>s+row.revenue,0),12);near(d.energy.balanceResidualKWh,0);near(r.totals.deliveredKWh,0);assert.equal(r.totals.completed,0);auditLedgers(r);
 const dark=pvExportGoldenProject();for(const row of dark.detailed!.solar[0].profile)row.irradianceWm2=0;const noPV=simulateDetailed(dark);near(noPV.totals.gridKWh,40);near(noPV.detailedResult!.energy.exportKWh!,0);assert.equal(noPV.totals.revenue,0);
 const disconnected=pvExportGoldenProject();disconnected.topology.nodes.find(n=>n.id==='A-grid')!.enabled=false;const noGrid=simulateDetailed(disconnected);near(noGrid.detailedResult!.energy.exportKWh!,0);near(noGrid.totals.gridKWh,0);near(noGrid.detailedResult!.energy.auxiliaryKWh,40);assert.equal(noGrid.totals.revenue,0);
});
