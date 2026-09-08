# 電氣模型 — 0.3.0增補

本版以有向無環路徑分配可行功率，按明定優先序服務輔助、A站電池／槍、B站電池／槍，並非最優EMS或AC潮流求解。固定效率、理想DC連線在解析案例中明示；保護、電壓動態、電纜温度及暫態不在本版驗證域。

箱變kVA×PF是輸入有功額定，所有AC/DC分支共享輸入上限；輸出还受η限制。SST/PCS/DD等按已聲明輸出額定共享限制，母線/槍按電壓×電流及設備額定的較小值。SOURCE_CHAIN校準相應轉換階段，而非全部損耗放到输出限制后；詳細多分支案例採ASSEMBLY。

每時段保存ComponentEnergy與EdgeEnergy，按每步功率乘時長積分；peak為瞬時分配峰值，不能用每小時kWh當peak。逐元件input=output+loss、output=outgoing+terminal、非電源input=incoming，超1e-6kWh停止。容量上限以kW檢查。SourceMeters是實際來源，HourResult站別gridKWh為用電者歸屬。

初始與每次排程變更後都檢查AC/DC/電壓、循環、重複ID、未註冊設備、AC獨立電網並聯與rack/gun供電路徑缺DD。路徑超4096條明確停止；不靜默捨棄。必要輔助供電不足會使相關站務/SST暫停。

完整驗證與前後差異見VERIFICATION.md。以下為先前模型背景，與本增補衝突時以本增補及Master Prompt123–129章為準：

# 電力模型
所有計算用kW、kWh、V、A、hours。三相P限制=min(額定kVA×PF, sqrt(3)×V×A×PF/1000)，DC限制=V×A/1000。
來源效率SOURCE_CHAIN：SST .9557、PCS .9307。ASSEMBLY：.9812×.974、.975×.98×.974。COMPONENT只乘實體階段，禁止重疊包含集合。
電力求解是能量／功率級準靜態模型，並非短路、保護協調、EMT或DC穩定模擬。按圖中可通行的方向路徑配置需求，逐節點保留共享餘量並計算Pin/Pout/loss。閉合多源環路不能被當作已驗證並聯控制。
每step檢查grid input = delivered + converter loss + auxiliary + battery delta。換電在完成事件交換ready/returned能量；不能用售電時間當成補電時間。
