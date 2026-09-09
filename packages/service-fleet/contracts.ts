export type StationId = 'A' | 'B';
export type ServiceKind = 'truck-swap' | 'passenger-swap' | 'direct-charge';
export interface EnergySOCPoint {soc:number; energyFraction:number|null;}
/** Piecewise linear stored-energy fraction versus BMS SOC; absent/null means the explicit linear assumption. */
export interface BatterySpec {
 id:string; family:string; capacityKWh:number|null; soh:number|null; initialSOC:number|null; energySOC?:EnergySOCPoint[]|null;
}
export interface BatterySlotConfig {
 id:string; sink:string; battery:BatterySpec; chargeKW:number|null; chargeEfficiency:number|null;
 /** Optional connector-side SOC power/current/voltage limits; null/absent retains fixed chargeKW. */
 chargeBands?:ChargeBand[]|null;
}
export interface SwapFleetConfig {
 id:string; station:StationId; kind:'truck-swap'|'passenger-swap'; enabled:boolean;
 bays:number|null; swapMinutes:number|null; readySOC:number|null; slots:BatterySlotConfig[];
}
/** Curve points define half-open constant SOC bands; no interpolation is hidden. */
export interface ChargeBand {fromSOC:number; toSOC:number; voltageV:number|null; maxKW:number|null; maxCurrentA:number|null;}
export interface TemperatureBand {minC:number; maxC:number; multiplier:number;}
export interface VehicleChargeProfile {
 id:string; enabled:boolean; capacityKWh:number|null; soh:number|null; chargeEfficiency:number|null;
 bands:ChargeBand[]|null; temperatureBands:TemperatureBand[]|null;
}
export interface GunConfig {id:string; sink:string; station:StationId; terminal:string; enabled:boolean; maxKW:number; maxCurrentA:number; maxVoltageV:number;}
export interface SwapArrival {
 id:string; fleetId:string; atMinute:number; returnSOC:number|null; unitPrice:number|null;
 /** null means exchange with a returned pack of exactly the dispatched pack capacity, SOH and family. */
 returnedPack:BatterySpec|null;
 /** Absolute net swap energy mode: preserve requested kWh; derive return SOC from the paired pack. */
 requestedKWh?:number|null; minReturnSOC?:number|null;
}
export interface ChargeArrival {
 id:string; station:StationId; atMinute:number; unitPrice:number|null; gunsRequired:1|2;
 /** Legacy energy mode bills connector energy and has no invented SOC or temperature. */
 energyKWh:number|null;
 /** Profile mode derives connector energy from vehicle stored-energy increase / chargeEfficiency. */
 profileId:string|null; initialSOC:number|null; targetSOC:number|null;
 temperatureC:number|null; temperatureSchedule:{atMinute:number; temperatureC:number}[];
 allowedGunIds:string[]|null;
}
export interface FleetConfig {swaps:SwapFleetConfig[]; profiles:VehicleChargeProfile[]; guns:GunConfig[]; swapArrivals:SwapArrival[]; chargeArrivals:ChargeArrival[];}
export interface PowerRequest {id:string; sink:string; kw:number; station:StationId; kind:'battery'|'gun'; serviceKind:ServiceKind; fleetId?:string; batteryId?:string; slotId?:string; jobId?:string; voltageV?:number;}
export type AllocatedPower=Record<string,number>;
export interface RuntimeAvailability {disabledSinks?:string[]; pausedFleetIds?:string[];}
export interface ServiceTransaction {
 id:string; station:StationId; kind:ServiceKind; arrival:number; start:number|null; completion:number|null;
 requestedKWh:number|null; deliveredKWh:number; storedVehicleKWh:number; unitPrice:number; revenue:number;
 gunIds:string[]; outgoingBatteryId?:string; incomingBatteryId?:string;
}
export interface ServiceEvent {toMinute?:number;
 atMinute:number; station:StationId; kind:'swap-complete'|'charge-energy'|'charge-complete'|'battery-charge';
 serviceKind:ServiceKind; jobId?:string; batteryId?:string; slotId?:string; sink?:string;
 terminalKWh:number; batteryLossKWh:number; storedChangeKWh:number;
 outgoingKWh:number; returnedKWh:number; deliveredKWh:number; revenueDelta:number;
}
export interface FleetTotals {
 initialStoredKWh:number; finalStoredKWh:number; batteryTerminalKWh:number; batteryLossKWh:number;
 outgoingKWh:number; returnedKWh:number; swapDeliveredKWh:number; directTerminalKWh:number;
 directStoredKWh:number; directBatteryLossKWh:number; revenue:number; completed:number; inventoryResidualKWh:number;
}
export interface BatteryState {slotId:string; sink:string; batteryId:string; family:string; capacityKWh:number; soh:number; energyKWh:number; reserved:boolean; energySOC?:EnergySOCPoint[]|null;}
export interface BatteryInspection extends BatteryState {fleetId:string; station:StationId; serviceKind:SwapFleetConfig['kind']; readySOC:number; soc:number; effectiveCapacityKWh:number; targetEnergyKWh:number; remainingKWh:number; requestedKW:number; enabled:boolean; operating:boolean;}
export interface ServiceSnapshot {atMinute:number; batteries:BatteryState[]; transactions:ServiceTransaction[]; totals:FleetTotals;}
