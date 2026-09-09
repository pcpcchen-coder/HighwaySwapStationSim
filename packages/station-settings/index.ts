import type { Project, StationId } from '../contracts/index.ts';
import { serviceRowSchema } from '../schemas/index.ts';
import { swapEnergyPerVehicle } from '../service-profile/index.ts';

/** SOC values are stored as ratios; the UI displays percentages. */
export function socWindowPreview(p:Project,station:StationId,returnSOC:number,readySOC:number){
 if(station!=='A'&&station!=='B')throw Error('請選擇 A 或 B 服務區。');
 if(!Number.isFinite(returnSOC)||!Number.isFinite(readySOC)||returnSOC<0||readySOC>1||returnSOC>=readySOC)
  throw Error('SOC 須符合 0% ≤ 回收下限 < 交付上限 ≤ 100%。');
 if(!Number.isFinite(p.station[station].capacityKWh)||p.station[station].capacityKWh<=0||p.station[station].capacityKWh>5000)
  throw Error('電池容量須大於 0 且不超過 5,000 kWh。');
 const next={...p,station:{...p.station,[station]:{...p.station[station],returnSOC,readySOC}}};
 const energyKWh=swapEnergyPerVehicle(next,station);
 const rows=p.services.filter(row=>row.station===station);
 const swapCount=rows.reduce((sum,row)=>sum+row.swapCount,0);
 return {energyKWh,swapCount,totalSwapKWh:swapCount*energyKWh};
}

/** Apply the explicitly selected window and recalculate only this station's
 * swap energy over all days. No topology rebuild or service-row reordering.
 * Validate before returning so an invalid batch cannot partly change a draft.
 */
export function applyStationSOC(p:Project,station:StationId,returnSOC:number,readySOC:number):Project{
 const {energyKWh}=socWindowPreview(p,station,returnSOC,readySOC);
 const services=p.services.map(row=>{
  if(row.station!==station)return row;
  const next={...row,swapKWh:row.swapCount*energyKWh};
  if(!serviceRowSchema.safeParse(next).success)throw Error(`第 ${row.day+1} 天 ${station} 區 ${row.hour} 時需求不合法，請先修正車次、充電電量或價格。`);
  return next;
 });
 return {...p,station:{...p.station,[station]:{...p.station[station],returnSOC,readySOC}},services};
}
