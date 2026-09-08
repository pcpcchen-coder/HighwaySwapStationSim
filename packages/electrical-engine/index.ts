import type { Project, Equipment, Topology } from '../contracts/index.ts';
import { equipmentRegistry } from '../../plugins/equipment/index.ts';
export function pathEfficiency(p: Project, path: 'sst' | 'pcs') { const e = p.efficiency; return e.mode === 'SOURCE_CHAIN' ? (path === 'sst' ? e.sstSource : e.pcsSource) : (path === 'sst' ? e.sst * e.charger : e.transformer * e.pcs * e.charger); }
export function compareEfficiency(p: Project, deliveredKWh = 10000) { const sst = pathEfficiency(p, 'sst'), pcs = pathEfficiency(p, 'pcs'); return { sst, pcs, percentagePoints: (sst - pcs) * 100, purchaseSavingPercent: (1 - pcs / sst) * 100, sstInputKWh: deliveredKWh / sst, pcsInputKWh: deliveredKWh / pcs }; }
export function validateEfficiencyBoundaries(boundaries: {
    includedStages: string[];
}[]) { const seen = new Set<string>(); for (const b of boundaries)
    for (const stage of b.includedStages) {
        if (seen.has(stage))
            throw Error('EFFICIENCY_BOUNDARY_OVERLAP');
        seen.add(stage);
    } }
function routes(topology: Topology, sink: string): Equipment[][] { const nodes = new Map(topology.nodes.map(n => [n.id, n])); const result: Equipment[][] = []; function visit(id: string, path: Equipment[]) { const node = nodes.get(id); if (!node?.enabled || path.some(n => n.id === id) || result.length >= 64)
    return; const next = [node, ...path]; if (node.type === 'grid') {
    result.push(next);
    return;
} for (const e of topology.edges.filter(e => e.enabled && e.target === id))
    visit(e.source, next); } visit(sink, []); return result; }
export interface PowerAllocation {
    sink: string;
    requested: number;
    delivered: number;
    grid: number;
    loss: number;
    sourceImport: Record<string, number>;
}
/** Output capacities are shared across every path through a node in this step. */
export function allocatePower(p: Project, requests: {
    sink: string;
    kw: number;
}[]): PowerAllocation[] {
    const used = new Map<string, number>();
    return requests.map(request => {
        let remaining = request.kw, grid = 0;
        const sourceImport: Record<string, number> = {};
        for (const path of routes(p.topology, request.sink)) {
            if (remaining <= 1e-10)
                break;
            const hasSST = path.some(n => n.type === 'sst');
            const efficiencies = path.map(n => { if (p.efficiency.mode === 'SOURCE_CHAIN')
                return n.type === 'charger' ? pathEfficiency(p, hasSST ? 'sst' : 'pcs') : 1; return ({ sst: p.efficiency.sst, pcs: p.efficiency.pcs, transformer: p.efficiency.transformer, charger: p.efficiency.charger } as Record<string, number>)[n.type] ?? 1; });
            let suffix = 1;
            const factors: number[] = [];
            for (let i = path.length - 1; i >= 0; i--) {
                factors[i] = 1 / suffix;
                suffix *= efficiencies[i];
            }
            let delivered = remaining;
            path.forEach((n, i) => { const capacity = equipmentRegistry.get(n.type).capacity(n); delivered = Math.min(delivered, Math.max(0, capacity - (used.get(n.id) ?? 0)) / factors[i]); });
            if (delivered <= 0)
                continue;
            path.forEach((n, i) => used.set(n.id, (used.get(n.id) ?? 0) + delivered * factors[i]));
            const imported = delivered / suffix;
            grid += imported;
            sourceImport[path[0].id] = (sourceImport[path[0].id] ?? 0) + imported;
            remaining -= delivered;
        }
        const delivered = request.kw - remaining;
        return { sink: request.sink, requested: request.kw, delivered, grid, loss: grid - delivered, sourceImport };
    });
}
