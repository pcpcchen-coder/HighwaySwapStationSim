import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateDetailed} from '../packages/detailed-model/engine.ts';
import {socVerificationProject,hourlySohVerificationProject,type SocVerificationId} from '../packages/soc-verification/index.ts';
import {batteryStateAt,batteryTraceRows} from '../packages/battery-trace/index.ts';
import type {RunResult} from '../packages/contracts/index.ts';
import {exportWorkbook,importWorkbook,unzipStored} from '../packages/io/index.ts';
import {parseProject} from '../packages/schemas/index.ts';
const close=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<1e-6,`${actual} != ${expected}`);
const cache=new Map<SocVerificationId,RunResult>();
function run(id:SocVerificationId){if(!cache.has(id))cache.set(id,simulateDetailed(socVerificationProject(id)));return cache.get(id)!;}
function at(id:SocVerificationId,minute:number){const view=batteryStateAt(run(id).detailedResult!.batteryTrace,'A-rack-0',minute);assert.ok(view);return view;}

test('three days of linear station SOC taper hit independent exact completion times',()=>{
 const result=run('linear_taper'),detail=result.detailedResult!;
 close(detail.fleet.totals.swapDeliveredKWh,1231.2);close(detail.fleet.totals.batteryTerminalKWh,1282.5);close(detail.fleet.totals.batteryLossKWh,51.3);
 for(let day=0;day<3;day++)for(const [minute,soc,power]of [[41.85267857142857,.8,280],[53.30357142857143,.9,140],[76.20535714285714,1,0]]){
  const b=at('linear_taper',day*1440+minute+1e-7);close(b.soc,soc);close(b.inputKW,power);
 }
 close(detail.energy.balanceResidualKWh,0);close(result.totals.gridKWh,1343.6072580983125);
});

test('nonlinear energy/SOC map changes returned energy, recharge and three-day delivered energy',()=>{
 const result=run('nonlinear_taper'),detail=result.detailedResult!;
 close(detail.fleet.totals.returnedKWh,246.24);close(detail.fleet.totals.swapDeliveredKWh,1292.76);
 close(detail.fleet.totals.batteryTerminalKWh,1346.625);close(detail.fleet.totals.batteryLossKWh,53.865);
 close(at('nonlinear_taper',7.5).energyKWh,82.08);close(at('nonlinear_taper',7.5).soc,.2);
 close(at('nonlinear_taper',83.07589285714286+1e-7).soc,1);close(detail.fleet.totals.inventoryResidualKWh,0);
});

test('physical DD curtailment and outage delay charge, preserving SOC during no input',()=>{
 const first=at('nonlinear_curtailed_outage',25),pause=at('nonlinear_curtailed_outage',35),during=at('nonlinear_curtailed_outage',38);
 close(first.inputKW,280);close(during.inputKW,0);close(pause.energyKWh,during.energyKWh);close(pause.soc,during.soc);
 close(at('nonlinear_curtailed_outage',42).inputKW,560);
 const result=run('nonlinear_curtailed_outage');close(result.detailedResult!.fleet.totals.batteryTerminalKWh,1346.625);
 close(at('nonlinear_curtailed_outage',97.57589285714286+1e-7).soc,1);
});

test('hourly 410.4 kWh cannot silently become 328.32 kWh with SOH 0.8',()=>{
 const result=simulateDetailed(hourlySohVerificationProject(410.4)),t=result.detailedResult!.fleet.transactions[0];
 close(t.requestedKWh!,410.4);close(t.deliveredKWh,0);assert.equal(t.start,null);assert.equal(t.completion,null);
 close(result.totals.unservedKWh,410.4);close(result.totals.revenue,0);
});

test('feasible absolute hourly demand derives returned SOC from actual effective pack capacity',()=>{
 const result=simulateDetailed(hourlySohVerificationProject(300)),t=result.detailedResult!.fleet.transactions[0],b=batteryStateAt(result.detailedResult!.batteryTrace,'A-rack-0',7.5)!;
 close(t.requestedKWh!,300);close(t.deliveredKWh,300);close(result.totals.unservedKWh,0);close(b.energyKWh,110.4);close(b.soc,.2690058479532164);
 close(result.detailedResult!.fleet.totals.batteryTerminalKWh,312.5);
});

