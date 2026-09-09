# HighwaySwapStationSim

## 0.7.0 電池 SOC 與回充修正

逐時 kWh 改為固定需求，個別容量／SOH 無法滿足時保留未服務量。每艙可設定 SOC 功率分段、SOC／能量對照與充入效率；能量流時間軸即時顯示 SOC、電池身份、庫存與待補電量，累計模式顯示終點 SOC。設定支援 JSON／CSV，結果 XLSX 增加電池時間表與曲線表。

在「獨立案例驗證」可載入三個各三日的 SOC 案例，親自比對本次產出與獨立 Decimal 預期。操作見 [電池 SOC 修正與驗算](docs/BATTERY_SOC_AUDIT.md)；`npm run verify:soc` 重跑 1,100 項獨立比較。以下保留 0.6.0 範圍介紹，最新狀態以 [驗證紀錄](docs/VERIFICATION.md) 為準。

## 0.6.0 完整模型

新增「完整模型設定」，將原圖中的換電 DD 外接槍、同側母聯、線纜／箱變損耗、效率曲線、熱／保護事件、PV／ESS／UPS／ATS、乘用車營運及生命周期財務接入受限測算。預設恢復原圖每側 PCS 1,600 kW、PCS 倉 1–2／SST 倉 3–8，兩站合計 12 個雙槍終端／24 槍；真實共享矩陣及未知規格仍待確認。

**操作順序：設定草稿 → 套用 → 新增端口時重建連接 → 檢查供電設計 → 需求／價格 → 執行測算 → 瞬時／區間累計驗算 → 檢查財務 → 匯出。** 集合頁可按「新增待填項目」產生欄位骨架，未知值保留 `null`。啟用物理模型後，必要缺值阻擋測算；財務缺值另行阻擋對應成本或投資結論。

能量流圖支援任意子分鐘窗口，分列外部購電／光伏、儲能內部移轉、自放電、容量衰減溢出與庫存增減。結果、驗算圖及結果 XLSX 使用同一次成功快照；未套用的本頁草稿、目前專案與最後結果分開保存。

| 工作頁 | v0.6.0 新內容 |
|---|---|
| 完整模型設定 | 搜尋／逐欄编辑、集合待填範本、缺值清單、明確套用／重建、完整設定 JSON／CSV |
| 供電與服務 | DD 共用／互斥、單車雙槍、逐包初始狀態、逐車 SOC／溫度分段、乘用車完整營運 |
| 能量流驗算 | 當下 kW／每小時及任意區間 kWh、PV／ESS／UPS 外部邊界、連續自放電與離散容量損失 |
| 獲利能力 | 來源表計基本／需量費、周期加權存貨、逐設備資產／租賃／OPEX、稅／應收、使用者確認的分月投資假設 |
| 獨立驗證 | 新 V04–V06 與原 V01–V03 分開驗證；舊專案未含 `detailed` 時仍使用原引擎 |

[完整模型手冊](docs/COMPLETE_MODEL_GUIDE.md) · [操作手冊](docs/USER_GUIDE.md) · [驗證紀錄](docs/VERIFICATION.md) · [v0.6 驗證簡報](public/reports/HighwaySwapSim-v0.6-Verification.pptx) · [PDF](public/reports/HighwaySwapSim-v0.6-Verification.pdf)

本版是參數化準靜態模型：固定分支電壓、設定式保護、最長一分鐘的離散調度及啟發式 EMS，沒有全網潮流、電磁暫態或最優調度證明。資料完整與指定案例數值驗證不等於現場校準，更不保證真實獲利。新增模組預設未知或未啟用時，不冒充已算入場站結果。

新驗證命令：`npm run verify:detailed`；舊回歸：`npm run verify:scenarios`。最終測試數量及狀態以本次 [驗證紀錄](docs/VERIFICATION.md) 為準，不把較早版本的通過數當成本次完整驗收。



**HighwaySwapSim** — 高速公路雙服務區供電、換電／充電營運與收益測算工作台。

