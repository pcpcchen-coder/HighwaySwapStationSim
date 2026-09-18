# 離線單檔建置與驗收

## 2026-09-18 啟動修正

前一版由臨時stdin TSX建立入口。入口被轉為 `React.createElement(...)`，但沒有匯入React，實際啟動會拋出 `ReferenceError: React is not defined`。HTML外框可見，React主畫面完全沒有掛載。前次腳本語法檢查與Worker數值比較沒有執行入口，所以漏掉這個缺陷。

修正使用獨立的 `offline/entry.tsx`，明確匯入 `createElement` 與 `createRoot`；建置也明確使用automatic JSX runtime。所有依賴、CSS及模擬Worker仍內嵌於同一HTML，原CSP不放寬。啟動例外會顯示錯誤資訊，不再只有空白。UI上方會標示「啟動修正版 2026-09-18」。

## 建置

```bash
npm ci
npm run build
npm run build:offline
```

預設產出 `outputs/HighwaySwapSim-0.7.0-offline.html`，不依賴舊HTML作為模板。也可指定輸出：

```bash
npm run build:offline -- /absolute/path/HighwaySwapSim-0.7.0-offline.html
```

`scripts/build-offline.mjs`以同一版本的正式建置CSS為輸入，檢查完整Worker替換與外部模組依賴。HTML內保留來源SHA與離線修正版標記。先完成正式建置，再產生離線版。

## 啟動回歸

```bash
npm run test:offline
# 驗證已產出的交付檔，不重新建立檔案：
OFFLINE_HTML_PATH=/absolute/path/HighwaySwapSim-0.7.0-offline.html npm run test:offline
```

新增兩項整合測試，使用交付HTML內的完整JavaScript與DOM：

- 在沒有全域React的環境掛載主畫面。
- 透過介面切換高／中／低，確認A側換電次數71／51／35，開啟十年頁。
- 透過「執行測算」啟動HTML內嵌的Worker程式，核對低負載交付52,212.536 kWh，並開啟能量流節點。
- 透過下載按鈕取得JSON與XLSX，重新解析並核對低負載設定、69次雙站換電及10個年度。
- 人為注入啟動例外，確認使用者能看到明確錯誤。

驗證使用JSDOM與VM模擬Worker通訊。測試傳輸保持接收端物件原型，避免測試環境的跨realm物件被嚴格資料驗證誤判；分頁操作包含mousedown。JSDOM沒有真實layout，因此DOM測試不解析樣式，不模擬圖表尺寸；樣式仍完整留在交付HTML。這些測試不代表已在Edge／Chrome完成原生file://、CSP或視覺驗收。

本次測試2/2通過、typecheck與正式建置通過。物理與年度公式沒有修改。jsdom及esbuild為明確列入的開發相依，沒有升級既有套件版本。
