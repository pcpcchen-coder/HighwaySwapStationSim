import type { Project, ServiceRow, RunResult } from '../contracts/index.ts';
export function bill(row: ServiceRow, kind: 'swap' | 'charge', kWh: number, policy: Project['billing']) { const price = policy === 'SOURCE_DISPLAY_PRICE' ? (kind === 'swap' ? row.swapTotalRaw : row.chargeTotalRaw) : row.gridPrice + (kind === 'swap' ? row.swapFee : row.chargeFee); return kWh * price; }
export function investmentCase(p: Project, result: RunResult) { if (result.mode !== 'CONSTRAINED' || result.totals.gridKWh <= 0)
    return null; const t = result.totals; const averagePrice = t.gridKWh > 0 ? t.gridCost / t.gridKWh : 0; const lossFactor = t.gridKWh > 0 ? Math.max(.01, 1 - t.lossKWh / t.gridKWh) : 1; const replenishmentKWh = Math.max(0, t.initialStoredKWh - t.finalStoredKWh); const replenishmentCost = replenishmentKWh / lossFactor * averagePrice; const adjustedDailyEnergyCost = t.gridCost + replenishmentCost; return { averagePrice, replenishmentKWh, replenishmentCost, adjustedDailyEnergyCost, projection: cashflow(p, t.revenue, adjustedDailyEnergyCost, t.deliveredKWh) }; }
export function breakEven(fixed: number, contribution: number, kWhPerSwap = 410, reserve = .6) { if (!Number.isFinite(fixed) || fixed < 0 || !Number.isFinite(contribution) || kWhPerSwap <= 0 || reserve < 0)
    throw Error('Invalid break-even input'); if (contribution <= 0)
    return null; const energy = fixed / contribution; return { energy, swaps: Math.ceil(energy / kWhPerSwap), energyFirst: Math.ceil(energy * (1 + reserve) / kWhPerSwap), integerFirst: Math.ceil(Math.ceil(energy / kWhPerSwap) * (1 + reserve)) }; }
export function npv(flows: number[], rate: number) { if (rate <= -1 || !Number.isFinite(rate) || flows.some(v => !Number.isFinite(v)))
    throw Error('Invalid NPV input'); return flows.reduce((sum, value, i) => sum + value / (1 + rate) ** i, 0); }
export function irr(flows: number[]): {
    status: 'ok' | 'no-root' | 'multiple-sign-changes';
    rate: number | null;
} { const signs = flows.filter(x => x !== 0).map(Math.sign); const changes = signs.slice(1).filter((s, i) => s !== signs[i]).length; if (changes !== 1)
    return { status: changes > 1 ? 'multiple-sign-changes' : 'no-root', rate: null }; let lo = -.999, hi = 1; while (npv(flows, lo) * npv(flows, hi) > 0 && hi < 1e6)
    hi *= 2; if (npv(flows, lo) * npv(flows, hi) > 0)
    return { status: 'no-root', rate: null }; for (let i = 0; i < 150; i++) {
    const mid = (lo + hi) / 2;
    if (npv(flows, lo) * npv(flows, mid) <= 0)
        hi = mid;
    else
        lo = mid;
} return { status: 'ok', rate: (lo + hi) / 2 }; }
export function payback(flows: number[]) { let sum = flows[0]; if (sum >= 0)
    return 0; for (let i = 1; i < flows.length; i++) {
    const previous = sum;
    sum += flows[i];
    if (sum >= 0)
        return i - 1 + (-previous) / flows[i];
} return null; }
export function cashflow(p: Project, dailyRevenue: number, dailyEnergyCost: number, dailyKWh: number) { const f = p.finance; if (f.capex === null || f.fixedDaily === null || !Number.isInteger(f.years) || f.years < 1 || f.years > 30 || f.discountRate < 0 || f.discountRate > 1 || f.capex < 0 || f.fixedDaily < 0)
    return null; const flows = [-f.capex]; const rows = []; let cumulative = -f.capex; for (let month = 1; month <= f.years * 12; month++) {
    const load = f.rampMonths === 0 ? 1 : f.startLoad + (1 - f.startLoad) * Math.min(month / f.rampMonths, 1);
    const days = f.operatingDaysPerYear / 12;
    const receipts = dailyRevenue * load * days;
    const variable = (dailyEnergyCost + dailyKWh * f.variablePerKWh) * load * days;
    const fixed = f.fixedDaily * days;
    const net = receipts - variable - fixed;
    flows.push(net);
    cumulative += net;
    rows.push({ month, load, receipts, variable, fixed, net, cumulative });
} const monthlyRate = (1 + f.discountRate) ** (1 / 12) - 1; const root = irr(flows); return { rows, flows, npv: npv(flows, monthlyRate), irr: root.rate === null ? null : (1 + root.rate) ** 12 - 1, irrStatus: root.status, paybackMonths: payback(flows), discountedPaybackMonths: payback(flows.map((v, i) => v / (1 + monthlyRate) ** i)), fundingGap: -Math.min(0, -f.capex, ...rows.map(r => r.cumulative)) }; }
