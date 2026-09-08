import test from 'node:test';
import assert from 'node:assert/strict';
import { cashflow, investmentCase, irr, npv, payback } from '../packages/economics-engine/index.ts';
import { invoiceCents, apportionCents, sumMoney } from '../packages/money/index.ts';
import { defaultProject } from '../packages/reference/index.ts';
import { simulate } from '../packages/station-engine/index.ts';
import type { Project, RunResult } from '../packages/contracts/index.ts';

const near = (actual: number, expected: number, tolerance = 1e-8) =>
    assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
function financialProject(days = 1): Project {
    const p = defaultProject();
    p.mode = 'CONSTRAINED';
    p.horizonDays = days;
    const base = p.services;
    p.services = Array.from({ length: days }, (_, day) => base.map(row => ({ ...row, day }))).flat();
    p.finance = { capex: 1000, fixedDaily: 10, variablePerKWh: .02, discountRate: .1, years: 1, rampMonths: 0, startLoad: 1, operatingDaysPerYear: 360 };
    return p;
}
// Isolated finance fixture: operating-engine energy validation is tested separately.
function financialResult(p: Project, overrides: Partial<RunResult['totals']> = {}): RunResult {
    const d = p.horizonDays;
    return {
        mode: 'CONSTRAINED', parameterSnapshot: structuredClone(p), engineVersion: 'financial-unit-fixture',
        hours: [], transactions: [], diagnostics: [], componentEnergy: [], edgeEnergy: [], sourceMeters: [],
        totals: { deliveredKWh: 1000 * d, requestedKWh: 1000 * d, gridKWh: 1000 * d, lossKWh: 0,
            revenue: 800 * d, gridCost: 500 * d, auxiliaryGridCost: 50 * d, completed: d, unservedKWh: 0,
            initialStoredKWh: 200, finalStoredKWh: 200, maxBalanceResidual: 0, ...overrides },
    };
}

test('finance: independent reference NPV, IRR and simple payback', () => {
    near(npv([-1000, 600, 600], .1), 41.32231404958685);
    near(irr([-1000, 600, 600]).rate!, .130662386291807, 1e-12);
    near(payback([-1000, 600, 600])!, 5 / 3);
    assert.equal(payback([-100, 10]), null);
    assert.equal(irr([1, 2]).status, 'no-root');
    assert.equal(irr([-1, -2]).status, 'no-root');
});

test('finance: long negative startup gives a negative IRR instead of a false 409500 percent return', () => {
    const p = financialProject();
    Object.assign(p.finance, { fixedDaily: 119, variablePerKWh: 0, years: 10, rampMonths: 120, startLoad: 0 });
    const r = cashflow(p, 120, 0, 0)!;
    // The last two monthly flows are 0 and 30; earlier monthly flows increase
    // by 30 from -3540. A separate polynomial evaluation gives base=1+r=.5.
    near(irr(r.flows).rate!, -.5, 1e-12);
    near(r.irr!, -.999755859375, 1e-12);
    assert.equal(r.irrStatus, 'ok');
    near(npv(r.flows, 1), -4510, 1e-8);
    const independentScaledResidual = Math.abs(r.flows.reduce((sum, value) => sum * .5 + value, 0));
    assert.ok(independentScaledResidual < 1e-8);
});

test('finance: trailing and leading zero periods do not change a 20 percent IRR', () => {
    const cases = [
        [-1000, 1200, ...Array(360).fill(0)],
        [...Array(360).fill(0), -1000, 1200],
        [...Array(180).fill(0), -1000, 1200, ...Array(360).fill(0)],
    ];
    for (const flows of cases) {
        const root = irr(flows);
        assert.equal(root.status, 'ok');
        near(root.rate!, .2, 1e-12);
        const ratio = Math.abs(-1000 + 1200 / (1 + root.rate!)) / (1000 + 1200 / (1 + root.rate!));
        assert.ok(Number.isFinite(ratio) && ratio <= 1e-10);
    }
    near(npv([-1000, 1200, ...Array(360).fill(0)], -.999), 1199000, 1e-6);
    assert.equal(irr(Array(360).fill(0)).status, 'no-root');
});

