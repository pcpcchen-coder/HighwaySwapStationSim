import type { Project, ServiceRow, RunResult } from '../contracts/index.ts';

// Customer settlement is applied by the station ledger after delivered invoice
// quantity and the arrival-locked rate are known. This helper is pre-settlement.
export function bill(row: ServiceRow, kind: 'swap' | 'charge', kWh: number, policy: Project['billing']) {
    const price = policy === 'SOURCE_DISPLAY_PRICE'
        ? (kind === 'swap' ? row.swapTotalRaw : row.chargeTotalRaw)
        : row.gridPrice + (kind === 'swap' ? row.swapFee : row.chargeFee);
    return kWh * price;
}
const finiteNonnegative = (value: number) => Number.isFinite(value) && value >= 0;
const sameProject = (a: Project, b: Project) => JSON.stringify(a) === JSON.stringify(b);

/** A completed, immutable run supplies both operating totals and financial inputs.
 * A depleted inventory is not a sustainable representative period; no invented
 * refill tariff or inventory cost basis is used to turn it into a projection.
 */
export function investmentCase(p: Project, result: RunResult) {
    if (result.mode !== 'CONSTRAINED' || !sameProject(p, result.parameterSnapshot)) return null;
    const snapshot = result.parameterSnapshot;
    const horizonDays = (snapshot as Project & { horizonDays?: number }).horizonDays ?? 1;
    if (!Number.isInteger(horizonDays) || horizonDays < 1) return null;
    const t = result.totals;
    const totalAuxiliaryGridCost = (t as typeof t & { auxiliaryGridCost?: number }).auxiliaryGridCost
        ?? result.hours.reduce((sum, hour) => sum + ((hour as typeof hour & { auxiliaryGridCost?: number }).auxiliaryGridCost ?? 0), 0);
    // Old results with auxiliary consumption and no cost attribution cannot
    // support an exact fixed-energy/traffic-energy ramp split.
    const auxiliaryCostsAvailable = 'auxiliaryGridCost' in t || result.hours.every(hour => 'auxiliaryGridCost' in hour)
        || result.hours.every(hour => hour.auxiliaryKWh === 0);
    const replenishmentKWh = Math.max(0, t.initialStoredKWh - t.finalStoredKWh);
    const inventoryComplete = replenishmentKWh <= .01;
    const costInputsComplete = snapshot.finance.capex !== null && snapshot.finance.fixedDaily !== null;
    const modeledOperatingContribution = snapshot.finance.fixedDaily === null ? null
        : t.revenue - t.gridCost - snapshot.finance.variablePerKWh * t.deliveredKWh - snapshot.finance.fixedDaily * horizonDays;
    const projection = inventoryComplete && auxiliaryCostsAvailable
        ? cashflow(snapshot, t.revenue / horizonDays, t.gridCost / horizonDays, t.deliveredKWh / horizonDays, totalAuxiliaryGridCost / horizonDays)
        : null;
    return {
        horizonDays,
        status: !inventoryComplete ? 'ENDING_INVENTORY_INCOMPLETE' as const
            : !auxiliaryCostsAvailable ? 'AUXILIARY_COST_ATTRIBUTION_MISSING' as const
            : !costInputsComplete ? 'INCOMPLETE_COST_INPUTS' as const
            : 'ASSUMPTION_BASED_PROJECTION' as const,
        averagePrice: t.gridKWh > 0 ? t.gridCost / t.gridKWh : null,
        replenishmentKWh,
        replenishmentCost: inventoryComplete ? 0 : null,
        adjustedDailyEnergyCost: inventoryComplete ? t.gridCost / horizonDays : null,
        dailyRevenue: t.revenue / horizonDays,
        dailyEnergyCost: t.gridCost / horizonDays,
        dailyFixedEnergyCost: totalAuxiliaryGridCost / horizonDays,
        energyContribution: t.revenue - t.gridCost,
        modeledOperatingContribution,
        contributionBasis: 'OBSERVED_HORIZON_CASH_BEFORE_INVENTORY_VALUATION_TAX_DEPRECIATION_REPLACEMENTS' as const,
        inventoryCostBasisStatus: 'NOT_MODELED' as const,
        accountingProfit: null,
        projection,
    };
}

