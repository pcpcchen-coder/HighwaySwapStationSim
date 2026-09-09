import type { Equipment, Project } from '../contracts/index.ts';
export const efficiencyTypes=['sst','transformer','pcs','charger'] as const;
export function supportsEfficiency(type:string):type is typeof efficiencyTypes[number]{return (efficiencyTypes as readonly string[]).includes(type);}
export function equipmentEfficiency(p:Project,n:Equipment,hasCharger=false):number{
 const override=n.params.efficiency;
 if(override!==undefined){
  if(!supportsEfficiency(n.type)||!Number.isFinite(override)||override<=0||override>1)throw Error(`${n.id}: 個別效率須為 0 < η ≤ 1，且僅支援 SST／箱變／PCS／DD。`);
  if(p.efficiency.mode!=='ASSEMBLY')throw Error('個別設備效率須使用「設備組裝乘積」模式。');
  return override;
 }
 let eta=supportsEfficiency(n.type)?p.efficiency[n.type]:1;
 if(p.efficiency.mode==='SOURCE_CHAIN'&&hasCharger){if(n.type==='sst')eta=p.efficiency.sstSource/p.efficiency.charger;if(n.type==='transformer')eta=p.efficiency.pcsSource/p.efficiency.pcs/p.efficiency.charger;}
 if(!(eta>0&&eta<=1))throw Error('INCONSISTENT_EFFICIENCY_BOUNDARY');return eta;
}
