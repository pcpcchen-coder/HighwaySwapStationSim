import type {Project} from '../contracts/index.ts';
import {engineeringProject,engineeringTopology,physicalProjection} from '../engineering/index.ts';
import {defaultDetailedConfig,syncCostInventory} from './defaults.ts';
export function completeProject():Project{
 const p=physicalProjection(engineeringProject());p.name='完整雙站 · 410.4 kWh 物理案例';p.detailed=defaultDetailedConfig(p);p.topology=engineeringTopology(p);p.detailed=syncCostInventory(p.detailed,p.topology.nodes);
 p.detailed.finance.inventory.pools=[{poolId:'A-truck',openingValue:null,additionalConversionCost:null},{poolId:'B-truck',openingValue:null,additionalConversionCost:null}];return p;
}
