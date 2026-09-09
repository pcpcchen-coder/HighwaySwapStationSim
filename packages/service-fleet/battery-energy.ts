import type {EnergySOCPoint} from './contracts.ts';
const EPS=1e-8;
/** Validate supplied data, never manufacture a chemistry or BMS curve. */
export function validateEnergySOC(points:EnergySOCPoint[]|null|undefined,path:string):void {
 if(points==null)return;
 if(points.length<2||points.length>1000)throw Error(`ENERGY_SOC_POINTS:${path}`);
 if(points[0].soc!==0||points[0].energyFraction!==0||points.at(-1)!.soc!==1||points.at(-1)!.energyFraction!==1)throw Error(`ENERGY_SOC_ENDPOINTS:${path}`);
 let prevSOC=-1,prevEnergy=-1;
 for(const p of points){if(p.energyFraction===null||!Number.isFinite(p.soc)||!Number.isFinite(p.energyFraction)||p.soc<0||p.soc>1||p.energyFraction<0||p.energyFraction>1||p.soc<=prevSOC||p.energyFraction<=prevEnergy)throw Error(`ENERGY_SOC_MONOTONE:${path}`);prevSOC=p.soc;prevEnergy=p.energyFraction;}
}
/** Stored kWh at SOC. Capacity is the rated full energy and SOH scales its usable full energy. */
export function energyAtSOC(capacityKWh:number,soh:number,soc:number,points?:EnergySOCPoint[]|null):number {
 if(soc<-EPS||soc>1+EPS)throw Error('SOC_OUT_OF_RANGE');soc=Math.max(0,Math.min(1,soc));
 if(!points)return capacityKWh*soh*soc;
 const hi=points.findIndex(p=>p.soc>=soc);if(hi<=0)return 0;
 const a=points[hi-1],b=points[hi],fraction=a.energyFraction!+(soc-a.soc)/(b.soc-a.soc)*(b.energyFraction!-a.energyFraction!);
 return capacityKWh*soh*fraction;
}
/** Inverse of the same piecewise linear map, so SOC display and stored-energy accounting agree. */
export function socAtEnergy(capacityKWh:number,soh:number,energyKWh:number,points?:EnergySOCPoint[]|null):number {
 const raw=energyKWh/(capacityKWh*soh);if(raw<-EPS||raw>1+EPS)throw Error('ENERGY_OUT_OF_RANGE');const fraction=Math.max(0,Math.min(1,raw));
 if(!points)return fraction;
 const hi=points.findIndex(p=>p.energyFraction!>=fraction);if(hi<=0)return 0;
 const a=points[hi-1],b=points[hi];return a.soc+(fraction-a.energyFraction!)/(b.energyFraction!-a.energyFraction!)*(b.soc-a.soc);
}
