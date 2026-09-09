import {z} from 'zod';
import type {DetailedConfig} from './contracts.ts';
import {validatePhysicalDraft,type PhysicalKind,type PhysicalConfigMap} from '../physical-models/schema.ts';
import {validateExtendedFinance} from '../extended-finance/validation.ts';
import {parseFleetDraft} from '../service-fleet/validation.ts';
import type {ExtendedFinanceConfig} from '../extended-finance/contracts.ts';
import type {ChargeArrival,SwapArrival,VehicleChargeProfile} from '../service-fleet/contracts.ts';
const n=z.number().finite(),nonnegative=n.nonnegative(),nullable=nonnegative.nullable(),ratio=n.min(0).max(1).nullable(),id=z.string().min(1).max(200),station=z.enum(['A','B']);
const physical=<K extends PhysicalKind>(kind:K)=>z.custom<PhysicalConfigMap[K]>(v=>validatePhysicalDraft(kind,v).length===0,`不合法的 ${kind} 設定（未知值請填 null）`);
function fleetPart<T>(key:string){return z.custom<T>(value=>{try{parseFleetDraft({swaps:[],profiles:[],guns:[],swapArrivals:[],chargeArrivals:[],[key]:[value]});return true;}catch{return false;}},`不合法的 ${key} 設定`);}
const battery=z.object({id,family:id,capacityKWh:nullable,soh:ratio,initialSOC:ratio}).strict();
const slot=z.object({id,sink:id,battery,chargeKW:nullable,chargeEfficiency:ratio}).strict();
const overrides=z.array(z.object({enabled:z.boolean(),slot}).strict()).max(500);
const interval=z.object({fromMinute:nonnegative,toMinute:nonnegative}).strict().refine(v=>v.toMinute>v.fromMinute);
export const detailedSchema=z.object({
 version:z.literal(1),
 topology:z.object({sharedDD:z.boolean(),sharingMode:z.enum(['SIMULTANEOUS','EXCLUSIVE']),pcsRatingKW:nonnegative,busTies:z.array(z.object({station,enabled:z.boolean(),direction:z.enum(['SST_TO_PCS','PCS_TO_SST']),kw:nullable}).strict()).max(2)}).strict(),
 physics:z.array(z.object({nodeId:id,temperatureC:n.nullable(),ambientC:n.nullable(),cable:physical('cable'),thermal:physical('thermal'),curve:physical('converter'),transformer:physical('transformer'),compensation:physical('compensation'),loadPowerFactor:ratio,protection:physical('protection'),faultSchedule:z.array(z.object({fromMinute:nonnegative,toMinute:nonnegative,currentA:nullable}).strict()).max(1000),currentLimitA:nullable,rampKWPerMinute:nullable}).strict()).max(500),
 storage:z.array(z.object({id,station,kind:z.enum(['ESS','UPS']),connectionNodeId:id,config:physical('storage'),initialSOC:ratio,initialSOH:ratio,policy:physical('storagePolicy')}).strict()).max(30),
 solar:z.array(z.object({id,station,connectionNodeId:id,config:physical('pv'),export:z.object({enabled:z.boolean(),gridSourceId:z.string().nullable(),connectionNodeId:id,converterKW:nullable,efficiency:ratio,unitPrice:nullable}).strict().optional(),profile:z.array(z.object({atMinute:nonnegative,irradianceWm2:nullable,cellTemperatureC:n.nullable()}).strict()).max(44640)}).strict()).max(30),
 backup:z.array(z.object({id,station,loadNodeIds:z.array(id).max(100),normalNodeId:id,backupNodeId:id,config:physical('ats'),inverterKW:nullable,inverterEfficiency:ratio}).strict()).max(30),
 loads:z.array(z.object({nodeId:id,idleKW:nullable,perActiveJobKW:nullable,hourlyKW:z.array(nullable).max(744).nullable(),perEnabledSST:z.boolean()}).strict()).max(500),
 service:z.object({useHourlyTruckDemand:z.boolean(),truckSlotOverrides:overrides,passenger:z.array(z.object({station,enabled:z.boolean(),slots:nonnegative.int().min(14).max(30),swapSeconds:n.positive(),bays:nullable,capacityKWh:nullable,soh:ratio,initialSOC:ratio,readySOC:ratio,returnSOC:ratio,batteryChargeKW:nullable,batteryEfficiency:ratio,chargerEfficiency:ratio,dcVoltageV:nullable,auxIdleKW:nullable,auxActiveKW:nullable,slotOverrides:overrides,arrivals:z.array(z.object({id,atMinute:nonnegative,count:nonnegative.int().max(1000),returnSOC:ratio,unitPrice:nullable}).strict()).max(20000)}).strict()).max(2),profiles:z.array(fleetPart<VehicleChargeProfile>('profiles')).max(100),swapArrivals:z.array(fleetPart<SwapArrival>('swapArrivals')).max(20000),chargeArrivals:z.array(fleetPart<ChargeArrival>('chargeArrivals')).max(20000)}).strict(),
 dispatch:z.object({priority:z.enum(['BATTERY_FIRST','GUN_FIRST','FAIR']),sourcePolicy:z.enum(['SOURCE_ORDER','LOWEST_PRICE']),chargeBelow:nullable,reserveReadyPacks:nullable,forecastMinutes:nullable,gridLimits:z.array(z.object({sourceId:id,kw:nullable}).strict()).max(100),communicationOutages:z.array(interval).max(1000),fallback:z.enum(['IMMEDIATE','PAUSE_FLEXIBLE'])}).strict(),
 construction:z.array(z.object({atMinute:nonnegative,equipmentId:id,enabled:z.boolean(),params:z.record(nonnegative)}).strict()).max(1000),
 finance:z.custom<ExtendedFinanceConfig>(v=>validateExtendedFinance(v).length===0,'財務設定含未知或不合法欄位'),
 assumptions:z.array(z.object({id,status:z.enum(['ASSUMPTION','USER_CONFIRMED','SOURCE_TRANSCRIBED']),note:z.string().max(4096)}).strict()).max(1000),
}).strict().superRefine((v,c)=>{
 const unique=(values:string[],path:string)=>{if(new Set(values).size!==values.length)c.addIssue({code:'custom',message:`${path} 識別碼重複`});};
 unique(v.physics.map(n=>n.nodeId),'physics');unique(v.storage.map(n=>n.id),'storage');unique(v.solar.map(n=>n.id),'solar');unique(v.backup.map(n=>n.id),'backup');unique(v.loads.map(n=>n.nodeId),'loads');unique(v.service.passenger.map(n=>n.station),'passenger');unique(v.topology.busTies.map(n=>n.station),'busTies');
 for(const profile of v.solar)for(let i=1;i<profile.profile.length;i++)if(profile.profile[i].atMinute<=profile.profile[i-1].atMinute)c.addIssue({code:'custom',message:`${profile.id}: 光伏時序須遞增且不重複`});
});
export function parseDetailedDraft(value:unknown):DetailedConfig{return detailedSchema.parse(value);}
