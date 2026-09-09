# 完整圖面補齊：需求與驗收矩陣

此文件為實作前的驗收契約與唯讀審核，不是已通過的產品驗證報告。基線為 `f22ec7842f1e56b7543a6bff5c86ec0e238095c6`。原有 V01–V03 fixtures 與 47,489 個比較保留不變；新增物理模型另立 V04–V06 與對應邊界測試。

## 發布狀態說明

下方為原始驗收規劃，保留規劃時的研究路徑和預期描述，不逐項冒稱全部現場驗證完成。正式三案使用 `data/verification/calculate-detailed.py`、`data/verification/detailed-expected.json` 與 `packages/detailed-verification/index.ts`；V04 的 A 完成時刻是每日起点後 97.5 分鐘、B 平時 67.5 分鐘／隔離日 127.5 分鐘（含初始作業時間）。功能實際範圍、欄位與限制見 `docs/COMPLETE_MODEL_GUIDE.md`；發布數值證據見本目錄 `detailed-comparison.json`、`release-checks.json`。

## 全域資料契約

1. 每個新欄位必須同時具備標籤、單位、允許範圍、能量/成本邊界、來源/假設狀態、計算作用和匯入匯出路徑。
2. `null` 是「未知/待填」，`0` 是「使用者已確認為零」，`enabled=false` 是「未安裝/不啟用」。三者不可互換。新功能關閉時不阻擋舊模型；新功能啟用但缺少必要參數時，計算失敗必須指向具體欄位。
3. 未填成本只阻擋需要該成本的財務結論；不應抹掉可驗算的電力結果。未填容量/效率/拓撲路徑則阻擋受影響物理情境，不能借用零或隱藏預設生成收益。
4. 完整 JSON/XLSX 必須保存所有新增設定、時間序列、狀態初值、調度策略和可辨識模型版本。設備設定 JSON/CSV 分別明定完整替換或欄位合併語義；需求匯入不得意外替換設備或財務設定。
5. 未知版本、拼錯欄位、重複 ID、孤立引用、不合法日期、NaN/Infinity、非法 SOC、負成本/功率等必須在一筆批次套用前拒絕；失敗不改變原專案。
6. 模擬、圖面、累计驗算、XLSX、財務必須共用「最後成功模擬」的 immutable parameterSnapshot。編輯草稿/匯入後標示待重算；不得讓新設計的額定值和舊功率曲線同時冒充同一次測算。
7. 初始電池/SOC/ESS/UPS 只在開始建立一次；跨午夜、跨電價時段、跨月、開關切換不可重置。
8. 新模型應使用新版本或明確 opt-in extension；舊 1.3 專案能載入且保留原語義。不得無聲把使用者自建拓撲重生為新預設。

## 需求矩陣

