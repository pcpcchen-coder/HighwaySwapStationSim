import type {Project} from '../contracts/index.ts';
import {engineeringProject,engineeringTopology,physicalProjection} from '../engineering/index.ts';
import {defaultDetailedConfig,syncCostInventory} from './defaults.ts';
export function completeProject():Project{
 const p=physicalProjection(engineeringProject());p.name='完整雙站 · 410.4 kWh 物理案例';p.detailed=defaultDetailedConfig(p);
 // Current complete preset: PCS:SST = 3:5 on both sides. Terminal inventory
 // is 1 PCS + 2 SST dual-gun terminals; DD count does not buy more guns.
 p.engineering!.pcsSlotsPerSite=3;p.detailed.topology.swapTerminalCounts={pcs:1,sst:2};
 p.detailed.assumptions.find(a=>a.id==='DD-MATRIX')!.note='依使用者 2026-09-17 配置：PCS 倉1–3、SST 倉4–8，3/5台DD共用組；每側外接雙槍終端 PCS 1 台、SST 2 台。預設回充與外槍互斥；共享矩陣仍需設備方確認。';
 p.topology=engineeringTopology(p);p.detailed=syncCostInventory(p.detailed,p.topology.nodes);
 p.detailed.finance.inventory.pools=[{poolId:'A-truck',openingValue:null,additionalConversionCost:null},{poolId:'B-truck',openingValue:null,additionalConversionCost:null}];return p;
}
