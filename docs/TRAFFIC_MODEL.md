# 車流模型
來源重播忠實呈現24小時表；受限模擬將每小時count轉成均勻到達請求，可選固定seed的隨機到達。來源未提供完整高速通行車流、價格彈性與路網，這些不是已校準模型。
換電排隊需要bay與ready電池；充電排隊需要終端與共享功率。每個請求保存arrival/start/completion、requested/delivered energy。未完成保留未供能，不強制補滿來源總計。
