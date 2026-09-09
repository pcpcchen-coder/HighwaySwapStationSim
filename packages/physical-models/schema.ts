import type { Issue,CableConfig,ThermalConfig,EfficiencyCurveConfig,TransformerLossConfig,CompensationConfig,StorageConfig,StoragePolicy,PvConfig,ProtectionConfig,AtsConfig } from './index.ts';
import { PhysicalInputError } from './index.ts';

export interface PhysicalConfigMap { cable:CableConfig;thermal:ThermalConfig;converter:EfficiencyCurveConfig;transformer:TransformerLossConfig;compensation:CompensationConfig;storage:StorageConfig;storagePolicy:StoragePolicy;pv:PvConfig;protection:ProtectionConfig;ats:AtsConfig }
export type PhysicalKind=keyof PhysicalConfigMap;
export interface FieldDefinition { type:'number'|'boolean'|'enum'|'curve'; nullable?:boolean; min?:number;max?:number;exclusiveMin?:boolean;integer?:boolean; options?:string[]; default?:boolean|string;unit?:string }
const n=(min=0,max=Number.MAX_VALUE,unit='',exclusiveMin=false):FieldDefinition=>({type:'number',nullable:true,min,max,unit,exclusiveMin});
const positive=(unit='')=>n(0,Number.MAX_VALUE,unit,true), ratio=()=>n(0,1), efficiency=()=>n(0,1,'',true), temperature=()=>n(-273.15,1000,'°C');
const enabled={type:'boolean',default:false} as const;
export const physicalModelDefinitions:Record<PhysicalKind,Record<string,FieldDefinition>>={
  cable:{enabled,domain:{type:'enum',options:['DC','AC3'],default:'DC'},sendingVoltageV:positive('V'),lengthM:n(0,1e7,'m'),conductorResistanceOhmPerKm:n(0,1e6,'Ω/km'),parallelRuns:{...positive(),integer:true},referenceTemperatureC:temperature(),conductorTemperatureC:temperature(),resistanceAlphaPerC:n(0,1,'1/°C'),reactanceOhmPerKm:n(0,1e6,'Ω/km'),loadPowerFactor:efficiency(),reactiveSign:{type:'enum',options:['lagging','leading'],default:'lagging'},ampacityA:positive('A'),ampacityDerating:ratio(),maxVoltageDropRatio:ratio()},
  thermal:{enabled,thermalResistanceCPerKW:positive('°C/kW'),heatCapacityKWhPerC:positive('kWh/°C'),maximumConductorC:temperature(),ampacityByAmbientC:{type:'curve',nullable:true}},
  converter:{enabled,ratedOutputKW:positive('kW'),points:{type:'curve',nullable:true},referenceTemperatureC:temperature(),temperatureCoefficientPerC:n(-1,1,'1/°C'),standbyKW:n(0,1e6,'kW')},
  transformer:{enabled,ratedKVA:positive('kVA'),noLoadKW:n(0,1e6,'kW'),ratedCopperKW:n(0,1e6,'kW'),noLoadKvar:n(0,1e6,'kvar'),ratedLeakageKvar:n(0,1e6,'kvar'),ratedCopperTemperatureC:temperature(),windingTemperatureC:temperature(),copperResistanceAlphaPerC:n(0,1,'1/°C')},
  compensation:{enabled,maximumKvar:n(0,1e7,'kvar'),targetPowerFactor:efficiency(),stepKvar:positive('kvar'),lossKWPerKvar:n(0,1,'kW/kvar'),allowLeading:{type:'boolean',default:false}},
  storage:{enabled,capacityKWh:positive('kWh'),minSOC:ratio(),maxSOC:ratio(),chargeKW:n(0,1e7,'kW'),dischargeKW:n(0,1e7,'kW'),chargeEfficiency:efficiency(),dischargeEfficiency:efficiency(),selfDischargePerHour:n(0,100,'1/h'),calendarFadePerDay:ratio(),cycleFadePerEquivalentCycle:ratio()},
  storagePolicy:{mode:{type:'enum',options:['SELF_CONSUMPTION','TOU','RESERVE','MANUAL'],default:'SELF_CONSUMPTION'},chargeBelow:n(-1e6,1e6),dischargeAbove:n(-1e6,1e6),reserveSOC:ratio(),manualKW:n(-1e7,1e7,'kW')},
  pv:{enabled,stcKW:n(0,1e7,'kW'),referenceIrradianceWm2:positive('W/m²'),referenceCellC:temperature(),temperatureCoefficientPerC:n(-1,1,'1/°C'),dcDerating:ratio(),mpptEfficiency:efficiency(),mpptOutputKW:n(0,1e7,'kW'),exportLimitKW:n(0,1e7,'kW')},
  protection:{enabled,continuousA:positive('A'),overloadPickupA:positive('A'),overloadDelayHours:n(0,87600,'h'),instantaneousPickupA:positive('A'),instantaneousDelayHours:n(0,87600,'h'),interruptionRatingA:positive('A'),automaticReset:{type:'boolean',default:false},resetDelayHours:n(0,87600,'h')},
  ats:{enabled,preferred:{type:'enum',options:['normal','backup'],default:'normal'},failDelayHours:n(0,87600,'h'),transferDeadHours:n(0,87600,'h'),returnDelayHours:n(0,87600,'h'),automaticReturn:{type:'boolean',default:true}},
};
export function defaultPhysicalConfig<K extends PhysicalKind>(kind:K):PhysicalConfigMap[K] {return Object.fromEntries(Object.entries(physicalModelDefinitions[kind]).map(([key,d])=>[key,d.default??null])) as unknown as PhysicalConfigMap[K];}
const plain=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
/** Draft schema: null is valid unknown data; unknown keys and wrong types are rejected. */
export function validatePhysicalDraft<K extends PhysicalKind>(kind:K,value:unknown):Issue[] {
  const issues:Issue[]=[];const bad=(field:string,message:string)=>issues.push({field,code:'invalid',message});if(!plain(value))return [{field:kind,code:'invalid',message:'設定須為普通物件。'}];const defs=physicalModelDefinitions[kind];for(const key of Object.keys(value))if(!Object.hasOwn(defs,key))bad(`${kind}.${key}`,'未知欄位，未靜默丟棄。');
  for(const [key,d] of Object.entries(defs)){const v=value[key],field=`${kind}.${key}`;if(v===undefined){bad(field,'缺少欄位；未知數值請明確填 null。');continue;}if(v===null){if(!d.nullable)bad(field,'此欄不可為空。');continue;}
    if(d.type==='boolean'){if(typeof v!=='boolean')bad(field,'須為布林值。');}
    if(d.type==='enum'){if(typeof v!=='string'||!d.options?.includes(v))bad(field,'選項無效。');}
    if(d.type==='number'){if(typeof v!=='number'||!Number.isFinite(v)||v<(d.min??-Infinity)||v>(d.max??Infinity)||d.exclusiveMin&&v===d.min||d.integer&&!Number.isInteger(v))bad(field,'數值、範圍或整數條件無效。');}
    if(d.type==='curve'){if(!Array.isArray(v)||v.length<2||v.length>1000){bad(field,'曲線須有 2–1000 點。');continue;}for(let i=0;i<v.length;i++){const point=v[i];if(!plain(point)||Object.keys(point).sort().join(',')!=='x,y'||(point.x!==null&&(typeof point.x!=='number'||!Number.isFinite(point.x)))||(point.y!==null&&(typeof point.y!=='number'||!Number.isFinite(point.y)))){bad(`${field}[${i}]`,'曲線點僅可包含有限數值或待填 null 的 x/y。');continue;}if(i&&plain(v[i-1])&&typeof point.x==='number'&&typeof v[i-1].x==='number'&&point.x<=Number(v[i-1].x))bad(`${field}[${i}].x`,'橫坐標須嚴格遞增。');if(kind==='converter'&&(typeof point.x==='number'&&(point.x<0||point.x>1)||typeof point.y==='number'&&(point.y<=0||point.y>1)))bad(`${field}[${i}]`,'效率曲線 x/y 為 0–1 比例且 y>0。');if(kind==='thermal'&&typeof point.y==='number'&&(point.y<0||point.y>1))bad(`${field}[${i}].y`,'降額比例須在 0–1。');}}
  }
  if(kind==='storage'&&typeof value.minSOC==='number'&&typeof value.maxSOC==='number'&&value.minSOC>=value.maxSOC)bad('storage.minSOC','SOC 下限必須小於上限。');
  if(kind==='storagePolicy'&&value.mode==='TOU'&&typeof value.chargeBelow==='number'&&typeof value.dischargeAbove==='number'&&value.chargeBelow>=value.dischargeAbove)bad('storagePolicy.chargeBelow','充電價格門檻須低於放電價格門檻。');
  if(kind==='protection'&&typeof value.continuousA==='number'&&typeof value.overloadPickupA==='number'&&typeof value.instantaneousPickupA==='number'&&(value.continuousA>value.overloadPickupA||value.overloadPickupA>value.instantaneousPickupA))bad('protection.overloadPickupA','整定須 continuous ≤ overload ≤ instantaneous。');
  return issues;
}
export function parsePhysicalDraft<K extends PhysicalKind>(kind:K,value:unknown):PhysicalConfigMap[K]{const issues=validatePhysicalDraft(kind,value);if(issues.length)throw new PhysicalInputError(issues);return structuredClone(value) as PhysicalConfigMap[K];}
/** Ready schema: disabled modules do not block unrelated simulation. Contextual
 * weather, fault current and temperature availability is checked by runtime calls.
 */
