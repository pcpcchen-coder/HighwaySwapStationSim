# 08｜交付、重建、維護與還原

## 1. 交付範圍

本次交付為Repository中的完整結案文件結構，不改應用程式功能、不重新發布網站、不重新生成離線版。產品交付基準仍為0.8.1，文件版次DOC-1.0。

| 交付項 | 位置／取得方式 | 當前狀態 |
|---|---|---|
| 需求、設計、實現、測試、SOP、結案文章 | [文件總目錄](README.md) | 本次補齊 |
| 原始碼與版本歷史 | [GitHub repository](https://github.com/pcpcchen-coder/HighwaySwapStationSim) | 持續維護 |
| 來源資料與固定案例 | [data/reference](../../data/reference/)、[data/verification](../../data/verification/)、[examples](../../examples/) | 保留原值與歷史案例 |
| 測試與封存證據 | [tests](../../tests/)、[docs/evidence](../evidence/) | 版本範圍见驗證報告 |
| 線上工作台 | [網站](https://highway-swap-george.george-chen-1104.chatgpt.site) | 既有入口；本次未重新部署／查核 |
| 單檔HTML | `outputs/HighwaySwapSim-0.8.1-offline.html`，由腳本建置 | 輸出目錄不追蹤到Git；不能假設clone後已有檔案 |
| 歷史PPT／PDF | [public/reports](../../public/reports/) | 保留舊版本證據，未製作新的0.8.1結案簡報 |
| 正式簽核及場域校準 | [結案正文簽核表](09_CLOSEOUT_REPORT.md) | 待接收者與專案負責人完成 |

## 2. 從Repository重建

建議先在新工作目錄操作，不覆寫使用者現有案例。Linux是現有CI環境；Node.js 24+、Python3及GNU/Bash工具依現行腳本準備。

```bash
git clone https://github.com/pcpcchen-coder/HighwaySwapStationSim.git
cd HighwaySwapStationSim
git rev-parse HEAD
npm ci
npm run typecheck
npm test
npm run build:offline
OFFLINE_HTML_PATH="$PWD/outputs/HighwaySwapSim-0.8.1-offline.html" npm run test:offline
npm run dev
```

要重建特定版本，先在獨立工作目錄檢出正式指定的commit，再安裝與測試。`npm test`會建置；未运行它時，先`npm run build`再打包離線HTML。開發頁面URL以終端實際顯示為準，不假定固定埠號。

正式網站由既有Sites專案管理；文件整理不需要另建網站。不可在Repository或README存放短期推送權杖、部署token或個人憑證。GitHub與Sites的commit識別需分開記錄，不能把其中一方的SHA套用到另一個來源庫。

## 3. 正式交付manifest

每次正式交付至少記錄以下欄位。範例為要填寫的格式，不是本次已執行的發版紀錄：

```yaml
product_version: "0.8.1"
document_version: "DOC-1.0"
source_commit_github: "待填：實際完整SHA"
source_commit_sites: "待填：有發布時記錄"
case_file: "project.json"
case_sha256: "待填"
result_file: "result.xlsx"
result_sha256: "待填"
offline_file: "HighwaySwapSim-0.8.1-offline.html"
offline_sha256: "待填"
test_environment: "待填：OS、Node、Python、瀏覽器"
test_log_directory: "待填"
known_issues: "10_ISSUES_DECISIONS.md"
accepted_by: "待簽核"
accepted_at: "待簽核"
```

case與result應能對應同一成功快照。若規劃CSV／JSON採更新後假設，另記其參數與時間，不假裝與舊XLSX完全同時。

## 4. 備份與還原

使用者的草稿、專案、結果與應用程式是四種不同保存物。草稿匯出不等於已套用，專案JSON不等於運行結果，網站上次結果也不會自動成為永久資料庫紀錄。

還原SST／PCS改圖前版本，依 [既有還原點](../RESTORE_BEFORE_SST_PCS_CHART.md)：GitHub分支`restore/pre-sst-pcs-chart-2026-09-19`，來源`b9405adbb78801ebb5ff4eaa0982e7cab631fdf8`，網站第16版與離線歷史第4版。該點是0.8.0舊圖基準，並非SOC整併後的0.8.1。

還原程序：保存現況→確認目標→在副本/分支重建→驗證→以新提交恢復來源→如需部署，發佈對應網站與離線產物→核對manifest。不強制重寫公開主線歷史。此輪只核對還原文件，未執行還原演練。

## 5. 變更維護流程

| 變更類型 | 必須更新 | 最低驗證 |
|---|---|---|
| 文案／文件 | 文件導航、相關章節、追溯紀錄 | 連結、範圍、數值與版本一致性 |
| UI控制 | REQ、實現、SOP、介面測試 | 保留資料連動與可用性，針對性介面測試 |
| 物理／調度 | REQ、設計公式、數值測試、證據、SOP | 核心、型別、建置、受影響獨立案例與整合 |
| 財務／年度 | 公式、單位、比較邊界、數值與匯出 | 同量比較、正零負、缺值、快照、來源單位 |
| 設備／來源資料 | 出處、轉錄、差異決策、案例檔 | 原值與衍生值分開，不能改fixture湊結果 |

先更新需求與決策，再實作與驗證。若需求已被替代，保留舊文件並加現行入口说明；不要同時維護兩份看似皆有效的不同數字。

## 6. 接收與維護責任

專案負責人確認範圍與結案條件；軟體維護人保存來源與可重現環境；電氣／設備方提供真實規格；營運方提供車流與庫存資料；財務方補成本與收益邊界；接收人執行UAT並簽認。人員姓名與期限由使用者填入，不以角色名稱假裝已分派。
