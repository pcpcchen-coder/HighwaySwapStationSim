# HighwaySwapSim 開發交接

更新：2026-09-08。產品0.1.0，schema1.1，engine0.1.0。指定repo：pcpcchen-coder/HighwaySwapStationSim。

## 已實作

- 完整Master Prompt原文、執行覆蓋決策、Phase0工程模型文件、來源CSV/JSON、圖片SHA256。
- 小型sim-kernel：Clock、stable EventQueue、SeededRandom、Registry；設備不進Kernel。
- Zod Project schema、1.0→1.1 migration、完整快照。6種設備插件：grid、SST、箱變、PCS、bus、charger。
- 有向圖編輯與AC/DC／電壓／重複ID／環路檢查；一期／二期、SST/PCS預設；逐路徑共享功率配置。
- 完整附件48列來源重播與收入；A充電36次/14480kWh及來源35次/12430kWh分開。
- 24h分鐘內事件切分：換電排隊、ready battery預約／回收、電池補電與直接充電共享、未供能、每時能量平衡。
- Immediate與TOU（購價<0.7或ready低於max(2,bays×2)時補電）兩種初版規則；TOU門檻尚需抽到EMS插件/schema。
- Web Worker執行與中止；UI不控制物理模型。比較最多4個immutable結果快照。
- 成本未填的財務防護、59/60次口徑、代表日月度爬坡、NPV、IRR、簡單/折現回收期、資金缺口。
- 真正的XLSX（11 sheets）與本系統未另存檔案的round-trip；JSON是完整來源。對任意Excel重新壓縮／改欄位的匯入尚不支援。

## 模型簡化，不能宣稱已完成的部分

- 圖中雙DC母線在工作版投影為每站一個匯流節點；原圖所有設備／母聯／ATS／UPS/RMU尚未逐一建模。
- 二期SST以同型設備聚合3360kW表示；沒有並聯動態控制。多來源路徑採固定順序分配，不是最優潮流。
- SOURCE_CHAIN把全流程損耗集中到末端charger邊界，因此中間設備額定約束是保守近似。精細端點負載率應用ASSEMBLY。
- 服務排序：輔助A/B優先，再配置A、B站充電；站內按需求功率比例分配。未支援SOC/溫度充電曲線、電池老化與ESS/PV。
- 初始24顆/站、500kWh、ready95%、return13%、單bay7.5min是DEMO，非來源設備規格；交換窗口不匹配的請求保留等待。
- 直接充電採總能量請求；原表A12時2050kWh不代表已確認的單車电池容量。完整vehicle SOC模型待增補。
- 月度財務是代表日縮放，補回期末能源缺口的成本只是以平均購價／效率估算。沒有需量費、全年逐時EMS、稅務、資產替換與內部轉撥帳。
- 金額計算目前用JS number並在顯示時捨入，尚非固定小數帳務系統。
- 種子與到達模式可透過JSON設定；完整schema-driven Parameters/Algorithm管理UI尚未完成。
- 此版本已做正式產物與數值驗證，沒有瀏覽器逐頁點擊／拖曳人工視覺實測。

## 下一個可執行里程碑

1. 將SST、PCS、DD、箱變的量測邊界／Aux參數移入完整EquipmentPlugin模型；提供COMPONENT模式與I²R。
2. 真實雙母線、分段與母聯、RMU/ATS/UPS，定義可支援並聯模式及fault/availability。
3. EMSStrategy Registry與schema參數，消除TOU門檻常數；增加ESS、PV及跨站能量帳。
4. 增加逐車SOC、P95等待、服務能力共享上限、可達路網與價格行為；再接2.5D/3D。
5. 換電能源存貨成本、需量費、CAPEX/OPEX明細、替換／殘值及長期財務；使用fixed-decimal計價。
6. 通用XLSX欄位解析、來源逐欄provenance、年度/批次DOE及Pareto。

## 執行

Node24；npm ci → npm run typecheck → npm run test:core → npm test。修改模型必更新fixture與docs。沒有資料庫或外部服務憑證亦能跑核心。
