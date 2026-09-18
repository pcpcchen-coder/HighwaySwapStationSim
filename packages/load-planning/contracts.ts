import type {ServiceRow} from '../contracts/index.ts';
export type LoadLevel='high'|'medium'|'low';
export interface LoadPlanYear {
 year:number;load:LoadLevel;operatingDays:number;demandFactor:number;
 traditionalEfficiency:number;sstEfficiency:number;
}
export interface LoadPlan {
 version:1;activeLoad:LoadLevel|null;
 profiles:Record<LoadLevel,ServiceRow[]>;
 years:LoadPlanYear[];
 energyValueCnyPerKWh:number;
}
