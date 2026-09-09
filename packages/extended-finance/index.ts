import type { AssetCost, ExtendedFinanceConfig, FinanceIssue, FinanceRun, InventoryFlow, MonthlyOperation } from './contracts.ts';
import { assertExtendedFinance } from './validation.ts';
export * from './contracts.ts';
export * from './validation.ts';

const MINUTE_MS = 60000;
function finite(value: number, label: string, min = 0) {
  if (!Number.isFinite(value) || value < min) throw Error(`Invalid ${label}`);
  return value;
}
/** Decimal HALF_UP, same sign behavior as current monetary settlement. */
export function financialRound(value: number): number {
  finite(value, 'money', -1e12);
  const sign = value < 0 ? -1 : 1;
  const [mantissa, exponent = '0'] = Math.abs(value).toString().toLowerCase().split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  let n = BigInt(whole + fraction), shift = 2 + Number(exponent) - fraction.length;
  if (shift >= 0) n *= 10n ** BigInt(shift);
  else { const d = 10n ** BigInt(-shift); n = (n + d / 2n) / d; }
  const cents = Number(n) * sign;
  if (!Number.isSafeInteger(cents) || Math.abs(cents) > 1e14) throw Error('Money range exceeded');
  return cents / 100;
}
const sumMoney = (values: number[]) => financialRound(values.reduce((s, v) => s + Math.round(v * 100), 0) / 100);
const missing = (issues: FinanceIssue[], path: string, message = '資料未知，請填入；已確認無此項請輸入 0') => issues.push({ code: 'MISSING_FINANCE_INPUT', path, message });
function requireValue(value: number | null, issues: FinanceIssue[], path: string): number | null { if (value === null) missing(issues, path); return value; }

