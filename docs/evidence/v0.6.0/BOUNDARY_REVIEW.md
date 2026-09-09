# 完整引擎整合後邊界審核

本記錄描述研究測試發現及其當時狀態，不將尚未回歸的修正視為已通過。

## 發布整合追蹤

下文保留當時發現的狀態；最終結果以同目錄 `release-checks.json` 與測試日誌為準。已加入正式回歸的項目包括：快照欄位順序、車端電壓二次限流、儲能內部成本轉撥、PV 外售、額外線纜電流限制、補償櫃與箱變耗損、初始過熱、次分鐘爬升。對應 `tests/detailed-model.test.ts`、`tests/detailed-io.test.ts`。

另由任意累計時間窗測試發現：以 rack 型節點承接自訂站用負載時，營運邊界曾出現 304 kWh 誤差；現已依 `detailed.loads[].nodeId` 分類，且三個完整案例的全期與次分鐘時間窗均核對。另禁止同一端點同時充當實際車輛服務和自訂站用负載，避免不同計量邊界混用。

## 最新追蹤更新

正式repo候選 `detailed-model.test.ts` 已以最新真实engine執行 **9/9組測試全通過**，strict TypeScript亦全通過。主三案保持33803比較；新增回歸確認下述snapshot key順序、800V profile二次限流、ESS內部成本轉撥均已修正。當時失敗案例保留在下文供說明發現過程。

PV逆送另新增獨立golden：一小時可用PV120、MPPT90%、本地负載40、逆變80%、額定50、併網輸出限制48kW。实际採收111.111111…、棄光8.888889…、輸出電網48、转换損耗23.111111…kWh、收入12元（0.25元/kWh），全部比對通過。另驗證無PV時不可從grid購電再冒充PV外售；接收grid停用時出口停止、PV仍供本地40kWh。

正式整合路徑：`projects.ts`→`packages/detailed-verification/index.ts`；`detailed-model.test.ts`→`tests/detailed-model.test.ts`；`expected.json`→`data/verification/detailed-expected.json`；`calculate-detailed.py`→`data/verification/calculate-detailed.py`。**必須使用calculate-detailed.py，該檔只寫detailed-expected.json，保護舊expected.json。**

## 已通過的完整入口檢查

使用 `packages/detailed-model/engine.ts::simulateDetailed`，不是原型primitive適配器。輸入來自 `configs.ts`，獨立期望值來自 Python Decimal70。

`run-detailed.ts` 已產生 `detailed-comparison.json`，紀錄源檔SHA256與時間。3案全部通過：

| 案例 | 獨立數值/事件比較 | 原始trace節點/邊/source-hour對帳 |
|---|---:|---:|
| V04 3日 | 18 | 3963 |
| V05 4日 | 11 | 9987 |
| V06 5日 | 21 | 19803 |
| 合计 | 50 | 33753 |

合計33803項。獨立預期最大差7.50e-10分鐘（共享容量求解微差）；ledger最大3.42e-13kWh。這些結果只覆蓋已記錄案例和版本。

另外實跑：

- V04清空所有到站：全期grid/loss/revenue均0；初末庫存200。
- 單筆1kWh、80kW槍：0.75min完成，grid1.0741138560687433、loss0.07411385606874336kWh；來源小時計價1.07元。
- A-grid全期停用：只從初庫存完成1次60kWh換電，購電0，庫存200→140，不能被誤當可持續盈利。
- `result.parameterSnapshot`匯出XLSX載回後深度相等；編輯原Project不改動既有snapshot；變更設計直接與舊結果一起匯出被拒絕。
- 線纜模型與另設1A限制同時啟用的修正版：計算峰值1.00000001A，B供電受限。

## 已定位並修正後重跑通過

1. `slotEtaMap()`實際回傳Record，engine/policy按Map呼叫`.get()`導致所有情境立即失敗。主代理轉為Map後V04/V06成功。
2. `reachable()`先命中target再檢查enabled，停用的正常母線仍被ATS當健康。V05原僅計PV/ESS、UPS完全不動；主代理調換檢查順序後V05得到400PV+50grid=336aux+114loss、初末storage70。
3. 線纜分支提前return略過`currentLimitA`；主代理補上限制，已用1A低額定實測生效。

## 已實證，需由主代理完成/回歸確認

### Snapshot的物件欄位順序

對全新 `p=v04Project(); r=simulateDetailed(p)`，未改動p就呼叫`exportWorkbook(p,r)`曾觸發`EXPORT_SNAPSHOT_MISMATCH`。原因`parseProject`重排key，p與snapshot深度相等但`JSON.stringify`不同。解法應保留經驗證原始輸入快照或使用完整canonical比較，不應忽略值變更。

### SOC profile受舊固定車壓二次限流

一筆100kWh充電，profile為800V、600A、480kW、SOC0→1、內效率1；上游SST/DD各1000kW，槍480kW/600A/1000V。僅legacy `vehicleVoltage`保留637.56V。

獨立預期：480kW，12.5min完成。當時實際：382.536000001kW，15.684798293min完成。ServiceFleet已依profile算480，但network `outputCapacity(gun)`再次套固定637.56V，形成無意的第二限制。須profile模式使用動態車壓和已驗證車端限制；legacy energy模式才使用固定車壓。

### ESS轉入換電庫存成本

全期購電0，ESS期初100kWh/50元，A重卡庫存初0，B重卡庫存100kWh/50元；ESS經95%DD給A充入95kWh。物理結果正確：grid0、loss5、fleet100→195、ESS100→0。

當時engine的A-truck `inflowPurchaseCost=50`其實是ESS內部轉撥值。`valueRunInventory`把其當外購並檢查ΣinflowPurchaseCost≤gridCost，因50>0而拋錯。需要外購/內部轉撥邊界資料與站級消除。若DD損耗隨取得成本資本化，期末A95kWh值50、B100值50；站級能源expense=0是本例明示會計政策。

## 讀碼發現，需專項驗證/明確限制

- PV `exportLimitKW`曾未被engine引用，只由pvAvailable回傳。非0設定不得無聲等同0；需要實際逆送路徑、電表及收入，或明確拒絕未支援模式。
- ramp用`Math.max(1,t-previous)`把所有不足1min事件當整分鐘；lastOutput也未在idle時歸零，可能突破爬升限額。
- 只有被分配request的節點才有out；獨立compensation櫃沒有負載request，out=0導致該位置啟用補償無效果。需明確所屬受電bus/箱變和Q流界面。
- 同node compensation+transformer：compensation算出activeKW含耗電後，transformer以原out重算並覆寫input，可能漏掉電容耗損。
- 初始overheat集合為空；若使用者初始溫度已越限，第一時間步仍可能供電。
