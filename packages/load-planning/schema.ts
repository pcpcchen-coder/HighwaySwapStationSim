import {z} from 'zod';
import {serviceRowSchema} from '../service-profile/schema.ts';
const level=z.enum(['high','medium','low']);
const profile=z.array(serviceRowSchema).length(48).superRefine((rows,c)=>{
 if(rows.some(r=>r.day!==0||!r.ac)||new Set(rows.map(r=>`${r.station}:${r.hour}`)).size!==48)c.addIssue({code:'custom',message:'負載劇本須有第1天A/B各24小時，並完整提供AC子集'});
});
export const loadPlanSchema=z.object({version:z.literal(1),activeLoad:level.nullable(),profiles:z.object({high:profile,medium:profile,low:profile}).strict(),
 energyValueCnyPerKWh:z.number().finite().min(0).max(100),
 years:z.array(z.object({year:z.number().int().min(2000).max(2200),load:level,operatingDays:z.number().finite().min(0).max(366),demandFactor:z.number().finite().min(0).max(10),traditionalEfficiency:z.number().finite().gt(0).lte(1),sstEfficiency:z.number().finite().gt(0).lte(1)}).strict()).length(10)
}).strict().superRefine((p,c)=>{
 if(p.years.some((y,i)=>i>0&&y.year!==p.years[i-1].year+1))c.addIssue({code:'custom',message:'十年設計須為連續年度'});
});