export interface MonthSlice { month: string; fromMinute: number; toMinute: number; calendarDays: number; coveredDays: number; complete: boolean }
export function calendarSlices(startDate: string, horizonDays: number): MonthSlice[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw Error('Invalid startDate');
  const start = Date.parse(`${startDate}T00:00:00Z`);
  if (!Number.isFinite(start) || new Date(start).toISOString().slice(0, 10) !== startDate) throw Error('Invalid startDate');
  if (!Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > 3660) throw Error('Invalid horizonDays');
  const end = start + horizonDays * 1440 * MINUTE_MS, result: MonthSlice[] = [];
  let cursor = start;
  while (cursor < end) {
    const d = new Date(cursor), first = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1), next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1), stop = Math.min(next, end);
    result.push({ month: d.toISOString().slice(0, 7), fromMinute: (cursor - start) / MINUTE_MS, toMinute: (stop - start) / MINUTE_MS, calendarDays: (next - first) / MINUTE_MS / 1440, coveredDays: (stop - cursor) / MINUTE_MS / 1440, complete: cursor === first && stop === next });
    cursor = stop;
  }
  return result;
}
export function integratePower(samples: number[][], from: number, to: number, endMinute: number, column = 1) {
  let energy = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.max(from, samples[i][0]), b = Math.min(to, samples[i + 1]?.[0] ?? endMinute);
    if (b > a) energy += samples[i][column] * (b - a) / 60;
  }
  return energy;
}
/** Fixed local quarter-hour blocks, never substitutes instantaneous or hourly max. */
export function maximumQuarterHourKW(samples: number[][], from: number, to: number, endMinute: number) {
  let peak = 0;
  for (let start = Math.ceil(from / 15) * 15; start + 15 <= to; start += 15) peak = Math.max(peak, integratePower(samples, start, start + 15, endMinute) * 4);
  return peak;
}
export interface MeterMonthBill {
  sourceId: string; month: string; completeMonth: boolean; status: 'COMPLETE_MONTH' | 'PRORATED_OBSERVED_ESTIMATE' | 'INCOMPLETE';
  coveredDays: number; calendarDays: number; importKWh: number; energyCost: number;
  observedMaximum15minKW: number | null; trueMonthlyMaximumKnown: boolean;
  basicCharge: number | null; excessDemandCharge: number | null; pfAdjustment: number | null;
  total: number | null;
}
export function billMeterMonths(run: FinanceRun, config: ExtendedFinanceConfig) {
  assertExtendedFinance(config);
  const issues: FinanceIssue[] = [], rows: MeterMonthBill[] = [];
  if (run.mode !== 'CONSTRAINED') issues.push({ code: 'NO_PHYSICAL_RESULT', path: 'run.mode', message: '需使用受限物理測算結果' });
  if (config.calendar.startDate === null) missing(issues, 'calendar.startDate');
  if (config.calendar.utcOffsetMinutes === null) missing(issues, 'calendar.utcOffsetMinutes');
  if (config.calendar.partialMonthPolicy === null) missing(issues, 'calendar.partialMonthPolicy');
  if (issues.length) return { rows, issues, total: null, energyCost: sumMoney(run.sourceMeters.map(m => m.cost)), estimated: false };
  const slices = calendarSlices(config.calendar.startDate!, run.parameterSnapshot.horizonDays);
  const gridIds = run.parameterSnapshot.topology.nodes.filter(n => n.type === 'grid').map(n => n.id);
  for (const meter of run.sourceMeters) {
    finite(meter.importKWh, 'meter.importKWh'); finite(meter.cost, 'meter.cost');
    if (!gridIds.includes(meter.sourceId)) issues.push({ code: 'UNKNOWN_METER_SOURCE', path: meter.sourceId, message: '電表必須對應實際 grid 電源節點' });
  }
  if (Math.abs(sumMoney(run.sourceMeters.map(m => m.cost)) - run.totals.gridCost) > 0.005) issues.push({ code: 'METER_COST_MISMATCH', path: 'sourceMeters', message: '電表合計與測算購電成本不一致' });
  for (const id of gridIds) for (const slice of slices) {
    const before = issues.length, path = `meters.${id}.${slice.month}`, contract = config.meters.find(m => m.sourceId === id);
    const meters = run.sourceMeters.filter(m => m.sourceId === id && (m.day * 24 + m.hour) * 60 >= slice.fromMinute && (m.day * 24 + m.hour) * 60 < slice.toMinute);
    const energyCost = sumMoney(meters.map(m => m.cost)), importKWh = meters.reduce((s, m) => s + m.importKWh, 0);
    const samples = run.powerTrace?.nodes.find(n => n.nodeId === id)?.samples;
    let peak: number | null = null;
    if (samples?.length && samples[0][0] === 0 && run.powerTrace!.endMinute >= slice.toMinute) {
      if (samples.some((s, i) => !Number.isFinite(s[0]) || !Number.isFinite(s[1]) || s[1] < 0 || i > 0 && s[0] <= samples[i - 1][0])) throw Error(`Invalid power trace ${id}`);
      const traceKWh = integratePower(samples, slice.fromMinute, slice.toMinute, run.powerTrace!.endMinute);
      if (Math.abs(traceKWh - importKWh) > Math.max(1e-6, importKWh * 1e-9)) issues.push({ code: 'METER_TRACE_MISMATCH', path, message: '需量所用 trace 與電表 kWh 不一致' });
      else peak = maximumQuarterHourKW(samples, slice.fromMinute, slice.toMinute, run.powerTrace!.endMinute);
    }
    let basic: number | null = null, excess: number | null = null, pfAdjustment: number | null = null;
    const allowed = slice.complete || config.calendar.partialMonthPolicy === 'PRORATE_OBSERVED';
    const factor = slice.complete ? 1 : slice.coveredDays / slice.calendarDays;
    if (!allowed) issues.push({ code: 'PARTIAL_BILLING_MONTH', path, message: '未覆蓋完整計費月；不能確認月最大需量及月帳單。可明確選擇觀測期間分攤估算。' });
    if (!contract) missing(issues, path, '缺少實際來源電表的供電契約');
    else {
      if (contract.basicMode === null) missing(issues, `${path}.basicMode`);
      else if (contract.basicMode === 'NONE') basic = 0;
      else {
        const rate = requireValue(contract.basicRatePerMonth, issues, `${path}.basicRatePerMonth`);
        const quantity = contract.basicMode === 'CAPACITY_KVA' ? requireValue(contract.capacityKVA, issues, `${path}.capacityKVA`) : peak;
        if (contract.basicMode === 'MAX_15MIN_KW' && peak === null) missing(issues, `${path}.trace`, '缺少可核對的電表逐事件功率，不能用小時峰值代替 15 分鐘需量');
        if (rate !== null && quantity !== null && allowed) basic = financialRound(quantity * rate * factor);
      }
      const excessRate = requireValue(contract.excessDemandRatePerKWMonth, issues, `${path}.excessDemandRatePerKWMonth`);
      if (excessRate === 0) excess = 0;
      else if (excessRate !== null) {
        const contracted = requireValue(contract.contractedDemandKW, issues, `${path}.contractedDemandKW`);
        if (peak === null) missing(issues, `${path}.trace`, '超約需量需要 15 分鐘 trace');
        if (contracted !== null && peak !== null && allowed) excess = financialRound(Math.max(0, peak - contracted) * excessRate * factor);
      }
      let adjustment: number | null = null;
      if (contract.pfMethod === null) missing(issues, `${path}.pfMethod`);
      else if (contract.pfMethod === 'NONE') adjustment = 0;
      else if (contract.pfMethod === 'MANUAL_ADJUSTMENT') adjustment = requireValue(contract.manualPfAdjustmentRatio, issues, `${path}.manualPfAdjustmentRatio`);
      else {
        const pf = contract.monthlyPF.find(p => p.month === slice.month)?.powerFactor ?? null;
        if (pf === null) missing(issues, `${path}.monthlyPF`, '需填入該月實測／假設功率因數，不能以設備 PF 自動替代月電表 PF');
        else {
          const band = [...contract.pfBands].sort((a, b) => b.minimumPF - a.minimumPF).find(b => pf >= b.minimumPF);
          if (!band) missing(issues, `${path}.pfBands`, '功率因數級距未涵蓋輸入值'); else adjustment = band.adjustmentRatio;
        }
      }
      if (adjustment === 0) pfAdjustment = 0;
      else if (adjustment !== null && (contract.pfChargeBase === 'ENERGY' || basic !== null)) pfAdjustment = financialRound((energyCost + (contract.pfChargeBase === 'ENERGY_AND_BASIC' ? basic! : 0)) * adjustment);
    }
    const total = issues.length === before && allowed && basic !== null && excess !== null && pfAdjustment !== null ? sumMoney([energyCost, basic, excess, pfAdjustment]) : null;
    rows.push({ sourceId: id, month: slice.month, completeMonth: slice.complete, status: total === null ? 'INCOMPLETE' : slice.complete ? 'COMPLETE_MONTH' : 'PRORATED_OBSERVED_ESTIMATE', coveredDays: slice.coveredDays, calendarDays: slice.calendarDays, importKWh, energyCost, observedMaximum15minKW: peak, trueMonthlyMaximumKnown: slice.complete && peak !== null, basicCharge: basic, excessDemandCharge: excess, pfAdjustment, total });
  }
  return { rows, issues, total: issues.length || rows.some(r => r.total === null) ? null : sumMoney(rows.map(r => r.total!)), energyCost: sumMoney(run.sourceMeters.map(m => m.cost)), estimated: rows.some(r => r.status === 'PRORATED_OBSERVED_ESTIMATE') };
}

