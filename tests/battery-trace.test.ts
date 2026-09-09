import test from 'node:test';
import assert from 'node:assert/strict';
import {createBatteryTrace,recordBatteryTrace,batteryStateAt,batteryTraceRows} from '../packages/battery-trace/index.ts';
import type {BatteryInspection} from '../packages/service-fleet/contracts.ts';
import {compileFleet} from '../packages/detailed-model/services.ts';
import {ServiceFleet} from '../packages/service-fleet/index.ts';
import {defaultNodePhysics} from '../packages/detailed-model/defaults.ts';
import {v04Project} from '../packages/detailed-verification/index.ts';
import {simulateDetailed} from '../packages/detailed-model/engine.ts';
import {detailedReadiness} from '../packages/detailed-model/readiness.ts';
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const state=(extra:Partial<BatteryInspection>={}):BatteryInspection=>({slotId:'A-rack-0',sink:'A-rack-0',batteryId:'first',family:'TEST',capacityKWh:100,soh:1,energyKWh:100,reserved:true,fleetId:'A-truck',station:'A',serviceKind:'truck-swap',readySOC:1,soc:1,effectiveCapacityKWh:100,targetEnergyKWh:100,remainingKWh:0,requestedKW:0,enabled:true,operating:true,...extra});
test('battery timeline is right-continuous at swaps and solves nonlinear SOC within compressed intervals',()=>{
 const trace=createBatteryTrace(20),eta=new Map([['A-rack-0',.8]]),power={'battery:A-truck:A-rack-0':60};
 recordBatteryTrace(trace,[state()],0,7.5,{},eta);
 const pack=state({batteryId:'returned',energyKWh:16,soc:.2,reserved:false,remainingKWh:84,requestedKW:60,energySOC:[{soc:0,energyFraction:0},{soc:.5,energyFraction:.4},{soc:1,energyFraction:1}]});
 recordBatteryTrace(trace,[pack],7.5,10,power,eta);
 recordBatteryTrace(trace,[{...pack,energyKWh:18,soc:.225,remainingKWh:82}],10,20,power,eta);
 assert.equal(trace.slots[0].intervals.length,2,'continuous identical charge intervals must merge');
 assert.equal(batteryStateAt(trace,'A-rack-0',7.4999)!.batteryId,'first');
 const at=batteryStateAt(trace,'A-rack-0',7.5)!;assert.equal(at.batteryId,'returned');near(at.soc,.2);assert.equal(at.status,'charging');
 const later=batteryStateAt(trace,'A-rack-0',15)!;near(later.energyKWh,22);near(later.soc,.275);near(later.remainingKWh,78);near(later.storedKW,48);
 assert.equal(batteryTraceRows(trace).length,2);near(batteryTraceRows(trace)[1].endSOC as number,.325);
 assert.equal(batteryStateAt(undefined,'A-rack-0',0),null);assert.equal(batteryStateAt(trace,'missing',0),null);assert.equal(batteryStateAt(trace,'A-rack-0',21),null);
});
test('battery timeline handles operating target below 100%, disabled racks and zero-length final state',()=>{
 const trace=createBatteryTrace(10),eta=new Map([['A-rack-0',1]]);
 recordBatteryTrace(trace,[state({readySOC:.8,energyKWh:80,soc:.8,targetEnergyKWh:80,reserved:false})],0,5,{},eta);
 recordBatteryTrace(trace,[state({enabled:false,reserved:false})],5,10,{},eta);
 recordBatteryTrace(trace,[state({batteryId:'final-returned',energyKWh:20,soc:.2,reserved:false,remainingKWh:80})],10,10,{},eta);
 assert.equal(batteryStateAt(trace,'A-rack-0',0)!.status,'ready');assert.equal(batteryStateAt(trace,'A-rack-0',5)!.status,'disabled');
 const end=batteryStateAt(trace,'A-rack-0',10)!;near(end.energyKWh,20);assert.equal(end.batteryId,'final-returned');near(end.inputKW,0);
});
test('state-owned battery efficiency cannot be overridden by generic converter or cable loss laws',()=>{
 const p=v04Project(),m=defaultNodePhysics('A-rack-0');m.curve.enabled=true;p.detailed!.physics=[m];
 assert.ok(detailedReadiness(p).some(i=>i.path==='A-rack-0.batteryEfficiency'));
 assert.throws(()=>simulateDetailed(p));m.curve.enabled=false;m.cable.enabled=true;assert.ok(detailedReadiness(p).some(i=>i.path==='A-rack-0.batteryEfficiency'));
});


test('one battery graph endpoint cannot silently hide two slots or share a gun sink',()=>{
 const p=v04Project(),f=compileFleet(p);f.swaps[1].slots[0].sink=f.swaps[0].slots[0].sink;
 assert.throws(()=>new ServiceFleet(f),/service-sink/);
 const g=compileFleet(p);g.swaps[0].slots[0].sink=g.guns[0].sink;assert.throws(()=>new ServiceFleet(g),/service-sink/);
 const slot=compileFleet(p).swaps[0].slots[0];slot.sink='A-bus-sst';p.detailed!.service.truckSlotOverrides=[{enabled:true,slot}];
 assert.ok(detailedReadiness(p).some(i=>i.path==='service.A-bus-sst'));assert.throws(()=>simulateDetailed(p));
});
