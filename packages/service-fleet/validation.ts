import type {FleetConfig} from './contracts.ts';
type Shape='string'|'number'|'boolean'|{literal:readonly(string|number)[]}|{nullable:Shape}|{array:Shape}|{[key:string]:Shape};
const nullable=(shape:Shape):Shape=>({nullable:shape}), array=(shape:Shape):Shape=>({array:shape});
const station:Shape={literal:['A','B']};
const battery:Shape={id:'string',family:'string',capacityKWh:nullable('number'),soh:nullable('number'),initialSOC:nullable('number')};
const profile:Shape={id:'string',enabled:'boolean',capacityKWh:nullable('number'),soh:nullable('number'),chargeEfficiency:nullable('number'),bands:nullable(array({fromSOC:'number',toSOC:'number',voltageV:nullable('number'),maxKW:nullable('number'),maxCurrentA:nullable('number')})),temperatureBands:nullable(array({minC:'number',maxC:'number',multiplier:'number'}))};
const swap:Shape={id:'string',station,kind:{literal:['truck-swap','passenger-swap']},enabled:'boolean',bays:nullable('number'),swapMinutes:nullable('number'),readySOC:nullable('number'),slots:array({id:'string',sink:'string',battery,chargeKW:nullable('number'),chargeEfficiency:nullable('number')})};
const gun:Shape={id:'string',sink:'string',station,terminal:'string',enabled:'boolean',maxKW:'number',maxCurrentA:'number',maxVoltageV:'number'};
const swapArrival:Shape={id:'string',fleetId:'string',atMinute:'number',returnSOC:nullable('number'),unitPrice:nullable('number'),returnedPack:nullable(battery)};
const chargeArrival:Shape={id:'string',station,atMinute:'number',unitPrice:nullable('number'),gunsRequired:{literal:[1,2]},energyKWh:nullable('number'),profileId:nullable('string'),initialSOC:nullable('number'),targetSOC:nullable('number'),temperatureC:nullable('number'),temperatureSchedule:array({atMinute:'number',temperatureC:'number'}),allowedGunIds:nullable(array('string'))};
const shape:Shape={swaps:array(swap),profiles:array(profile),guns:array(gun),swapArrivals:array(swapArrival),chargeArrivals:array(chargeArrival)};
function check(input:unknown,s:Shape,path:string):void {
 if(typeof s==='string'){if(typeof input!==s||(s==='number'&&!Number.isFinite(input as number)))throw Error(`DRAFT_TYPE:${path}:${s}`);if(s==='string'&&(input as string).length>4096)throw Error(`DRAFT_STRING_LIMIT:${path}`);return;}
 if('literal'in s){if(!(s.literal as readonly unknown[]).includes(input))throw Error(`DRAFT_ENUM:${path}`);return;}
 if('nullable'in s){if(input!==null)check(input,s.nullable as Shape,path);return;}
 if('array'in s){if(!Array.isArray(input))throw Error(`DRAFT_ARRAY:${path}`);if(input.length>20000)throw Error(`DRAFT_ARRAY_LIMIT:${path}`);input.forEach((item,i)=>check(item,s.array as Shape,`${path}[${i}]`));return;}
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error(`DRAFT_OBJECT:${path}`);
 const value=input as Record<string,unknown>;for(const key of Object.keys(value))if(!Object.hasOwn(s,key))throw Error(`DRAFT_UNKNOWN:${path}.${key}`);
 for(const [key,child] of Object.entries(s))if(!Object.hasOwn(value,key))throw Error(`DRAFT_MISSING:${path}.${key}`);else check(value[key],child,`${path}.${key}`);
}
/** Strict structural validation allows nullable drafts to save; construct ServiceFleet only after readiness passes. */
export function parseFleetDraft(input:unknown):FleetConfig {check(input,shape,'fleet');return structuredClone(input) as FleetConfig;}
