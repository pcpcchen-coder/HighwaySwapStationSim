# HighwaySwapStationSim

**HighwaySwapSim** — 高速公路雙服務區供電、換電／充電營運與收益測算工作台。

由 Codex / Astra 接手實作。第一個工程工作版本 **0.1.0**，完整需求保留於 [Master Prompt](docs/MASTER_PROMPT.md)，當前範圍與限制見 [交接文件](docs/HANDOFF.md)。

## 已提供的操作

|工作頁|功能|
|---|---|
|總覽|24小時需求／交付與電價、A/B服務區與來源差異|
|供電設計|SST／PCS、一期／二期預設；拖曳、新增／刪除設備、連線及開關；schema參數檢查|
|站務配置|電池數量、容量、SOC、工位、作業時間、充電槍與共享功率|
|逐時案例|48筆A/B時序、換充電量、購電價、服務費、來源idle保留|
|效率比較|來源摘要／組裝效率、相同交付能量比較、避免重複乘效率|
|模擬結果|Web Worker受限模擬、排隊／庫存／功率／損耗／能量守恆|
|獲利能力|成本輸入、代表日外推、月度爬坡、NPV／IRR／回收期及資金缺口|
|情境比較|最多4個結果快照；JSON匯出／匯入；本系統XLSX匯出／還原|
|模型與驗證|插件與模型範圍、來源疑點、診斷資訊|

**來源重播不提供實際購電成本**；需執行受限模擬。成本預設未填，財務示範值不是報價。使用者草稿與比較目前只存在本次頁面，離開前請匯出JSON。

## 開發與驗證

需要 **Node.js 24+**、npm、Git。

```bash
git clone https://github.com/pcpcchen-coder/HighwaySwapStationSim.git
cd HighwaySwapStationSim
npm ci
npm run typecheck
npm run test:core
npm test
npm run dev
```

`npm test` 包含核心測試、正式建置、Worker／HTML／元件驗證。`config/runtime-types.wrangler.json` 僅供產生型別，沒有實際建立資料庫；部署使用 `.openai/hosting.json` 與 Vite Sites 適配。型別需要重建時執行 `npm run types:runtime`。

## 檔案結構

```text
app/                      React/Vinext 入口
components/simulator/     工程工作台
packages/contracts/       共享契約
packages/schemas/         Zod與migration
packages/sim-kernel/      時鐘、事件、亂數、Registry
packages/topology-engine/ 端口與圖驗證
packages/electrical-engine/ 共享功率與效率
packages/station-engine/  排隊、電池、充電、能量帳
packages/economics-engine/ 計費、損益兩平、投資現金流
packages/reference/       附件案例與示範預設
packages/io/              JSON與XLSX交換
plugins/equipment/        設備插件
simulation-worker/        獨立工作程序
data/reference/           原始轉錄CSV/JSON與來源雜湊
docs/                     完整需求、假設、模型、交接與驗證
tests/                    核心及正式產物測試
```

## 文件

- [執行決策](docs/EXECUTION_CONTEXT.md) — 使用指定repo、由Codex接手，覆蓋原Kimi執行限定。
- [完整 Master Prompt](docs/MASTER_PROMPT.md) — 原0–100章與新增101–114章。
- [架構](docs/ARCHITECTURE.md)、[電力模型](docs/ELECTRICAL_MODEL.md)、[經濟模型](docs/ECONOMIC_MODEL.md)。
- [假設](docs/ASSUMPTIONS.md)、[資料來源](data/reference/source-manifest.json)、[驗證](docs/VERIFICATION.md)。
- [交接與下一步](docs/HANDOFF.md)、[產品路線](docs/ROADMAP.md)。

本版是有向供電路徑與能量級模型。完整双800V母線的並聯控制、PV/ESS、保護暫態、3D車流、進階EMS、資產替換及通用Excel編輯後重播仍在後續範圍，不能宣稱已完成整份Master Prompt。
