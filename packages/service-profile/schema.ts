import {z} from 'zod';
const n=z.number().finite().nonnegative(),count=n.int().max(1000);
export const serviceRowSchema=z.object({
 day:n.int().max(30),hour:n.int().max(23),station:z.enum(['A','B']),
 swapCount:count,swapKWh:n,chargeCount:count,chargeKWh:n,idleRaw:n.nullable(),
 gridPrice:n,swapFee:n,chargeFee:n,swapTotalRaw:n,chargeTotalRaw:n,
 ac:z.object({swapCount:count,swapKWh:n,chargeCount:count,chargeKWh:n}).strict().optional(),
}).strict().superRefine((r,ctx)=>{
 for(const kind of ['swap','charge'] as const){
  const totalCount=r[`${kind}Count`],totalEnergy=r[`${kind}KWh`];
  if(totalCount===0&&totalEnergy!==0)ctx.addIssue({code:'custom',message:'Energy requires a nonzero session count'});
  if(r.ac){const c=r.ac[`${kind}Count`],e=r.ac[`${kind}KWh`];
   if(c>totalCount||e>totalEnergy+1e-8||(c===0&&e!==0)||(c===totalCount&&Math.abs(e-totalEnergy)>1e-8)||(c>0&&e===0)||(totalCount>c&&totalEnergy<=e))ctx.addIssue({code:'custom',path:['ac',kind],message:'AC 子集須介於零與總量；AC/DC 非零電量都須有對應車次'});
  }
 }
});