function inventoryTransferCost(flow: InventoryFlow) {
  for (const key of ['openingKWh', 'inflowKWh', 'inflowPurchaseCost', 'issuedKWh', 'closingKWh'] as const) finite(flow[key], key);
  const transferCost = flow.internalTransferCost === undefined ? 0 : flow.internalTransferCost;
  finite(transferCost, 'internalTransferCost');
  if (transferCost > flow.inflowPurchaseCost) throw Error(`Inventory internal transfer exceeds full inflow cost: ${flow.poolId}`);
  const residual = flow.openingKWh + flow.inflowKWh - flow.issuedKWh - flow.closingKWh;
  if (Math.abs(residual) > Math.max(1e-6, flow.openingKWh * 1e-9)) throw Error(`Inventory energy does not reconcile: ${flow.poolId}`);
  return transferCost;
}
/** Periodic weighted average, not moving-average and not a new energy purchase.
 * Full received transfer cost participates in the individual pool's valuation. */
export function weightedInventory(flow: InventoryFlow, openingValue: number | null, additionalConversionCost: number | null) {
  const internalTransferCost = inventoryTransferCost(flow);
  const residual = flow.openingKWh + flow.inflowKWh - flow.issuedKWh - flow.closingKWh;
  if (openingValue === null || additionalConversionCost === null) return null;
  finite(openingValue, 'openingValue'); finite(additionalConversionCost, 'additionalConversionCost');
  const totalKWh = flow.openingKWh + flow.inflowKWh;
  const availableCost = openingValue + flow.inflowPurchaseCost + additionalConversionCost;
  if (totalKWh === 0 && availableCost !== 0) throw Error('Nonzero inventory value on empty inventory');
  const unitCost = totalKWh ? availableCost / totalKWh : 0;
  const costOfIssues = flow.issuedKWh * unitCost, closingValue = flow.closingKWh * unitCost;
  return { ...flow, internalTransferCost, openingValue, additionalConversionCost, unitCost, costOfIssues, closingValue, valueResidual: availableCost - costOfIssues - closingValue, energyResidual: residual };
}
export function valueRunInventory(run: FinanceRun, config: ExtendedFinanceConfig, flows: InventoryFlow[]) {
  assertExtendedFinance(config);
  const issues: FinanceIssue[] = [], rows = [];
  if (new Set(flows.map(f => f.poolId)).size !== flows.length) throw Error('Duplicate inventory pool');
  const internalTransferCost = flows.reduce((s, f) => s + inventoryTransferCost(f), 0);
  for (const p of config.inventory.pools) if (!flows.some(f => f.poolId === p.poolId)) missing(issues, `inventory.${p.poolId}`, '已設定存貨池沒有本次測算流量明細');
  for (const flow of flows) {
    const settings = config.inventory.pools.find(p => p.poolId === flow.poolId);
    if (!settings) { missing(issues, `inventory.${flow.poolId}`, '缺少能源存貨成本設定'); continue; }
    const row = weightedInventory(flow, settings.openingValue, settings.additionalConversionCost);
    if (!row) missing(issues, `inventory.${flow.poolId}`, '需填期初能源存貨價值及其他入庫轉換成本（可填 0）'); else rows.push(row);
  }
  if (!flows.length && (run.totals.initialStoredKWh > 0 || run.totals.finalStoredKWh > 0)) missing(issues, 'inventory.flows', '缺少本次物理測算的入庫購電成本分攤明細');
  const inflowPurchaseCost = flows.reduce((s, f) => s + f.inflowPurchaseCost, 0);
  const externalInflowPurchaseCost = inflowPurchaseCost - internalTransferCost;
  if (externalInflowPurchaseCost > run.totals.gridCost + 0.01) throw Error('Inventory external purchase allocation exceeds actual external grid cost');
  const totalCostOfIssues = rows.reduce((s, r) => s + r.costOfIssues, 0);
  if (!issues.length && internalTransferCost > totalCostOfIssues + 1e-8) throw Error('Inventory internal transfer has no matching on-site issue cost');
  const consolidatedCostOfIssues = issues.length ? null : totalCostOfIssues - internalTransferCost;
  const expense = issues.length ? null : run.totals.gridCost - externalInflowPurchaseCost + consolidatedCostOfIssues!;
  return { rows, issues, energyExpense: expense, cashEnergyPurchases: run.totals.gridCost,
    fullInflowPurchaseCost: inflowPurchaseCost, internalTransferCost, externalInflowPurchaseCost, consolidatedCostOfIssues,
    inventoryValueChange: issues.length ? null : rows.reduce((s, r) => s + r.closingValue - r.openingValue, 0),
    reconciliationResidual: expense === null ? null : run.totals.gridCost + rows.reduce((s, r) => s + r.additionalConversionCost + r.openingValue - r.closingValue, 0) - expense };
}

