import type { Equipment, Project } from '../contracts/index.ts';
import { equipmentEfficiency } from '../equipment-efficiency/index.ts';
import { outputCapacity, type PowerAllocation } from '../electrical-engine/index.ts';

export const sourceTypes = new Set(['grid', 'pv-source', 'storage-source', 'ups-source']);
export interface NetworkPolicy {
  /** Total input required for the node's aggregate output, including conversion losses. */
  inputForOutput?: (node: Equipment, outputKW: number) => number;
  capacity?: (node: Equipment) => number;
  inputCapacity?: (node: Equipment) => number;
  withinLimits?: (node:Equipment,outputKW:number,inputKW:number)=>boolean;
  sourceRank?: (node: Equipment) => number;
  /** Optional input/output pair exclusion, used for isolated ATS and sharing matrices. */
  routeAllowed?: (nodes: Equipment[]) => boolean;
}
type Route = { nodes: Equipment[]; edges: string[] };
function supplyRoutes(p: Project, sink: string, policy: NetworkPolicy): Route[] {
  const byId = new Map(p.topology.nodes.map(n => [n.id, n]));
  const parents = new Map<string, typeof p.topology.edges>();
  for (const e of p.topology.edges) if (e.enabled) parents.set(e.target, [...(parents.get(e.target) ?? []), e]);
  const result: Route[] = [];
  function visit(id: string, tail: Equipment[], edges: string[]) {
    const n = byId.get(id);
    if (!n?.enabled || tail.some(x => x.id === id)) return;
    const nodes = [n, ...tail];
    if (sourceTypes.has(n.type)) {
      if (!policy.routeAllowed || policy.routeAllowed(nodes)) result.push({ nodes, edges });
      if (result.length > 4096) throw Error('PATH_LIMIT_EXCEEDED');
      return;
    }
    for (const e of parents.get(id) ?? []) visit(e.source, nodes, [e.id, ...edges]);
  }
  visit(sink, [], []);
  return result.sort((a, b) => (policy.sourceRank?.(a.nodes[0]) ?? 0) - (policy.sourceRank?.(b.nodes[0]) ?? 0) || a.nodes.length - b.nodes.length);
}

/** Aggregate nonlinear backward allocation. A second customer pays only the
 * marginal node input; cable I²R is evaluated at total current, never per job.
 * Unknown/invalid models throw before an allocation is committed. */
export function allocateDetailedPower(p: Project, requests: { sink: string; kw: number; absorbedAsLoss?: boolean }[], policy: NetworkPolicy = {}): PowerAllocation[] {
  const outputs = new Map<string, number>();
  const inputs = new Map<string, number>();
  const modelInput = (n: Equipment, out: number) => {
    const input = policy.inputForOutput ? policy.inputForOutput(n, out) : out / equipmentEfficiency(p, n);
    if (Number.isNaN(input) || input < out - 1e-7) throw Error(`INVALID_INPUT_MODEL:${n.id}`);
    return input;
  };
  const routes = new Map<string, Route[]>();
  return requests.map(request => {
    if (!Number.isFinite(request.kw) || request.kw < 0) throw Error('INVALID_POWER_REQUEST');
    if(request.absorbedAsLoss && sourceTypes.has(p.topology.nodes.find(n=>n.id===request.sink)?.type??''))throw Error('SOURCE_CANNOT_BE_LOSS_SINK');
    let remaining = request.kw;
    const result: PowerAllocation = { sink: request.sink, requested: request.kw, delivered: 0, grid: 0, loss: 0, sourceImport: {}, nodeFlows: [], edgeFlows: [] };
    if (!routes.has(request.sink)) routes.set(request.sink, supplyRoutes(p, request.sink, policy));
    for (const route of routes.get(request.sink)!) {
      if (remaining < 1e-9) break;
      if(route.nodes.some((n,i)=>!(request.absorbedAsLoss&&i===route.nodes.length-1)&&(policy.capacity?.(n)??outputCapacity(p,n))-(outputs.get(n.id)??0)<1e-8))continue;
      const evaluate = (delivered: number) => {
        let delta = delivered, feasible = true;
        const flows: PowerAllocation['nodeFlows'] = [], edges: PowerAllocation['edgeFlows'] = [];
        for (let i = route.nodes.length - 1; i >= 0; i--) {
          const n = route.nodes[i], isLoss = !!request.absorbedAsLoss && i === route.nodes.length - 1;
          const outDelta = isLoss ? 0 : delta, before = outputs.get(n.id) ?? 0, after = before + outDelta;
          const input = isLoss ? delivered : modelInput(n, after) - modelInput(n, before);
          const newInput = (inputs.get(n.id) ?? 0) + input;
          if (!Number.isFinite(input)) return { feasible:false, flows:[], edges:[], source:Infinity };
          if (input < -1e-7) throw Error(`NONMONOTONE_INPUT_MODEL:${n.id}`);
          const cap = policy.capacity?.(n) ?? outputCapacity(p, n);
          const inputCap = policy.inputCapacity?.(n) ?? (n.type === 'transformer' ? n.params.kva * n.params.pf : Infinity);
          if(Number.isNaN(cap)||cap<0||Number.isNaN(inputCap)||inputCap<0)throw Error(`INVALID_CAPACITY_MODEL:${n.id}`);
          if (!Number.isFinite(input) || after > cap + 1e-9 || newInput > inputCap + 1e-9) feasible = false;
          if(policy.withinLimits&&!policy.withinLimits(n,after,newInput))feasible=false;
          flows.unshift({ nodeId: n.id, inputKW: input, outputKW: outDelta, lossKW: input - outDelta, terminalKW: i === route.nodes.length - 1 && !isLoss ? outDelta : 0 });
          if (i > 0) edges.unshift({ edgeId: route.edges[i - 1], source: route.nodes[i - 1].id, target: n.id, kw: input });
          delta = input;
        }
        return { feasible, flows, edges, source: delta };
      };
      let delivered = remaining, accepted = evaluate(delivered);
      if (!accepted.feasible) {
        let lo = 0, hi = delivered;
        for (let i = 0; i < 48; i++) { const mid = (lo + hi) / 2; if (evaluate(mid).feasible) lo = mid; else hi = mid; }
        delivered = lo;
        accepted = evaluate(delivered);
      }
      if (delivered < 1e-9) continue;
      for (const f of accepted.flows) {outputs.set(f.nodeId, (outputs.get(f.nodeId) ?? 0) + f.outputKW);inputs.set(f.nodeId,(inputs.get(f.nodeId)??0)+f.inputKW);}
      result.nodeFlows.push(...accepted.flows); result.edgeFlows.push(...accepted.edges);
      const source = route.nodes[0].id;
      result.sourceImport[source] = (result.sourceImport[source] ?? 0) + accepted.source;
      result.grid += accepted.source; result.delivered += delivered;
      remaining = Math.max(0, remaining - delivered);
    }
    result.loss = result.grid - (request.absorbedAsLoss ? 0 : result.delivered);
    return result;
  });
}
