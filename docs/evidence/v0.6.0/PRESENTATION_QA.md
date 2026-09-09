# HighwaySwapSim v0.6 驗證簡報交付

交付檔案：

- `output/HighwaySwapSim-v0.6-Verification.pptx`
- `output/HighwaySwapSim-v0.6-Verification.pdf`

PDF 為最終 PPTX 的視覺預覽，文字與表格編輯請使用 PPTX。未開啟桌面版 PowerPoint，不宣稱已做該應用程式測試。

## 九頁內容

1. 模型驗證範圍與 33,803 項比較結果。
2. 原圖缺口對應完整模型的供電、設備、備援、車隊、財務能力。
3. `null`、`0`、停用的區別，JSON/CSV/XLSX 與快照。
4. V04 三日共享 DD／母聯，獨立 expected 與真實引擎 actual。
5. V05 四日 PV／ESS／UPS，發電、棄光、儲能與負載守恆。
6. V06 五日乘用服務與跨月電费，金額結算與月峰限制。
7. 50 項獨立数值／事件與 33,753 項原始帳目檢查的計數。
8. 800 V 二次限流、ESS 內部成本轉撥、PV 逆送、快照／設備狀態的修正回歸。
9. 使用者驗算順序，對外可說的有限驗證結論與現場校準要求。

## 完成的文件品質檢查

- 9 頁，7 個原生可編輯表格，指定頁 2–8 均有原生 table。
- V04/V05/V06 每筆表內 expected 與 actual 在顯示精度下相同。
- 第 7 頁三欄合計經明確 arithmetic contracts 驗證。
- First-party Artifact Tool 匯入成功。
- 套件結構、字型政策、版面幾何全部通過，最終零警告。
- 9 頁逐頁以完整尺寸檢查，無遮擋、截斷、空白表頭或溢出。
- 最終 notes 改為 repo 路徑後重新匯出，再逐頁獨立程序渲染。9 頁與已檢查版本像素完全一致。
- PDF 9 頁均由 Poppler 成功解碼渲染，且其內嵌圖片與已檢查 PPTX 頁圖的 RGB 像素逐頁完全一致。

## 研發過程修正

第一次版面檢查指出第 2 頁表格過密，已調整字級、內距與表格範圍，最終零警告。

同一 Artifact Tool 程序連續渲染時曾出現重複表頭文字缺失，PPTX 原生表格 XML 內容正確。最終每頁使用獨立程序匯入和渲染，全部表頭已視覺確認。

PDF 全頁批次轉圖時曾出現一張中間 PNG 未完整寫入。最後每頁獨立執行 Poppler，9 頁完整解碼。PDF 內嵌圖片再與來源逐像素檢查，不以低畫質圖片比較假裝排版通過。

## 模型證據範圍

簡報數值來自 `simulateDetailed` 三案與獨立 Decimal70 期望值。模型比較本身由主驗證工作完成，本簡報沒有另跑或擴張成未知的測試數量。

發布前應以 repo 最後重跑的下列檔案為來源定位：

- `docs/evidence/v0.6.0/detailed-comparison.json`，含 sourceSHA256。
- `docs/evidence/v0.6.0/BOUNDARY_REVIEW.md`。
- `docs/evidence/v0.6.0/ACCEPTANCE_MATRIX.md`。
- `packages/detailed-verification/index.ts`。
- `data/verification/calculate-detailed.py`。
- `data/verification/detailed-expected.json`。
- `tests/detailed-model.test.ts`。

投影片不包含暫存 sourceSHA256，不列仍在變動的核心測試總組數，也不將舊三案 47,489 個比較混入新三案 33,803 個比較。

## 完整性

- PPTX SHA256：`3b867713bcd051458436634178b619b9bf5ef564e935ee7665618e6a22de7c2e`
- PDF SHA256：`d92df982a92d3591ab209a8d50bce4a5679a76e7dbd8fb69b99923e06360eac0`

建立來源在 `build/build-deck.mjs`，最終驗證收據為 `build/validation-v0.6_public.json`，套件檢查為 `build/package-qa.json`，PDF 圖片精確比對為 `build/pdf-integrity-qa.json`。其餘先前 revision 與中間圖不屬於交付檔案。