test('finance: ambiguous roots, representability and invalid values have explicit unavailable states', () => {
    assert.deepEqual(irr([-100, 230, -132]), { status: 'multiple-sign-changes', rate: null });
    near(irr([-10000, 1]).rate!, -.9999, 1e-12);
    assert.deepEqual(irr([-1e15, .01]), { status: 'no-root', rate: null });
    assert.throws(() => irr([NaN, 1]), /Invalid cash flows/);
    assert.throws(() => npv([-1000, ...Array(120).fill(1)], -.999), /finite numeric range/);
});

test('finance: 1, 3 and 5 day identical operation normalizes to the same investment projection', () => {
    const p1 = financialProject(), base = investmentCase(p1, financialResult(p1))!;
    for (const days of [3, 5]) {
        const p = financialProject(days), q = investmentCase(p, financialResult(p))!;
        near(q.projection!.npv, base.projection!.npv);
        near(q.projection!.rows[0].net, base.projection!.rows[0].net);
        near(q.dailyRevenue, 800);
        near(q.dailyEnergyCost, 500);
        near(q.dailyFixedEnergyCost, 50);
        near(q.modeledOperatingContribution!, 270 * days);
        near(q.energyContribution, 300 * days);
    }
});

test('finance: fixed auxiliary energy runs every operating day regardless of traffic ramp', () => {
    const p = financialProject();
    Object.assign(p.finance, { fixedDaily: 0, variablePerKWh: 0, rampMonths: 12, startLoad: 0 });
    // 10 kW * 24 h * .5 CNY/kWh = 120 CNY/day = 3600 CNY/30-day month.
    const r = cashflow(p, 0, 120, 0, 120)!;
    near(r.rows[0].fixedEnergy, 3600);
    near(r.rows[0].variable, 0);
    near(r.rows[0].net, -3600);
    near(r.rows[11].net, -3600);
});

test('finance: monthly cash bridge separates traffic energy, fixed energy and other costs', () => {
    const p = financialProject();
    Object.assign(p.finance, { rampMonths: 2, startLoad: 0 });
    const month = cashflow(p, 800, 500, 1000, 50)!.rows[0];
    near(month.receipts, 12000);
    near(month.variableEnergy, 6750);
    near(month.otherVariable, 300);
    near(month.fixedEnergy, 1500);
    near(month.fixedOpex, 300);
    near(month.net, 3150);
});

test('finance: a changed draft cannot mix financial or operational inputs with an earlier result', () => {
    const p = financialProject(), r = financialResult(p), financialDraft = structuredClone(p), operationalDraft = structuredClone(p);
    financialDraft.finance.fixedDaily = 100;
    operationalDraft.station.A.gunKW = 1;
    assert.equal(investmentCase(financialDraft, r), null);
    assert.equal(investmentCase(operationalDraft, r), null);
    near(investmentCase(r.parameterSnapshot, r)!.modeledOperatingContribution!, 270);
});

test('finance: inventory depletion blocks investment extrapolation without inventing a replacement cost', () => {
    const p = financialProject(), q = investmentCase(p, financialResult(p, { finalStoredKWh: 100 }))!;
    assert.equal(q.status, 'ENDING_INVENTORY_INCOMPLETE');
    assert.equal(q.projection, null);
    assert.equal(q.replenishmentCost, null);
    assert.equal(q.adjustedDailyEnergyCost, null);
    assert.equal(q.accountingProfit, null);
    assert.equal(q.inventoryCostBasisStatus, 'NOT_MODELED');
    near(q.replenishmentKWh, 100);
    near(q.energyContribution, 300);
    near(q.modeledOperatingContribution!, 270);
});

