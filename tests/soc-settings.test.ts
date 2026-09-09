import test from 'node:test';
import assert from 'node:assert/strict';
import {completeProject} from '../packages/detailed-model/project.ts';
import {appendDetailedTemplate,prepareBatterySlotParameters} from '../packages/detailed-model/templates.ts';
import {compileTruckSlots,compilePassengerSlots} from '../packages/detailed-model/services.ts';
import {parseDetailedDraft} from '../packages/detailed-model/schema.ts';
import {exportDetailedJSON,exportDetailedCSV,importDetailedProfile} from '../packages/detailed-profile/index.ts';
import {collectDetails} from '../components/simulator/detailed-fields.ts';
import {ServiceFleet,validateFleetConfig} from '../packages/service-fleet/index.ts';
import type {BatterySlotConfig} from '../packages/service-fleet/contracts.ts';
const withNullCurves=(slot:BatterySlotConfig)=>({...slot,chargeBands:slot.chargeBands??null,battery:{...slot.battery,energySOC:slot.battery.energySOC??null}});
test('explicit preparation preserves effective slot values, draft inputs and unrelated settings',()=>{
 const p=completeProject(),config=p.detailed!,before=structuredClone(p);
 p.station.A.capacityKWh=600;p.station.A.readySOC=.93;p.station.A.batteryChargeKW=420;
 const saved=structuredClone(p),expectedTruck=(['A','B'] as const).flatMap(s=>compileTruckSlots(p,s).map(withNullCurves));
 const expectedPassenger=config.service.passenger.map(pc=>compilePassengerSlots(pc).map(withNullCurves));
 const prepared=prepareBatterySlotParameters(p,config),next={...p,detailed:prepared.config};
 assert.deepEqual(p,saved,'preparing fields mutates neither applied project nor draft');
 assert.deepEqual((['A','B'] as const).flatMap(s=>compileTruckSlots(next,s)),expectedTruck);
 assert.deepEqual(next.detailed.service.passenger.map(pc=>compilePassengerSlots(pc)),expectedPassenger);
 assert.equal(prepared.added,expectedTruck.length+expectedPassenger.flat().length);
 const withoutOverrides=(c:typeof config)=>{const copy=structuredClone(c);copy.service.truckSlotOverrides=[];for(const pc of copy.service.passenger)pc.slotOverrides=[];return copy;};
 assert.deepEqual(withoutOverrides(prepared.config),withoutOverrides(config));
 assert.equal(prepared.config.service.truckSlotOverrides[0].slot.battery.capacityKWh,600);
 assert.equal(before.detailed!.service.truckSlotOverrides.length,0);
});
test('repeated preparation is idempotent and preserves enabled and disabled custom overrides',()=>{
 const p=completeProject(),config=p.detailed!;
 const first=compileTruckSlots(p,'A')[0],pending=compileTruckSlots(p,'A')[1];
 first.battery.soh=.81;first.battery.initialSOC=.4;first.chargeEfficiency=.96;
 first.chargeBands=[{fromSOC:0,toSOC:.8,voltageV:700,maxKW:400,maxCurrentA:600},{fromSOC:.8,toSOC:1,voltageV:700,maxKW:150,maxCurrentA:600}];
 first.battery.energySOC=[{soc:0,energyFraction:0},{soc:.5,energyFraction:.4},{soc:1,energyFraction:1}];
 pending.battery.capacityKWh=null;
 config.service.truckSlotOverrides=[{enabled:true,slot:first},{enabled:false,slot:pending}];
 const snapshot=structuredClone(config),once=prepareBatterySlotParameters(p,config),twice=prepareBatterySlotParameters(p,once.config);
 assert.deepEqual(config,snapshot);
 assert.deepEqual(once.config.service.truckSlotOverrides[0],snapshot.service.truckSlotOverrides[0]);
 assert.equal(once.config.service.truckSlotOverrides[1].enabled,false);
 assert.equal(once.config.service.truckSlotOverrides[1].slot.battery.capacityKWh,null);
 assert.deepEqual(twice.config,once.config);assert.equal(twice.added,0);
 const effective=compileTruckSlots({...p,detailed:once.config},'A');assert.equal(effective[1].battery.capacityKWh,p.station.A.capacityKWh,'disabled draft must continue inheriting station values');
});
test('curve scaffolds retain unknown measurements and expose editable scalar fields',()=>{
 const p=completeProject();let c=prepareBatterySlotParameters(p,p.detailed!).config;
 const bandPath=['service','truckSlotOverrides',0,'slot','chargeBands'] as (string|number)[];
 const mapPath=['service','truckSlotOverrides',0,'slot','battery','energySOC'] as (string|number)[];
 c=appendDetailedTemplate(p,c,bandPath).config;c=appendDetailedTemplate(p,c,mapPath).config;
 assert.deepEqual(c.service.truckSlotOverrides[0].slot.chargeBands,[{fromSOC:0,toSOC:1,voltageV:null,maxKW:null,maxCurrentA:null}]);
 assert.deepEqual(c.service.truckSlotOverrides[0].slot.battery.energySOC,[{soc:0,energyFraction:null},{soc:1,energyFraction:null}]);
 assert.doesNotThrow(()=>parseDetailedDraft(c));
 const fleet={swaps:[{id:'A-truck',station:'A' as const,kind:'truck-swap' as const,enabled:true,bays:1,swapMinutes:7.5,readySOC:1,slots:[c.service.truckSlotOverrides[0].slot]}],profiles:[],guns:[],swapArrivals:[],chargeArrivals:[]};
 assert.throws(()=>validateFleetConfig(fleet),'incomplete measurements must block execution');
 const fields=collectDetails(c,'service');
 assert.ok(fields.leaves.some(l=>l.key.endsWith('energySOC[0].energyFraction')&&l.value===null&&l.type==='number'&&l.unit==='比例（0–1）'));
 assert.ok(fields.leaves.some(l=>l.key.endsWith('chargeBands[0].maxKW')&&l.type==='number'));
 const second=appendDetailedTemplate(p,c,mapPath);assert.deepEqual(second.config.service.truckSlotOverrides[0].slot.battery.energySOC![1],{soc:.5,energyFraction:null});
});
test('JSON and CSV preserve nullable SOC curves, optional absolute swap demand and slot overrides',()=>{
 const p=completeProject();p.detailed=prepareBatterySlotParameters(p,p.detailed!).config;
 p.detailed=appendDetailedTemplate(p,p.detailed,['service','swapArrivals']).config;
 p.detailed.service.swapArrivals[0].requestedKWh=300;p.detailed.service.swapArrivals[0].minReturnSOC=.2;
 p.detailed.service.truckSlotOverrides[0].slot.battery.energySOC=[{soc:0,energyFraction:0},{soc:.5,energyFraction:null},{soc:1,energyFraction:1}];
 p.detailed.service.truckSlotOverrides[0].slot.chargeBands=[{fromSOC:0,toSOC:1,voltageV:null,maxKW:400,maxCurrentA:null}];
 for(const format of ['json','csv'] as const){const text=format==='json'?exportDetailedJSON(p):exportDetailedCSV(p);assert.deepEqual(importDetailedProfile(completeProject(),text,format).detailed,p.detailed);}
 const old=completeProject().detailed!;assert.deepEqual(parseDetailedDraft(old),old,'legacy drafts remain unchanged');
 const bad=structuredClone(p.detailed);Object.assign(bad.service.truckSlotOverrides[0].slot.battery,{energySOC:[{soc:0,energyFraction:0,unknown:1}]});assert.throws(()=>parseDetailedDraft(bad),'unknown curve fields may not be silently dropped');
});

