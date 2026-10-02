# 03｜實現說明與程式對照

## 1. 實現基準

本文件描述 0.8.1 及 2026-09-21 SOC 入口整併後的實際程式。完整需求與驗收條件在 [REQ](01_REQUIREMENTS.md)，此處專注處理步驟、資料與檔案位置。程式存在不等於現場設備已驗收；各項證據由 [追溯矩陣](07_TRACEABILITY.md) 連接。

## 2. 模組分工

| 層 | 模組 | 輸入 → 產出 | 實現責任 |
|---|---|---|---|
| UI | [workbench.tsx](../../components/simulator/workbench.tsx) | 使用者編輯、Worker 訊息 → 工作頁與匯出 | 管理目前專案、成功結果、情境比較與分頁 |
| 初始設定 | [single-bus-project.ts](../../packages/detailed-model/single-bus-project.ts) | 工程預設 → 一期 Project | 建立單母線、共享群組、調度、假設與低負載 |
| 資料契約 | [contracts](../../packages/contracts/index.ts)、[schemas](../../packages/schemas/index.ts) | JSON → 已驗證 Project | 型別、schema 1.3、相容遷移 |
| 詳細設定 | [schema](../../packages/detailed-model/schema.ts)、[readiness](../../packages/detailed-model/readiness.ts) | 草稿 → 可執行性診斷 | 區分 null、停用與啟用必填參數 |
| 圖與配置 | [engineering](../../packages/engineering/index.ts)、[single-bus](../../packages/engineering/single-bus.ts)、[topology](../../packages/topology-engine/index.ts) | 配置 → 節點／連線／驗證 | 來源能力、端口與分支關係 |
| 幾何 | [reference-layout](../../packages/reference-layout/index.ts) | 節點 → 圖面座標與走線 | 供電設計／能量流圖排列 |
| 模擬入口 | [Worker](../../simulation-worker/worker.ts)、[station-engine](../../packages/station-engine/index.ts) | Project → RunResult／錯誤 | 模式分派；舊專案保留歷史引擎 |
| 完整引擎 | [engine](../../packages/detailed-model/engine.ts) | 可執行 Project → 多日帳本 | 事件步進、供電分配、狀態與結帳 |
| 供電分配 | [detailed-network](../../packages/detailed-network/index.ts)、[physical-models](../../packages/physical-models/index.ts) | 請求與約束 → 實際供電 | 共用容量、損耗、可選物理元件 |
| 營運／電池 | [service-fleet](../../packages/service-fleet/index.ts)、[battery-energy](../../packages/service-fleet/battery-energy.ts) | 車輛事件與電池 → 交付、排隊、庫存 | 配對、SOH／SOC、功率分段、電池交換 |
| 軌跡與守恆 | [power-trace](../../packages/power-trace/index.ts)、[battery-trace](../../packages/battery-trace/index.ts)、[flow-boundary](../../packages/flow-boundary/index.ts) | 運行帳本 → 任意時間與區間讀數 | kW／kWh、SOC、外部與營運邊界 |
| 年度規劃 | [load-planning](../../packages/load-planning/index.ts)、[inventory-adjustment](../../packages/load-planning/inventory-adjustment.ts) | 六個案例 → 年度表 | freshness、庫存扣除、背景用電及折算 |
| 效率比較 | [sst-pcs-comparison](../../packages/load-planning/sst-pcs-comparison.ts) | 元件帳＋D＋ηPCS＋電價 → 電費差額 | 同量 DC 邊界、來源加權、不支援狀態 |
| 財務 | [economics-engine](../../packages/economics-engine/index.ts)、[extended-finance](../../packages/extended-finance/index.ts)、[money](../../packages/money/index.ts) | 電表／交易／成本 → 財務結果 | 金額結算、缺值、完整財務與簡化收益分界 |
| 檔案交換 | [io](../../packages/io/index.ts)、[service-profile](../../packages/service-profile/index.ts)、[equipment-profile](../../packages/equipment-profile/index.ts)、[detailed-profile](../../packages/detailed-profile/index.ts) | 設定／結果 ↔ JSON、CSV、XLSX | 嚴格驗證、局部合併、完整還原及快照 |

## 3. 初始化與一期配置

`singleBusProject()` 先由既有工程案例建立物理專案，再設定：

1. `phase=1`、`strategy=IMMEDIATE`；將舊獨立槍／功率池數量設為零，避免重複生成獨立超充設備。
2. `detailed.topology.architecture=SINGLE_BUS`、`sharedDD=true`、`sharingMode=EXCLUSIVE`，外槍終端分組為 `pcs:1`、`sst:2`。
3. `detailed.dispatch.priority=GUN_FIRST`、`reserveAuxiliaryPower=false`，不預留滿電包與預測窗口。
4. 重新建立工程拓撲及可選物理記錄，保存使用者決策與沿用假設，載入低負載劇本。

