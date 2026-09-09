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