test('materializing inherited slots leaves three-day swap and recharge outputs unchanged',()=>{
 const p=completeProject(),prepared={...p,detailed:prepareBatterySlotParameters(p,p.detailed!).config};
 function run(project:typeof p){
  const swaps=(['A','B'] as const).map(station=>({id:`${station}-truck`,station,kind:'truck-swap' as const,enabled:true,bays:project.station[station].bays,swapMinutes:project.station[station].swapMinutes,readySOC:project.station[station].readySOC,slots:compileTruckSlots(project,station)}));
  const swapArrivals=[0,1440,2880].flatMap(atMinute=>(['A','B'] as const).map(station=>({id:`${station}-${atMinute}`,fleetId:`${station}-truck`,atMinute,returnSOC:.2,unitPrice:.8,returnedPack:null})));
  const fleet=new ServiceFleet({swaps,profiles:[],guns:[],swapArrivals,chargeArrivals:[]});fleet.activate();let t=0;
  while(t<4320-1e-8){const power=Object.fromEntries(fleet.powerRequests().map(r=>[r.id,r.kw])),next=fleet.nextEventMinute(power,4320);assert.ok(next>t);fleet.advance(next,power);fleet.activate(next);t=next;}
  const snapshot=fleet.snapshot();snapshot.batteries=snapshot.batteries.map(b=>({...b,energySOC:b.energySOC??null}));
  return {snapshot,events:fleet.events()};
 }
 assert.deepEqual(run(prepared),run(p));
});
