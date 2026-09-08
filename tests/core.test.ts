import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultProject, presetTopology } from '../packages/reference/index.ts';
import { parseProject, migrateProject } from '../packages/schemas/index.ts';
import { replay, simulate } from '../packages/station-engine/index.ts';
import { allocatePower, pathEfficiency, validateEfficiencyBoundaries } from '../packages/electrical-engine/index.ts';
import { breakEven, npv, irr, payback, cashflow } from '../packages/economics-engine/index.ts';
import { EventQueue, Registry, SeededRandom } from '../packages/sim-kernel/index.ts';
import { validateTopology } from '../packages/topology-engine/index.ts';
import { exportWorkbook, importWorkbook, unzipStored } from '../packages/io/index.ts';
const near = (a: number, b: number, tolerance = 1e-6) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
test('XLSX is a real ZIP workbook and preserves exact canonical project', () => { const p = defaultProject(); p.name = '中文 & <test> "quoted"'; const bytes = exportWorkbook(p, replay(p)); assert.equal(bytes[0], 0x50); assert.equal(bytes[1], 0x4b); assert.deepEqual(importWorkbook(bytes), p); const files = unzipStored(bytes); assert.ok(files['xl/workbook.xml'].includes('Hourly_Results')); assert.ok(files['xl/worksheets/sheet11.xml'].includes('SUM(Hourly_Results!D2:D49)')); const corrupt = bytes.slice(); corrupt[100] ^= 1; assert.throws(() => importWorkbook(corrupt)); });
test('source rows retain discrepancy and exact billing', () => { const p = defaultProject(); const r = replay(p); assert.equal(r.totals.deliveredKWh, 77750); assert.equal(r.totals.completed, 195); const a = r.hours.filter(h => h.station === 'A'); assert.equal(a.reduce((s, h) => s + h.chargeCount, 0), 36); p.billing = 'SOURCE_DISPLAY_PRICE'; near(replay(p).totals.revenue, 68912.9); assert.equal(p.services[0].idleRaw, null); });
test('schema round trip and migration are deterministic; reject duplicate hours and unsupported version', () => { const p = defaultProject(); assert.deepEqual(parseProject(JSON.parse(JSON.stringify(p))), p); assert.deepEqual(migrateProject({ ...p, schemaVersion: '1.0' }), p); assert.throws(() => parseProject({ ...p, schemaVersion: '2.0' })); p.services[0] = p.services[1]; assert.throws(() => parseProject(p)); });
test('kernel deterministic RNG, stable event order and registry isolation', () => { const a = new SeededRandom(7), b = new SeededRandom(7); for (let i = 0; i < 30; i++)
    assert.equal(a.next(), b.next()); const q = new EventQueue<string>(); q.schedule(1, 'a'); q.schedule(1, 'b'); assert.deepEqual(q.takeThrough(1).map(e => e.payload), ['a', 'b']); const r = new Registry<{
    type: string;
}>(); r.register({ type: 'new-battery' }); assert.throws(() => r.register({ type: 'new-battery' })); });
test('efficiency assembly matches independent fixture and rejects double counting', () => { const p = defaultProject(); p.efficiency.mode = 'ASSEMBLY'; near(pathEfficiency(p, 'sst'), .9556888, 1e-9); near(pathEfficiency(p, 'pcs'), .930657, 1e-9); assert.throws(() => validateEfficiencyBoundaries([{ includedStages: ['DD', 'cable'] }, { includedStages: ['DD'] }]), /OVERLAP/); });
test('valid preset; AC/DC errors and directed loops rejected', () => { const t = presetTopology(); assert.deepEqual(validateTopology(t), []); t.edges.push({ id: 'bad', source: 'A-grid', target: 'A-bus', enabled: true }); assert.ok(validateTopology(t).some(d => d.code === 'PORT_DOMAIN')); t.edges.push({ id: 'loop', source: 'A-charger', target: 'A-bus', enabled: true }); assert.ok(validateTopology(t).some(d => d.code === 'UNSUPPORTED_LOOP')); });
test('shared upstream grid cap and open edge constrain delivered power', () => { const p = defaultProject(); p.topology.nodes.find(n => n.id === 'A-grid')!.params.kva = 1000; p.topology.nodes.find(n => n.id === 'A-grid')!.params.pf = 1; const r = allocatePower(p, [{ sink: 'A-charger', kw: 1000 }, { sink: 'B-charger', kw: 1000 }]); assert.ok(r.reduce((s, a) => s + a.grid, 0) <= 1000 + 1e-8); for (const a of r)
    near(a.grid, a.delivered + a.loss); p.topology.edges.forEach(e => e.enabled = false); assert.equal(allocatePower(p, [{ sink: 'A-charger', kw: 1000 }])[0].delivered, 0); });