test('finance: missing costs, source replay and zero-grid losses cannot masquerade as profit', () => {
    const p = financialProject();
    p.finance.fixedDaily = null;
    const missingFixed = investmentCase(p, financialResult(p))!;
    assert.equal(missingFixed.status, 'INCOMPLETE_COST_INPUTS');
    assert.equal(missingFixed.modeledOperatingContribution, null);
    assert.equal(missingFixed.projection, null);
    const noCapex = financialProject(); noCapex.finance.capex = null;
    assert.equal(investmentCase(noCapex, financialResult(noCapex))!.projection, null);
    const replayResult = financialResult(noCapex); replayResult.mode = 'SOURCE_REPLAY';
    assert.equal(investmentCase(noCapex, replayResult), null);
    const costs = financialProject();
    const noGrid = investmentCase(costs, financialResult(costs, { revenue: 0, gridKWh: 0, gridCost: 0, auxiliaryGridCost: 0, deliveredKWh: 0 }))!;
    near(noGrid.modeledOperatingContribution!, -10);
    near(noGrid.projection!.rows[0].net, -300);
    assert.equal(noGrid.accountingProfit, null);
    assert.equal(noGrid.status, 'ASSUMPTION_BASED_PROJECTION');
});

test('money: ten distinct 1.005 CNY invoices settle to 10.10 CNY, not a combined 10.05 CNY', () => {
    assert.equal(invoiceCents(1, 1.005), 101);
    assert.equal(Array.from({ length: 10 }, () => invoiceCents(1, 1.005)).reduce((a, b) => a + b, 0), 1010);
    assert.equal(invoiceCents(10, 1.005), 1005);
    assert.deepEqual(apportionCents(101, [1, 1, 1]), [34, 34, 33]);
    const p = financialProject();
    p.efficiency = { mode: 'ASSEMBLY', sst: 1, transformer: 1, pcs: 1, charger: 1, sstSource: 1, pcsSource: 1 };
    for (const s of ['A', 'B'] as const) Object.assign(p.station[s], { auxiliaryKW: 0, guns: 1, gunKW: 10, chargePoolKW: 10 });
    p.services = p.services.map(row => ({ ...row, swapCount: 0, swapKWh: 0, chargeCount: row.station === 'A' && row.hour === 0 ? 10 : 0, chargeKWh: row.station === 'A' && row.hour === 0 ? 10 : 0, gridPrice: .7, swapFee: .305, chargeFee: .305 }));
    const r = simulate(p);
    assert.equal(r.totals.completed, 10);
    assert.equal(r.transactions.length, 10);
    assert.ok(r.transactions.every(job => job.revenue === 1.01));
    assert.equal(Math.round(r.totals.revenue * 100), 1010);
    assert.equal(r.transactions.reduce((sum, job) => sum + Math.round(job.revenue! * 100), 0), 1010);
});

test('money: individual and aggregate ledgers reject amounts outside the declared 1e12-cent range', () => {
    const capCents = 1_000_000_000_000, capCny = 10_000_000_000;
    assert.equal(invoiceCents(1, capCny), capCents);
    assert.equal(sumMoney([capCny]), capCny);
    assert.equal(sumMoney([-capCny]), -capCny);
    assert.equal(sumMoney([.1, .2]), .3);
    assert.throws(() => invoiceCents(1, capCny + .01), /MONEY_RANGE_EXCEEDED/);
    assert.throws(() => sumMoney([capCny / 2, capCny / 2, .01]), /MONEY_RANGE_EXCEEDED/);
    assert.throws(() => sumMoney([-capCny / 2, -capCny / 2, -.01]), /MONEY_RANGE_EXCEEDED/);
    assert.throws(() => invoiceCents(-1, 1), /NEGATIVE_INVOICE/);
    assert.throws(() => invoiceCents(1, Infinity), /NON_FINITE_AMOUNT/);
    for (const cents of [0, 1, 99, 101, capCents - 1, capCents]) {
        assert.equal(Math.round((cents / 100) * 100), cents);
        assert.equal(Math.round(sumMoney([cents / 100]) * 100), cents);
    }
});

// Overflow must be rejected before an invalid IRR or chart can be produced.
test('finance: extreme finite monthly inputs return an unavailable projection',()=>{const p=defaultProject();p.finance={...p.finance,capex:0,fixedDaily:1e308};assert.equal(cashflow(p,0,0,0),null);});
