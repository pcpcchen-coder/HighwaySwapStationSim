# 驗證紀錄 — 0.1.0

2026-09-08，Node24.19.0，TypeScript5.9.3，React19.2.6。

已執行：

- 核心回歸10項通過：來源收入／總計、schema/migration、event/RNG/registry、效率邊界、圖驗證、共享功率、財務解析例、完整受限模擬守恆與重現、無電源庫存耗盡、XLSX完整JSON還原／損毀拒絕。
- TypeScript `tsc --noEmit` 通過。
- Vinext/Vite正式build通過，輸出SSR Worker、client與獨立simulation worker。
- 獨立Python openpyxl讀取：11個sheet、48筆service與hourly結果、KPI SUM公式可解析。
- 正式產物6項測試全部通過：Worker首頁回應與產品內容、bundled simulation worker訊息處理，以及既有UI元件語意測試。合計16項自動測試通過；GitHub CI另以遠端執行結果為準。

## 數值基準

|項目|結果|
|---|---:|
|来源逐列總需求|77750 kWh|
|来源逐列服務總次數|195|
|A充電逐列|36次 / 14480 kWh|
|B充電逐列|31次 / 10790 kWh|
|SOURCE_DISPLAY_PRICE收入|68912.90 CNY|
|EXACT_COMPONENTS收入|68945.44803 CNY|
|SST ASSEMBLY加權|0.9556888|
|PCS ASSEMBLY加權|0.930657|
|能量優先／整數優先冗餘|59 / 60次|

示範一期SST受限模型（默认設定、非工程校準）：交付74100.2165098kWh、購入77627.3502381kWh、路徑損耗3417.6276155kWh、完成180次、最大逐時能量殘差約4.44e-8kWh。期初電池能源22800、期末22429.5061130kWh，已發出期末缺口警示。這是初版模型數值，不是來源附件宣稱的實際營運結果。

## 實際限制

沒有瀏覽器手動逐頁互動與視覺驗證；SSR與Worker測試不等同完整E2E。沒有驗證短路保護、暫態穩定、設備實測曲線或真實投資報酬。未實作項見HANDOFF.md。
