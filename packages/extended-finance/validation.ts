import type { ExtendedFinanceConfig, FinanceIssue } from './contracts.ts';

export function validateExtendedFinance(input: unknown): FinanceIssue[] {
  const issues: FinanceIssue[] = [];
  const bad = (path: string, message: string) => issues.push({ code: 'INVALID_FINANCE_INPUT', path, message });
  const obj = (v: unknown, keys: string[], p: string): Record<string, any> => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) { bad(p, 'Expected object'); return {}; }
    const r = v as Record<string, unknown>;
    for (const key of Object.keys(r)) if (!keys.includes(key)) bad(`${p}.${key}`, 'Unknown field');
    for (const key of keys) if (!(key in r)) bad(`${p}.${key}`, 'Missing field; use null for unknown');
    return r;
  };
  const num = (v: unknown, p: string, low = 0, high = 1e12, integer = false, nullable = true) => {
    if (nullable && v === null) return;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < low || v > high || integer && !Number.isInteger(v)) bad(p, `Expected ${integer ? 'integer' : 'number'} in [${low}, ${high}]${nullable ? ' or null' : ''}`);
  };
  const en = (v: unknown, p: string, vals: unknown[]) => { if (!vals.includes(v)) bad(p, 'Unknown selection'); };
  const str = (v: unknown, p: string, nullable = false) => { if (!(nullable && v === null) && (typeof v !== 'string' || v.length === 0 || v.length > 200)) bad(p, 'Expected non-empty text'); };
  const arr = (v: unknown, p: string): unknown[] => { if (!Array.isArray(v) || v.length > 5000) { bad(p, 'Expected array (max 5000)'); return []; } return v; };
  const ids = (items: any[], field: string, p: string) => { const seen = new Set(); for (const v of items) { if (seen.has(v?.[field])) bad(p, `Duplicate ${field}`); seen.add(v?.[field]); } };
  const root = obj(input, ['version', 'calendar', 'meters', 'inventory', 'assets', 'opex', 'tax', 'workingCapital', 'investment'], 'finance');
  en(root.version, 'finance.version', [1]);
  const c = obj(root.calendar, ['startDate', 'utcOffsetMinutes', 'partialMonthPolicy'], 'calendar');
  if (c.startDate !== null) {
    const timestamp = typeof c.startDate === 'string' ? Date.parse(`${c.startDate}T00:00:00Z`) : NaN;
    if (typeof c.startDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(c.startDate) || !Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== c.startDate) bad('calendar.startDate', 'Expected valid YYYY-MM-DD or null');
  }
  num(c.utcOffsetMinutes, 'calendar.utcOffsetMinutes', -840, 840, true);
  en(c.partialMonthPolicy, 'calendar.partialMonthPolicy', ['REQUIRE_FULL_MONTH', 'PRORATE_OBSERVED', null]);
  const meters = arr(root.meters, 'meters'); ids(meters, 'sourceId', 'meters');
  meters.forEach((v, i) => {
    const p = `meters[${i}]`, m = obj(v, ['sourceId', 'basicMode', 'capacityKVA', 'basicRatePerMonth', 'contractedDemandKW', 'excessDemandRatePerKWMonth', 'pfMethod', 'pfChargeBase', 'manualPfAdjustmentRatio', 'pfBands', 'monthlyPF'], p);
    str(m.sourceId, `${p}.sourceId`);
    en(m.basicMode, `${p}.basicMode`, ['NONE', 'CAPACITY_KVA', 'MAX_15MIN_KW', null]);
    for (const k of ['capacityKVA', 'basicRatePerMonth', 'contractedDemandKW', 'excessDemandRatePerKWMonth']) num(m[k], `${p}.${k}`);
    en(m.pfMethod, `${p}.pfMethod`, ['NONE', 'MANUAL_ADJUSTMENT', 'PF_BANDS', null]);
    en(m.pfChargeBase, `${p}.pfChargeBase`, ['ENERGY', 'ENERGY_AND_BASIC']);
    num(m.manualPfAdjustmentRatio, `${p}.manualPfAdjustmentRatio`, -1, 10);
    const bands = arr(m.pfBands, `${p}.pfBands`); ids(bands, 'minimumPF', `${p}.pfBands`);
    bands.forEach((b, j) => { const x = obj(b, ['minimumPF', 'adjustmentRatio'], `${p}.pfBands[${j}]`); num(x.minimumPF, `${p}.pfBands[${j}].minimumPF`, 0, 1, false, false); num(x.adjustmentRatio, `${p}.pfBands[${j}].adjustmentRatio`, -1, 10, false, false); });
    const measured = arr(m.monthlyPF, `${p}.monthlyPF`); ids(measured, 'month', `${p}.monthlyPF`);
    measured.forEach((v, j) => { const x = obj(v, ['month', 'powerFactor'], `${p}.monthlyPF[${j}]`); if (typeof x.month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(x.month)) bad(`${p}.monthlyPF[${j}].month`, 'Expected YYYY-MM'); num(x.powerFactor, `${p}.monthlyPF[${j}].powerFactor`, 0, 1); });
  });
  const inv = obj(root.inventory, ['method', 'pools'], 'inventory'); en(inv.method, 'inventory.method', ['PERIOD_WEIGHTED']);
  const pools = arr(inv.pools, 'inventory.pools'); ids(pools, 'poolId', 'inventory.pools');
  pools.forEach((v, i) => { const x = obj(v, ['poolId', 'openingValue', 'additionalConversionCost'], `inventory.pools[${i}]`); str(x.poolId, `inventory.pools[${i}].poolId`); num(x.openingValue, `inventory.pools[${i}].openingValue`); num(x.additionalConversionCost, `inventory.pools[${i}].additionalConversionCost`); });
  const assets = arr(root.assets, 'assets'); ids(assets, 'id', 'assets');
  assets.forEach((v, i) => {
    const p = `assets[${i}]`, x = obj(v, ['id', 'equipmentId', 'name', 'ownership', 'quantity', 'unitPurchaseCost', 'purchaseMonth', 'depreciationMonths', 'residualUnitValue', 'disposalMonth', 'disposalUnitProceeds', 'monthlyLeasePerUnit'], p);
    str(x.id, `${p}.id`); str(x.equipmentId, `${p}.equipmentId`, true); str(x.name, `${p}.name`);
    en(x.ownership, `${p}.ownership`, ['OWNED', 'LEASED', 'THIRD_PARTY', null]);
    num(x.quantity, `${p}.quantity`, 0, 1e6, true);
    for (const k of ['unitPurchaseCost', 'residualUnitValue', 'disposalUnitProceeds', 'monthlyLeasePerUnit']) num(x[k], `${p}.${k}`);
    for (const k of ['purchaseMonth', 'disposalMonth']) num(x[k], `${p}.${k}`, 0, 360, true);
    num(x.depreciationMonths, `${p}.depreciationMonths`, 1, 1200, true);
    if (x.residualUnitValue !== null && x.unitPurchaseCost !== null && x.residualUnitValue > x.unitPurchaseCost) bad(`${p}.residualUnitValue`, 'Residual exceeds original purchase cost');
    if (x.disposalMonth > 0 && x.purchaseMonth !== null && x.disposalMonth < x.purchaseMonth) bad(`${p}.disposalMonth`, 'Disposal precedes purchase');
  });
  const opex = arr(root.opex, 'opex'); ids(opex, 'id', 'opex');
  opex.forEach((v, i) => { const p = `opex[${i}]`, x = obj(v, ['id', 'name', 'basis', 'rate', 'startMonth', 'endMonth', 'escalationAnnual'], p); str(x.id, `${p}.id`); str(x.name, `${p}.name`); en(x.basis, `${p}.basis`, ['CALENDAR_MONTH', 'OPERATING_DAY', 'DELIVERED_KWH', 'REVENUE_RATIO']); num(x.rate, `${p}.rate`); num(x.startMonth, `${p}.startMonth`, 1, 360, true, false); num(x.endMonth, `${p}.endMonth`, 0, 360, true, false); if (x.endMonth > 0 && x.endMonth < x.startMonth) bad(`${p}.endMonth`, 'End precedes start'); num(x.escalationAnnual, `${p}.escalationAnnual`, -1, 10); });
  const tax = obj(root.tax, ['model', 'incomeTaxRate', 'openingTaxLossCarryForward', 'revenueLevyRate', 'otherTaxPerMonth'], 'tax');
  en(tax.model, 'tax.model', ['MONTHLY_NO_LOSS_RELIEF', 'ANNUAL_LOSS_CARRY_FORWARD', null]);
  num(tax.incomeTaxRate, 'tax.incomeTaxRate', 0, 1); num(tax.revenueLevyRate, 'tax.revenueLevyRate', 0, 1); num(tax.openingTaxLossCarryForward, 'tax.openingTaxLossCarryForward'); num(tax.otherTaxPerMonth, 'tax.otherTaxPerMonth');
  const wc = obj(root.workingCapital, ['receivableDays', 'openingReceivables', 'openingReceivablesCollectMonth', 'openingEnergyInventoryFunding', 'openingOperatingReserve', 'targetOperatingReserve', 'releaseAtHorizon'], 'workingCapital');
  num(wc.receivableDays, 'workingCapital.receivableDays', 0, 3650);
  for (const k of ['openingReceivables', 'openingEnergyInventoryFunding', 'openingOperatingReserve', 'targetOperatingReserve']) num(wc[k], `workingCapital.${k}`);
  num(wc.openingReceivablesCollectMonth, 'workingCapital.openingReceivablesCollectMonth', 1, 360, true); en(wc.releaseAtHorizon, 'workingCapital.releaseAtHorizon', [true, false]);
  const invst = obj(root.investment, ['horizonMonths', 'annualDiscountRate', 'projectionInputsConfirmed', 'operatingMonths'], 'investment'); num(invst.horizonMonths, 'investment.horizonMonths', 1, 360, true); num(invst.annualDiscountRate, 'investment.annualDiscountRate', 0, 1); en(invst.projectionInputsConfirmed, 'investment.projectionInputsConfirmed', [true, false]);
  const operations = arr(invst.operatingMonths, 'investment.operatingMonths'); ids(operations, 'month', 'investment.operatingMonths');
  operations.forEach((v, i) => { const p = `investment.operatingMonths[${i}]`, o = obj(v, ['month', 'calendarDays', 'operatingDays', 'revenue', 'energyPurchases', 'energyExpense', 'basicAndAdjustmentCharges', 'deliveredKWh'], p); num(o.month, `${p}.month`, 1, 360, true, false); num(o.calendarDays, `${p}.calendarDays`, 28, 31, true); num(o.operatingDays, `${p}.operatingDays`, 0, 31); for (const k of ['revenue', 'energyPurchases', 'energyExpense', 'basicAndAdjustmentCharges', 'deliveredKWh']) num(o[k], `${p}.${k}`); });
  return issues;
}
export function assertExtendedFinance(input: unknown): asserts input is ExtendedFinanceConfig {
  const issues = validateExtendedFinance(input); if (issues.length) throw Error(issues.map(i => `${i.path}: ${i.message}`).join('\n'));
}