由 Codex / Astra 接手實作。工程工作版本 **0.6.0**，完整需求保留於 [Master Prompt](docs/MASTER_PROMPT.md)，當前範圍與限制見 [交接文件](docs/HANDOFF.md)。

操作順序、JSON／XLSX保存差異與案例載入注意事項，請先閱讀 [操作手冊](docs/USER_GUIDE.md)。

## 已提供的操作

|工作頁|功能|
|---|---|
|總覽|1–31日需求／交付與電價、連續庫存與A/B服務區|
|供電設計|SST／PCS、一期／二期預設；拖曳、新增／刪除設備、連線及開關；schema參數檢查|
|站務配置|電池數量、容量、SOC、工位、作業時間、充電槍與共享功率|
|逐時案例|每站每日24筆時序，逐日編輯需求與到站鎖定單價|
|效率比較|來源摘要／組裝效率、相同交付能量比較、避免重複乘效率|
|能量流驗算|完整節點／連線圖、當下功率／每小時電量／任意區間累計、守恆驗算與數值匯出|
|模擬結果|Web Worker受限模擬、排隊／庫存、逐元件與連線能量帳、實際來源電表|
|獨立案例驗證|新 V04–V06 和原 V01–V03 分開；即時預期／實際／差異比對及 PPT|
|獲利能力|完整模型按源電表月帳單、明確分月假設；舊案保留原模型|
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

- [操作手冊](docs/USER_GUIDE.md) — 先配置、再設計、重算、驗算與保存；匯入恢復及覆寫行為。
- [執行決策](docs/EXECUTION_CONTEXT.md) — 使用指定repo、由Codex接手，覆蓋原Kimi執行限定。
- [完整 Master Prompt](docs/MASTER_PROMPT.md) — 原0–100章、101–114章、設備容量115–122章、連續多日／獨立驗證123–129章及能量流／區間累計130–131章。
- [架構](docs/ARCHITECTURE.md)、[電力模型](docs/ELECTRICAL_MODEL.md)、[經濟模型](docs/ECONOMIC_MODEL.md)。
- [假設](docs/ASSUMPTIONS.md)、[資料來源](data/reference/source-manifest.json)、[驗證](docs/VERIFICATION.md)。
- [交接與下一步](docs/HANDOFF.md)、[產品路線](docs/ROADMAP.md)。

v0.6 新完整模型的 PV／ESS、受控母聯、規則 EMS 與資產替換見上方完整模型章節。全網 AC 潮流、電磁／保護暫態、3D 車流及通用 Excel 任意編輯後重播仍不在本版範圍。

## 歷史設備補充（0.2–0.5）

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


## 0.4.1 區間累計

能量流驗算新增「區間累計 kWh」：雙端滑桿／精確起訖分鐘、期初至目前與完整期間快捷鍵；全站和每個元件／連線按同一區間積分。全站總輸出採末端吸收，避免中間串接重複計量。詳細契約見 [操作文件](docs/ENERGY_FLOW_UI.md)。

## 0.4.2 逐時需求編輯與交換

「逐時案例」可修改每天、每站的換電／充電車次及總需求，新增目前草稿的需求 CSV／JSON 匯出與原子匯入；支援部分列合併及全期取代。CSV 可用 Excel 編輯後另存 UTF-8 匯回。需求不重建供電設計，修改後須重新測算才能更新能量流與結果 XLSX。

提供均勻／固定種子到站設定、來源總價欄位及明確 SOC 重算。檔案格式與先後步驟見 [逐時需求操作](docs/SERVICE_PROFILE.md) 和 [操作手冊](docs/USER_GUIDE.md)。

## 0.5.0 設備設定與個別效率

SST、箱變、PCS及DD／超充堆可各自覆寫轉換效率，未設定時繼承全域。供電設計新增整套設備JSON及設備參數CSV匯入匯出，保留拓撲、排程、站務與效率；CSV可透過Excel UTF-8批次調整既有設備。匯入驗證完整通過才套用，修改後須重算。參數作用、規格紀錄與操作順序見 [設備設定文件](docs/EQUIPMENT_SETTINGS.md)。