export function validatePhysicalReady<K extends PhysicalKind>(kind:K,value:unknown):Issue[] {
  const issues=validatePhysicalDraft(kind,value);if(issues.length||!plain(value))return issues;if(value.enabled===false)return issues;
  const irrelevant=new Set<string>();if(kind==='cable'&&value.domain==='DC'){irrelevant.add('reactanceOhmPerKm');irrelevant.add('loadPowerFactor');}
  if(kind==='storagePolicy'){if(value.mode!=='TOU'){irrelevant.add('chargeBelow');irrelevant.add('dischargeAbove');}if(value.mode!=='MANUAL')irrelevant.add('manualKW');}
  // Reset/return delays remain persisted but are not required when disabled.
  if(kind==='protection'&&!value.automaticReset)irrelevant.add('resetDelayHours');if(kind==='ats'&&!value.automaticReturn)irrelevant.add('returnDelayHours');
  for(const [key,d] of Object.entries(physicalModelDefinitions[kind]))if(d.nullable&&value[key]===null&&!irrelevant.has(key))issues.push({field:`${kind}.${key}`,code:'missing',message:'啟用模型的必要數值待填。'});
  for(const [key,d]of Object.entries(physicalModelDefinitions[kind]))if(d.type==='curve'&&Array.isArray(value[key]))for(const [i,point]of (value[key] as Record<string,unknown>[]).entries())for(const axis of ['x','y'])if(point[axis]===null)issues.push({field:`${kind}.${key}[${i}].${axis}`,code:'missing',message:'啟用曲線的必要數值待填。'});
  if(kind==='converter'&&Array.isArray(value.points)&&(value.points[0].x!==0||value.points.at(-1).x!==1))issues.push({field:'converter.points',code:'missing',message:'效率曲線必須覆蓋負載比例 0 到 1。'});
  return issues;
}
