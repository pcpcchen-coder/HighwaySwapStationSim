/** Editable assumptions only: null is unknown, an explicit zero is confirmed zero.
 * This module is a review prototype. No jurisdiction-specific tariff/tax rate is supplied.
 */
export type Maybe = number | null;
export interface MeterContract {
  sourceId: string;
  basicMode: 'NONE' | 'CAPACITY_KVA' | 'MAX_15MIN_KW' | null;
  capacityKVA: Maybe;
  basicRatePerMonth: Maybe;
  contractedDemandKW: Maybe;
  excessDemandRatePerKWMonth: Maybe;
  pfMethod: 'NONE' | 'MANUAL_ADJUSTMENT' | 'PF_BANDS' | null;
  pfChargeBase: 'ENERGY' | 'ENERGY_AND_BASIC';
  manualPfAdjustmentRatio: Maybe;
  pfBands: { minimumPF: number; adjustmentRatio: number }[];
  monthlyPF: { month: string; powerFactor: Maybe }[];
}
export interface AssetCost {
  id: string;
  equipmentId: string | null;
  name: string;
  ownership: 'OWNED' | 'LEASED' | 'THIRD_PARTY' | null;
  quantity: Maybe;
  unitPurchaseCost: Maybe;
  /** 0 = before first operating month, 1 = beginning of first month, etc. */
  purchaseMonth: Maybe;
  depreciationMonths: Maybe;
  residualUnitValue: Maybe;
  /** null means disposal timing unknown; 0 means retain through the horizon. */
  disposalMonth: Maybe;
  disposalUnitProceeds: Maybe;
  monthlyLeasePerUnit: Maybe;
}
export interface OperatingCost {
  id: string;
  name: string;
  basis: 'CALENDAR_MONTH' | 'OPERATING_DAY' | 'DELIVERED_KWH' | 'REVENUE_RATIO';
  rate: Maybe;
  startMonth: number;
  /** 0 = no scheduled end. */
  endMonth: number;
  escalationAnnual: Maybe;
}
export interface ExtendedFinanceConfig {
  version: 1;
  calendar: {
    /** A local calendar date, run minute zero is local midnight. */
    startDate: string | null;
    /** Fixed offset only, no DST. Does not change the physical run's tariff hours. */
    utcOffsetMinutes: Maybe;
    partialMonthPolicy: 'REQUIRE_FULL_MONTH' | 'PRORATE_OBSERVED' | null;
  };
  meters: MeterContract[];
  inventory: {
    method: 'PERIOD_WEIGHTED';
    pools: { poolId: string; openingValue: Maybe; additionalConversionCost: Maybe }[];
  };
  assets: AssetCost[];
  opex: OperatingCost[];
  tax: {
    model: 'MONTHLY_NO_LOSS_RELIEF' | 'ANNUAL_LOSS_CARRY_FORWARD' | null;
    incomeTaxRate: Maybe;
    openingTaxLossCarryForward: Maybe;
    /** A modeled revenue levy, explicitly not VAT/input-credit accounting. */
    revenueLevyRate: Maybe;
    otherTaxPerMonth: Maybe;
  };
  workingCapital: {
    receivableDays: Maybe;
    openingReceivables: Maybe;
    openingReceivablesCollectMonth: Maybe;
    openingEnergyInventoryFunding: Maybe;
    openingOperatingReserve: Maybe;
    targetOperatingReserve: Maybe;
    releaseAtHorizon: boolean;
  };
  investment: {
    horizonMonths: Maybe;
    annualDiscountRate: Maybe;
    /** Only user-confirmed monthly operating assumptions may be projected. */
    projectionInputsConfirmed: boolean;
    operatingMonths: MonthlyOperationAssumption[];
  };
}
export interface FinanceIssue { code: string; path: string; message: string }
export interface FinanceRun {
  mode: string;
  parameterSnapshot: {
    horizonDays: number;
    topology: { nodes: { id: string; type: string; station: string }[] };
  };
  sourceMeters: { day: number; hour: number; sourceId: string; importKWh: number; cost: number }[];
  hours?: { day: number; hour: number; revenue: number; deliveredKWh: number }[];
  powerTrace?: {
    endMinute: number;
    nodes: { nodeId: string; samples: number[][] }[];
  };
  totals: { revenue: number; gridCost: number; deliveredKWh: number; initialStoredKWh: number; finalStoredKWh: number };
}
/** These inputs must be emitted by the same immutable physical run.
 * Additional energy costs are grid purchase cost attributed to actual pool inflow,
 * including conversion losses once. They are not a second electricity purchase.
 */
export interface InventoryFlow {
  poolId: string;
  openingKWh: number;
  inflowKWh: number;
  /** Full inflow cost, including external grid purchases and transfers received
   * from another on-site energy inventory pool. */
  inflowPurchaseCost: number;
  /** Included in inflowPurchaseCost, never an additional charge. Matched on-site
   * inventory issue costs are eliminated from consolidated purchases and COGS. */
  internalTransferCost?: number;
  issuedKWh: number;
  closingKWh: number;
}
export interface MonthlyOperation {
  month: number;
  calendarDays: number;
  operatingDays: number;
  revenue: number;
  /** Cash bought energy, all actual source meters and losses included once. */
  energyPurchases: number;
  /** Purchases plus opening value less closing value, with no inventory double count. */
  energyExpense: number;
  basicAndAdjustmentCharges: number;
  deliveredKWh: number;
}
export type MonthlyOperationAssumption = { [K in keyof MonthlyOperation]: K extends 'month' ? number : Maybe };

export function defaultExtendedFinance(
  equipment: { id: string; type: string; name?: string }[] = [],
): ExtendedFinanceConfig {
  return {
    version: 1,
    calendar: { startDate: null, utcOffsetMinutes: null, partialMonthPolicy: 'REQUIRE_FULL_MONTH' },
    meters: equipment.filter(n => n.type === 'grid').map(n => ({
      sourceId: n.id, basicMode: null, capacityKVA: null, basicRatePerMonth: null,
      contractedDemandKW: null, excessDemandRatePerKWMonth: null,
      pfMethod: null, pfChargeBase: 'ENERGY_AND_BASIC', manualPfAdjustmentRatio: null,
      pfBands: [], monthlyPF: [],
    })),
    inventory: { method: 'PERIOD_WEIGHTED', pools: [] },
    assets: equipment.map(n => ({
      id: `cost-${n.id}`, equipmentId: n.id, name: n.name ?? n.id,
      ownership: null, quantity: 1, unitPurchaseCost: null, purchaseMonth: null,
      depreciationMonths: null, residualUnitValue: null, disposalMonth: null,
      disposalUnitProceeds: null, monthlyLeasePerUnit: null,
    })),
    opex: [
      ['rent', '場地租金'], ['labor', '人力'], ['maintenance', '維修保養'],
      ['insurance', '保險'], ['communications', '通訊／雲端'], ['consumables', '耗材'],
      ['administration', '管理費'],
    ].map(([id, name]) => ({ id, name, basis: 'CALENDAR_MONTH', rate: null, startMonth: 1, endMonth: 0, escalationAnnual: null })),
    tax: { model: null, incomeTaxRate: null, openingTaxLossCarryForward: null, revenueLevyRate: null, otherTaxPerMonth: null },
    workingCapital: { receivableDays: null, openingReceivables: null, openingReceivablesCollectMonth: null, openingEnergyInventoryFunding: null,
      openingOperatingReserve: null, targetOperatingReserve: null, releaseAtHorizon: false },
    investment: { horizonMonths: null, annualDiscountRate: null, projectionInputsConfirmed: false, operatingMonths: [] },
  };
}
