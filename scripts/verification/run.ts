/**
 * Compare three real simulator executions against an independently authored,
 * immutable Decimal oracle. This runner never updates implementation/fixtures.
 *
 * Usage:
 *   node <runner.ts> [--repo <repo>]  (run from repo root)
 *     [--expected <expected.json>] [--fixtures <fixtures.json>] [--out <dir>]
 * Defaults are repo-relative data/verification/{expected,fixtures}.json and
 * artifacts/verification output. Node 24 uses native TypeScript type stripping.
 *
 * kWh/kW/min: absolute 1e-6. Settled money: exact integer cents; only binary
 * floating representation noise (<1e-8 CNY) is accepted around a cent value.
 * Unrounded analytical CNY is a separate numerical quantity, tolerance 1e-6.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

type J = Record<string, any>;
type Unit = 'kWh' | 'kW' | 'min' | 'count' | 'fraction' | 'CNY_unrounded' | 'CNY_cent' | 'boolean' | 'identity';
const TOLERANCE = 1e-6;
const STATIONS = ['A', 'B'] as const;
const argv = process.argv.slice(2);
function option(flag: string): string | undefined { const i = argv.indexOf(flag); return i < 0 ? undefined : argv[i + 1]; }
const REPO = resolve(option('--repo') ?? process.cwd());
const EXPECTED = resolve(option('--expected') ?? join(REPO, 'data/verification/expected.json'));
const FIXTURES = resolve(option('--fixtures') ?? join(REPO, 'data/verification/fixtures.json'));
const OUT = resolve(option('--out') ?? join(REPO, 'artifacts/verification'));
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const num = (x: any): number => typeof x === 'number' ? x : typeof x === 'string' && x.trim()!=='' ? Number(x) : NaN;
const sum = (xs: any[], key?: string): number => xs.reduce((a, x) => a + num(key ? x[key] : x), 0);
const hkey = (day: number, hour: number, id: string) => `${day * 24 + hour}:${id}`;
const last = <T,>(xs: T[]): T => xs[xs.length - 1];
function decimalScaled(value: any, places: number): bigint {
  // Expected decimal strings are authoritative. No Number conversion is used.
  const text = String(value), m = /^(-?)(\d+)(?:\.(\d*))?$/.exec(text);
  if (!m) throw Error(`Invalid exact decimal: ${text}`);
  const digits = (m[3] ?? '').padEnd(places, '0');
  if (digits.slice(places).replace(/0/g, '')) throw Error(`Expected value is not quantized to ${places} places: ${text}`);
  return (m[1] ? -1n : 1n) * BigInt(m[2] + digits.slice(0, places));
}
function physicalPeak(c: J, f: J, absoluteHour: number): J {
  const start = absoluteHour * 60, end = start + 60;
  const battery = c.batteryChargeIntervalsPerStationMinutes.some(([a, b]: any[]) => Math.min(end, num(b)) > Math.max(start, num(a))) ? 50 : 0;
  const ev = c.id === 'V02_PCS_AC_EV_4D' && [12, 13].includes(absoluteHour % 24) ? 50 : 0;
  const aux = num(f.auxiliary_kW_per_site), dc = (battery + ev) / num(f.dd_efficiency);
  const nodes: J = {}, edges: J = {}, source: J = {}, station: J = {};
  if (c.id === 'V03_OUTAGE_CROSSSITE_5D') {
    const g = 2 * dc / num(f.sst_efficiency);
    Object.assign(nodes, { 'A-grid': g, 'A-sst': 2 * dc, 'A-bus': 2 * dc, 'A-tie': dc, 'B-bus': dc });
    Object.assign(edges, { 'A-grid->A-sst': g, 'A-sst->A-bus': 2 * dc, 'A-bus->A-tie': dc, 'A-tie->B-bus': dc });
    source['A-grid'] = g;
    for (const s of STATIONS) { nodes[`${s}-charger`] = battery; edges[`${s}-bus->${s}-charger`] = dc; station[s] = g / 2; }
  } else for (const s of STATIONS) {
    let g: number;
    if (c.id === 'V01_SST_3D') {
      g = dc / num(f.sst_efficiency);
      Object.assign(nodes, { [`${s}-grid`]: g, [`${s}-sst`]: dc, [`${s}-bus`]: dc, [`${s}-charger`]: battery });
      Object.assign(edges, { [`${s}-grid->${s}-sst`]: g, [`${s}-sst->${s}-bus`]: dc, [`${s}-bus->${s}-charger`]: dc });
    } else {
      const pcs = dc / num(f.pcs_efficiency), tx = pcs + aux; g = tx / num(f.transformer_efficiency);
      Object.assign(nodes, { [`${s}-grid`]: g, [`${s}-transformer`]: tx, [`${s}-lv`]: tx, [`${s}-pcs`]: dc, [`${s}-bus`]: dc, [`${s}-charger`]: ev, [`${s}-aux`]: aux });
      Object.assign(edges, { [`${s}-grid->${s}-transformer`]: g, [`${s}-transformer->${s}-lv`]: tx, [`${s}-lv->${s}-pcs`]: pcs, [`${s}-pcs->${s}-bus`]: dc, [`${s}-bus->${s}-charger`]: dc, [`${s}-lv->${s}-aux`]: aux });
    }
    source[`${s}-grid`] = g; station[s] = g;
  }
  return { nodes, edges, source, station };
}
function capacityFromSnapshot(node: J, project: J): number {
  switch (node.type) {
    case 'grid': case 'mv-cable': return node.params.kva * node.params.pf;
    // Formal rating boundary: transformer kVA*PF is INPUT capacity.
    case 'transformer': return node.params.kva * node.params.pf * (node.params.efficiency ?? project.efficiency.transformer);
    case 'bus': return node.params.voltage * node.params.amps / 1000;
    case 'gun': return node.params.vehicleVoltage > node.params.voltage ? 0 : Math.min(node.params.kw, node.params.amps * node.params.vehicleVoltage / 1000);
    case 'compensation': return 0;
    default: return node.params.kw;
  }
}
class Checks {
  assertions = 0; passed = 0; failed = 0;
  categories: J = {}; maxErrors: J = {}; failures: J[] = [];
  check(path: string, actual: any, expected: any, unit: Unit, category: string) {
    this.assertions++;
    const group = this.categories[category] ??= { assertions: 0, passed: 0, failed: 0, maxAbsError: 0, maxErrorPath: null };
    group.assertions++;
    let pass = false, error = 0, normalizedActual: any = actual, normalizedExpected: any = expected;
    if (unit === 'identity' || unit === 'boolean') { pass = actual === expected; error = pass ? 0 : 1; }
    else if (unit === 'CNY_cent') {
      const a = num(actual), cents = Math.round(a * 100), e = decimalScaled(expected, 2);
      const representationError = Math.abs(a - cents / 100);
      pass = Number.isFinite(a) && Number.isSafeInteger(cents) && representationError < 1e-8 && BigInt(cents) === e;
      error = Number.isFinite(a) ? Math.abs(cents - Number(e)) / 100 : Infinity;
      if (!pass && error === 0) error = representationError;
      normalizedActual = Number.isFinite(a) ? `${cents} cents (raw ${a})` : String(a); normalizedExpected = `${e} cents`;
    } else {
      const a = num(actual), e = num(expected); error = Math.abs(a - e);
      pass = Number.isFinite(a) && Number.isFinite(e) && error <= (unit === 'count' ? 0 : TOLERANCE);
      if (!Number.isFinite(error)) error = Infinity;
    }
    if (error > group.maxAbsError) { group.maxAbsError = error; group.maxErrorPath = path; }
    const mx = this.maxErrors[unit] ??= { absolute: 0, path: null };
    if (error > mx.absolute) { mx.absolute = error; mx.path = path; }
    if (pass) { this.passed++; group.passed++; }
    else { this.failed++; group.failed++; this.failures.push({ path, unit, category, actual: normalizedActual, expected: normalizedExpected, absoluteError: Number.isFinite(error) ? error : String(error), tolerance: ['identity', 'boolean', 'count', 'CNY_cent'].includes(unit) ? 0 : TOLERANCE }); }
  }
  truth(path: string, actual: boolean, category = 'structure') { this.check(path, actual, true, 'boolean', category); }
  unique(rows: J[], key: (r: J) => string, label: string): Map<string, J> {
    const out = new Map<string, J>(); for (const r of rows) { const k = key(r); this.truth(`${label}.unique[${k}]`, !out.has(k)); out.set(k, r); } return out;
  }
  report() { return { assertions: this.assertions, passed: this.passed, failed: this.failed, categories: this.categories, maxErrors: this.maxErrors, failures: this.failures }; }
}
function initialStation(actual: J, s: string): number { const c = actual.parameterSnapshot.station[s]; return c.batteries * c.capacityKWh * c.readySOC; }
function compareCase(c: J, f: J, actual: J): J {
  const ck = new Checks(), id = c.id, p = actual.parameterSnapshot;
  ck.check(`${id}.horizonDays`, p.horizonDays, c.horizonDays, 'count', 'structure');
  ck.check(`${id}.hours.length`, actual.hours.length, c.horizonDays * 48, 'count', 'structure');
  ck.check(`${id}.transactions.length`, actual.transactions.length, c.transactions.length, 'count', 'structure');
  ck.check(`${id}.mode`, actual.mode, 'CONSTRAINED', 'identity', 'structure');
  ck.check(`${id}.moneyPolicy`, p.moneyPolicy, 'CNY_CENT_HALF_UP', 'identity', 'structure');
  ck.check(`${id}.assemblyEfficiency`, p.efficiency.mode, 'ASSEMBLY', 'identity', 'structure');
  ck.check(`${id}.errorDiagnostics`, actual.diagnostics.filter((x: J) => x.severity === 'error').length, 0, 'count', 'structure');
  const ah = ck.unique(actual.hours, r => hkey(r.day, r.hour, r.station), 'hours');
  const an = ck.unique(actual.componentEnergy, r => hkey(r.day, r.hour, r.nodeId), 'components');
  const ae = ck.unique(actual.edgeEnergy, r => hkey(r.day, r.hour, `${r.source}->${r.target}`), 'edges');
  const am = ck.unique(actual.sourceMeters, r => hkey(r.day, r.hour, r.sourceId), 'meters');
  const at = ck.unique(actual.transactions, r => `${r.station}:${r.kind}:${r.arrival}`, 'transactions');
  const expectedNodes = new Set(Object.keys(c.nodes)), expectedEdges = new Set(Object.keys(c.edges));
  const expectedSources = new Set(Object.keys(c.sourceMeters));
  for (const n of actual.componentEnergy) { ck.truth(`components.expectedNode[${n.nodeId}]`, expectedNodes.has(n.nodeId)); ck.truth(`components.hourRange[${n.nodeId}:${n.day}:${n.hour}]`, n.day >= 0 && n.day < c.horizonDays && n.hour >= 0 && n.hour < 24); }
  for (const e of actual.edgeEnergy) ck.truth(`edges.expectedEdge[${e.source}->${e.target}]`, expectedEdges.has(`${e.source}->${e.target}`));
  for (const m of actual.sourceMeters) ck.truth(`meters.expectedSource[${m.sourceId}]`, expectedSources.has(m.sourceId));
  const stationActual: J[] = [];
  const onlyEV = c.id === 'V02_PCS_AC_EV_4D';
  for (const h of c.hourlyPhysicalLedgers) {
    const absolute = h.absoluteHour, peaks = physicalPeak(c, f, absolute), rowPrefix = `${id}.hour[${absolute}]`;
    for (const s of STATIONS) {
      const e = h.stations[s], a = ah.get(`${absolute}:${s}`);
      ck.truth(`${rowPrefix}.${s}.exists`, !!a); if (!a) continue;
      const before = absolute === 0 ? initialStation(actual, s) : num(ah.get(`${absolute - 1}:${s}`)?.storedKWh);
      const chargerOutput = num(an.get(`${absolute}:${s}-charger`)?.outputKWh ?? 0);
      const derived: J = { ...a, batteryChargeKWh: onlyEV ? 0 : chargerOutput, evDeliveredKWh: onlyEV ? chargerOutput : 0,
        swapDeliveredKWh: onlyEV ? 0 : a.deliveredKWh, initialStoredKWh: before, finalStoredKWh: a.storedKWh,
        storedDeltaKWh: a.storedKWh - before, completedSessions: a.swapCount + a.chargeCount,
        revenueSettled: a.revenue, revenueExact: a.revenue, readyPacks: a.ready, queuedSessions: a.queue };
      // Exact attributed cost is reconstructed from physical energy and its
      // known source tariff; settled per-consumer cents are not invented.
      const sourceStation = c.id === 'V03_OUTAGE_CROSSSITE_5D' ? 'A' : s;
      derived.gridCostExact = a.gridKWh * num(f[`grid_prices_${sourceStation}`][h.day]);
      stationActual.push({ ...derived, absoluteHour: absolute, station: s });
      for (const key of ['gridKWh', 'lossKWh', 'auxiliaryKWh', 'batteryChargeKWh', 'evDeliveredKWh', 'swapDeliveredKWh', 'deliveredKWh', 'initialStoredKWh', 'finalStoredKWh', 'storedDeltaKWh']) ck.check(`${rowPrefix}.${s}.${key}`, derived[key], e[key], 'kWh', 'hourly.station.energy');
      for (const key of ['readyPacks', 'queuedSessions', 'completedSessions']) ck.check(`${rowPrefix}.${s}.${key}`, derived[key], e[key], 'count', 'hourly.station.state');
      ck.check(`${rowPrefix}.${s}.revenueSettled`, a.revenue, e.revenueSettled, 'CNY_cent', 'hourly.station.revenue');
      ck.check(`${rowPrefix}.${s}.gridCostExact`, derived.gridCostExact, e.gridCostExact, 'CNY_unrounded', 'hourly.station.exactCost');
      ck.check(`${rowPrefix}.${s}.reportedBalanceResidual`, a.balanceResidual, 0, 'kWh', 'conservation.station');
      ck.check(`${rowPrefix}.${s}.independentBalanceResidual`, a.gridKWh - a.lossKWh - a.auxiliaryKWh - a.deliveredKWh - (a.storedKWh - before), 0, 'kWh', 'conservation.station');
      ck.check(`${rowPrefix}.${s}.peakKW`, a.peakKW, peaks.station[s], 'kW', 'hourly.station.peak');
      const expectedRequest = p.services.find((r: J) => r.station === s && r.day === h.day && r.hour === h.hour);
      ck.check(`${rowPrefix}.${s}.requestedKWh`, a.requestedKWh, expectedRequest.swapKWh + expectedRequest.chargeKWh, 'kWh', 'hourly.station.request');
    }
    for (const [nodeId, fields] of Object.entries(h.nodes) as [string, J][]) {
      const a = an.get(`${absolute}:${nodeId}`), prefix = `${rowPrefix}.node[${nodeId}]`;
      if (num(fields.inputKWh) > TOLERANCE || num(fields.outputKWh) > TOLERANCE) ck.truth(`${prefix}.exists`, !!a);
      for (const field of ['inputKWh', 'outputKWh', 'lossKWh']) ck.check(`${prefix}.${field}`, a?.[field] ?? 0, fields[field], 'kWh', 'hourly.component.energy');
      const terminal = nodeId.endsWith('-charger') || nodeId.endsWith('-aux');
      ck.check(`${prefix}.terminalKWh`, a?.terminalKWh ?? 0, terminal ? fields.outputKWh : 0, 'kWh', 'hourly.component.terminal');
      ck.check(`${prefix}.peakOutputKW`, a?.peakOutputKW ?? 0, peaks.nodes[nodeId], 'kW', 'hourly.component.peak');
      if (a) {
        const snapshotNode = p.topology.nodes.find((n: J) => n.id === nodeId);
        ck.check(`${prefix}.capacityKW`, a.capacityKW, capacityFromSnapshot(snapshotNode, p), 'kW', 'capacity.snapshotMetadata');
        ck.truth(`${prefix}.capacityNotExceeded`, a.peakOutputKW <= a.capacityKW + TOLERANCE, 'capacity.feasibility');
        ck.check(`${prefix}.reportedBalanceResidual`, a.maxBalanceResidual, 0, 'kWh', 'conservation.component');
        ck.check(`${prefix}.conversionBalance`, a.inputKWh - a.outputKWh - a.lossKWh, 0, 'kWh', 'conservation.component');
        const outgoing = actual.edgeEnergy.filter((e: J) => e.day === h.day && e.hour === h.hour && e.source === nodeId);
        const incoming = actual.edgeEnergy.filter((e: J) => e.day === h.day && e.hour === h.hour && e.target === nodeId);
        ck.check(`${prefix}.outgoingBalance`, a.outputKWh - sum(outgoing, 'kWh') - a.terminalKWh, 0, 'kWh', 'conservation.component');
        if (!nodeId.endsWith('-grid')) ck.check(`${prefix}.incomingBalance`, a.inputKWh - sum(incoming, 'kWh'), 0, 'kWh', 'conservation.component');
      }
    }
    for (const [edge, energy] of Object.entries(h.edges)) {
      const a = ae.get(`${absolute}:${edge}`), prefix = `${rowPrefix}.edge[${edge}]`;
      if (num(energy) > TOLERANCE) ck.truth(`${prefix}.exists`, !!a);
      ck.check(`${prefix}.kWh`, a?.kWh ?? 0, energy, 'kWh', 'hourly.edge.energy');
      ck.check(`${prefix}.peakKW`, a?.peakKW ?? 0, peaks.edges[edge], 'kW', 'hourly.edge.peak');
    }
    const actualHourlyMeters = actual.sourceMeters.filter((m: J) => m.day === h.day && m.hour === h.hour);
    ck.check(`${rowPrefix}.settledSourceCost`, sum(actualHourlyMeters, 'cost'), h.gridCostSettled, 'CNY_cent', 'hourly.source.settlement');
    const consumerCost = sum(actual.hours.filter((r: J) => r.day === h.day && r.hour === h.hour), 'gridCost');
    ck.check(`${rowPrefix}.consumerCostReconcilesSource`, consumerCost, h.gridCostSettled, 'CNY_cent', 'money.reconciliation');
  }
  for (const e of c.sourceHourInvoices) {
    const absolute = e.absoluteHour, a = am.get(`${absolute}:${e.sourceId}`), prefix = `${id}.sourceHour[${absolute}:${e.sourceId}]`;
    if (num(e.importKWh) > TOLERANCE) ck.truth(`${prefix}.exists`, !!a);
    ck.check(`${prefix}.importKWh`, a?.importKWh ?? 0, e.importKWh, 'kWh', 'hourly.source.energy');
    ck.check(`${prefix}.costSettled`, a?.cost ?? 0, e.costSettled, 'CNY_cent', 'hourly.source.invoice');
    ck.check(`${prefix}.energyForInvoiceMicroKWh`, Math.round((a?.importKWh ?? 0)*1e6), Number(decimalScaled(e.energyForInvoiceKWh,6)), 'count', 'hourly.source.invoiceQuantization');
    ck.check(`${prefix}.costExact`, (a?.importKWh ?? 0) * (a?.unitPrice ?? num(e.gridPrice)), e.costExact, 'CNY_unrounded', 'hourly.source.exactCost');
    ck.check(`${prefix}.peakKW`, a?.peakKW ?? 0, physicalPeak(c, f, absolute).source[e.sourceId], 'kW', 'hourly.source.peak');
    if (a) ck.check(`${prefix}.unitPrice`, a.unitPrice, e.gridPrice, 'fraction', 'hourly.source.tariff');
  }
  for (const e of c.transactions) {
    const key = `${e.station}:${e.kind}:${num(e.arrivalMinute)}`, a = at.get(key), prefix = `${id}.transaction[${key}]`;
    ck.truth(`${prefix}.exists`, !!a); if (!a) continue;
    ck.check(`${prefix}.station`, a.station, e.station, 'identity', 'transaction.identity');
    ck.check(`${prefix}.kind`, a.kind, e.kind, 'identity', 'transaction.identity');
    for (const [ak, ek] of [['arrival', 'arrivalMinute'], ['start', 'startMinute'], ['completion', 'completionMinute']]) ck.check(`${prefix}.${ak}`, a[ak], e[ek], 'min', 'transaction.time');
    ck.check(`${prefix}.waitingMinutes`, a.start - a.arrival, e.waitingMinutes, 'min', 'transaction.time');
    ck.check(`${prefix}.deliveredKWh`, a.deliveredKWh, e.deliveredKWh, 'kWh', 'transaction.energy');
    ck.check(`${prefix}.requestedKWh`, a.requestedKWh, e.deliveredKWh, 'kWh', 'transaction.energy');
    ck.check(`${prefix}.unitPrice`, a.unitPrice, e.unitPrice, 'fraction', 'transaction.tariff');
    ck.check(`${prefix}.revenue`, a.revenue, e.revenueSettled, 'CNY_cent', 'transaction.invoice');
  }
  const dailyActual: J[] = [];
  for (const day of c.days) {
    const d = day.day, rows = stationActual.filter(r => r.day === d), byStation: J = {};
    for (const s of STATIONS) {
      const rs = rows.filter(r => r.station === s).sort((a, b) => a.hour - b.hour);
      const item: J = {};
      for (const k of ['gridKWh', 'lossKWh', 'auxiliaryKWh', 'batteryChargeKWh', 'evDeliveredKWh', 'swapDeliveredKWh', 'deliveredKWh', 'storedDeltaKWh', 'completedSessions', 'revenueExact', 'revenueSettled', 'gridCostExact']) item[k] = sum(rs, k);
      item.initialStoredKWh = rs[0]?.initialStoredKWh; item.finalStoredKWh = last(rs)?.finalStoredKWh;
      item.endReadyPacks = last(rs)?.readyPacks; item.endQueuedSessions = last(rs)?.queuedSessions;
      byStation[s] = item;
      for (const [k, expectedValue] of Object.entries(day.stations[s])) {
        const unit: Unit = ['completedSessions', 'endReadyPacks', 'endQueuedSessions'].includes(k) ? 'count' : k === 'revenueSettled' ? 'CNY_cent' : ['revenueExact', 'gridCostExact'].includes(k) ? 'CNY_unrounded' : 'kWh';
        ck.check(`${id}.day[${d}].station[${s}].${k}`, item[k], expectedValue, unit, 'daily.station');
      }
    }
    const dt: J = {}; for (const k of Object.keys(byStation.A)) dt[k] = byStation.A[k] + byStation.B[k];
    const meters = actual.sourceMeters.filter((r: J) => r.day === d);
    dt.gridCostSettled = sum(meters, 'cost');
    dt.modeledOperatingContributionExact = dt.revenueExact - dt.gridCostExact;
    dt.modeledOperatingContributionSettled = Math.round((dt.revenueSettled - dt.gridCostSettled) * 100) / 100;
    dt.balanceResidualKWh = dt.gridKWh - dt.lossKWh - dt.auxiliaryKWh - dt.deliveredKWh - dt.storedDeltaKWh;
    for (const [k, expectedValue] of Object.entries(day.totals)) {
      const unit: Unit = ['completedSessions', 'endReadyPacks', 'endQueuedSessions'].includes(k) ? 'count' : ['revenueSettled', 'gridCostSettled', 'modeledOperatingContributionSettled'].includes(k) ? 'CNY_cent' : ['revenueExact', 'gridCostExact', 'modeledOperatingContributionExact'].includes(k) ? 'CNY_unrounded' : 'kWh';
      ck.check(`${id}.day[${d}].totals.${k}`, dt[k], expectedValue, unit, 'daily.totals');
    }
    for (const [node, fields] of Object.entries(day.nodes) as [string, J][]) for (const field of ['inputKWh', 'outputKWh', 'lossKWh']) ck.check(`${id}.day[${d}].node[${node}].${field}`, sum(actual.componentEnergy.filter((r: J) => r.day === d && r.nodeId === node), field), fields[field], 'kWh', 'daily.component');
    for (const [edge, energy] of Object.entries(day.edges)) ck.check(`${id}.day[${d}].edge[${edge}].kWh`, sum(actual.edgeEnergy.filter((r: J) => r.day === d && `${r.source}->${r.target}` === edge), 'kWh'), energy, 'kWh', 'daily.edge');
    dailyActual.push({ day: d, totals: dt, stations: byStation });
  }
  for (const [node, fields] of Object.entries(c.nodes) as [string, J][]) for (const field of ['inputKWh', 'outputKWh', 'lossKWh']) ck.check(`${id}.nodeTotal[${node}].${field}`, sum(actual.componentEnergy.filter((r: J) => r.nodeId === node), field), fields[field], 'kWh', 'aggregate.component');
  for (const [edge, energy] of Object.entries(c.edges)) ck.check(`${id}.edgeTotal[${edge}].kWh`, sum(actual.edgeEnergy.filter((r: J) => `${r.source}->${r.target}` === edge), 'kWh'), energy, 'kWh', 'aggregate.edge');
  for (const [source, fields] of Object.entries(c.sourceMeters) as [string, J][]) {
    const ms = actual.sourceMeters.filter((r: J) => r.sourceId === source);
    ck.check(`${id}.sourceTotal[${source}].importKWh`, sum(ms, 'importKWh'), fields.importKWh, 'kWh', 'aggregate.source');
    ck.check(`${id}.sourceTotal[${source}].costExact`, sum(ms.map((m: J) => m.importKWh * m.unitPrice)), fields.costExact, 'CNY_unrounded', 'aggregate.source');
    ck.check(`${id}.sourceTotal[${source}].costSettled`, sum(ms, 'cost'), fields.costSettled, 'CNY_cent', 'aggregate.source');
  }
  const t: J = {}, atotal = actual.totals;
  for (const k of Object.keys(c.totals)) t[k] = sum(dailyActual.map(d => d.totals[k] ?? 0));
  Object.assign(t, { ...atotal, completedSessions: atotal.completed, revenueExact: sum(actual.transactions, 'revenue'), revenueSettled: atotal.revenue,
    gridCostExact: sum(actual.sourceMeters.map((m: J) => m.importKWh * m.unitPrice)), gridCostSettled: atotal.gridCost,
    initialStoredKWh: atotal.initialStoredKWh, finalStoredKWh: atotal.finalStoredKWh,
    storedDeltaKWh: atotal.finalStoredKWh - atotal.initialStoredKWh,
    endReadyPacks: last(dailyActual).totals.endReadyPacks, endQueuedSessions: last(dailyActual).totals.endQueuedSessions,
    maxWaitMinutes: Math.max(...actual.transactions.map((j: J) => j.start === null ? Infinity : j.start - j.arrival)),
    inventoryRestorationRequiredKWh: Math.max(0, atotal.initialStoredKWh - atotal.finalStoredKWh) });
  t.modeledOperatingContributionExact = t.revenueExact - t.gridCostExact;
  t.modeledOperatingContributionSettled = Math.round((t.revenueSettled - t.gridCostSettled) * 100) / 100;
  t.settlementRoundingDifference = t.gridCostSettled - t.gridCostExact;
  t.balanceResidualKWh = t.gridKWh - t.lossKWh - t.auxiliaryKWh - t.deliveredKWh - t.storedDeltaKWh;
  for (const [k, e] of Object.entries(c.totals)) {
    const unit: Unit = ['completedSessions', 'endReadyPacks', 'endQueuedSessions'].includes(k) ? 'count' : k === 'maxWaitMinutes' ? 'min' : ['revenueSettled', 'gridCostSettled', 'modeledOperatingContributionSettled'].includes(k) ? 'CNY_cent' : ['revenueExact', 'gridCostExact', 'modeledOperatingContributionExact', 'settlementRoundingDifference'].includes(k) ? 'CNY_unrounded' : 'kWh';
    ck.check(`${id}.totals.${k}`, t[k], e, unit, 'totals');
  }
  ck.check(`${id}.totals.maxBalanceResidual`, atotal.maxBalanceResidual, 0, 'kWh', 'conservation.total');
  ck.check(`${id}.totals.sourceCostReconciliation`, sum(actual.sourceMeters, 'cost'), Math.round(atotal.gridCost * 100) / 100, 'CNY_cent', 'money.reconciliation');
  ck.check(`${id}.totals.transactionRevenueReconciliation`, sum(actual.transactions, 'revenue'), Math.round(atotal.revenue * 100) / 100, 'CNY_cent', 'money.reconciliation');
  return { id, name: c.name, status: ck.failed === 0 ? 'PASS' : 'FAIL', engineVersion: actual.engineVersion,
    ...ck.report(), actualDerivedTotals: t, expectedTotals: c.totals, dailyActual,
    rawCounts: { hours: actual.hours.length, componentEnergy: actual.componentEnergy.length, edgeEnergy: actual.edgeEnergy.length, sourceMeters: actual.sourceMeters.length, transactions: actual.transactions.length },
    diagnostics: actual.diagnostics };
}
async function main() {
  await mkdir(OUT, { recursive: true });
  const expectedText = await readFile(EXPECTED, 'utf8'), fixtureText = await readFile(FIXTURES, 'utf8');
  const expected = JSON.parse(expectedText), fixtures = JSON.parse(fixtureText);
  if (expected.cases.length !== 3 || fixtures.cases.length !== 3) throw Error('Exactly three cases required');
  if (sha(fixtureText) !== expected.fixtureSHA256) throw Error('Fixture hash differs from immutable oracle');
  const codeFiles=['packages/equipment-efficiency/index.ts','packages/equipment-profile/index.ts','packages/topology-engine/index.ts','packages/tabular/index.ts','packages/service-profile/index.ts','packages/schemas/index.ts','packages/contracts/index.ts','packages/power-trace/index.ts','packages/station-engine/index.ts','packages/electrical-engine/index.ts','packages/money/index.ts','packages/verification/cases.ts','plugins/equipment/index.ts','data/verification/fixtures.json'];
  const codeSHA256=Object.fromEntries(await Promise.all(codeFiles.map(async file=>[file,sha(await readFile(join(REPO,file),'utf8'))])));
  const runnerSHA256=sha(await readFile(resolve(process.argv[1]),'utf8'));
  const { simulate } = await import(pathToFileURL(join(REPO, 'packages/station-engine/index.ts')).href);
  const { verificationCases } = await import(pathToFileURL(join(REPO, 'packages/verification/cases.ts')).href);
  const generated = verificationCases(); if (generated.length !== 3) throw Error('Implementation must expose exactly three verification cases');
  const cases: J[] = [], validatorMutationChecks: J[] = [];
  for (const c of expected.cases) {
    const input = generated.find((g: J) => g.id === c.id), f = fixtures.cases.find((v: J) => v.id === c.id);
    if (!input) throw Error(`Missing implementation fixture: ${c.id}`);
    const start = performance.now();
    try {
      const actual = simulate(input.project);
      const actualPath = join(OUT, `actual-${c.id}.json`);
      await writeFile(actualPath, JSON.stringify(actual, null, 2) + '\n');
      const comparison = compareCase(c, f, actual); comparison.elapsedMs = performance.now() - start; comparison.actualPath = actualPath;
      cases.push(comparison);
      // Comparator self-tests reuse V01 and mutate only in-memory copies.
      // They are not additional simulation scenarios or main assertions.
      if(c.id===expected.cases[0].id){
        for(const mutation of [{field:'importKWh',delta:1,label:'physical source meter +1 kWh'},{field:'cost',delta:.01,label:'source-hour invoice +0.01 CNY'}]){
          const altered=structuredClone(actual), meterIndex=altered.sourceMeters.findIndex((m:J)=>m.importKWh>0);
          const original=altered.sourceMeters[meterIndex][mutation.field];
          altered.sourceMeters[meterIndex][mutation.field]=original+mutation.delta;
          const checked=compareCase(c,f,altered);
          validatorMutationChecks.push({label:mutation.label,reusedCaseId:c.id,mutationPath:`sourceMeters[${meterIndex}].${mutation.field}`,original,mutated:original+mutation.delta,expectedStatus:'FAIL',observedStatus:checked.status,detected:checked.failed>0,failedAssertions:checked.failed,exampleFailurePaths:checked.failures.slice(0,6).map((x:J)=>x.path),excludedFromMainAssertionCounts:true});
        }
      }
      process.stdout.write(`${c.id}: ${comparison.status}; ${comparison.passed}/${comparison.assertions} assertions; ${comparison.failed} failures\n`);
      for (const failure of comparison.failures.slice(0, 12)) process.stdout.write(`  ${failure.path}: actual=${failure.actual}; expected=${failure.expected}; error=${failure.absoluteError}\n`);
    } catch (error: any) {
      const failure = { id: c.id, status: 'ERROR', assertions: 1, passed: 0, failed: 1, error: String(error?.stack ?? error), elapsedMs: performance.now() - start };
      cases.push(failure); await writeFile(join(OUT, `actual-${c.id}.json`), JSON.stringify({ simulationError: failure.error, parameterSnapshot: input.project }, null, 2) + '\n');
      process.stdout.write(`${c.id}: ERROR ${error?.message ?? error}\n`);
    }
  }
  const historyPath=resolve(option('--history')??join(OUT,'verification-history/first-run-contract-mismatch/verification-report.json'));
  let firstRun:J|null=null;
  try{const old=JSON.parse(await readFile(historyPath,'utf8'));firstRun={reportPath:historyPath,status:old.status,assertions:old.assertions,passed:old.passed,failed:old.failed,expectedSHA256:old.expectedSHA256,resolution:'C02 clarified delivery-interval revenue and half-open completion counts; transformer input kVA rating maps to output capacity after efficiency. Original mismatch report and snapshots preserved.'};}catch{/* No earlier run in a fresh repository output directory. */}
  const report = { generatedAt: new Date().toISOString(), task: 'Exactly three independent multi-day analytic verification scenarios',
    status: cases.every(c => c.status === 'PASS') && validatorMutationChecks.every(m=>m.detected) ? 'PASS' : 'FAIL', validatorMutationChecks, comparisonHistory:{firstRun,resolvedRun:{status:cases.every(c=>c.status==='PASS')?'PASS':'FAIL',assertions:sum(cases,'assertions'),failed:sum(cases,'failed')}}, tolerance: { kWh: TOLERANCE, kW: TOLERANCE, minutes: TOLERANCE, count: 0, settledCurrencyCents: 0, currencyBinaryRepresentationNoiseCNY: 1e-8, unroundedAnalyticalCNY: TOLERANCE },
    interpretation: 'Analytic implementation verification, not validation against measured equipment or operating records.',
    peakExpectations: 'Derived independently from positive-duration intersection of immutable analytic charge intervals and hour windows, using fixture stage efficiencies; never hourly-energy-as-peak or implementation allocator.',
    zeroFlowConvention: 'An absent physical node/edge/source-hour record is zero only when the oracle expects zero; nonzero expected records must exist.',
    revenueConvention: 'C02: half-open completion intervals; arrival price locked; cumulative delivered-session invoice increments accrued to each delivery interval, including unfinished-session deliveries. Daily/horizon settlement also compared.',
    codeSHA256, runnerSHA256, repo: REPO, expectedPath: EXPECTED, fixturePath: FIXTURES, expectedSHA256: sha(expectedText), fixtureSHA256: sha(fixtureText),
    assertions: sum(cases, 'assertions'), passed: sum(cases, 'passed'), failed: sum(cases, 'failed'), cases };
  const reportPath = join(OUT, 'verification-report.json'); await writeFile(reportPath, JSON.stringify(report, (_k, v) => typeof v === 'number' && !Number.isFinite(v) ? String(v) : v, 2) + '\n');
  process.stdout.write(`Report: ${reportPath}\nOverall ${report.status}: ${report.passed}/${report.assertions}; ${report.failed} failures\n`);
  if (report.status !== 'PASS') process.exitCode = 1;
}
main().catch(error => { process.stderr.write(`${error?.stack ?? error}\n`); process.exitCode = 1; });
