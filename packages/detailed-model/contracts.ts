import type { StationId, RunResult } from '../contracts/index.ts';
import type { CableConfig, ThermalConfig, EfficiencyCurveConfig, TransformerLossConfig, CompensationConfig, ProtectionConfig, StorageConfig, StoragePolicy, PvConfig, AtsConfig } from '../physical-models/index.ts';
import type { BatterySlotConfig, ChargeArrival, SwapArrival, VehicleChargeProfile, ServiceSnapshot, ServiceEvent } from '../service-fleet/contracts.ts';
import type { ExtendedFinanceConfig, InventoryFlow } from '../extended-finance/contracts.ts';
import type { TopologyOptions } from '../detailed-network/topology.ts';

export interface NodePhysics {
 nodeId:string; temperatureC:number|null; ambientC:number|null;
 cable:CableConfig; thermal:ThermalConfig; curve:EfficiencyCurveConfig;
 transformer:TransformerLossConfig; compensation:CompensationConfig;
 loadPowerFactor:number|null; protection:ProtectionConfig;
 faultSchedule:{fromMinute:number;toMinute:number;currentA:number|null}[];
 /** Null applies no additional current or ramp limit; nameplate limits remain. */
 currentLimitA:number|null; rampKWPerMinute:number|null;
}
export interface Store {
 id:string; station:StationId; kind:'ESS'|'UPS'; connectionNodeId:string;
 config:StorageConfig; initialSOC:number|null; initialSOH:number|null;
 policy:StoragePolicy;
}
export interface Solar {
 id:string; station:StationId; connectionNodeId:string; config:PvConfig;
 profile:{atMinute:number;irradianceWm2:number|null;cellTemperatureC:number|null}[];
 export?:{enabled:boolean;gridSourceId:string|null;connectionNodeId:string;converterKW:number|null;efficiency:number|null;unitPrice:number|null};
}
export interface Backup {
 id:string; station:StationId; loadNodeIds:string[]; normalNodeId:string; backupNodeId:string;
 config:AtsConfig; inverterKW:number|null; inverterEfficiency:number|null;
}
export interface Passenger {
 station:StationId; enabled:boolean; slots:number; swapSeconds:number; bays:number|null;
 capacityKWh:number|null; soh:number|null; initialSOC:number|null; readySOC:number|null; returnSOC:number|null;
 batteryChargeKW:number|null; batteryEfficiency:number|null; chargerEfficiency:number|null; dcVoltageV:number|null;
 auxIdleKW:number|null; auxActiveKW:number|null;
 slotOverrides:{enabled:boolean;slot:BatterySlotConfig}[];
 arrivals:{id:string;atMinute:number;count:number;returnSOC:number|null;unitPrice:number|null}[];
}
export interface DetailedConfig {
 version:1; topology:TopologyOptions;
 physics:NodePhysics[]; storage:Store[]; solar:Solar[]; backup:Backup[];
 loads:{nodeId:string;idleKW:number|null;perActiveJobKW:number|null;hourlyKW:(number|null)[]|null;perEnabledSST:boolean}[];
 service:{useHourlyTruckDemand:boolean;truckSlotOverrides:{enabled:boolean;slot:BatterySlotConfig}[];passenger:Passenger[];profiles:VehicleChargeProfile[];swapArrivals:SwapArrival[];chargeArrivals:ChargeArrival[]};
 dispatch:{priority:'BATTERY_FIRST'|'GUN_FIRST'|'FAIR';sourcePolicy:'SOURCE_ORDER'|'LOWEST_PRICE';chargeBelow:number|null;reserveReadyPacks:number|null;forecastMinutes:number|null;gridLimits:{sourceId:string;kw:number|null}[];communicationOutages:{fromMinute:number;toMinute:number}[];fallback:'IMMEDIATE'|'PAUSE_FLEXIBLE'};
 construction:{atMinute:number;equipmentId:string;enabled:boolean;params:Record<string,number>}[];
 finance:ExtendedFinanceConfig;
 assumptions:{id:string;status:'ASSUMPTION'|'USER_CONFIRMED'|'SOURCE_TRANSCRIBED';note:string}[];
}
export interface StorageLedger {fromMinute:number;toMinute:number;id:string;station:StationId;inputKWh:number;outputKWh:number;lossKWh:number;storedKWh:number;deltaKWh:number;soh:number;cycles:number;initialStoredKWh:number;inputKW:number;outputKW:number;selfDischargeKWh:number;capacitySpillKWh:number;}
export interface ElectricalReading {fromMinute:number;toMinute:number;nodeId:string;currentA:number;voltageV:number;reactiveKvar:number;temperatureC:number|null;}
export interface DetailedResult {
 fleet:ServiceSnapshot; serviceEvents:ServiceEvent[]; storage:StorageLedger[]; electrical:ElectricalReading[];
 pv:{fromMinute:number;toMinute:number;id:string;availableKWh:number;generatedKWh:number;curtailedKWh:number}[];
 exports?:{day:number;hour:number;id:string;kWh:number;unitPrice:number;revenue:number}[];
 switching:{atMinute:number;id:string;state:string;reason:string}[];
 inventory:InventoryFlow[];
 energy:{pvKWh:number;exportKWh?:number;storageInitialKWh:number;storageFinalKWh:number;storageLossKWh:number;auxiliaryKWh:number;networkLossKWh:number;balanceResidualKWh:number;};
}
export type DetailedRun = RunResult & { detailedResult:DetailedResult };
