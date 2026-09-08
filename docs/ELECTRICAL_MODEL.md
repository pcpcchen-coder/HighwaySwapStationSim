# 電力模型
所有計算用kW、kWh、V、A、hours。三相P限制=min(額定kVA×PF, sqrt(3)×V×A×PF/1000)，DC限制=V×A/1000。
來源效率SOURCE_CHAIN：SST .9557、PCS .9307。ASSEMBLY：.9812×.974、.975×.98×.974。COMPONENT只乘實體階段，禁止重疊包含集合。
電力求解是能量／功率級準靜態模型，並非短路、保護協調、EMT或DC穩定模擬。按圖中可通行的方向路徑配置需求，逐節點保留共享餘量並計算Pin/Pout/loss。閉合多源環路不能被當作已驗證並聯控制。
每step檢查grid input = delivered + converter loss + auxiliary + battery delta。換電在完成事件交換ready/returned能量；不能用售電時間當成補電時間。
