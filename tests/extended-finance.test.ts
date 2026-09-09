import test from 'node:test';
import assert from 'node:assert/strict';
import { billMeterMonths, calendarSlices, defaultExtendedFinance, evaluateExtendedFinance, financialRound, maximumQuarterHourKW, projectLifecycle, validateExtendedFinance, valueRunInventory, weightedInventory } from '../packages/extended-finance/index.ts';
import type { ExtendedFinanceConfig, FinanceRun, MonthlyOperation } from '../packages/extended-finance/contracts.ts';

const near = (actual: number, expected: number, epsilon = 1e-8) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
const profiles = () => {
  const node = (id: string, powers: number[]) => ({ nodeId: id, samples: Array.from({ length: 5 }, (_, day) => [
    [day * 1440, powers[0], powers[0], 0, 0, 0, 0], [day * 1440 + 15, powers[1], powers[1], 0, 0, 0, 0],
    [day * 1440 + 30, powers[2], powers[2], 0, 0, 0, 0], [day * 1440 + 45, powers[3], powers[3], 0, 0, 0, 0],
  ]).flat() });
  const run: FinanceRun = {
    mode: 'CONSTRAINED', parameterSnapshot: { horizonDays: 5, topology: { nodes: [{ id: 'A-grid', type: 'grid', station: 'A' }, { id: 'B-grid', type: 'grid', station: 'B' }] } },
    sourceMeters: Array.from({ length: 5 }, (_, day) => [{ day, hour: 0, sourceId: 'A-grid', importKWh: 75, cost: 37.50 }, { day, hour: 0, sourceId: 'B-grid', importKWh: 30, cost: 24 }]).flat(),
    powerTrace: { endMinute: 7200, nodes: [node('A-grid', [0, 100, 200, 0]), node('B-grid', [0, 80, 40, 0])] },
    totals: { revenue: 525, gridCost: 307.50, deliveredKWh: 525, initialStoredKWh: 0, finalStoredKWh: 0 },
  };
  const config = defaultExtendedFinance(run.parameterSnapshot.topology.nodes);
  config.calendar = { startDate: '2026-01-30', utcOffsetMinutes: 480, partialMonthPolicy: 'PRORATE_OBSERVED' };
  config.meters.forEach(m => { m.excessDemandRatePerKWMonth = 0; m.pfMethod = 'NONE'; });
  Object.assign(config.meters[0], { basicMode: 'CAPACITY_KVA', capacityKVA: 1000, basicRatePerMonth: 2 });
  Object.assign(config.meters[1], { basicMode: 'MAX_15MIN_KW', basicRatePerMonth: 3 });
  return { run, config };
};
function completeConfig(months = 3): ExtendedFinanceConfig {
  const c = defaultExtendedFinance();
  c.calendar = { startDate: '2026-01-01', utcOffsetMinutes: 480, partialMonthPolicy: 'REQUIRE_FULL_MONTH' };
  c.opex.forEach(o => { o.rate = 0; o.escalationAnnual = 0; });
  c.tax = { model: 'MONTHLY_NO_LOSS_RELIEF', incomeTaxRate: .25, openingTaxLossCarryForward: 0, revenueLevyRate: 0, otherTaxPerMonth: 0 };
  c.workingCapital = { receivableDays: 0, openingReceivables: 0, openingReceivablesCollectMonth: null, openingEnergyInventoryFunding: 0, openingOperatingReserve: 0, targetOperatingReserve: 0, releaseAtHorizon: false };
  c.investment = { horizonMonths: months, annualDiscountRate: 0, projectionInputsConfirmed: true, operatingMonths: [] };
  return c;
}
const operations = (months = 3): MonthlyOperation[] => Array.from({ length: months }, (_, i) => ({ month: i + 1, calendarDays: [31, 28, 31][i % 3], operatingDays: [31, 28, 31][i % 3], revenue: 100, energyPurchases: 20, energyExpense: 20, basicAndAdjustmentCharges: 0, deliveredKWh: 100 }));

