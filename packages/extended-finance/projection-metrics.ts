/** Intended location: packages/extended-finance/projection-metrics.ts. */
import { irr, payback } from '../economics-engine/index.ts';

export function lifecycleInvestmentMetrics(flows: number[] | null, annualDiscountRate: number | null) {
  if (!flows || annualDiscountRate === null) return {
    available: false, annualIRR: null, irrStatus: 'incomplete' as const,
    paybackMonths: null, discountedPaybackMonths: null, fundingGap: null, laterFundingDeficit: false,
  };
  if (!flows.length || flows.some(f => !Number.isFinite(f)) || !Number.isFinite(annualDiscountRate) || annualDiscountRate < 0 || annualDiscountRate > 1) throw Error('Invalid detailed investment metrics input');
  const root = irr(flows);
  const annualIRR = root.rate === null ? null : Math.expm1(12 * Math.log1p(root.rate));
  const monthlyDiscount = Math.expm1(Math.log1p(annualDiscountRate) / 12);
  let cumulative = 0, lowest = 0, reachedNonnegative = false, laterFundingDeficit = false;
  for (const flow of flows) {
    cumulative += flow; lowest = Math.min(lowest, cumulative);
    if (reachedNonnegative && cumulative < 0) laterFundingDeficit = true;
    if (cumulative >= 0) reachedNonnegative = true;
  }
  return {
    available: true,
    annualIRR: annualIRR !== null && Number.isFinite(annualIRR) ? annualIRR : null,
    irrStatus: annualIRR !== null && !Number.isFinite(annualIRR) ? 'no-root' as const : root.status,
    paybackMonths: payback(flows),
    discountedPaybackMonths: payback(flows.map((flow, month) => flow / (1 + monthlyDiscount) ** month)),
    fundingGap: -lowest,
    laterFundingDeficit,
  };
}
