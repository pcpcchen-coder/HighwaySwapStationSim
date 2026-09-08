# 模擬模型
來源重播和受限模擬分開；Web Worker執行，UI不決定物理結果。
Kernel包含seed RNG、有穩定序號的事件queue、clock、registry。事件在步長內切分處理，功率积分以實際dt hours計算。結果保存參數快照與引擎版本。
輸出能量帳、站點服務/排隊、power timeseries、電池期初期末能量與資料警示。長期財務使用獨立明示的代表日假設，不能冒充8760小時完整求解。
