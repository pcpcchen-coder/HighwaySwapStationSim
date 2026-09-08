# 驗證計畫
1. 24行CSV/JSON完整、空白不等於0、A/B逐列與原總計對帳。
2. 電費與服務費独立fixture、SOURCE/ASSEMBLY效率、邊界重疊拒絕。
3. 端口AC/DC/電壓、重複id、開關断開、功率上限、共享上游限流。
4. 同seed重現、事件同時刻順序、庫存/能量平衡、延遲服務。
5. 無貢獻損益兩平、59/60口徑、NPV/IRR与回收期。
6. JSON round-trip、壞資料拒絕、TypeScript、正式建置。
測試結果見VERIFICATION.md，尚未运行的不得先標PASS。
