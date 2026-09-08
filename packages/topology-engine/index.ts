import type { Diagnostic, Project, Topology } from '../contracts/index.ts';
import { equipmentRegistry } from '../../plugins/equipment/index.ts';
export function validateTopology(topology: Topology): Diagnostic[] {
    const d: Diagnostic[] = [];
    const nodes = new Map(topology.nodes.map(n => [n.id, n]));
    if (nodes.size !== topology.nodes.length)
        d.push({ code: 'DUPLICATE_NODE', severity: 'error', message: '設備 ID 重複' });
    if (new Set(topology.edges.map(e => e.id)).size !== topology.edges.length)
        d.push({ code: 'DUPLICATE_EDGE', severity: 'error', message: '連線 ID 重複' });
    for (const n of nodes.values()) {
        try {
            const p = equipmentRegistry.get(n.type);
            for (const field of p.parameters) {
                const v = n.params[field.key];
                if (!Number.isFinite(v) || v < field.min || v > field.max)
                    d.push({ code: 'INVALID_PARAMETER', severity: 'error', message: `${n.id}: ${field.label} 超出範圍`, target: n.id });
            }
        }
        catch {
            d.push({ code: 'UNKNOWN_PLUGIN', severity: 'error', message: `未註冊設備 ${n.type}`, target: n.id });
        }
    }
    for (const edge of topology.edges) {
        const a = nodes.get(edge.source), b = nodes.get(edge.target);
        if (!a || !b) {
            d.push({ code: 'MISSING_NODE', severity: 'error', message: `${edge.id} 缺少端點` });
            continue;
        }
        if (!edge.enabled || !a.enabled || !b.enabled)
            continue;
        try {
            const out = equipmentRegistry.get(a.type).ports(a).find(p => p.direction === 'output'), input = equipmentRegistry.get(b.type).ports(b).find(p => p.direction === 'input');
            if (!out || !input || out.domain !== input.domain)
                d.push({ code: 'PORT_DOMAIN', severity: 'error', message: `${a.id} → ${b.id} AC/DC 或方向不相容` });
            else if (Math.abs(out.voltage - input.voltage) / input.voltage > Math.max(out.tolerance, input.tolerance))
                d.push({ code: 'PORT_VOLTAGE', severity: 'error', message: `${a.id} → ${b.id} 電壓不相容` });
        }
        catch { /* already reported */ }
    }
    const active = topology.edges.filter(e => e.enabled && nodes.get(e.source)?.enabled && nodes.get(e.target)?.enabled);
    const visited = new Set<string>(), visiting = new Set<string>();
    function cycle(id: string): boolean { if (visiting.has(id))
        return true; if (visited.has(id))
        return false; visiting.add(id); for (const e of active.filter(e => e.source === id))
        if (cycle(e.target))
            return true; visiting.delete(id); visited.add(id); return false; }
    if ([...nodes.keys()].some(cycle))
        d.push({ code: 'UNSUPPORTED_LOOP', severity: 'error', message: '目前求解器支援有向無環供電路徑；閉合環路須另配並聯控制模型' });
    return d;
}
export function sourceDiagnostics(p: Project): Diagnostic[] { return [{ code: 'SOURCE_TOTAL_MISMATCH', severity: 'warning', message: 'A 區原圖充電總計 35 次 / 12,430 kWh；逐列 36 次 / 14,480 kWh，差額等於 12 時一列。' }, { code: 'SOURCE_AMBIGUITY', severity: 'warning', message: 'A 12 時 1 次 / 2,050 kWh 與「閒」欄語意未确认；原值保留。' }, ...(p.finance.capex === null || p.finance.fixedDaily === null ? [{ code: 'MISSING_COST', severity: 'warning' as const, message: 'CAPEX / 固定成本尚未填妥；不能判定真實獲利。' }] : [])]; }