export interface LifecycleRow {
  month: number; revenue: number; cashCollections: number; closingReceivables: number;
  energyPurchases: number; energyExpense: number; basicAndAdjustmentCharges: number; opex: number; lease: number;
  depreciation: number; disposalGain: number; levyAndOtherTax: number; taxableBeforeLossRelief: number;
  incomeTax: number; accountingProfit: number; capex: number; disposalProceeds: number;
  workingCapitalChange: number; closingOperatingReserve: number; netCashFlow: number; cumulativeCashFlow: number;
}
function assetBookValue(asset: AssetCost, beforeMonth: number) {
  const cost = asset.unitPurchaseCost! * asset.quantity!, residual = asset.residualUnitValue! * asset.quantity!;
  const first = Math.max(1, asset.purchaseMonth!);
  return Math.max(residual, cost - Math.max(0, Math.min(asset.depreciationMonths!, beforeMonth - first)) * (cost - residual) / asset.depreciationMonths!);
}
/** Complete, user-confirmed monthly operating rows are inputs, not an implicit
 * scale-up of a short simulation. All equipment replacement rows are independent
 * asset vintages; retire the old asset explicitly to stop its depreciation/lease.
 */
export function projectLifecycle(config: ExtendedFinanceConfig, suppliedOperations?: MonthlyOperation[]) {
  assertExtendedFinance(config);
  const issues: FinanceIssue[] = [];
  const rawOperations = suppliedOperations ?? config.investment.operatingMonths;
  for (const [i, o] of rawOperations.entries()) for (const [k, v] of Object.entries(o)) if (v === null) missing(issues, `investment.operatingMonths[${i}].${k}`);
  const operations = rawOperations as MonthlyOperation[];
  const horizon = requireValue(config.investment.horizonMonths, issues, 'investment.horizonMonths');
  const discount = requireValue(config.investment.annualDiscountRate, issues, 'investment.annualDiscountRate');
  if (!config.investment.projectionInputsConfirmed) missing(issues, 'investment.projectionInputsConfirmed', '需確認每月收入、用電與完整計費月成本假設');
  if (config.calendar.startDate === null) missing(issues, 'calendar.startDate');
  if (config.tax.model === null) missing(issues, 'tax.model');
  for (const k of ['incomeTaxRate', 'openingTaxLossCarryForward', 'revenueLevyRate', 'otherTaxPerMonth'] as const) requireValue(config.tax[k], issues, `tax.${k}`);
  for (const k of ['receivableDays', 'openingReceivables', 'openingEnergyInventoryFunding', 'openingOperatingReserve', 'targetOperatingReserve'] as const) requireValue(config.workingCapital[k], issues, `workingCapital.${k}`);
  if ((config.workingCapital.openingReceivables ?? 0) > 0) requireValue(config.workingCapital.openingReceivablesCollectMonth, issues, 'workingCapital.openingReceivablesCollectMonth');
  for (const asset of config.assets) {
    const p = `assets.${asset.id}`;
    if (asset.ownership === null) { missing(issues, `${p}.ownership`); continue; }
    if (asset.ownership === 'THIRD_PARTY') continue;
    for (const k of ['quantity', 'purchaseMonth', 'disposalMonth'] as const) requireValue(asset[k], issues, `${p}.${k}`);
    if (asset.ownership === 'OWNED') {
      for (const k of ['unitPurchaseCost', 'depreciationMonths', 'residualUnitValue'] as const) requireValue(asset[k], issues, `${p}.${k}`);
      if ((asset.disposalMonth ?? 0) > 0) requireValue(asset.disposalUnitProceeds, issues, `${p}.disposalUnitProceeds`);
    } else requireValue(asset.monthlyLeasePerUnit, issues, `${p}.monthlyLeasePerUnit`);
  }
  for (const o of config.opex) { requireValue(o.rate, issues, `opex.${o.id}.rate`); requireValue(o.escalationAnnual, issues, `opex.${o.id}.escalationAnnual`); }
  if (horizon !== null && (operations.length !== horizon || operations.some((o, i) => o.month !== i + 1))) missing(issues, 'operations', '每個月份需有一筆依序完整的營運輸入');
  for (const [i, o] of operations.entries()) {
    for (const [key, v] of Object.entries(o)) if (v !== null) finite(v, `operations[${i}].${key}`);
    if (Object.values(o).some(v => v === null)) continue;
    if (!Number.isInteger(o.calendarDays) || o.calendarDays < 28 || o.calendarDays > 31 || o.operatingDays > o.calendarDays) throw Error('Invalid monthly calendar/operating days');
  }
  if (issues.length) return { status: 'INCOMPLETE' as const, issues, rows: [] as LifecycleRow[], flows: null, npv: null, accountingProfit: null, endingTaxLossCarryForward: null };
  const months = horizon!, wc = config.workingCapital, tax = config.tax;
  const firstDate = new Date(`${config.calendar.startDate!}T00:00:00Z`);
  // Monthly projections begin with the calendar month containing startDate.
  // Operations must explicitly cover a full calendar month; partial observed
  // periods belong to billMeterMonths and cannot enter this table silently.
  const monthStartDays = [0];
  for (let m = 0; m < months; m++) {
    const actualDays = new Date(Date.UTC(firstDate.getUTCFullYear(), firstDate.getUTCMonth() + m + 1, 0)).getUTCDate();
    if (operations[m].calendarDays !== actualDays) throw Error(`Calendar days mismatch at month ${m + 1}`);
    monthStartDays.push(monthStartDays[m] + actualDays);
  }
  const initialCapex = config.assets.filter(a => a.ownership === 'OWNED' && a.purchaseMonth === 0).reduce((s, a) => s + a.unitPurchaseCost! * a.quantity!, 0);
  let cumulative = -initialCapex - wc.openingOperatingReserve! - wc.openingReceivables! - wc.openingEnergyInventoryFunding!, receivables = wc.openingReceivables!, reserve = wc.openingOperatingReserve!, taxCarry = tax.openingTaxLossCarryForward!;
  let annualTaxable = 0;
  const flows = [financialRound(cumulative)], rows: LifecycleRow[] = [];
  for (let i = 0; i < months; i++) {
    const o = operations[i], m = i + 1, from = monthStartDays[i], to = monthStartDays[i + 1];
    let capex = 0, depreciation = 0, disposalProceeds = 0, disposalGain = 0, lease = 0;
    for (const asset of config.assets) {
      if (asset.ownership === 'THIRD_PARTY') continue;
      const starts = Math.max(1, asset.purchaseMonth!), active = m >= starts && (asset.disposalMonth === 0 || m < asset.disposalMonth!);
      if (asset.ownership === 'OWNED') {
        if (asset.purchaseMonth === m) capex += asset.unitPurchaseCost! * asset.quantity!;
        if (asset.disposalMonth === m) {
          const proceeds = asset.disposalUnitProceeds! * asset.quantity!;
          disposalProceeds += proceeds; disposalGain += proceeds - assetBookValue(asset, m);
        }
        if (active && m - starts < asset.depreciationMonths!) depreciation += (asset.unitPurchaseCost! - asset.residualUnitValue!) * asset.quantity! / asset.depreciationMonths!;
      } else if (active) lease += asset.monthlyLeasePerUnit! * asset.quantity!;
    }
    const opex = config.opex.reduce((sum, cost) => {
      if (m < cost.startMonth || cost.endMonth !== 0 && m > cost.endMonth) return sum;
      const quantity = cost.basis === 'CALENDAR_MONTH' ? 1 : cost.basis === 'OPERATING_DAY' ? o.operatingDays : cost.basis === 'DELIVERED_KWH' ? o.deliveredKWh : o.revenue;
      return sum + cost.rate! * quantity * (1 + cost.escalationAnnual!) ** ((m - 1) / 12);
    }, 0);
    const levyAndOtherTax = o.revenue * tax.revenueLevyRate! + tax.otherTaxPerMonth!;
    const taxable = o.revenue - o.energyExpense - o.basicAndAdjustmentCharges - opex - lease - depreciation - levyAndOtherTax + disposalGain;
    let incomeTax = 0;
    if (tax.model === 'MONTHLY_NO_LOSS_RELIEF') incomeTax = Math.max(0, taxable) * tax.incomeTaxRate!;
    else {
      annualTaxable += taxable;
      const calendarMonth = (firstDate.getUTCMonth() + i) % 12;
      // End-of-horizon tax settlement is an explicit modeled closing settlement.
      if (calendarMonth === 11 || m === months) {
        if (annualTaxable < 0) taxCarry -= annualTaxable;
        else { const relieved = Math.min(taxCarry, annualTaxable); taxCarry -= relieved; incomeTax = (annualTaxable - relieved) * tax.incomeTaxRate!; }
        annualTaxable = 0;
      }
    }
    let collections = wc.openingReceivablesCollectMonth === m ? wc.openingReceivables! : 0;
    // Uniform daily recognition, exact fixed-day collection lag; old cohorts
    // may span more than one month. No false month/30 approximation.
    for (let j = 0; j <= i; j++) {
      const salesStart = monthStartDays[j] + wc.receivableDays!, salesEnd = monthStartDays[j + 1] + wc.receivableDays!;
      const overlap = Math.max(0, Math.min(to, salesEnd) - Math.max(from, salesStart));
      collections += operations[j].revenue * overlap / operations[j].calendarDays;
    }
    receivables += o.revenue - collections;
    const target = wc.releaseAtHorizon && m === months ? 0 : wc.targetOperatingReserve!;
    const workingCapitalChange = target - reserve; reserve = target;
    const netCash = collections - o.energyPurchases - o.basicAndAdjustmentCharges - opex - lease - levyAndOtherTax - incomeTax - capex + disposalProceeds - workingCapitalChange;
    cumulative += netCash;
    rows.push({ month: m, revenue: o.revenue, cashCollections: collections, closingReceivables: receivables,
      energyPurchases: o.energyPurchases, energyExpense: o.energyExpense, basicAndAdjustmentCharges: o.basicAndAdjustmentCharges, opex, lease, depreciation, disposalGain,
      levyAndOtherTax, taxableBeforeLossRelief: taxable, incomeTax, accountingProfit: taxable - incomeTax, capex, disposalProceeds, workingCapitalChange, closingOperatingReserve: reserve, netCashFlow: netCash, cumulativeCashFlow: cumulative });
    flows.push(netCash);
  }
  const monthlyRate = Math.expm1(Math.log1p(discount!) / 12);
  const npv = flows.reduce((s, f, i) => s + f / (1 + monthlyRate) ** i, 0);
  if (!Number.isFinite(npv)) throw Error('Projection numeric range exceeded');
  return { status: 'ASSUMPTION_BASED_PROJECTION' as const, issues, rows, flows, npv, accountingProfit: rows.reduce((s, r) => s + r.accountingProfit, 0), endingTaxLossCarryForward: taxCarry };
}

