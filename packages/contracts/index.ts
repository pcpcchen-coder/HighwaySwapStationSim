export type StationId = 'A' | 'B';
export type Domain = 'AC' | 'DC';
export interface Port {
    id: string;
    domain: Domain;
    voltage: number;
    tolerance: number;
    direction: 'input' | 'output';
}
export interface Equipment {
    id: string;
    type: string;
    name: string;
    station: StationId;
    x: number;
    y: number;
    enabled: boolean;
    params: Record<string, number>;
}
export interface Edge {
    id: string;
    source: string;
    target: string;
    enabled: boolean;
}
export interface Topology {
    nodes: Equipment[];
    edges: Edge[];
}
export interface ServiceRow {
    day: number;
    hour: number;
    station: StationId;
    swapCount: number;
    swapKWh: number;
    chargeCount: number;
    chargeKWh: number;
    idleRaw: number | null;
    gridPrice: number;
    swapFee: number;
    chargeFee: number;
    swapTotalRaw: number;
    chargeTotalRaw: number;
}
export interface StationConfig {
    batteries: number;
    capacityKWh: number;
    readySOC: number;
    returnSOC: number;
    bays: number;
    swapMinutes: number;
    guns: number;
    gunKW: number;
    chargePoolKW: number;
    batteryChargeKW: number;
    auxiliaryKW: number;
}
export interface Project {
    detailed?: import('../detailed-model/contracts.ts').DetailedConfig;
    schemaVersion: '1.3';
    horizonDays: number;
    moneyPolicy: 'CNY_CENT_HALF_UP';
    equipmentSchedule: {atMinute:number; equipmentId:string; enabled:boolean}[];
    engineering?: EngineeringConfig;
    name: string;
    seed: number;
    phase: 1 | 2;
    mode: 'SOURCE_REPLAY' | 'CONSTRAINED';
    strategy: 'IMMEDIATE' | 'TOU';
    arrival: 'SCHEDULED' | 'SEEDED';
    topology: Topology;
    services: ServiceRow[];
    station: Record<StationId, StationConfig>;
    efficiency: {
        mode: 'SOURCE_CHAIN' | 'ASSEMBLY';
        sst: number;
        transformer: number;
        pcs: number;
        charger: number;
        sstSource: number;
        pcsSource: number;
    };
    billing: 'EXACT_COMPONENTS' | 'SOURCE_DISPLAY_PRICE';
    finance: {
        capex: number | null;
        fixedDaily: number | null;
        variablePerKWh: number;
        discountRate: number;
        years: number;
        rampMonths: number;
        startLoad: number;
        operatingDaysPerYear: number;
    };
    sources: {
        id: string;
        status: string;
        note: string;
    }[];
}
export interface Diagnostic {
    code: string;
    severity: 'error' | 'warning';
    message: string;
    target?: string;
}
export interface HourResult {
    day: number;
    auxiliaryGridCost: number;
    hour: number;
    station: StationId;
    requestedKWh: number;
    deliveredKWh: number;
    swapCount: number;
    chargeCount: number;
    gridKWh: number;
    lossKWh: number;
    auxiliaryKWh: number;
    revenue: number;
    gridCost: number;
    ready: number;
    queue: number;
    storedKWh: number;
    balanceResidual: number;
    peakKW: number;
}
export interface Transaction {
    unitPrice?: number;
    revenue?: number;
    equipmentId?: string;
    id: string;
    station: StationId;
    kind: 'swap' | 'charge';
    arrival: number;
    start: number | null;
    completion: number | null;
    requestedKWh: number;
    deliveredKWh: number;
}
export interface RunResult {
    detailedResult?: import('../detailed-model/contracts.ts').DetailedResult;
    /** Present only for constrained runs recorded by engine 0.4+. */
    powerTrace?: PowerTrace;
    engineVersion: string;
    parameterSnapshot: Project;
    mode: Project['mode'];
    hours: HourResult[];
    transactions: Transaction[];
    diagnostics: Diagnostic[];
    componentEnergy: ComponentEnergy[];
    edgeEnergy: EdgeEnergy[];
    sourceMeters: SourceMeter[];
    totals: {
        deliveredKWh: number;
        requestedKWh: number;
        gridKWh: number;
        lossKWh: number;
        revenue: number;
        gridCost: number;
        auxiliaryGridCost: number;
        completed: number;
        unservedKWh: number;
        initialStoredKWh: number;
        finalStoredKWh: number;
        maxBalanceResidual: number;
    };
}

export interface EngineeringConfig {
    profile: 'SUPPLEMENT_513';
    pcsSlotsPerSite: number;
    intertie: boolean;
    simultaneity: number;
    packVoltage: number;
    passengerSlots: number;
    passengerSwapSeconds: number;
    passengerChargerKW: number;
    passengerAuxKW: number;
    passengerLoadFactor: number;
    truckAuxLoadFactor: number;
}

export interface ComponentEnergy {day:number;hour:number;nodeId:string;inputKWh:number;outputKWh:number;lossKWh:number;terminalKWh:number;peakOutputKW:number;capacityKW:number;maxBalanceResidual:number;}
export interface EdgeEnergy {day:number;hour:number;edgeId:string;source:string;target:string;kWh:number;peakKW:number;}
export interface SourceMeter {day:number;hour:number;sourceId:string;importKWh:number;peakKW:number;unitPrice:number;cost:number;}

/** Piecewise constant signals. No interpolation or display rounding is applied.
 * A sample applies from its minute (inclusive) until the next sample, or endMinute.
 * Status: 0 configured on, 1 configured off, 2 auxiliary interlock, 3 auxiliary shortfall.
 */
export type PowerNodeSample = [minute:number,inputKW:number,outputKW:number,lossKW:number,terminalKW:number,requestedKW:number,status:number];
export type PowerEdgeSample = [minute:number,powerKW:number];
export interface PowerTrace {
    version: 1;
    endMinute: number;
    eventMinutes: number[];
    nodes: {nodeId:string;samples:PowerNodeSample[]}[];
    edges: {edgeId:string;samples:PowerEdgeSample[]}[];
}
