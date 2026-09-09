import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true },
});

after(async () => {
  await vite.close();
});

async function readCssTree(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const contents = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return readCssTree(entryPath);
      }
      return entry.name.endsWith(".css") ? readFile(entryPath, "utf8") : "";
    }),
  );
  return contents.join("\n");
}

test("emits the catalog's animation and scrolling utilities", async () => {
  const css = await readCssTree(path.join(root, "dist"));

  assert.match(css, /--tw-enter-opacity/);
  assert.match(css, /scrollbar-width:\s*thin/);
  assert.match(css, /scrollbar-width:\s*none/);
  assert.match(css, /scrollbar-gutter:\s*stable/);
  assert.match(css, /scroll-fade-reveal-b/);
  assert.match(css, /mask-image:/);
  assert.match(css, /tw-shimmer/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test("forwards progress semantics to the primitive", async () => {
  const { Progress } = await vite.ssrLoadModule("/components/ui/progress.tsx");
  const html = renderToStaticMarkup(React.createElement(Progress, { value: 37 }));

  assert.match(html, /aria-valuenow="37"/);
  assert.match(html, /aria-valuetext="37%"/);
  assert.match(html, /data-state="loading"/);
});

test("emits chart themes for the starter's media dark mode", async () => {
  const { ChartStyle } = await vite.ssrLoadModule("/components/ui/chart.tsx");
  const html = renderToStaticMarkup(
    React.createElement(ChartStyle, {
      id: "contract",
      config: {
        latency: { theme: { light: "#ffffff", dark: "#000000" } },
      },
    }),
  );

  assert.match(html, /\[data-chart=contract\]/);
  assert.match(html, /@media \(prefers-color-scheme: dark\)/);
  assert.doesNotMatch(html, /\.dark/);
});

test("renders sidebar skeletons deterministically", async () => {
  const { SidebarMenuSkeleton } = await vite.ssrLoadModule(
    "/components/ui/sidebar.tsx",
  );
  const first = renderToStaticMarkup(React.createElement(SidebarMenuSkeleton));
  const second = renderToStaticMarkup(React.createElement(SidebarMenuSkeleton));

  assert.equal(first, second);
  assert.match(first, /--skeleton-width:70%/);
});

test("flow explorer renders every engineering node and edge, with accessible time controls and unavailable replay data", async () => {
  const { FlowExplorer } = await vite.ssrLoadModule('/components/simulator/flow-explorer.tsx');
  const { engineeringProject } = await import('../packages/engineering/index.ts');
  const { replay } = await import('../packages/station-engine/index.ts');
  const html = renderToStaticMarkup(React.createElement(FlowExplorer, { result: replay(engineeringProject()) }));
  assert.equal((html.match(/data-node=/g) ?? []).length,92);
  assert.equal((html.match(/data-edge=/g) ?? []).length,96);
  for(const id of ['A-rack-0','B-rack-7','A-gun-0','B-gun-3','A-passenger','B-swap-bay']) assert.ok(html.includes(`data-node="${id}"`),id);
  assert.match(html,/尚無可驗算的功率記錄/);
  assert.match(html,/模擬時間軸（分鐘）/);
  assert.match(html,/role="slider"/);
  assert.match(html,/輸入 —/);
});

test("flow explorer renders actual constrained values and retains all JSON export and node audit controls", async () => {
  const { FlowExplorer, flowTime } = await vite.ssrLoadModule('/components/simulator/flow-explorer.tsx');
  const { verificationCases } = await import('../packages/verification/cases.ts');
  const { simulate } = await import('../packages/station-engine/index.ts');
  const html=renderToStaticMarkup(React.createElement(FlowExplorer,{result:simulate(verificationCases()[1].project)}));
  assert.doesNotMatch(html,/尚無可驗算的功率記錄/);
  assert.match(html,/逐項守恆/);assert.match(html,/匯出全圖數值 JSON/);
  assert.match(html,/功率積分/);assert.match(html,/10\.20 kW/);
  assert.equal(flowTime(.125),'D1 00:00:07.500');assert.equal(flowTime(1440),'D2 00:00:00.000');
});

test("cumulative summary renders physical boundary totals in kWh and explains intermediate transfer exclusion", async () => {
  const { FlowSummary }=await vite.ssrLoadModule('/components/simulator/flow-explorer.tsx');
  const { verificationCases }=await import('../packages/verification/cases.ts');
  const { simulate }=await import('../packages/station-engine/index.ts');
  const { flowView }=await import('../packages/power-trace/index.ts');
  const view=flowView(simulate(verificationCases()[1].project),1445,'cumulative',1435);
  const html=renderToStaticMarkup(React.createElement(FlowSummary,{view}));
  assert.match(html,/累計總輸入（電網）/);assert.match(html,/累計總輸出（末端）/);assert.match(html,/累計總損耗/);
  assert.match(html,/3\.40/);assert.match(html,/3\.33/);assert.match(html,/0\.07/);assert.match(html,/kWh/);assert.match(html,/避免中間設備逐級加總而重複計量/);
});

test("demand editor renders current draft values, import/export, arrival controls and source billing fields",async()=>{
 const { ServicePanel }=await vite.ssrLoadModule('/components/simulator/service-panel.tsx');
 const { engineeringProject }=await import('../packages/engineering/index.ts');
 const p=engineeringProject();p.billing='SOURCE_DISPLAY_PRICE';p.arrival='SEEDED';p.services[0].chargeCount=7;
 const html=renderToStaticMarkup(React.createElement(ServicePanel,{project:p,setProject:()=>{}}));
 for(const text of ['匯入需求 CSV / JSON','匯出需求 CSV','匯出需求 JSON','每小時到站方式','隨機種子','本日換電量依 SOC 重算','來源換電總價','來源充電總價','不必先測算','SOC'])assert.ok(html.includes(text),text);
 assert.match(html,/aria-label="第 1 天 A 區 0 時 充電車次"[^>]*value="7"/);assert.match(html,/accept=".csv,.json"/);
});

test('equipment settings render individual overrides, inheritance, scope and current draft exports',async()=>{
 const { EquipmentTransfer,NodeEfficiencyEditor,EquipmentEfficiencyTable }=await vite.ssrLoadModule('/components/simulator/equipment-settings.tsx');
 const { engineeringProject }=await import('../packages/engineering/index.ts');const p=engineeringProject(),node=p.topology.nodes.find(n=>n.id==='A-sst-0');node.params.efficiency=.91;
 const props={project:p,setProject:()=>{}};const html=renderToStaticMarkup(React.createElement(EquipmentTransfer,props));for(const text of ['匯入設備 JSON / CSV','匯出整套設備 JSON','匯出設備參數 CSV','保留目前需求','停機排程','目前草稿'])assert.ok(html.includes(text),text);
 const custom=renderToStaticMarkup(React.createElement(NodeEfficiencyEditor,{...props,node}));assert.match(custom,/value="91"/);assert.match(custom,/checked/);
 const inherited=renderToStaticMarkup(React.createElement(NodeEfficiencyEditor,{...props,node:p.topology.nodes.find(n=>n.id==='B-sst-0')}));assert.match(inherited,/沿用全域效率/);assert.match(inherited,/98\.0000%/);
 p.efficiency.transformer=0;const invalid=renderToStaticMarkup(React.createElement(EquipmentEfficiencyTable,props));assert.match(invalid,/參數待修正/);
});


test("financial setup and independent case launchers remain available before the first run",async()=>{
 const { FinancePanel }=await vite.ssrLoadModule('/components/simulator/panels.tsx');
 const { VerificationPanel }=await vite.ssrLoadModule('/components/simulator/verification.tsx');
 const { engineeringProject,physicalProjection }=await import('../packages/engineering/index.ts');
 const project=physicalProjection(engineeringProject());
 const html=renderToStaticMarkup(React.createElement(FinancePanel,{project,setProject:()=>{},result:null}));
 for(const label of ['初始投資 CAPEX','每日固定成本','尚未測算','載入財務示範值'])assert.ok(html.includes(label),label);
 assert.doesNotMatch(html,/日已結算收入|假設投資淨現值 NPV/);
 const cases=renderToStaticMarkup(React.createElement(VerificationPanel,{result:null,busy:false,onRun:()=>{}}));
 assert.equal((cases.match(/>載入並測算<\/button>/g)??[]).length,3);
 assert.match(cases,/尚無與三個固定驗證輸入完全相同的結果快照/);
});


test("SOC controls expose percentages per station and capacity summaries follow the applied window",async()=>{
 const { StationPanel }=await vite.ssrLoadModule('/components/simulator/panels.tsx');
 const { EngineeringPanel }=await vite.ssrLoadModule('/components/simulator/facility.tsx');
 const { SocRangeEditor }=await vite.ssrLoadModule('/components/simulator/soc-settings.tsx');
 const { engineeringProject,physicalProjection }=await import('../packages/engineering/index.ts');
 const { applyStationSOC }=await import('../packages/station-settings/index.ts');
 const p=applyStationSOC(physicalProjection(engineeringProject()),'A',.2,.8);
 const props={project:p,setProject:()=>{}};
 for(const Component of [StationPanel,EngineeringPanel]){
  const html=renderToStaticMarkup(React.createElement(Component,props));
  for(const label of ['A 區回收 SOC 下限','A 區交付 SOC 上限','B 區回收 SOC 下限','B 區交付 SOC 上限','套用 A 區 SOC 並同步全期換電需求','套用 B 區 SOC 並同步全期換電需求','307.8000','410.4000'])assert.ok(html.includes(label),label);
  assert.doesNotMatch(html,/Ready SOC|回收 SOC <small>0–1/);
 }
 const capacity=renderToStaticMarkup(React.createElement(EngineeringPanel,props));
 assert.match(capacity,/2,528\.13/);assert.match(capacity,/連續補電餘量/);assert.doesNotMatch(capacity,/3370\.84/);
 const invalid={...p,station:{...p.station,A:{...p.station.A,returnSOC:.9,readySOC:.8}}};
 const html=renderToStaticMarkup(React.createElement(SocRangeEditor,{...props,project:invalid,station:'A'}));
 assert.match(html,/role="alert"/);assert.match(html,/disabled/);assert.doesNotMatch(html,/每次補電預覽/);
});


test('complete settings expose nullable fields, explicit apply and both exchange formats',async()=>{
 const {DetailedSettingsPanel}=await vite.ssrLoadModule('/components/simulator/detailed-settings.tsx');
 const {completeProject}=await vite.ssrLoadModule('/packages/detailed-model/project.ts');
 const html=renderToStaticMarkup(React.createElement(DetailedSettingsPanel,{project:completeProject(),setProject:()=>{}}));
 for(const text of ['完整模型設定','套用並重建設備連接','匯入完整模型 JSON／CSV','匯出本頁草稿 CSV','待填','物理測算必要資料'])assert.ok(html.includes(text),text);
});
test('complete finance separates missing costs and actual cross-month billing in immutable results',async()=>{
 const {DetailedFinancePanel}=await vite.ssrLoadModule('/components/simulator/detailed-finance-panel.tsx');
 const {v04Project,v06Project}=await vite.ssrLoadModule('/packages/detailed-verification/index.ts');
 const {simulateDetailed}=await vite.ssrLoadModule('/packages/detailed-model/engine.ts');
 const missing=renderToStaticMarkup(React.createElement(DetailedFinancePanel,{result:simulateDetailed(v04Project())}));assert.match(missing,/尚未確認/);assert.match(missing,/待處理/);
 const complete=renderToStaticMarkup(React.createElement(DetailedFinancePanel,{result:simulateDetailed(v06Project())}));for(const value of ['942.06','557.55','2026-01','2026-02'])assert.ok(complete.includes(value),value);
});
test('complete flow and live verification render actual PV storage values and fixed-case comparisons',async()=>{
 const {FlowExplorer}=await vite.ssrLoadModule('/components/simulator/flow-explorer.tsx');const {DetailedVerificationPanel}=await vite.ssrLoadModule('/components/simulator/detailed-verification.tsx');
 const {v05Project}=await vite.ssrLoadModule('/packages/detailed-verification/index.ts');const {simulateDetailed}=await vite.ssrLoadModule('/packages/detailed-model/engine.ts');const result=simulateDetailed(v05Project());
 const html=renderToStaticMarkup(React.createElement(FlowExplorer,{result}));assert.equal((html.match(/data-node=/g)??[]).length,result.parameterSnapshot.topology.nodes.length);for(const label of ['外部總輸入','全站總損耗','逐台儲能庫存與損耗'])assert.ok(html.includes(label),label);
 const verified=renderToStaticMarkup(React.createElement(DetailedVerificationPanel,{result,busy:false,onRun:()=>{}}));for(const label of ['載入並執行 3 日','載入並執行 4 日','載入並執行 5 日','全部通過','獨立預期','匯出驗證報告 JSON'])assert.ok(verified.includes(label),label);
});

// Append to tests/ui-components.test.mjs after root integrates battery-trace contracts.
test("battery inspector distinguishes cursor SOC, stored energy, recharge power and cumulative endpoint",async()=>{
 const {BatterySOCPanel}=await vite.ssrLoadModule('/components/simulator/flow-explorer.tsx');
 const state={slotId:'A-rack-0',sink:'A-rack-0',batteryId:'swap-001:returned',family:'truck-A',effectiveCapacityKWh:410.4,capacityKWh:513,soh:.8,energyKWh:164.16,soc:.4,readySOC:.9,remainingKWh:205.2,inputKW:560,storedKW:537.6,status:'charging',atMinute:15};
 const html=renderToStaticMarkup(React.createElement(BatterySOCPanel,{state,minute:15,mode:'cumulative'}));
 for(const text of ['終點 SOC','累計終點的庫存狀態','164.16','205.20','560.00','537.60','410.40','90.00','80.00','swap-001:returned','充電中','SOC 仍顯示游標時刻，不做累加'])assert.ok(html.includes(text),text);
 assert.match(html,/role="meter"/);assert.match(html,/aria-valuenow="40"/);assert.match(html,/D1 00:15:00.000/);
});

test("missing battery state remains unavailable, never an empty or full pack",async()=>{
 const {BatterySOCPanel}=await vite.ssrLoadModule('/components/simulator/flow-explorer.tsx');
 const html=renderToStaticMarkup(React.createElement(BatterySOCPanel,{state:null,minute:15,mode:'power'}));
 assert.match(html,/此刻 SOC —/);assert.match(html,/沒有此電池艙的 SOC 記錄/);assert.match(html,/不代表電池為空/);assert.doesNotMatch(html,/role="meter"/);assert.doesNotMatch(html,/0.00/);
});

test("battery ready state reflects configurable target below 100 percent",async()=>{
 const {BatterySOCPanel}=await vite.ssrLoadModule('/components/simulator/flow-explorer.tsx');
 const state={slotId:'A-rack-0',sink:'A-rack-0',batteryId:'ready-pack',family:'truck-A',effectiveCapacityKWh:513,capacityKWh:513,soh:1,energyKWh:410.4,soc:.8,readySOC:.8,remainingKWh:0,inputKW:0,storedKW:0,status:'ready',atMinute:50};
 const html=renderToStaticMarkup(React.createElement(BatterySOCPanel,{state,minute:50,mode:'energy'}));
 assert.match(html,/達標可換出/);assert.match(html,/aria-valuenow="80"/);assert.match(html,/此刻 SOC/);assert.doesNotMatch(html,/已充滿/);
});


test("SOC verification controls preserve busy state and require a matching completed result",async()=>{
 const {SocVerificationPanel}=await vite.ssrLoadModule('/components/simulator/soc-verification.tsx');
 const html=renderToStaticMarkup(React.createElement(SocVerificationPanel,{result:null,busy:true,onRun:()=>{}}));
 for(const text of ['電池 SOC 三日驗證','SOC-1','SOC-2','SOC-3','案例 JSON','選擇一個三日案例','合成驗證假設'])assert.ok(html.includes(text),text);
 assert.ok((html.match(/disabled=""/g)??[]).length>=4);assert.doesNotMatch(html,/本次結果的列示數值符合獨立預期/);
});