export function breakEven(fixed: number, contribution: number, kWhPerSwap = 410, reserve = .6) {
    if (!finiteNonnegative(fixed) || !Number.isFinite(contribution) || !Number.isFinite(kWhPerSwap) || kWhPerSwap <= 0 || !finiteNonnegative(reserve))
        throw Error('Invalid break-even input');
    if (contribution <= 0) return null;
    const energy = fixed / contribution;
    return { energy, swaps: Math.ceil(energy / kWhPerSwap), energyFirst: Math.ceil(energy * (1 + reserve) / kWhPerSwap), integerFirst: Math.ceil(Math.ceil(energy / kWhPerSwap) * (1 + reserve)) };
}
function validateFlows(flows: number[]) {
    if (!flows.length || flows.some(value => !Number.isFinite(value))) throw Error('Invalid cash flows');
}
/** NPV sign with bounded Horner evaluation. Scaling does not change its roots.
 * For negative rates, evaluate NPV*(1+r)^(n-1), avoiding +/-Infinity cancellation.
 */
function scaledNpv(flows: number[], rate: number, scale: number) {
    const base = 1 + rate;
    let value = 0;
    if (rate < 0) {
        for (const flow of flows) value = value * base + flow / scale;
    } else {
        for (let i = flows.length - 1; i >= 0; i--) value = value / base + flows[i] / scale;
    }
    return value;
}
export function npv(flows: number[], rate: number) {
    validateFlows(flows);
    if (rate <= -1 || !Number.isFinite(rate)) throw Error('Invalid NPV input');
    // Trailing zero periods do not alter NPV. Removing them prevents the
    // negative-rate polynomial scaling from underflowing to a false zero.
    let end = flows.length;
    while (end > 0 && flows[end - 1] === 0) end--;
    if (end === 0) return 0;
    flows = flows.slice(0, end);
    const scale = Math.max(...flows.map(Math.abs));
    if (scale === 0) return 0;
    const value = scaledNpv(flows, rate, scale);
    if (value === 0) return 0;
    const result = rate >= 0 ? value * scale
        : Math.sign(value) * Math.exp(Math.log(Math.abs(value)) + Math.log(scale) - (flows.length - 1) * Math.log1p(rate));
    if (!Number.isFinite(result)) throw Error('NPV exceeds finite numeric range');
    return result;
}
export function irr(flows: number[]): { status: 'ok' | 'no-root' | 'multiple-sign-changes'; rate: number | null } {
    validateFlows(flows);
    // Leading zero periods multiply NPV by a positive discount factor; trailing
    // zero periods contribute nothing. Neither changes any finite IRR > -1.
    let start = 0, end = flows.length;
    while (start < end && flows[start] === 0) start++;
    while (end > start && flows[end - 1] === 0) end--;
    flows = flows.slice(start, end);
    const signs = flows.filter(value => value !== 0).map(Math.sign);
    const changes = signs.slice(1).filter((sign, i) => sign !== signs[i]).length;
    if (changes !== 1) return { status: changes > 1 ? 'multiple-sign-changes' : 'no-root', rate: null };
    const scale = Math.max(...flows.map(Math.abs));
    const evaluate = (rate: number) => scaledNpv(flows, rate, scale);
    const magnitudes = flows.map(Math.abs);
    const residual = (rate: number) => {
        const value = evaluate(rate), absolute = scaledNpv(magnitudes, rate, scale);
        return Number.isFinite(value) && Number.isFinite(absolute) && absolute > 0
            ? Math.abs(value) / absolute : Infinity;
    };
    const accept = (rate: number): { status: 'ok' | 'no-root'; rate: number | null } =>
        Number.isFinite(rate) && rate > -1 && residual(rate) <= 1e-10
            ? { status: 'ok', rate } : { status: 'no-root', rate: null };
    let lo = -1 + Number.EPSILON, hi = 1;
    let atLo = evaluate(lo), atHi = evaluate(hi);
    if (atLo === 0) return accept(lo);
    if (atHi === 0) return accept(hi);
    while (Math.sign(atLo) === Math.sign(atHi) && hi < Number.MAX_VALUE / 4) {
        hi *= 2;
        atHi = evaluate(hi);
    }
    if (!Number.isFinite(atLo) || !Number.isFinite(atHi) || Math.sign(atLo) === Math.sign(atHi)) return { status: 'no-root', rate: null };
    for (let i = 0; i < 200; i++) {
        const mid = lo + (hi - lo) / 2;
        const atMid = evaluate(mid);
        if (!Number.isFinite(atMid)) return { status: 'no-root', rate: null };
        if (atMid === 0) return accept(mid);
        if (mid === lo || mid === hi) break;
        if (Math.sign(atMid) === Math.sign(atLo)) { lo = mid; atLo = atMid; }
        else { hi = mid; atHi = atMid; }
    }
    return accept(residual(lo) < residual(hi) ? lo : hi);
}
export function payback(flows: number[]) {
    validateFlows(flows);
    let sum = flows[0];
    if (sum >= 0) return 0;
    for (let i = 1; i < flows.length; i++) {
        const previous = sum;
        sum += flows[i];
        if (sum >= 0) return i - 1 + (-previous) / flows[i];
    }
    return null;
}
/** Costs of fixed auxiliary loads recur on every operating day, independently
 * of the traffic ramp. dailyEnergyCost includes dailyFixedEnergyCost.
 */
