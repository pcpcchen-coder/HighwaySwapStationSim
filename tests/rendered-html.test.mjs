import assert from "node:assert/strict";
import test from "node:test";

test("production Worker serves the HighwaySwapSim workbench", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  const html = await response.text();
  assert.match(html, /HighwaySwapSim/);
  assert.match(html, /執行測算/);
  const visible = html.replace(/<!--.*?-->/g,'');
  assert.match(visible, /410\.4 kWh 物理案例/);
  assert.match(visible, /尚未測算/);
  const exportButton=(visible.match(/<button\b[^>]*>[\s\S]*?<\/button>/g)??[]).find(button=>button.includes("結果 XLSX"));
  assert.match(exportButton??"", /\bdisabled/);
  assert.doesNotMatch(visible, /完整設備案例 · 513 kWh|原始八月重播 \/ 舊模型|快照已同步|來源逐列交付電量/);
  for (const label of ['CATL 巧克力換電站','DD 超充堆','液冷','母線 1','母線 2','重卡換電工位','電池倉']) {
    // React may insert comment boundaries around adjacent dynamic text.
    assert.ok(html.replace(/<!--.*?-->/g,'').includes(label),label);
  }
  assert.doesNotMatch(html, /Starter Project/);
  assert.doesNotMatch(html, /codex-preview/);
});
