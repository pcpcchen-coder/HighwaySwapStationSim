import {engineeringProject,engineeringTopology,physicalProjection} from '../engineering/index.ts';
import {defaultDetailedConfig,defaultNodePhysics,syncCostInventory} from './defaults.ts';
import {defaultExtendedFinance} from '../extended-finance/contracts.ts';
import {applyLoadPreset,defaultLoadPlan} from '../load-planning/index.ts';
import type {Project} from '../contracts/index.ts';

/** User-confirmed 2026-09-18 configuration. Historical completeProject and
 * fixtures remain independently reproducible; new UI projects use this factory.
 */
export function singleBusProject():Project {
 const p=physicalProjection(engineeringProject());
 p.phase=1;p.strategy='IMMEDIATE';p.engineering!.pcsSlotsPerSite=3;
 for(const s of ['A','B'] as const){p.station[s].guns=0;p.station[s].chargePoolKW=0;}
 p.detailed=defaultDetailedConfig(p);
 const d=p.detailed;
 d.topology={architecture:'SINGLE_BUS',sharedDD:true,sharingMode:'EXCLUSIVE',pcsRatingKW:0,swapTerminalCounts:{pcs:1,sst:2},busTies:[]};
 d.dispatch={...d.dispatch,priority:'GUN_FIRST',reserveAuxiliaryPower:false,reserveReadyPacks:0,forecastMinutes:0};
 for(const storage of d.storage)if(storage.kind==='ESS')storage.connectionNodeId=`${storage.station}-feed-sst`;
 for(const solar of d.solar){solar.connectionNodeId=`${solar.station}-feed-sst`;if(solar.export)solar.export.connectionNodeId=solar.connectionNodeId;}
 d.assumptions=[
  {id:'SINGLE-BUS-PHASE1',status:'USER_CONFIRMED',note:'母線1/2合併視為公共DC800V；A/B各一台1680kW SST，十年維持目前第一期設備。雙向支援受供電側SST剩餘容量限制，不模擬母聯開關。'},
  {id:'ACDC-BOUNDARY',status:'USER_CONFIRMED',note:'每側箱變直接供應3台560kW AC/DC；整機效率預設95.35%，可逐台修改。不再串接集中PCS及舊版DD。'},
  {id:'DD-MATRIX',status:'USER_CONFIRMED',note:'每側AC倉1–3與DC倉4–8固定分組；AC組1座、DC組2座雙槍終端。各組回充／外槍整組互斥，外槍优先。移除獨立超充堆與終端。'},
  {id:'AUX-PRIORITY',status:'USER_CONFIRMED',note:'不預留站用功率；先供外槍，再由剩餘容量供站用與回充。站用耗電仍計入；必要站用不足時相依设备／工位停機。'},
  {id:'INHERITED-PARAMETERS',status:'ASSUMPTION',note:'沿用SST98%、箱變98%、DC/DC97.4%、電網PF0.99；乘用車550kW與重卡200kW負載率均50%；槍600A／637.56V。線長150m為既有假設，未啟用阻抗損耗；電池SOH及容量不作十年自動老化。'},
  {id:'MODEL-BOUNDARY',status:'ASSUMPTION',note:'功率／能量級共享模型；不計並聯環流、開關暫態或短路保護配合。儲能、光伏及備援預設未啟用。'},
 ];
 p.topology=engineeringTopology(p);
 d.physics=p.topology.nodes.filter(n=>['sst','transformer','acdc','charger','mv-cable','dc-cable','mv-switch'].includes(n.type)).map(n=>{
  const m=defaultNodePhysics(n.id);if(n.type.endsWith('cable')){m.cable.domain=n.type==='mv-cable'?'AC3':'DC';m.cable.lengthM=n.params.length;m.cable.sendingVoltageV=n.type==='mv-cable'?10000:800;}return m;
 });
 d.finance=defaultExtendedFinance(p.topology.nodes);
 p.detailed=syncCostInventory(d,p.topology.nodes);
 p.detailed.finance.inventory.pools=[{poolId:'A-truck',openingValue:null,additionalConversionCost:null},{poolId:'B-truck',openingValue:null,additionalConversionCost:null}];
 p.loadPlan=defaultLoadPlan();
 const next=applyLoadPreset(p,'low');next.name='單母線 · 第一期 · AC/DC 95.35%';
 return next;
}
