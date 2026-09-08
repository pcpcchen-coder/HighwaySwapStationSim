# 財務模型
Revenue=sum(delivered billed energy × customer total price)。客戶總價與grid price/服務費分開。SOURCE_DISPLAY_PRICE與EXACT_COMPONENTS是不同結算策略。
Grid cost=sum(actual imported kWh × purchase tariff)，已包含損耗；loss cost不能再扣。現金OPEX、折舊、耗損估計、替換CAPEX分欄，避免重複扣算。
投資試算為全投資簡化口徑；month0初始CAPEX，月度爬坡、固定/變動成本、折現、回收期。費用未確認時標示DEMO，不提供已驗證投資结論。
來源冗餘：ceil(15000×1.6/410)=59；ceil(ceil(15000/410)×1.6)=60。
