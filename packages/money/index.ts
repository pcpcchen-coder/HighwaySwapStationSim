/** Fixed decimal settlement. Energy and tariff quantize HALF_UP to six decimals, invoices to CNY cents. */
export function scaled(value:number,places:number):bigint {
 if(!Number.isFinite(value))throw Error('NON_FINITE_AMOUNT');
 const negative=value<0;const [mantissa,exp='0']=Math.abs(value).toString().toLowerCase().split('e');
 const [whole,fraction='']=mantissa.split('.');let digits=BigInt(whole+fraction),shift=places+Number(exp)-fraction.length;
 if(shift>=0)digits*=10n**BigInt(shift);else{const divisor=10n**BigInt(-shift);digits=(digits+divisor/2n)/divisor;}
 return negative?-digits:digits;
}
function safeCents(cents:bigint):number {const value=Number(cents);if(!Number.isSafeInteger(value)||cents>1_000_000_000_000n||cents< -1_000_000_000_000n)throw Error('MONEY_RANGE_EXCEEDED');return value;}
export function invoiceCents(kWh:number,unitPrice:number):number {if(kWh<0||unitPrice<0)throw Error('NEGATIVE_INVOICE');const product=scaled(kWh,6)*scaled(unitPrice,6);return safeCents((product+5000000000n)/10000000000n);}
export function money(kWh:number,unitPrice:number):number{return invoiceCents(kWh,unitPrice)/100;}
export function sumMoney(values:number[]):number{return safeCents(values.reduce((sum,value)=>sum+scaled(value,2),0n))/100;}
/** Largest-remainder apportionment preserves the exact source invoice. Stable input order breaks ties. */
export function apportionCents(total:number,weights:number[]):number[]{const sum=weights.reduce((a,b)=>a+b,0);if(sum===0)return weights.map(()=>0);const raw=weights.map(w=>total*w/sum),out=raw.map(Math.floor);let left=total-out.reduce((a,b)=>a+b,0);const order=raw.map((v,i)=>({i,f:v-out[i]})).sort((a,b)=>b.f-a.f||a.i-b.i);for(let i=0;i<left;i++)out[order[i%order.length].i]++;return out;}
