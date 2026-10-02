# HighwaySwapStationSim

**HighwaySwapSim** 是高速公路A／B雙服務區的供電、充換電營運、電池庫存與效率收益測算工作台。

現行產品基準 **0.8.1／schema 1.3**。新預設採單母線第一期：每側1台1680kW SST、3台560kW AC/DC、5台560kW DC/DC、3座雙槍終端；AC/DC整機效率預設95.35%可逐台調整。換電SOC統一在「站務配置」。

## 結案文件入口

**[完整文件總目錄](docs/closeout/README.md)** · **[結案報告正文草案](docs/closeout/09_CLOSEOUT_REPORT.md)** · **[40項REQ追溯矩陣](docs/closeout/07_TRACEABILITY.md)**

| 階段 | 文件 | 內容 |
|---|---|---|
| 背景／基準 | [00 專案基準](docs/closeout/00_PROJECT_BASELINE.md) | 目標、配置、版本、資料來源與範圍 |
| 需求REQ | [01 需求規格](docs/closeout/01_REQUIREMENTS.md) | 40項需求與可驗收條件 |
| 設計 | [02 系統與模型設計](docs/closeout/02_DESIGN.md) | 拓撲、架構、計算公式與邊界 |
| 實現 | [03 實現說明](docs/closeout/03_IMPLEMENTATION.md) | 程式、資料欄位、實作步驟 |
| 測試計畫 | [04 測試程序](docs/closeout/04_TEST_PLAN.md) | 20項TC、重現命令與人工UAT |
| 測試結果 | [05 驗證報告](docs/closeout/05_VERIFICATION_REPORT.md) | 歷史結果、封存數值、證據層級 |
| 操作 | [06 操作SOP](docs/closeout/06_OPERATIONS.md) | 10項操作、核對點、保存與排錯 |
| 追溯 | [07 追溯矩陣](docs/closeout/07_TRACEABILITY.md) | REQ→程式→TC→證據→SOP |
| 交付／維護 | [08 交付維護](docs/closeout/08_DELIVERY_MAINTENANCE.md) | 重建、manifest、版本還原 |
| 結案主文 | [09 結案報告](docs/closeout/09_CLOSEOUT_REPORT.md) | 已撰寫技術正文；行政資料與簽核待填 |
| 決策／待辦 | [10 決策與待辦](docs/closeout/10_ISSUES_DECISIONS.md) | 假設、風險、責任角色與關閉條件 |

## 如何使用

[開啟工作網站](https://highway-swap-george.george-chen-1104.chatgpt.site)。先依 [操作SOP](docs/closeout/06_OPERATIONS.md) 確認配置與需求，再執行測算，核對能量流與期末庫存，最後匯出JSON／XLSX。頁面內的草稿不等於永久保存，關閉前需下載檔案。

十年頁固定一期設備，預設2027低、2028–2029中、2030–2036高；以三負載與三背景案例的三日結果估算。效率圖比較**相同DC交付量下SST相對箱變＋PCS省下的電費**，不代表完整淨利。預設歷史案例十年約168.77萬元CNY，條件與證據見 [驗證報告](docs/closeout/05_VERIFICATION_REPORT.md)。

## 開發與驗證

建議Linux或相容環境、Node.js24+、Python3、npm及Git；建置脚本需Bash／GNU工具。

```bash
git clone https://github.com/pcpcchen-coder/HighwaySwapStationSim.git
cd HighwaySwapStationSim
npm ci
npm run typecheck
npm test
npm run build:offline
npm run dev
```

離線檔輸出至`outputs/HighwaySwapSim-0.8.1-offline.html`，不追蹤到Git。詳細命令、額外年度驗證與交付檔測試見 [測試計畫](docs/closeout/04_TEST_PLAN.md)。

## 程式目錄

| 路徑 | 責任 |
|---|---|
| `app/`、`components/simulator/` | 網頁入口、工作台與編輯器 |
| `packages/detailed-model/`、`detailed-network/` | 完整引擎、設定與供電分配 |
| `packages/service-fleet/`、`battery-trace/` | 車輛、電池、事件與SOC軌跡 |
| `packages/load-planning/` | 三劇本、庫存調整、十年與SST／PCS比較 |
| `packages/power-trace/`、`flow-boundary/` | 瞬時、區間累計與多層守恆 |
| `packages/io/`、`*-profile/` | JSON／CSV／XLSX交換 |
| `simulation-worker/`、`offline/` | 背景運算與單檔入口 |
| `data/`、`tests/`、`docs/evidence/` | 來源、固定驗證與封存證據 |
| `docs/closeout/` | 本期結案文件主線 |

現行沒有業務資料庫；`db/schema.ts`保留空範本。情境與結果採檔案保存，不能因存在資料庫依賴便宣稱有雲端同步。

## 證據與模型限制

既有0.8.1／SOC整併記錄載明核心194項及相關介面／離線測試通過；2026-10-02只整理文件與檢查一致性，未重跑產品測試。詳細版本、日期與未測範圍見 [VERIFICATION](docs/VERIFICATION.md)。

本工具屬參數化準靜態能源與營運模型。SST並聯穩定、環流、保護暫態、現場效率、長期排隊、原生瀏覽器離線UAT及完整投資報酬，均須依相應範圍另行驗證。中、高負載有供應與庫存缺口，不能將期初電池能量年年當成新增售電。

## 歷史與專題文件

[Master Prompt](docs/MASTER_PROMPT.md) · [交接紀錄](docs/HANDOFF.md) · [單母線一期](docs/SINGLE_BUS_PHASE1.md) · [SST／PCS比較](docs/SST_PCS_COMPARISON.md) · [完整模型手冊](docs/COMPLETE_MODEL_GUIDE.md) · [還原點](docs/RESTORE_BEFORE_SST_PCS_CHART.md) · [歷史README](docs/history/README_before_closeout_2026-10-02.md)

原始需求、舊版案例及PPT／PDF保留其當時版本，不作現行0.8.1全功能驗收證明。
