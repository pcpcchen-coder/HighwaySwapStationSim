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
    schemaVersion: '1.1';
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
    engineVersion: string;
    parameterSnapshot: Project;
    mode: Project['mode'];
    hours: HourResult[];
    transactions: Transaction[];
    diagnostics: Diagnostic[];
    totals: {
        deliveredKWh: number;
        requestedKWh: number;
        gridKWh: number;
        lossKWh: number;
        revenue: number;
        gridCost: number;
        completed: number;
        unservedKWh: number;
        initialStoredKWh: number;
        finalStoredKWh: number;
        maxBalanceResidual: number;
    };
}
