# HighwaySwapStationSim

**HighwaySwapSim** — 高速公路雙服務區供電、換電／充電營運與收益測算工作台。

由 Codex / Astra 接手實作。工程工作版本 **0.4.0**，完整需求保留於 [Master Prompt](docs/MASTER_PROMPT.md)，當前範圍與限制見 [交接文件](docs/HANDOFF.md)。

## 已提供的操作

|工作頁|功能|
|---|---|
|總覽|1–31日需求／交付與電價、連續庫存與A/B服務區|
|供電設計|SST／PCS、一期／二期預設；拖曳、新增／刪除設備、連線及開關；schema參數檢查|
|站務配置|電池數量、容量、SOC、工位、作業時間、充電槍與共享功率|
|逐時案例|每站每日24筆時序，逐日編輯需求與到站鎖定單價|
|效率比較|來源摘要／組裝效率、相同交付能量比較、避免重複乘效率|
|模擬結果|Web Worker受限模擬、排隊／庫存、逐元件與連線能量帳、實際來源電表|
|三例獨立驗證|3／4／5日受控案例、即時總計比較、47,489項封存比對與PPT|
|獲利能力|成本輸入、代表日外推、月度爬坡、NPV／IRR／回收期及資金缺口|
|情境比較|最多4個結果快照；JSON匯出／匯入；本系統XLSX匯出／還原|
|模型與驗證|插件與模型範圍、來源疑點、診斷資訊|

**來源重播不提供實際購電成本**；需執行受限模擬。成本預設未填，財務示範值不是報價。使用者草稿與比較目前只存在本次頁面，離開前請匯出JSON。

## 開發與驗證

需要 **Node.js 24+**、Python 3、npm、Git。

```bash
git clone https://github.com/pcpcchen-coder/HighwaySwapStationSim.git
cd HighwaySwapStationSim
npm ci
npm run typecheck
npm run test:core
npm test
npm run dev
```

`npm test` 包含核心／財務回歸、Python獨立解析資料再現與47,489項比對、正式建置、Worker／HTML／物理／匯出驗證。`config/runtime-types.wrangler.json` 僅供產生型別，沒有實際建立資料庫；部署使用 `.openai/hosting.json` 與 Vite Sites 適配。型別需要重建時執行 `npm run types:runtime`。

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
- [完整 Master Prompt](docs/MASTER_PROMPT.md) — 原0–100章、101–114章、設備容量115–122章與連續多日／獨立驗證123–129章。
- [架構](docs/ARCHITECTURE.md)、[電力模型](docs/ELECTRICAL_MODEL.md)、[經濟模型](docs/ECONOMIC_MODEL.md)。
- [假設](docs/ASSUMPTIONS.md)、[資料來源](data/reference/source-manifest.json)、[驗證](docs/VERIFICATION.md)。
- [交接與下一步](docs/HANDOFF.md)、[產品路線](docs/ROADMAP.md)。

本版是有向供電路徑與能量級模型。完整双800V母線的並聯控制、PV/ESS、保護暫態、3D車流、進階EMS、資產替換及通用Excel編輯後重播仍在後續範圍，不能宣稱已完成整份Master Prompt。

## 本輪設備補充

完整案例已展開 92 個設備與 96 條連線：逐台 SST、雙 DC 母線、16 倉 / DD、2 超充堆、4 終端 / 8 槍，以及 CATL 巧克力站。

- [設備與容量需求](docs/SUPPLEMENT_2026-09-08.md)
- [原始重播的完整設備快照](examples/supplement-source-replay.json)
- [二期 410.4 kWh 物理案例](examples/supplement-phase2-physical.json)
- [來源與數值轉錄](data/reference/supplement-2026-09-08.json)

原始八月 410 kWh 表與新電池 410.4 kWh 投影分開；CATL 官方 14–30 倉 / 99 秒與附件 500+50 kW 配置分開。案例容量的 3370.76 kW 原值會顯示精確重算 3370.841889 kW，並保留 0.6 同動率不足時的供電缺口。乘用車目前只計交流共用負載，沒有假設換電收入。


## 0.3.0 驗證交付

[公開工作網站](https://highway-swap-george.george-chen-1104.chatgpt.site) · [完整驗證紀錄](docs/VERIFICATION.md) · [驗證PPT](public/reports/HighwaySwapSim_Verification.pptx) · [獨立解析計算器與預期](data/verification/README.md)

三個案例共288小時，47,489項獨立數值比對全通過，最大能量誤差2.96e-12 kWh，結算金額差0分；另有比較器故意破壞自驗與完整92設備三日守恆測試。這是指定輸入／模型契約的驗證，不能當作未經實測校準的獲利保證。期末庫存缺口會阻擋投資回報外推；成本與真實結算條款仍須確認。


## 0.4.0 能量流驗算

新增完整節點／連線圖與事件時間軸：拖動即時更新kW，切換小時kWh、點節點逐項守恆、對照功率積分與帳本、匯出完整數值。可一鍵執行92節點／96連線的三日完整案例。操作與數值契約見 [能量流驗算](docs/ENERGY_FLOW_UI.md)，新版驗證見 [驗證紀錄](docs/VERIFICATION.md)。原0.3.0簡報保留原版本的驗證範圍。
