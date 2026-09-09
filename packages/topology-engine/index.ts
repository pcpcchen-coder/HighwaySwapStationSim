import type { Diagnostic, Project, Topology } from '../contracts/index.ts';
import { supportsEfficiency } from '../equipment-efficiency/index.ts';
import { equipmentRegistry } from '../../plugins/equipment/index.ts';
export function validateTopology(topology: Topology): Diagnostic[] {
    const d: Diagnostic[] = [];
    const nodes = new Map(topology.nodes.map(n => [n.id, n]));
    if (nodes.size !== topology.nodes.length)
        d.push({ code: 'DUPLICATE_NODE', severity: 'error', message: '設備 ID 重複' });
    if (new Set(topology.edges.map(e => e.id)).size !== topology.edges.length)
        d.push({ code: 'DUPLICATE_EDGE', severity: 'error', message: '連線 ID 重複' });
    for (const n of nodes.values()) {
        if (n.params.efficiency !== undefined && (!supportsEfficiency(n.type) || !Number.isFinite(n.params.efficiency) || n.params.efficiency <= 0 || n.params.efficiency > 1))
            d.push({code:'INVALID_EFFICIENCY',severity:'error',message:`${n.id}: 個別效率須為 0 < η ≤ 1，且僅支援轉換設備`,target:n.id});
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
    // Independent AC networks may meet only after isolated conversion onto DC.
    function ancestors(id:string,seen=new Set<string>()):Set<string>{if(seen.has(id))return new Set();seen.add(id);const n=nodes.get(id);if(n?.type==='grid')return new Set([id]);const all=new Set<string>();for(const e of active.filter(e=>e.target===id))for(const source of ancestors(e.source,new Set(seen)))all.add(source);return all;}
    for(const n of nodes.values()){
        if(!n.enabled)continue;let ports;try{ports=equipmentRegistry.get(n.type).ports(n);}catch{continue;}
        if(ports.some(p=>p.domain==='AC')&&ancestors(n.id).size>1)d.push({code:'UNSUPPORTED_AC_PARALLEL',severity:'error',target:n.id,message:`${n.id} 連到多個獨立 AC 電網；目前不支援 AC 並聯控制。`});
        if(['rack','gun'].includes(n.type)){
            function bypass(id:string,hasDD=false,seen=new Set<string>()):boolean{if(seen.has(id))return false;seen.add(id);const x=nodes.get(id);if(x?.type==='charger')hasDD=true;if(x?.type==='grid')return !hasDD;return active.filter(e=>e.target===id).some(e=>bypass(e.source,hasDD,new Set(seen)));}
            if(bypass(n.id))d.push({code:'MISSING_DD_STAGE',severity:'error',target:n.id,message:`${n.id} 的供電路徑繞過 DD 充電機，禁止直接母線接電池／槍。`});
        }
    }
    return d;
}
export function sourceDiagnostics(p: Project): Diagnostic[] { return [{ code: 'SOURCE_TOTAL_MISMATCH', severity: 'warning', message: 'A 區原圖充電總計 35 次 / 12,430 kWh；逐列 36 次 / 14,480 kWh，差額等於 12 時一列。' }, { code: 'SOURCE_AMBIGUITY', severity: 'warning', message: 'A 12 時 1 次 / 2,050 kWh 與「閒」欄語意未确认；原值保留。' }, ...(p.finance.capex === null || p.finance.fixedDaily === null ? [{ code: 'MISSING_COST', severity: 'warning' as const, message: 'CAPEX / 固定成本尚未填妥；不能判定真實獲利。' }] : [])]; }