export function cashflow(p: Project, dailyRevenue: number, dailyEnergyCost: number, dailyKWh: number, dailyFixedEnergyCost = 0) {
    const f = p.finance;
    if (f.capex === null || f.fixedDaily === null || !finiteNonnegative(f.capex) || !finiteNonnegative(f.fixedDaily)
        || !Number.isInteger(f.years) || f.years < 1 || f.years > 30 || !finiteNonnegative(f.variablePerKWh)
        || !finiteNonnegative(f.discountRate) || f.discountRate > 1 || !Number.isInteger(f.rampMonths) || f.rampMonths < 0 || f.rampMonths > 120
        || !finiteNonnegative(f.startLoad) || f.startLoad > 1 || !Number.isFinite(f.operatingDaysPerYear) || f.operatingDaysPerYear <= 0 || f.operatingDaysPerYear > 366) return null;
    if (![dailyRevenue, dailyEnergyCost, dailyKWh, dailyFixedEnergyCost].every(finiteNonnegative)
        || dailyFixedEnergyCost > dailyEnergyCost + 1e-8) throw Error('Invalid representative daily financial inputs');
    const trafficEnergyCost = Math.max(0, dailyEnergyCost - dailyFixedEnergyCost);
    const flows = [-f.capex];
    const rows = [];
    let cumulative = -f.capex;
    for (let month = 1; month <= f.years * 12; month++) {
        // Month 1 is the end of the first ramp month; month 0=startLoad.
        const load = f.rampMonths === 0 ? 1 : f.startLoad + (1 - f.startLoad) * Math.min(month / f.rampMonths, 1);
        const days = f.operatingDaysPerYear / 12;
        const receipts = dailyRevenue * load * days;
        const variableEnergy = trafficEnergyCost * load * days;
        const otherVariable = dailyKWh * f.variablePerKWh * load * days;
        const fixedEnergy = dailyFixedEnergyCost * days;
        const fixedOpex = f.fixedDaily * days;
        const variable = variableEnergy + otherVariable;
        const fixed = fixedEnergy + fixedOpex;
        const net = receipts - variable - fixed;
        if(![receipts,variableEnergy,otherVariable,fixedEnergy,fixedOpex,variable,fixed,net,cumulative+net].every(Number.isFinite))return null;
        flows.push(net);
        cumulative += net;
        rows.push({ month, load, days, receipts, variableEnergy, otherVariable, fixedEnergy, fixedOpex, variable, fixed, net, cumulative });
    }
    const monthlyRate = Math.expm1(Math.log1p(f.discountRate) / 12);
    const root = irr(flows);
    const annualIrr = root.rate === null ? null : Math.expm1(12 * Math.log1p(root.rate));
    return {
        rows, flows, npv: npv(flows, monthlyRate),
        irr: annualIrr === null || !Number.isFinite(annualIrr) ? null : annualIrr,
        irrStatus: annualIrr !== null && !Number.isFinite(annualIrr) ? 'no-root' as const : root.status,
        paybackMonths: payback(flows),
        discountedPaybackMonths: payback(flows.map((value, i) => value / (1 + monthlyRate) ** i)),
        fundingGap: -Math.min(0, -f.capex, ...rows.map(row => row.cumulative)),
    };
}