test('financial analytic fixtures and no-root states', () => { const be = breakEven(4500, .3)!; assert.equal(be.energy, 15000); assert.equal(be.swaps, 37); assert.equal(be.energyFirst, 59); assert.equal(be.integerFirst, 60); assert.equal(breakEven(4500, 0), null); near(npv([-1000, 600, 600], .1), 41.3223140496); near(irr([-1000, 600, 600]).rate!, .1306623863); near(payback([-1000, 600, 600])!, 1 + 400 / 600); assert.equal(irr([1, 2]).status, 'no-root'); assert.equal(irr([-1, 3, -1]).status, 'multiple-sign-changes'); assert.equal(payback([-100, 10]), null); assert.equal(cashflow(defaultProject(), 100, 50, 100), null); });
test('constrained simulation conserves energy, bounds inventory and is reproducible', () => { const p = defaultProject(); p.mode = 'CONSTRAINED'; const a = simulate(p), b = simulate(p); assert.deepEqual(a, b); assert.ok(a.totals.maxBalanceResidual < .01); assert.ok(a.totals.deliveredKWh <= a.totals.requestedKWh + 1e-8); for (const h of a.hours) {
    assert.ok(h.ready >= 0 && h.ready <= 24);
    assert.ok(h.queue >= 0);
    assert.ok(h.gridKWh >= 0);
} near(a.totals.gridKWh, a.totals.lossKWh + a.hours.reduce((s, h) => s + h.auxiliaryKWh, 0) + a.totals.deliveredKWh + a.totals.finalStoredKWh - a.totals.initialStoredKWh, .01); });
test('no supply does not create charged batteries; shortage remains unserved', () => { const p = defaultProject(); p.mode = 'CONSTRAINED'; p.topology.edges.forEach(e => e.enabled = false); p.station.A.auxiliaryKW = 0; p.station.B.auxiliaryKW = 0; const r = simulate(p); assert.equal(r.totals.gridKWh, 0); assert.ok(r.totals.unservedKWh > 0); assert.ok(r.totals.deliveredKWh <= 48 * 410 + 1e-6); assert.ok(r.totals.maxBalanceResidual < .01); });