為維持歷史相容，部分內部鍵仍叫 `pcsSlotsPerSite`、`pcs`、`dd-group-sst`。**單母線中的 `pcs` 群組鍵在此代表 AC/DC 分支，不表示仍有集中 PCS 設備。** 接手人應依 `architecture` 與實際節點 `type` 判讀，不能只看欄位名稱增設一台 PCS。

## 4. SOC 設定實現

唯一編輯入口是 [StationPanel](../../components/simulator/panels.tsx) 內 A／B 卡片的 [SocRangeEditor](../../components/simulator/soc-settings.tsx)。設備與容量頁已移除重複編輯器；舊版容量摘要仍可讀取已套用 SOC。

```text
輸入百分比草稿
→ socWindowPreview 驗證及計算預覽
→ 按套用
→ applyStationSOC 驗證整份變更
→ 更新指定站 returnSOC／readySOC 與全期 swapKWh
→ 更新目前 Project，使用者再執行測算
```

資料以 0–1 保存，UI 以 0–100% 顯示。`applyStationSOC` 不重建拓撲，保留他站、車次、直接充電、費率與自訂設備；有 AC 子集時同步其換電電量。未套用草稿不進入 JSON 或模擬。逐艙覆寫是另一層資料，站級設定不應被宣稱能覆蓋全部逐艙客製條件。

## 5. 需求、服務與調度實現

`ServiceRow` 以 `station＋day＋hour` 定位，保存 swap／charge 次數、總 kWh、原始單價及可選 `ac` 子集。`splitDemand()` 檢查子集，`captureLoadProfile()` 將所選一天的兩站需求保存到指定劇本。載入劇本與保存劇本分成兩個動作，避免目前畫面編輯被直接認作年度需求。

完整服務編譯由 [services.ts](../../packages/detailed-model/services.ts) 把需求轉成可用倉位／槍位的事件，再由 ServiceFleet 處理。外槍請求先取得功率，整組互斥阻止同組回充；剩餘功率再分給站用與可回充電池。必要站用不足時會聯鎖相依設備，並非把站用需求刪除。

單次完整引擎保留交易與庫存的真實模擬結果；年度庫存扣除只發生於規劃彙整階段，不能回寫原始 RunResult 以讓帳本看起來更平衡。

## 6. 效率與年度實現

- [equipment-efficiency](../../packages/equipment-efficiency/index.ts) 決定個別覆寫或全域預設。AC/DC 的整機 `eta` 與替代 PCS 規劃效率是不同輸入。
- `capacityProject()` 產生高／中／低及三組背景案例；`capacityMatches()` 核對結果是否仍對應目前設備與需求，過期時不沿用。
- `planningDaySummary()`／`inventoryAdjustment()` 分支計算庫存消耗與收入扣除；三日原始量轉成規劃日均量。
- `singleBusTenYears()` 套用每年需求條件與背景日，計算需求、供應、缺口及能源收支。
- `sstPcsComparison()` 從 SST 與 DC/DC 元件帳求兩方案效率；對不可用條件回傳 `null`。相等效率只清除機器浮點抵消誤差，不把真實負收益截成零。
- `pcsReferenceEfficiency` 可選，舊 JSON 未提供時回退全域 PCS 效率；新增欄位不強迫修改舊專案檔。

## 7. 狀態與保存契約

| 資料狀態 | 使用位置 | 保存方式 | 更新條件 |
|---|---|---|---|
| 詳細設定草稿 | 完整模型設定 | 本頁草稿 JSON／CSV | 明確套用才寫入專案 |
| 目前 Project | 設備、站務、需求、目前規劃 | 頂端專案 JSON | 合法編輯／匯入 |
| 上次成功 RunResult | 結果、能量流、結果 XLSX | 結果 XLSX、數值匯出 | Worker 成功結果 |
| 六案例結果快取 | 十年估算 | 十年估算 JSON 等 | 執行批次；參數變更檢查是否失效 |
| 版本來源 | GitHub／Sites 各自提交 | commit、還原分支／版本 | 發版流程，不能只靠頁面名稱 |

`db/schema.ts` 沒有業務表，沒有多使用者資料庫與雲端情境同步。檔案匯出是目前保存流程；使用者關閉頁面前必須保存。

## 8. 程式與文件變更紀錄

| 日期 | 變更 | 結案意義 |
|---|---|---|
| 2026-09-18 | 一期單母線與六組三日規劃 | 取代舊集中 PCS 初始案例 |
| 2026-09-19 | 累計圖改 SST／PCS 電費差 | 比較基準與財務意義改變，舊圖不再當預設 |
| 2026-09-21 | SOC 統一至站務配置 | 同一參數只保留一處編輯入口 |
| 2026-10-02 | 結案文件與 REQ／TC／SOP 追溯 | 文件更新，產品功能與數值模型未修改 |

## 9. 維護注意事項

修改公式應在 packages 層完成，UI 只呼叫共用運算；更換來源資料須保留原始值與來源紀錄。變更共享分配、庫存或計費時需重新執行相應數值測試，不能只驗證畫面標籤。若只修文件，進行文件一致性檢查即可，不將未執行的產品回歸列為本次通過。