| ID | 缺項與可編輯資料 | 最低驗收條件 | 邊界/負向測試 |
|---|---|---|---|
| TOP-01 | 圖面方案、PCS1600/2000、乘用500/550、每倉供電組 | 基準圖每站倉1–2 PCS、3–8 SST；規格版本有名稱、來源；覆寫之後拓撲/容量/輸出一致 | 已自訂設備不因切換SOC失去參數；原方案保留migration標記 |
| TOP-02 | 16支換電DD外接槍、8雙槍終端；加獨立超充共24槍 | 基準圖12终端/24槍全部有來源路徑、端口ID和終端功率；不得只是圖形節點 | 單槍關閉僅該槍失效；終端與DD共享上限同時生效 |
| DD-01 | DD輸入/輸出額定邊界、rack/gun連接矩陣、共用/互斥模式、分配順序 | 任何時段所有DD下游Σ功率≤有效上限，損耗只一次；V04同DD架60+槍40=100 | 槍需求80不額外得到80；共享禁用、互斥選擇、單DD失效 |
| GUN-01 | 單/雙槍一車、每槍電流/電壓/功率、終端/堆共享上限 | 車輛占用正確端口；允許双槍時同車總功率受車端BMS限額；無超賣槍位 | 車壓超槍maxVoltage停止；低電壓V×I限額；一車兩槍不得計兩筆收入 |
| TIE-01 | A/B母聯方向、額定、閉開事件、互鎖、模式 | 模擬可見同側SST↔PCS支援路徑；V04隔離期間B0、恢復後供電 | 相反方向不能同時形成迴圈；開路0；AC不同源不被無條件並聯 |
| ELEC-01 | 線長、R/單位、導體數、電壓、溫度係數、電流上限 | 有效電阻與I²R可獨立計算，輸入=輸出+loss；正確区分AC三相與DC回路 | R=0理想回歸；長度加倍損耗相應；低壓高流違限；不重複DD內線損 |
| ELEC-02 | 轉換效率曲線、空載損耗、銅損、降額、溫度 | 明定曲線輸入軸和額定側；總loss包含固定和負載項且不重計常數eta | 空載仍耗損（設備啟用）；disable=0；不合法/不單調座標拒絕 |
| ELEC-03 | 無功補償容量、負載PF、開關/環網電流容量 | Q抵減和kVA=√(P²+Q²)形成真实有功餘裕；補償不創造kWh | 過補償/滯後超前符號，PF=1邊界，680A容量映射清楚 |
| ELEC-04 | 保護電流、延時、復歸、故障/停機事件 | 支援之準穩態保護按設定切斷；UI明示非瞬態短路/保護協調認證 | 閾值上下、事件同時發生、重閉、延時期間能量 |
| AUX-01 | 站用待機/操作/充電/溫度時序、每SST輔助需求 | 明確功率時序取代不可改10kW需求；source電費和aux分攤可追溯 | 無車待機、作業7.5min負载、跨時段積分；不得在負载系数外再乘一次 |
| UPS-01 | 容量、初SOC、min/maxSOC、ηC/ηD、功率、reserve | V05储能state连续；每8kWh輸出耗10kWh库存；到reserve后unserved | 不允许同時充放；SOC邊界精確事件；再充所需12.5kWh入表 |
| ATS-01 | 正常/備援源、DCAC、延時、break-before-make、恢復策略 | 故障→斷開→延時→接備援；兩輸入不非法並聯；輔助供不上時SST相應停機 | 失效順序、備援也故障、同刻復電、0延時、UPS能否橋接 |
| PV-01 | STC、辐照/溫度時序、溫度系數、MPPTη、逆功率/棄光 | V05 PV原始可用480、採集400、末端336+loss114含grid50；棄光單獨列 | 夜間0、超STC/逆溫度限制、無負載、null辐照拒計；棄光不是熱損 |
| ESS-01 | 容量、各SOC、η、功率、SOCreserve、dispatch、衰退/更換 | V05每天50→95→50不重置；全站守恆加上储能ΔE；不能同時充放 | 跨SOC邊界切步、極小功率、容量衰退溢出有帳、收益不計儲能充電 |
| EMS-01 | rack/gun/service優先、TOU閾值、reserve、削峰/自用策略、預測時序 | 规则和tie選擇可重播，選定策略改動实际输出；只有求得證明才標最佳化 | 相同seed和參數重播；不讓所有路徑排序偶然改服務公平；預測缺值 |
| BAT-01 | 每顆capacity/family/SOH/initialSOC、回站SOC、每車回收包 | 出入庫身份/能量守恆；不同容量不換算成相同kWh；不兼容family不交換 | 初始SOC不同、最大容量、無就緒包、回車SOC高於target |
| BAT-02 | SOC–V–I/taper曲線、溫度、內儲存效率、fade/cycle/calendar | 精確切過曲線/SOC點；充入電能=儲能增加+內損；低SOH有效容量正確 | 20–80與20–100僅在填有效曲線/衰退模型後才宣稱壽命差 |
| PASS-01 | CATL規格（来源）、乘用到車/回SOC/價格、倉/工位/秒數 | V06 5笔passenger、500kWh/500收入；每天09:07.5完成、11:07.5補滿 | 改99秒影响服务完成；倉數減少产生排隊；不能同時計550固定充電負載 |
| DEM-01 | 多日逐時profile及可選精確arrival事件、車種/端口意願 | 行/事件ID完整匯入匯出；粒度和arrival規則明示 | 日界23:59、跨日未完成、重複event、超容量、未來日期 |
| FIN-01 | 電表source、日曆起日、15min窗、月費/容量/需量/超約/PF、部分月策略 | V06按来源A875/B150kWh；Jan2日Feb3日；能量費557.55；分攤估計384.51 | full-month strict返回未定；不得把5日觀測峰冒稱月峰；DST/时区契約 |
| FIN-02 | 每設備BOM、投運日期、成本/壽命/更新/停機、租賃 | 分期CAPEX和replacement出現於正確期間，使用者已填0與null區分 | 未知成本不顯示完整NPV；租赁不得也當自有CAPEX折舊 |
| FIN-03 | 稅、折舊、殘值、DSO/DPO、初營運金、應收等 | 現金流和會計利潤分列；收款期與收入期不同；年份/月數邊界明確 | 期末應收不消失；taxloss規則明定；折舊不再次現金扣除 |
| FIN-04 | 初始能源成本、取得成本、加權平均/批次、期末估值 | 子case100kWh/40+100/60→issue150COGS75、closing50/value25；現金40≠存貨後25 | 零庫存、耗損分攤、returnpack成本歸屬、負存貨拒絕 |
| UI-01 | 每欄可編輯/匯入匯出、來源/缺值/生效狀態 | 字段schema→控件→完整JSON→重新模擬→XLSX→載回能對應；不只在JSON可寫 | 空白輸入不變0；局部錯誤不清空草稿；支援明確恢復继承/預設 |
| FLOW-01 | 新節點/雙向边、storage/generation/export、瞬間/區间/累計 | 全部節點一對一trace；區間可加性；能量來源+庫存減少=負載+loss+export | tie反向符號、充放切換、to端點不加能量、缺trace不得显示量測0 |
| IO-01 | extension版本、JSON/XLSX/CSV schema、欄位標籤和unknown/null | 設定和結果匯出分清；結果匯出只允許matching snapshot；出入值不截斷 | 未知key/version拒絕，XLSX被Excel重存限制說明；CSV公式文字轉義 |