// Supplement numeric checks use independent expected values, never screenshot rounding as physics.
import {engineeringProject, engineeringTopology, physicalProjection, capacityCase} from '../packages/engineering/index.ts';
test('supplement reconciles exact energy, AC allocation, concurrency and gun current limits',()=>{
 const p=engineeringProject();p.phase=2;p.topology=engineeringTopology(p);const v=capacityCase(p);
 near(v.energy,410.4);near(v.hourlyBattery,3283.2);near(v.hourlyDD,3370.841889117);near(v.sstDeficit,10.841889117);
 near(v.transformerOutput,2425.5);near(v.ac,770);near(v.pcsInput,1655.5);near(v.pcsOutput,1622.39);
 near(v.residuals[2].residual,779.679527721);near(v.residuals[2].configured,1299.465879535);
 near(v.gunLimit,382.536);near(v.concurrency[0].request,1728);assert.ok(v.concurrency[0].deficit>0);
 const original=defaultProject();assert.equal(replay(original).totals.requestedKWh,77750);
 near(physicalProjection(p).services[0].swapKWh,3283.2);near(replay(physicalProjection(p)).totals.requestedKWh,77801.2);
});
test('detailed topology retains individual SSTs, racks, guns, AC source ownership and schema migration',()=>{
 const p=engineeringProject(),n=p.topology.nodes;assert.deepEqual(validateTopology(p.topology),[]);
 assert.equal(n.filter(n=>n.type==='rack').length,16);assert.equal(n.filter(n=>n.type==='gun').length,8);
 assert.equal(n.filter(n=>n.type==='terminal').length,4);assert.equal(n.filter(n=>n.type==='sst'&&n.enabled).length,2);
 p.phase=2;p.topology=engineeringTopology(p);assert.equal(p.topology.nodes.filter(n=>n.type==='sst'&&n.enabled).length,4);
 const allocation=allocatePower(p,[{sink:'B-rack-0',kw:100}])[0];near(allocation.sourceImport['A-grid'],allocation.grid);assert.equal(allocation.sourceImport['B-grid'],undefined);
 assert.deepEqual(importWorkbook(exportWorkbook(p,replay(p))),p);
 const old=defaultProject();assert.deepEqual(migrateProject({...old,schemaVersion:'1.1'}),old);
});
test('box transformer and shared stack boundaries constrain concurrent branch demand',()=>{
 const p=engineeringProject();p.phase=2;p.topology=engineeringTopology(p);p.engineering!.intertie=false;p.topology=engineeringTopology(p);
 const a=allocatePower(p,[{sink:'A-passenger',kw:550},{sink:'A-swap-bay',kw:200},{sink:'A-sst-aux',kw:20},{sink:'A-bus-pcs',kw:3000}]);
 near(a[3].delivered,1622.39);near(a.reduce((s,x)=>s+x.grid,0),2475);
 // Test gun V*I and total stack cap at 800 V with ample PCS supply.
 p.topology.nodes.filter(n=>n.type==='gun').forEach(n=>n.params.vehicleVoltage=800);
 const guns=allocatePower(p,[0,1,2,3].map(i=>({sink:`A-gun-${i}`,kw:480})));
 near(guns.reduce((s,x)=>s+x.delivered,0),1440);assert.ok(guns.every(x=>x.delivered<=480));
 p.topology.nodes.find(n=>n.id==='A-gun-0')!.enabled=false;
 near(allocatePower(p,[{sink:'A-gun-0',kw:480}])[0].delivered,0);
 p.topology.nodes.find(n=>n.id==='A-rack-0')!.enabled=false;
 near(allocatePower(p,[{sink:'A-rack-0',kw:560}])[0].delivered,0);
});
test('DC intertie shares capacity without adding power or shorting AC sources',()=>{
 const p=engineeringProject();p.topology.nodes.find(n=>n.id==='A-pcs')!.enabled=false;
 const shared=allocatePower(p,[{sink:'A-gun-0',kw:300}])[0];assert.ok(shared.delivered>0);assert.ok(shared.sourceImport['B-grid']>0);
 p.topology.edges.filter(e=>e.source.includes('tie-')||e.target.includes('tie-')).forEach(e=>e.enabled=false);
 near(allocatePower(p,[{sink:'A-gun-0',kw:300}])[0].delivered,0);
});
test('detailed physical case conserves energy and disabled guns cannot serve jobs',()=>{
 const p=physicalProjection(engineeringProject());p.topology.nodes.filter(n=>n.type==='gun').forEach(n=>n.enabled=false);
 const r=simulate(p);assert.ok(r.totals.maxBalanceResidual<.01);assert.ok(r.transactions.filter(t=>t.kind==='charge').every(t=>t.start===null&&t.deliveredKWh===0));
 const full=simulate(physicalProjection(engineeringProject()));assert.ok(full.totals.maxBalanceResidual<.01);assert.ok(full.totals.gridKWh>0);
 assert.ok(full.transactions.filter(t=>t.kind==='charge'&&t.start!==null).every(t=>t.equipmentId?.includes('-gun-')));
 assert.deepEqual(full,simulate(physicalProjection(engineeringProject())));
});