test('nullable defaults are valid, unknown remains unknown, zero is distinct, strict unknown/date/range rejection', () => {
  const c = defaultExtendedFinance(); assert.deepEqual(validateExtendedFinance(c), []);
  assert.equal(projectLifecycle(c, []).status, 'INCOMPLETE');
  assert.deepEqual(validateExtendedFinance(JSON.parse(JSON.stringify(c))), []);
  assert.ok(validateExtendedFinance({ ...c, surprise: 1 }).length > 0);
  for (const date of ['2026-02-30', '2026-99-99', 'bad']) { const b = structuredClone(c); b.calendar.startDate = date; assert.ok(validateExtendedFinance(b).length > 0); }
  const b = structuredClone(c); b.tax.incomeTaxRate = NaN; assert.ok(validateExtendedFinance(b).length > 0);
  const z = completeConfig(); z.tax.incomeTaxRate = 0; assert.equal(projectLifecycle(z, operations()).status, 'ASSUMPTION_BASED_PROJECTION');
});
test('calendar split handles real month lengths and leap day, no 30-day default', () => {
  const s = calendarSlices('2026-01-30', 5); assert.deepEqual(s.map(x => [x.month, x.coveredDays, x.calendarDays]), [['2026-01', 2, 31], ['2026-02', 3, 28]]);
  assert.equal(calendarSlices('2024-02-01', 29)[0].complete, true);
  assert.equal(calendarSlices('2026-02-01', 28)[0].complete, true);
  assert.throws(() => calendarSlices('2026-02-29', 1));
});
test('15min integration distinguishes instantaneous 1200kW and actual block average 80kW', () => {
  near(maximumQuarterHourKW([[0, 1200], [1, 0]], 0, 60, 60), 80);
  near(maximumQuarterHourKW([[0, 0], [14, 600], [16, 0]], 0, 60, 60), 40);
});
test('5-day actual source billing, partial calendar proration, HALF_UP per source/month', () => {
  const { run, config } = profiles(), result = billMeterMonths(run, config);
  assert.deepEqual(result.issues, []); assert.equal(result.estimated, true);
  assert.equal(result.energyCost, 307.50); assert.equal(result.total, 692.01);
  assert.deepEqual(result.rows.map(r => r.basicCharge), [129.03, 214.29, 15.48, 25.71]);
  assert.deepEqual(result.rows.map(r => r.observedMaximum15minKW), [200, 200, 80, 80]);
  assert.ok(result.rows.every(r => !r.trueMonthlyMaximumKnown));
  config.calendar.partialMonthPolicy = 'REQUIRE_FULL_MONTH';
  assert.equal(billMeterMonths(run, config).total, null);
});
test('PF manual correction and overcontract are separate editable line items', () => {
  const { run, config } = profiles();
  Object.assign(config.meters[0], { excessDemandRatePerKWMonth: 4, contractedDemandKW: 150, pfMethod: 'MANUAL_ADJUSTMENT', manualPfAdjustmentRatio: .1 });
  const result = billMeterMonths(run, config); assert.deepEqual(result.issues, []);
  // January A: energy75, basic129.03, extra(200-150)*4*2/31=12.90;
  // PF base explicitly excludes overcontract: (75+129.03)*.1=20.40.
  assert.equal(result.rows[0].excessDemandCharge, 12.90); assert.equal(result.rows[0].pfAdjustment, 20.40); assert.equal(result.rows[0].total, 237.33);
  config.meters[0].pfMethod = 'PF_BANDS'; config.meters[0].pfBands = [{ minimumPF: 0, adjustmentRatio: .1 }, { minimumPF: .9, adjustmentRatio: -.02 }];
  config.meters[0].monthlyPF = [{ month: '2026-01', powerFactor: .95 }, { month: '2026-02', powerFactor: .8 }];
  const byPF = billMeterMonths(run, config); assert.equal(byPF.rows[0].pfAdjustment, -4.08); assert.equal(byPF.rows[1].pfAdjustment, 32.68);
});
test('meter trace inconsistency and omitted tariff cost block invoice', () => {
  const { run, config } = profiles(); config.meters[0].basicRatePerMonth = null;
  assert.equal(billMeterMonths(run, config).total, null);
  const c = profiles(); c.run.powerTrace!.nodes[0].samples[1][1] = 101;
  assert.ok(billMeterMonths(c.run, c.config).issues.some(i => i.code === 'METER_TRACE_MISMATCH'));
});
test('period weighted inventory and cash/accrual bridge, losses included only once', () => {
  const flow = { poolId: 'A-truck', openingKWh: 100, inflowKWh: 100, inflowPurchaseCost: 60, issuedKWh: 150, closingKWh: 50 };
  const result = weightedInventory(flow, 40, 0)!;
  near(result.unitCost, .5); near(result.costOfIssues, 75); near(result.closingValue, 25); near(result.valueResidual, 0);
  assert.equal(weightedInventory(flow, null, 0), null);
  assert.throws(() => weightedInventory({ ...flow, closingKWh: 49 }, 40, 0));
  const { run, config } = profiles(); run.totals.gridCost = 60; run.totals.initialStoredKWh = 100; run.totals.finalStoredKWh = 50;
  config.inventory.pools = [{ poolId: 'A-truck', openingValue: 40, additionalConversionCost: 0 }];
  const valued = valueRunInventory(run, config, [flow]);
  near(valued.energyExpense!, 75); near(valued.inventoryValueChange!, -15); near(valued.reconciliationResidual!, 0);
  near(100 - valued.cashEnergyPurchases, 40); near(100 - valued.energyExpense!, 25);
});
test('phase CAPEX, old asset disposal, replacement depreciation and taxes reconcile independently', () => {
  const c = completeConfig();
  c.assets = [
    { id: 'old', equipmentId: 'A-SST', name: 'old', ownership: 'OWNED', quantity: 1, unitPurchaseCost: 120, purchaseMonth: 0, depreciationMonths: 12, residualUnitValue: 0, disposalMonth: 3, disposalUnitProceeds: 80, monthlyLeasePerUnit: null },
    { id: 'new', equipmentId: 'A-SST', name: 'replacement', ownership: 'OWNED', quantity: 1, unitPurchaseCost: 240, purchaseMonth: 3, depreciationMonths: 24, residualUnitValue: 0, disposalMonth: 0, disposalUnitProceeds: null, monthlyLeasePerUnit: null },
  ];
  const result = projectLifecycle(c, operations()); assert.deepEqual(result.issues, []);
  assert.deepEqual(result.rows.map(r => r.depreciation), [10, 10, 10]);
  assert.deepEqual(result.rows.map(r => r.disposalGain), [0, 0, -20]);
  assert.deepEqual(result.rows.map(r => r.incomeTax), [17.5, 17.5, 12.5]);
  assert.deepEqual(result.rows.map(r => r.accountingProfit), [52.5, 52.5, 37.5]);
  assert.deepEqual(result.flows, [-120, 62.5, 62.5, -92.5]);
  near(result.npv!, -87.5);
});
test('leased and third-party batteries never add station purchase CAPEX/depreciation', () => {
  const c = completeConfig(); c.tax.incomeTaxRate = 0;
  c.assets = [
    { id: 'leased-battery', equipmentId: null, name: 'lease', ownership: 'LEASED', quantity: 2, unitPurchaseCost: null, purchaseMonth: 1, depreciationMonths: null, residualUnitValue: null, disposalMonth: 0, disposalUnitProceeds: null, monthlyLeasePerUnit: 3 },
    { id: 'bank-battery', equipmentId: null, name: 'bank', ownership: 'THIRD_PARTY', quantity: null, unitPurchaseCost: null, purchaseMonth: null, depreciationMonths: null, residualUnitValue: null, disposalMonth: null, disposalUnitProceeds: null, monthlyLeasePerUnit: null },
  ];
  const result = projectLifecycle(c, operations()); assert.equal(result.flows![0], 0); assert.deepEqual(result.rows.map(r => r.lease), [6, 6, 6]); assert.deepEqual(result.rows.map(r => r.netCashFlow), [74, 74, 74]);
});
test('31/28-day receivable lag and working capital funding never invent horizon collections', () => {
  const c = completeConfig(); c.tax.incomeTaxRate = 0;
  Object.assign(c.workingCapital, { receivableDays: 15, openingReceivables: 30, openingReceivablesCollectMonth: 1, openingEnergyInventoryFunding: 40, openingOperatingReserve: 10, targetOperatingReserve: 20, releaseAtHorizon: true });
  const result = projectLifecycle(c, operations()); assert.equal(result.flows![0], -80);
  near(result.rows[0].cashCollections, 30 + 100 * 16 / 31);
  near(result.rows[1].cashCollections, 100 * 15 / 31 + 100 * 13 / 28);
  near(result.rows[2].cashCollections, 100 * 15 / 28 + 100 * 16 / 31);
  near(result.rows[2].closingReceivables, 100 * 15 / 31);
  assert.deepEqual(result.rows.map(r => r.workingCapitalChange), [10, 0, -20]);
  near(result.rows.reduce((s, r) => s + r.cashCollections, 0) + result.rows[2].closingReceivables, 330);
});
test('explicit annual loss carry versus monthly no-relief produces distinct tax schedules', () => {
  const c = completeConfig(); c.tax.model = 'ANNUAL_LOSS_CARRY_FORWARD'; c.tax.openingTaxLossCarryForward = 10;
  const ops = operations(); ops[0].revenue = 0; // taxable -20,+80,+80 total140 less10carry=130
  const annual = projectLifecycle(c, ops); assert.deepEqual(annual.rows.map(r => r.incomeTax), [0, 0, 32.5]); near(annual.endingTaxLossCarryForward!, 0);
  c.tax.model = 'MONTHLY_NO_LOSS_RELIEF'; const monthly = projectLifecycle(c, ops); assert.deepEqual(monthly.rows.map(r => r.incomeTax), [0, 20, 20]);
});
test('half-up handles decimal ties and signed adjustments', () => {
  assert.equal(financialRound(1.005), 1.01); assert.equal(financialRound(-1.005), -1.01); assert.equal(financialRound(1e-7), 0);
});
test('monthly operating assumptions survive JSON and null blocks projection without becoming zero', () => {
  const c = completeConfig(); c.investment.operatingMonths = operations();
  assert.deepEqual(projectLifecycle(JSON.parse(JSON.stringify(c))), projectLifecycle(c, operations()));
  c.investment.operatingMonths[1].energyExpense = null;
  const result = projectLifecycle(c); assert.equal(result.status, 'INCOMPLETE'); assert.equal(result.accountingProfit, null);
  assert.ok(result.issues.some(i => i.path === 'investment.operatingMonths[1].energyExpense'));
});
test('UI entry separates observed period contribution, unknown asset cost and monthly projection', () => {
  const { run, config } = profiles();
  config.assets.forEach(a => a.ownership = 'THIRD_PARTY');
  config.opex.forEach(o => { o.rate = 0; o.escalationAnnual = 0; });
  // Monthly rent310: January2/31*310=20, February3/28*310=33.2142857.
  config.opex[0].rate = 310;
  const result = evaluateExtendedFinance(run, config);
  near(result.observed.opex!, 20 + 310 * 3 / 28);
  near(result.observed.cashOperatingContributionBeforeTaxCapexAndCollections!, 525 - 692.01 - 20 - 310 * 3 / 28);
  assert.equal(result.observed.accountingNetProfit, null);
  assert.equal(result.projection.status, 'INCOMPLETE');
  config.assets[0].ownership = 'OWNED';
  const missing = evaluateExtendedFinance(run, config); assert.equal(missing.observed.status, 'INCOMPLETE_COST_INPUTS'); assert.equal(missing.observed.cashOperatingContributionBeforeTaxCapexAndCollections, null);
});
test('three-day ESS to truck inventory eliminates internal transfers in consolidated cost', () => {
  const { run, config } = profiles();
  run.parameterSnapshot.horizonDays = 3;
  Object.assign(run.totals, { gridCost: 150, revenue: 300, deliveredKWh: 300, initialStoredKWh: 200, finalStoredKWh: 200 });
  config.inventory.pools = [
    { poolId: 'A-ess', openingValue: 100, additionalConversionCost: 0 },
    { poolId: 'A-truck', openingValue: 62.5, additionalConversionCost: 0 },
  ];
  // Each of 3 days: grid -> ESS 100kWh at .5, ESS -> truck 100kWh,
  // truck -> customers 100kWh. Period weighted ESS cost is (100+150)/400=.625.
  const flows = [
    { poolId: 'A-ess', openingKWh: 100, inflowKWh: 300, inflowPurchaseCost: 150, issuedKWh: 300, closingKWh: 100 },
    { poolId: 'A-truck', openingKWh: 100, inflowKWh: 300, inflowPurchaseCost: 187.5, internalTransferCost: 187.5, issuedKWh: 300, closingKWh: 100 },
  ];
  const valued = valueRunInventory(run, config, flows);
  assert.deepEqual(valued.issues, []);
  assert.equal(valued.fullInflowPurchaseCost, 337.5);
  assert.equal(valued.internalTransferCost, 187.5);
  assert.equal(valued.externalInflowPurchaseCost, 150);
  assert.equal(valued.consolidatedCostOfIssues, 187.5);
  assert.equal(valued.energyExpense, 187.5);
  assert.deepEqual(valued.rows.map(r => r.unitCost), [.625, .625]);
  assert.deepEqual(valued.rows.map(r => r.costOfIssues), [187.5, 187.5]);
  assert.deepEqual(valued.rows.map(r => r.closingValue), [62.5, 62.5]);
  // Whole site: opening162.5 + external grid150 - closing125 = expense187.5.
  assert.equal(valued.inventoryValueChange, -37.5);
  assert.equal(valued.reconciliationResidual, 0);
  assert.equal(run.totals.revenue - valued.energyExpense!, 112.5);
  assert.equal(run.totals.revenue - valued.cashEnergyPurchases, 150);
});
test('internal transfer input rejects negative, nonfinite, over-full-cost and unmatched issue amounts', () => {
  const flow = { poolId: 'A-truck', openingKWh: 0, inflowKWh: 100, inflowPurchaseCost: 50, issuedKWh: 100, closingKWh: 0 };
  for (const cost of [-1, NaN, Infinity, 50.01]) assert.throws(() => weightedInventory({ ...flow, internalTransferCost: cost }, 0, 0));
  const { run, config } = profiles(); run.totals.gridCost = 0;
  config.inventory.pools = [{ poolId: 'A-truck', openingValue: 0, additionalConversionCost: 0 }];
  assert.throws(() => valueRunInventory(run, config, [{ ...flow, issuedKWh: 0, closingKWh: 100, internalTransferCost: 50 }]), /no matching on-site issue cost/);
});