/** UI entry point. Observed period costs and long-term assumptions remain
 * separate; a short run never silently becomes monthly tax or investment data.
 */
export function evaluateExtendedFinance(run: FinanceRun, config: ExtendedFinanceConfig, inventoryFlows: InventoryFlow[] = []) {
  const billing = billMeterMonths(run, config);
  const inventory = valueRunInventory(run, config, inventoryFlows);
  const projection = projectLifecycle(config);
  const issues: FinanceIssue[] = [];
  const slices = config.calendar.startDate === null ? [] : calendarSlices(config.calendar.startDate, run.parameterSnapshot.horizonDays);
  if (!slices.length) missing(issues, 'calendar.startDate');
  let opex = 0, lease = 0, depreciation = 0;
  const costRows: { id: string; category: 'OPEX' | 'LEASE' | 'DEPRECIATION'; amount: number }[] = [];
  for (const cost of config.opex) {
    if (cost.rate === null || cost.escalationAnnual === null) { missing(issues, `opex.${cost.id}`); continue; }
    let amount = 0;
    for (const [i, slice] of slices.entries()) {
      const month = i + 1;
      if (month < cost.startMonth || cost.endMonth > 0 && month > cost.endMonth) continue;
      let quantity = cost.basis === 'CALENDAR_MONTH' ? slice.coveredDays / slice.calendarDays : slice.coveredDays;
      if (cost.basis === 'DELIVERED_KWH' || cost.basis === 'REVENUE_RATIO') {
        if (slices.length === 1) quantity = cost.basis === 'DELIVERED_KWH' ? run.totals.deliveredKWh : run.totals.revenue;
        else if (run.hours) quantity = run.hours.filter(h => (h.day * 24 + h.hour) * 60 >= slice.fromMinute && (h.day * 24 + h.hour) * 60 < slice.toMinute).reduce((s, h) => s + (cost.basis === 'DELIVERED_KWH' ? h.deliveredKWh : h.revenue), 0);
        else { missing(issues, `opex.${cost.id}`, '跨月變動成本需要本次結果逐時收入及交付量'); continue; }
      }
      amount += cost.rate * quantity * (1 + cost.escalationAnnual) ** (i / 12);
    }
    opex += amount; costRows.push({ id: cost.id, category: 'OPEX', amount });
  }
  for (const a of config.assets) {
    if (a.ownership === null) { missing(issues, `assets.${a.id}.ownership`); continue; }
    if (a.ownership === 'THIRD_PARTY') continue;
    if ([a.quantity, a.purchaseMonth, a.disposalMonth].some(v => v === null)) { missing(issues, `assets.${a.id}`, '需確認数量、開始使用月份及處置月份'); continue; }
    if (a.ownership === 'LEASED' && a.monthlyLeasePerUnit === null || a.ownership === 'OWNED' && [a.unitPurchaseCost, a.residualUnitValue, a.depreciationMonths].some(v => v === null)) { missing(issues, `assets.${a.id}`, '缺少租金或資產成本／折舊資料'); continue; }
    let amount = 0;
    for (const [i, slice] of slices.entries()) {
      const month = i + 1, starts = Math.max(1, a.purchaseMonth!);
      if (month < starts || a.disposalMonth! > 0 && month >= a.disposalMonth!) continue;
      if (a.ownership === 'LEASED') amount += a.monthlyLeasePerUnit! * a.quantity! * slice.coveredDays / slice.calendarDays;
      else if (month - starts < a.depreciationMonths!) amount += (a.unitPurchaseCost! - a.residualUnitValue!) * a.quantity! / a.depreciationMonths! * slice.coveredDays / slice.calendarDays;
    }
    if (a.ownership === 'LEASED') lease += amount; else depreciation += amount;
    costRows.push({ id: a.id, category: a.ownership === 'LEASED' ? 'LEASE' : 'DEPRECIATION', amount });
  }
  const nonGridConversionCash = config.inventory.pools.reduce((s, p) => s + (p.additionalConversionCost ?? 0), 0);
  const complete = billing.total !== null && inventory.energyExpense !== null && issues.length === 0;
  const additionalElectricity = billing.total === null ? null : billing.total - billing.energyCost;
  return { billing, inventory, projection, observed: {
    status: complete ? 'ASSUMPTION_BASED_PERIOD_COSTS' as const : 'INCOMPLETE_COST_INPUTS' as const,
    issues, costRows, opex: issues.length ? null : opex, lease: issues.length ? null : lease, depreciation: issues.length ? null : depreciation,
    energyContribution: run.totals.revenue - run.totals.gridCost,
    cashOperatingContributionBeforeTaxCapexAndCollections: complete ? run.totals.revenue - billing.total! - opex - lease - nonGridConversionCash : null,
    inventoryAdjustedOperatingResultBeforeTaxAndDisposals: complete ? run.totals.revenue - inventory.energyExpense! - additionalElectricity! - opex - lease - depreciation : null,
    accountingNetProfit: null,
    netProfitStatus: 'USE_CONFIRMED_MONTHLY_PROJECTION_FOR_TAX_DISPOSALS_AND_RECEIVABLES' as const,
  } };
}