test('explicit SOC arrivals intentionally use actual pack capacity and SOH',()=>{
 const p=hourlySohVerificationProject(0);p.detailed!.service.useHourlyTruckDemand=false;p.detailed!.service.swapArrivals=[{id:'explicit',fleetId:'A-truck',atMinute:0,returnSOC:.2,unitPrice:1,returnedPack:null}];
 const result=simulateDetailed(p),t=result.detailedResult!.fleet.transactions[0];
 close(t.requestedKWh!,328.32);close(t.deliveredKWh,328.32);close(result.detailedResult!.fleet.totals.batteryTerminalKWh,342);
});

test('time cursor is right-continuous at swap completion and keeps correct battery identity',()=>{
 const before=at('nonlinear_taper',7.5-1e-6),after=at('nonlinear_taper',7.5);
 assert.equal(before.batteryId,'initial');assert.equal(before.status,'swapping');close(before.soc,1);close(before.energyKWh,513);
 assert.equal(after.batteryId,'swap-0:returned');close(after.soc,.2);close(after.energyKWh,82.08);assert.equal(after.status,'charging');
 assert.equal(at('nonlinear_taper',1447.5).batteryId,'swap-1:returned');
});

test('arbitrary cursor minute interpolates energy then inverts nonlinear SOC map',()=>{
 const b=at('nonlinear_taper',15.125);close(b.energyKWh,150.4);close(b.soc,.3664717348927875);close(b.remainingKWh,362.6);
 const knot=at('nonlinear_taper',21.24107142857143);close(knot.energyKWh,205.2);close(knot.soc,.5);
});

test('trace exports have exact interval endpoint energy and final horizon state',()=>{
 const trace=run('nonlinear_taper').detailedResult!.batteryTrace,rows=batteryTraceRows(trace);assert.ok(rows.length>0);
 for(const row of rows){assert.ok(Number.isFinite(row.endEnergyKWh as number));assert.ok((row.endSOC as number)>=-1e-8&&(row.endSOC as number)<=1+1e-8);}
 const end=at('nonlinear_taper',4320);close(end.soc,1);close(end.energyKWh,513);close(end.inputKW,0);
 assert.equal(batteryStateAt(undefined,'A-rack-0',0),null);assert.equal(batteryStateAt(trace,'unknown',0),null);
 assert.equal(batteryStateAt(trace,'A-rack-0',-1),null);assert.equal(batteryStateAt(trace,'A-rack-0',4321),null);
});

test('project JSON round trip preserves new curve data and independent per-slot settings',()=>{
 const p=socVerificationProject('nonlinear_taper'),copy=parseProject(JSON.parse(JSON.stringify(p)));
 assert.deepEqual(copy.detailed!.service.truckSlotOverrides,p.detailed!.service.truckSlotOverrides);
 assert.equal(copy.detailed!.service.truckSlotOverrides[0].slot.chargeEfficiency,.96);
 assert.deepEqual(copy.detailed!.service.truckSlotOverrides[0].slot.battery.energySOC,[{soc:0,energyFraction:0},{soc:.5,energyFraction:.4},{soc:1,energyFraction:1}]);
});


test('XLSX preserves SOC curves and every exported battery interval, rerun reproduces state timeline',()=>{
 const result=run('nonlinear_taper'),bytes=exportWorkbook(result.parameterSnapshot,result),p=importWorkbook(bytes),again=simulateDetailed(p);
 assert.deepEqual(p,result.parameterSnapshot);assert.deepEqual(again,result);
 const files=unzipStored(bytes),names=[...files['xl/workbook.xml'].matchAll(/<sheet name="([^"]+)" sheetId="(\d+)"/g)];
 const id=names.find(m=>m[1]==='Battery_SOC_Trace')![2],xml=files[`xl/worksheets/sheet${id}.xml`];
 const rows=batteryTraceRows(result.detailedResult!.batteryTrace);assert.equal([...xml.matchAll(/<row r="/g)].length,rows.length+1);
 for(const key of ['fromMinute','toMinute','soc','endSOC','energyKWh','endEnergyKWh','inputKW','storedKW','batteryId','energySOC'])assert.ok(xml.includes(key),key);
 const curveId=names.find(m=>m[1]==='Battery_SOC_Curves')![2],curveXML=files[`xl/worksheets/sheet${curveId}.xml`];assert.equal([...curveXML.matchAll(/<row r="/g)].length,4);assert.ok(curveXML.includes('energyFraction'));
 assert.ok(!xml.includes('NaN')&&!xml.includes('Infinity'));
});