## 原模型改動時需要特別保護的接口

- `packages/schemas/index.ts`：`projectSchema` 目前對未知 key 默認 strip。新增 extension 若未入 schema，完整 JSON/XLSX 可「匯入成功卻丟資料」。完整方案應用 strict schema 或逐層 dropped-field rejection 並提供向後 migration。
- `packages/equipment-profile/index.ts`：settingsSchema 手動 pick 欄位；`params` 原為非負 number，不容納 null、布林、曲線；`editableParameter` 排除 length/kvar；CSV空白只代表繼承效率。不得因新增表單而繞過原 strict import 安全檢查。
- `packages/contracts/index.ts`：原 Transaction.kind 僅 swap/charge，PowerTrace v1 無 storageDelta/generation/export；HourResult 和 SourceMeter 無月需量、逆送與能源價值。新增結果不能塞成舊字段造成語義改變。
- `packages/power-trace/index.ts`：`input-output-loss=0` 及 `grid-loss-terminal=0` 假設無本地發電或元件內储能。新版本應明列發電和ΔE，所有累計格子也須對應。只把ESS充電當terminal會令畫面表面守恆但售電/存貨重計。
- `packages/io/index.ts`：XLSX第一表Project_JSON為權威，之後的索引已有test依赖。新工作表建議追加；每個表頭/單位不可混用現金、會計、售電、充電、儲能。README版本目前舊值也需同步。
- `tests/power-trace.test.ts`：完整舊preset硬assert92nodes/96edges。不可改原V01–V03 fixture來消除失敗；新拓撲另立新preset測試，維持legacy輸入結果可追溯。
- `SOURCE_REPLAY` 保留原資料，不允許靠回放交易去補出PV/SOC/限流物理。新功能應拒绝在來源回放模式虛構計算結果。

## 三個新增独立多日案例

附 `oracle.py` 使用 Decimal 精度70，不import任何模擬器函式。執行產出 `expected.json`，所有十進位值保存為字串以免JSON先失去精度。`implementationCompared=false` 明示此檔僅是独立期望值。

| 案例 | 測試目的 | 主要獨立預期 |
|---|---|---|
| V04_SHARED_DD_TIE_3D | 3日共用DD限額與母聯開路/恢復、跨站source計量 | 架180kWh＋A槍240＋B槍120=540；grid=540/(.95×.98)=580.021482277…；loss40.021482277…；A每天90min完成，B第2日延至120min |
| V05_PV_ESS_UPS_4D | 4日PV/MPPT、ESS连续SOC、UPS耗盡reserve、loss/curtail分離 | PVraw可用480/採集400/棄80（bus-equivalent72），grid50，末端336，loss114，UPS未供8；ESS/UPS初末總70kWh |
| V06_PASSENGER_TARIFF_5D | 5日乘用庫存與成交、source需量、跨月電費、存貨估值 | Jan30–Feb3；passenger5筆500kWh/500元；全服務1025kWh/1025元；A875/B150kWh；電量557.55＋基本費分攤估計384.51→942.06，貢獻82.94 |

V04是電氣分配的閉合情境，其電池補電缺口由已發生換電輸入，未測工位秒級事件；乘用工位由V06涵蓋。V05未測非零ATS延時、非零衰退、反向售電，這些要另建unit/boundary tests，不能用V05通過宣稱全部涵蓋。V06使用合成電价和明示partial-month估計政策，並未假定真實電網規則。

V06草案修訂紀錄：最初日合計成本557.50忽略既有「來源×小時」結算。每次乘用补电09:07.5–11:07.5在三个小时分别43.75、50、6.25kWh；0.5元單價按每source-hour HALF_UP為21.88、25、3.13元，共50.01元/日。獨立oracle已明确按各小时結算，5日增加0.05元，最終557.55。此修正不是改產品或原V01–V03 fixture，使草案數學契約與既有公開結算規則一致。

## 發佈前的判定門檻

1. 以實际implementation adapter建立同一输入，逐事件/節點/連線/source hour/15min窗/日/月/交易/庫存比較新oracle。數值容差採能量與功率absolute1e-6或明定相對值；金額按同一invoice/交易分組和HALF_UP cents要求完全一致。
2. 增加欄位roundtrip和缺值gate測試：完整JSON、設備JSON、可編輯CSV、XLSX，再模擬輸出一致；unknown欄位與invalid batch無副作用。
3. 三個新案例仍不能證明所有組合；用需求矩陣逐項列已測/未測/不適用。向外報告限於「指定模型、參數、版本和場景，獨立重算與守恆驗證通過」。
4. 真實獲利需要設備datasheet、現場計量、实际電價/需量、到站資料、成本單據校準。未填項必須形成完整性報告並降低可出結論範圍；不显示無條件100%標章。
