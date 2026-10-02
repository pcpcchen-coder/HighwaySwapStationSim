# 07｜需求—實現—測試—操作追溯矩陣

本表將40項REQ連到現行來源檔、可執行測試、證據與SOP。需求狀態不等於UAT或現場驗收。EV定義见 [證據索引](05_VERIFICATION_REPORT.md)，TC程序见 [測試計畫](04_TEST_PLAN.md)，SOP见 [操作程序](06_OPERATIONS.md)。

## 1. 狀態說明

- 實現：本次已讀取並核對現行來源路徑與相關行為。
- 測試：列出既有測試檔；歷史結果須再對照EV，不能僅凭檔案存在稱為通過。
- 選配：可配置的模型能力；實際啟用與現場確認分開。
- 文件：有程序與識別記錄；不代表已實際完成回復或簽核。

## 2. 逐項對照

### REQ-001

**雙服務區與接入邊界** — 已實現；既有測試／歷史證據，本次未重跑產品測試。

| 對照項 | 位置／依據 |
|---|---|
| 實現 | [packages/engineering/single-bus.ts](../../packages/engineering/single-bus.ts) |
| 測試程式 | [tests/single-bus.test.ts](../../tests/single-bus.test.ts) |
| 測試程序 | TC-001,TC-002（[定義](04_TEST_PLAN.md)） |
| 證據 | EV-01,EV-02（[分級與範圍](05_VERIFICATION_REPORT.md)） |
| 操作 | SOP-01,SOP-02（[步驟](06_OPERATIONS.md)） |

### REQ-002

**單一公共DC母線** — 已實現；既有測試／歷史證據，本次未重跑產品測試。

| 對照項 | 位置／依據 |
|---|---|
| 實現 | [packages/detailed-model/single-bus-project.ts](../../packages/detailed-model/single-bus-project.ts) |
| 測試程式 | [tests/single-bus.test.ts](../../tests/single-bus.test.ts) |
| 測試程序 | TC-001,TC-002（[定義](04_TEST_PLAN.md)） |
| 證據 | EV-01,EV-02（[分級與範圍](05_VERIFICATION_REPORT.md)） |
| 操作 | SOP-01,SOP-02（[步驟](06_OPERATIONS.md)） |

### REQ-003

**一期設備數量** — 已實現；既有測試／歷史證據，本次未重跑產品測試。

| 對照項 | 位置／依據 |
|---|---|
| 實現 | [packages/engineering/single-bus.ts](../../packages/engineering/single-bus.ts) |
| 測試程式 | [tests/single-bus.test.ts](../../tests/single-bus.test.ts) |
| 測試程序 | TC-001（[定義](04_TEST_PLAN.md)） |
| 證據 | EV-01,EV-02（[分級與範圍](05_VERIFICATION_REPORT.md)） |
| 操作 | SOP-01,SOP-02（[步驟](06_OPERATIONS.md)） |

### REQ-004

**移除舊版重複設备** — 已實現；既有測試／歷史證據，本次未重跑產品測試。

| 對照項 | 位置／依據 |
|---|---|
| 實現 | [packages/detailed-model/single-bus-project.ts](../../packages/detailed-model/single-bus-project.ts) |
| 測試程式 | [tests/single-bus.test.ts](../../tests/single-bus.test.ts) |
| 測試程序 | TC-001,TC-003（[定義](04_TEST_PLAN.md)） |
| 證據 | EV-01,EV-02（[分級與範圍](05_VERIFICATION_REPORT.md)） |
| 操作 | SOP-01,SOP-02（[步驟](06_OPERATIONS.md)） |

### REQ-005

**雙向支援不重複容量** — 已實現；既有測試／歷史證據，本次未重跑產品測試。

| 對照項 | 位置／依據 |
|---|---|
| 實現 | [packages/detailed-network/index.ts](../../packages/detailed-network/index.ts) |
| 測試程式 | [tests/single-bus.test.ts](../../tests/single-bus.test.ts) |
| 測試程序 | TC-002（[定義](04_TEST_PLAN.md)） |
| 證據 | EV-01,EV-02（[分級與範圍](05_VERIFICATION_REPORT.md)） |
| 操作 | SOP-02,SOP-06（[步驟](06_OPERATIONS.md)） |

### REQ-006

**固定分組與整組互斥** — 已實現；既有測試／歷史證據，本次未重跑產品測試。

| 對照項 | 位置／依據 |
|---|---|
| 實現 | [packages/detailed-model/services.ts](../../packages/detailed-model/services.ts) |
| 測試程式 | [tests/single-bus.test.ts](../../tests/single-bus.test.ts) |
| 測試程序 | TC-004（[定義](04_TEST_PLAN.md)） |
| 證據 | EV-01,EV-02（[分級與範圍](05_VERIFICATION_REPORT.md)） |
| 操作 | SOP-02,SOP-05（[步驟](06_OPERATIONS.md)） |

### REQ-007

**外槍優先與站用聯鎖** — 已實現；既有測試／歷史證據，本次未重跑產品測試。

| 對照項 | 位置／依據 |
|---|---|
| 實現 | [packages/detailed-model/engine.ts](../../packages/detailed-model/engine.ts) |
| 測試程式 | [tests/single-bus.test.ts](../../tests/single-bus.test.ts) |
| 測試程序 | TC-004（[定義](04_TEST_PLAN.md)） |
| 證據 | EV-01,EV-02（[分級與範圍](05_VERIFICATION_REPORT.md)） |
| 操作 | SOP-05,SOP-09（[步驟](06_OPERATIONS.md)） |

### REQ-008

**整機與個別效率可調** — 已實現；既有測試／歷史證據，本次未重跑產品測試。

| 對照項 | 位置／依據 |
|---|---|
| 實現 | [packages/equipment-efficiency/index.ts](../../packages/equipment-efficiency/index.ts) |
| 測試程式 | [tests/equipment-profile.test.ts](../../tests/equipment-profile.test.ts)；[tests/single-bus.test.ts](../../tests/single-bus.test.ts) |
| 測試程序 | TC-003（[定義](04_TEST_PLAN.md)） |
| 證據 | EV-01,EV-06（[分級與範圍](05_VERIFICATION_REPORT.md)） |
| 操作 | SOP-02（[步驟](06_OPERATIONS.md)） |

### REQ-009

**量測邊界與限流** — 已實現；既有測試／歷史證據，本次未重跑產品測試。

| 對照項 | 位置／依據 |
|---|---|
| 實現 | [packages/engineering/single-bus-capacity.ts](../../packages/engineering/single-bus-capacity.ts) |
| 測試程式 | [tests/equipment-profile.test.ts](../../tests/equipment-profile.test.ts)；[tests/single-bus.test.ts](../../tests/single-bus.test.ts) |
| 測試程序 | TC-003,TC-011（[定義](04_TEST_PLAN.md)） |
| 證據 | EV-01,EV-02（[分級與範圍](05_VERIFICATION_REPORT.md)） |
| 操作 | SOP-02,SOP-06（[步驟](06_OPERATIONS.md)） |

### REQ-010

**高／中／低來源劇本** — 已實現；既有測試／歷史證據，本次未重跑產品測試。

| 對照項 | 位置／依據 |
|---|---|
| 實現 | [packages/load-planning/index.ts](../../packages/load-planning/index.ts) |
| 測試程式 | [tests/load-planning.test.ts](../../tests/load-planning.test.ts) |
| 測試程序 | TC-005（[定義](04_TEST_PLAN.md)） |
| 證據 | EV-01,EV-05（[分級與範圍](05_VERIFICATION_REPORT.md)） |
| 操作 | SOP-04（[步驟](06_OPERATIONS.md)） |

### REQ-011

**逐日逐時編輯與交換** — 已實現；既有測試／歷史證據，本次未重跑產品測試。

| 對照項 | 位置／依據 |
|---|---|
| 實現 | [packages/service-profile/index.ts](../../packages/service-profile/index.ts) |
| 測試程式 | [tests/service-profile.test.ts](../../tests/service-profile.test.ts) |
| 測試程序 | TC-006,TC-017（[定義](04_TEST_PLAN.md)） |
| 證據 | EV-01,EV-06（[分級與範圍](05_VERIFICATION_REPORT.md)） |
| 操作 | SOP-04,SOP-08（[步驟](06_OPERATIONS.md)） |

### REQ-012

**AC子集與DC差額** — 已實現；既有測試／歷史證據，本次未重跑產品測試。

| 對照項 | 位置／依據 |
|---|---|
| 實現 | [packages/load-planning/index.ts](../../packages/load-planning/index.ts) |
| 測試程式 | [tests/load-planning.test.ts](../../tests/load-planning.test.ts) |
| 測試程序 | TC-005,TC-006（[定義](04_TEST_PLAN.md)） |
| 證據 | EV-01,EV-05（[分級與範圍](05_VERIFICATION_REPORT.md)） |
| 操作 | SOP-04（[步驟](06_OPERATIONS.md)） |

### REQ-013

**可重現的到站事件** — 已實現；既有測試／歷史證據，本次未重跑產品測試。

| 對照項 | 位置／依據 |
|---|---|
| 實現 | [packages/detailed-model/services.ts](../../packages/detailed-model/services.ts) |
| 測試程式 | [tests/service-profile.test.ts](../../tests/service-profile.test.ts)；[tests/service-fleet.test.ts](../../tests/service-fleet.test.ts) |
| 測試程序 | TC-006,TC-009（[定義](04_TEST_PLAN.md)） |
| 證據 | EV-01,EV-06（[分級與範圍](05_VERIFICATION_REPORT.md)） |
| 操作 | SOP-04,SOP-05（[步驟](06_OPERATIONS.md)） |

### REQ-014

**SOC單一設定入口** — 已實現；既有測試／歷史證據，本次未重跑產品測試。

| 對照項 | 位置／依據 |
|---|---|
| 實現 | [components/simulator/soc-settings.tsx](../../components/simulator/soc-settings.tsx)；[components/simulator/panels.tsx](../../components/simulator/panels.tsx) |
| 測試程式 | [tests/ui-components.test.mjs](../../tests/ui-components.test.mjs)；[tests/station-settings.test.ts](../../tests/station-settings.test.ts) |
| 測試程序 | TC-007,TC-018（[定義](04_TEST_PLAN.md)） |
| 證據 | EV-01（[分級與範圍](05_VERIFICATION_REPORT.md)） |
| 操作 | SOP-03（[步驟](06_OPERATIONS.md)） |

### REQ-015

**明確套用SOC與需求同步** — 已實現；既有測試／歷史證據，本次未重跑產品測試。

| 對照項 | 位置／依據 |
|---|---|
| 實現 | [packages/station-settings/index.ts](../../packages/station-settings/index.ts) |
| 測試程式 | [tests/station-settings.test.ts](../../tests/station-settings.test.ts) |
| 測試程序 | TC-007,TC-013（[定義](04_TEST_PLAN.md)） |
| 證據 | EV-01,EV-06（[分級與範圍](05_VERIFICATION_REPORT.md)） |
| 操作 | SOP-03,SOP-04（[步驟](06_OPERATIONS.md)） |

### REQ-016

**固定需求與SOH一致性** — 已實現；既有測試／歷史證據，本次未重跑產品測試。

| 對照項 | 位置／依據 |
|---|---|
| 實現 | [packages/service-fleet/index.ts](../../packages/service-fleet/index.ts) |
| 測試程式 | [tests/battery-soc-core.test.ts](../../tests/battery-soc-core.test.ts) |
| 測試程序 | TC-008,TC-009（[定義](04_TEST_PLAN.md)） |
| 證據 | EV-01,EV-04（[分級與範圍](05_VERIFICATION_REPORT.md)） |
| 操作 | SOP-03,SOP-05（[步驟](06_OPERATIONS.md)） |

### REQ-017

**逐艙電池與功率曲線** — 已實現；既有測試／歷史證據，本次未重跑產品測試。

| 對照項 | 位置／依據 |
|---|---|
| 實現 | [packages/service-fleet/battery-energy.ts](../../packages/service-fleet/battery-energy.ts)；[packages/battery-trace/index.ts](../../packages/battery-trace/index.ts) |
| 測試程式 | [tests/battery-soc-core.test.ts](../../tests/battery-soc-core.test.ts)；[tests/battery-trace.test.ts](../../tests/battery-trace.test.ts) |
| 測試程序 | TC-008,TC-010（[定義](04_TEST_PLAN.md)） |
| 證據 | EV-01,EV-04（[分級與範圍](05_VERIFICATION_REPORT.md)） |
| 操作 | SOP-03,SOP-06（[步驟](06_OPERATIONS.md)） |

### REQ-018

**排隊與連續庫存** — 已實現；既有測試／歷史證據，本次未重跑產品測試。

| 對照項 | 位置／依據 |
|---|---|
| 實現 | [packages/service-fleet/index.ts](../../packages/service-fleet/index.ts) |
| 測試程式 | [tests/service-fleet.test.ts](../../tests/service-fleet.test.ts)；[tests/single-bus.test.ts](../../tests/single-bus.test.ts) |
| 測試程序 | TC-009,TC-014（[定義](04_TEST_PLAN.md)） |
| 證據 | EV-01,EV-02,EV-04（[分級與範圍](05_VERIFICATION_REPORT.md)） |
| 操作 | SOP-05（[步驟](06_OPERATIONS.md)） |

### REQ-019

**受限測算與缺值門檻** — 已實現；既有測試／歷史證據，本次未重跑產品測試。

| 對照項 | 位置／依據 |
|---|---|
| 實現 | [packages/detailed-model/readiness.ts](../../packages/detailed-model/readiness.ts)；[packages/station-engine/index.ts](../../packages/station-engine/index.ts) |
| 測試程式 | [tests/detailed-boundary-readiness.test.ts](../../tests/detailed-boundary-readiness.test.ts)；[tests/detailed-io.test.ts](../../tests/detailed-io.test.ts) |
| 測試程序 | TC-010（[定義](04_TEST_PLAN.md)） |
| 證據 | EV-01,EV-04（[分級與範圍](05_VERIFICATION_REPORT.md)） |
| 操作 | SOP-01,SOP-05（[步驟](06_OPERATIONS.md)） |

### REQ-020

**時間軸與即時讀數** — 已實現；既有測試／歷史證據，本次未重跑產品測試。

| 對照項 | 位置／依據 |
|---|---|
| 實現 | [packages/power-trace/index.ts](../../packages/power-trace/index.ts)；[packages/battery-trace/index.ts](../../packages/battery-trace/index.ts) |
| 測試程式 | [tests/power-trace.test.ts](../../tests/power-trace.test.ts)；[tests/battery-trace.test.ts](../../tests/battery-trace.test.ts) |
| 測試程序 | TC-012,TC-018（[定義](04_TEST_PLAN.md)） |
| 證據 | EV-01,EV-04（[分級與範圍](05_VERIFICATION_REPORT.md)） |
| 操作 | SOP-06（[步驟](06_OPERATIONS.md)） |

### REQ-021

**區間累計與端點一致** — 已實現；既有測試／歷史證據，本次未重跑產品測試。

| 對照項 | 位置／依據 |
|---|---|
| 實現 | [packages/flow-boundary/index.ts](../../packages/flow-boundary/index.ts) |
| 測試程式 | [tests/flow-boundary.test.ts](../../tests/flow-boundary.test.ts)；[tests/power-trace.test.ts](../../tests/power-trace.test.ts) |
| 測試程序 | TC-011,TC-012（[定義](04_TEST_PLAN.md)） |
| 證據 | EV-01,EV-04（[分級與範圍](05_VERIFICATION_REPORT.md)） |
| 操作 | SOP-06（[步驟](06_OPERATIONS.md)） |

### REQ-022

**多層能量守恆** — 已實現；既有測試／歷史證據，本次未重跑產品測試。

| 對照項 | 位置／依據 |
|---|---|
| 實現 | [packages/flow-boundary/index.ts](../../packages/flow-boundary/index.ts)；[packages/detailed-model/engine.ts](../../packages/detailed-model/engine.ts) |
| 測試程式 | [tests/flow-boundary.test.ts](../../tests/flow-boundary.test.ts)；[tests/detailed-checks.test.ts](../../tests/detailed-checks.test.ts) |
| 測試程序 | TC-011,TC-012（[定義](04_TEST_PLAN.md)） |
| 證據 | EV-02,EV-04（[分級與範圍](05_VERIFICATION_REPORT.md)） |
| 操作 | SOP-05,SOP-06（[步驟](06_OPERATIONS.md)） |

### REQ-023

**固定一期的十年評估** — 已實現；既有測試／歷史證據，本次未重跑產品測試。

| 對照項 | 位置／依據 |
|---|---|
| 實現 | [packages/load-planning/index.ts](../../packages/load-planning/index.ts) |
| 測試程式 | [tests/single-bus.test.ts](../../tests/single-bus.test.ts)；[tests/sst-pcs-comparison.test.ts](../../tests/sst-pcs-comparison.test.ts) |
| 測試程序 | TC-014,TC-015（[定義](04_TEST_PLAN.md)） |
| 證據 | EV-01,EV-02,EV-03（[分級與範圍](05_VERIFICATION_REPORT.md)） |
| 操作 | SOP-07（[步驟](06_OPERATIONS.md)） |

### REQ-024

**年度需求與代表日分離** — 已實現；既有測試／歷史證據，本次未重跑產品測試。

| 對照項 | 位置／依據 |
|---|---|
| 實現 | [packages/load-planning/index.ts](../../packages/load-planning/index.ts) |
| 測試程式 | [tests/load-planning.test.ts](../../tests/load-planning.test.ts) |
| 測試程序 | TC-005,TC-014（[定義](04_TEST_PLAN.md)） |
| 證據 | EV-01,EV-05（[分級與範圍](05_VERIFICATION_REPORT.md)） |
| 操作 | SOP-04,SOP-07（[步驟](06_OPERATIONS.md)） |

### REQ-025

**六案例與背景用電** — 已實現；既有測試／歷史證據，本次未重跑產品測試。

| 對照項 | 位置／依據 |
|---|---|
| 實現 | [packages/load-planning/index.ts](../../packages/load-planning/index.ts) |
| 測試程式 | [tests/single-bus.test.ts](../../tests/single-bus.test.ts) |
| 測試程序 | TC-013,TC-014（[定義](04_TEST_PLAN.md)） |
| 證據 | EV-01,EV-02（[分級與範圍](05_VERIFICATION_REPORT.md)） |
| 操作 | SOP-07（[步驟](06_OPERATIONS.md)） |

### REQ-026

**年度庫存扣除** — 已實現；既有測試／歷史證據，本次未重跑產品測試。

| 對照項 | 位置／依據 |
|---|---|
| 實現 | [packages/load-planning/inventory-adjustment.ts](../../packages/load-planning/inventory-adjustment.ts) |
| 測試程式 | [tests/single-bus.test.ts](../../tests/single-bus.test.ts) |
| 測試程序 | TC-009,TC-014（[定義](04_TEST_PLAN.md)） |
| 證據 | EV-01,EV-02（[分級與範圍](05_VERIFICATION_REPORT.md)） |
| 操作 | SOP-05,SOP-07（[步驟](06_OPERATIONS.md)） |

### REQ-027

**同量SST／PCS效率比較** — 已實現；既有測試／歷史證據，本次未重跑產品測試。

| 對照項 | 位置／依據 |
|---|---|
| 實現 | [packages/load-planning/sst-pcs-comparison.ts](../../packages/load-planning/sst-pcs-comparison.ts) |
| 測試程式 | [tests/sst-pcs-comparison.test.ts](../../tests/sst-pcs-comparison.test.ts) |
| 測試程序 | TC-015（[定義](04_TEST_PLAN.md)） |
| 證據 | EV-01,EV-03（[分級與範圍](05_VERIFICATION_REPORT.md)） |
| 操作 | SOP-07（[步驟](06_OPERATIONS.md)） |

### REQ-028

**年度累計與比較假設** — 已實現；既有測試／歷史證據，本次未重跑產品測試。

| 對照項 | 位置／依據 |
|---|---|
| 實現 | [packages/load-planning/index.ts](../../packages/load-planning/index.ts)；[components/simulator/load-planning-panel.tsx](../../components/simulator/load-planning-panel.tsx) |
| 測試程式 | [tests/sst-pcs-comparison.test.ts](../../tests/sst-pcs-comparison.test.ts)；[tests/offline-ui.test.mjs](../../tests/offline-ui.test.mjs) |
| 測試程序 | TC-015,TC-018（[定義](04_TEST_PLAN.md)） |
| 證據 | EV-01,EV-03（[分級與範圍](05_VERIFICATION_REPORT.md)） |
| 操作 | SOP-07,SOP-09（[步驟](06_OPERATIONS.md)） |

### REQ-029

**財務邊界與缺值揭露** — 已實現；既有測試／歷史證據，本次未重跑產品測試。

| 對照項 | 位置／依據 |
|---|---|
| 實現 | [packages/extended-finance/index.ts](../../packages/extended-finance/index.ts)；[packages/money/index.ts](../../packages/money/index.ts) |
| 測試程式 | [tests/extended-finance.test.ts](../../tests/extended-finance.test.ts)；[tests/financial-regression.test.ts](../../tests/financial-regression.test.ts) |
| 測試程序 | TC-016（[定義](04_TEST_PLAN.md)） |
| 證據 | EV-01,EV-04（[分級與範圍](05_VERIFICATION_REPORT.md)） |
| 操作 | SOP-05,SOP-07,SOP-09（[步驟](06_OPERATIONS.md)） |

### REQ-030

**完整專案JSON與相容性** — 已實現；既有測試／歷史證據，本次未重跑產品測試。

| 對照項 | 位置／依據 |
|---|---|
| 實現 | [packages/schemas/index.ts](../../packages/schemas/index.ts)；[packages/io/index.ts](../../packages/io/index.ts) |
| 測試程式 | [tests/core.test.ts](../../tests/core.test.ts)；[tests/detailed-io.test.ts](../../tests/detailed-io.test.ts) |
| 測試程序 | TC-013,TC-017（[定義](04_TEST_PLAN.md)） |
| 證據 | EV-01,EV-04（[分級與範圍](05_VERIFICATION_REPORT.md)） |
| 操作 | SOP-01,SOP-08（[步驟](06_OPERATIONS.md)） |

### REQ-031

**設備與需求局部交換** — 已實現；既有測試／歷史證據，本次未重跑產品測試。

| 對照項 | 位置／依據 |
|---|---|
| 實現 | [packages/equipment-profile/index.ts](../../packages/equipment-profile/index.ts)；[packages/detailed-profile/index.ts](../../packages/detailed-profile/index.ts) |
| 測試程式 | [tests/equipment-profile.test.ts](../../tests/equipment-profile.test.ts)；[tests/detailed-io.test.ts](../../tests/detailed-io.test.ts)；[tests/service-profile.test.ts](../../tests/service-profile.test.ts) |
| 測試程序 | TC-006,TC-017（[定義](04_TEST_PLAN.md)） |
| 證據 | EV-01,EV-06（[分級與範圍](05_VERIFICATION_REPORT.md)） |
| 操作 | SOP-02,SOP-04,SOP-08（[步驟](06_OPERATIONS.md)） |

### REQ-032

**XLSX結果快照與還原** — 已實現；既有測試／歷史證據，本次未重跑產品測試。

| 對照項 | 位置／依據 |
|---|---|
| 實現 | [packages/io/index.ts](../../packages/io/index.ts) |
| 測試程式 | [tests/detailed-io.test.ts](../../tests/detailed-io.test.ts)；[tests/io-regressions.test.mjs](../../tests/io-regressions.test.mjs) |
| 測試程序 | TC-013,TC-017（[定義](04_TEST_PLAN.md)） |
| 證據 | EV-01,EV-04（[分級與範圍](05_VERIFICATION_REPORT.md)） |
| 操作 | SOP-08（[步驟](06_OPERATIONS.md)） |

### REQ-033

**單檔離線產物** — 已實現；DOM驗證紀錄有，原生瀏覽器離線UAT待執行。

| 對照項 | 位置／依據 |
|---|---|
| 實現 | [scripts/build-offline.mjs](../../scripts/build-offline.mjs)；[offline/entry.tsx](../../offline/entry.tsx) |
| 測試程式 | [tests/offline-ui.test.mjs](../../tests/offline-ui.test.mjs) |
| 測試程序 | TC-018（[定義](04_TEST_PLAN.md)） |
| 證據 | EV-01（[分級與範圍](05_VERIFICATION_REPORT.md)） |
| 操作 | SOP-01,SOP-08,SOP-09（[步驟](06_OPERATIONS.md)） |

### REQ-034

**成功快照與確定性** — 已實現；既有測試／歷史證據，本次未重跑產品測試。

| 對照項 | 位置／依據 |
|---|---|
| 實現 | [components/simulator/workbench.tsx](../../components/simulator/workbench.tsx)；[packages/load-planning/index.ts](../../packages/load-planning/index.ts) |
| 測試程式 | [tests/core.test.ts](../../tests/core.test.ts)；[tests/load-planning.test.ts](../../tests/load-planning.test.ts)；[tests/detailed-io.test.ts](../../tests/detailed-io.test.ts) |
| 測試程序 | TC-013,TC-017（[定義](04_TEST_PLAN.md)） |
| 證據 | EV-01,EV-04（[分級與範圍](05_VERIFICATION_REPORT.md)） |
| 操作 | SOP-05,SOP-08（[步驟](06_OPERATIONS.md)） |

### REQ-035

**來源與假設可追溯** — 已實現；既有測試／歷史證據，本次未重跑產品測試。

| 對照項 | 位置／依據 |
|---|---|
| 實現 | [data/reference/source-manifest.json](../../data/reference/source-manifest.json)；[packages/reference/index.ts](../../packages/reference/index.ts) |
| 測試程式 | [tests/load-planning.test.ts](../../tests/load-planning.test.ts)；[tests/service-profile.test.ts](../../tests/service-profile.test.ts) |
| 測試程序 | TC-005,TC-006,TC-020（[定義](04_TEST_PLAN.md)） |
| 證據 | EV-04,EV-05,EV-08（[分級與範圍](05_VERIFICATION_REPORT.md)） |
| 操作 | SOP-04,SOP-08（[步驟](06_OPERATIONS.md)） |

### REQ-036

**獨立驗證與回歸** — 已實現；既有測試／歷史證據，本次未重跑產品測試。

| 對照項 | 位置／依據 |
|---|---|
| 實現 | [scripts/verification/run.ts](../../scripts/verification/run.ts)；[scripts/verification/run-detailed.ts](../../scripts/verification/run-detailed.ts)；[scripts/verification/run-soc.ts](../../scripts/verification/run-soc.ts) |
| 測試程式 | [tests/soc-live-verification.test.ts](../../tests/soc-live-verification.test.ts)；[tests/detailed-checks.test.ts](../../tests/detailed-checks.test.ts) |
| 測試程序 | TC-011,TC-020（[定義](04_TEST_PLAN.md)） |
| 證據 | EV-01,EV-04,EV-08（[分級與範圍](05_VERIFICATION_REPORT.md)） |
| 操作 | SOP-05,SOP-06（[步驟](06_OPERATIONS.md)） |

### REQ-037

**圖面與可操作性** — 已實現；幾何／SSR測試有，原生視覺驗收未補齊。

| 對照項 | 位置／依據 |
|---|---|
| 實現 | [packages/reference-layout/index.ts](../../packages/reference-layout/index.ts)；[components/simulator/workbench.tsx](../../components/simulator/workbench.tsx) |
| 測試程式 | [tests/reference-layout.test.ts](../../tests/reference-layout.test.ts)；[tests/ui-components.test.mjs](../../tests/ui-components.test.mjs) |
| 測試程序 | TC-001,TC-018（[定義](04_TEST_PLAN.md)） |
| 證據 | EV-01,EV-06（[分級與範圍](05_VERIFICATION_REPORT.md)） |
| 操作 | SOP-02,SOP-06（[步驟](06_OPERATIONS.md)） |

### REQ-038

**選配與模型限制分開** — 選配已實現；一期停用者不計成果，現場確認另案。

| 對照項 | 位置／依據 |
|---|---|
| 實現 | [packages/detailed-model/readiness.ts](../../packages/detailed-model/readiness.ts)；[packages/physical-models/index.ts](../../packages/physical-models/index.ts) |
| 測試程式 | [tests/physical-models.test.ts](../../tests/physical-models.test.ts)；[tests/detailed-boundary-readiness.test.ts](../../tests/detailed-boundary-readiness.test.ts) |
| 測試程序 | TC-010,TC-019（[定義](04_TEST_PLAN.md)） |
| 證據 | EV-01,EV-04（[分級與範圍](05_VERIFICATION_REPORT.md)） |
| 操作 | SOP-02,SOP-09（[步驟](06_OPERATIONS.md)） |

### REQ-039

**版本與還原可追溯** — 還原文件與版本識別已備；本次未做還原演練。

| 對照項 | 位置／依據 |
|---|---|
| 實現 | [docs/RESTORE_BEFORE_SST_PCS_CHART.md](../../docs/RESTORE_BEFORE_SST_PCS_CHART.md) |
| 測試程式 | 人工程序與文件檢查；無自動化還原驗收 |
| 測試程序 | TC-020（[定義](04_TEST_PLAN.md)） |
| 證據 | EV-07,EV-08（[分級與範圍](05_VERIFICATION_REPORT.md)） |
| 操作 | SOP-08,SOP-10（[步驟](06_OPERATIONS.md)） |

### REQ-040

**需求至結案文件鏈** — 本次文件已建立；正式結案與簽核待接收者完成。

| 對照項 | 位置／依據 |
|---|---|
| 實現 | [docs/closeout/README.md](../../docs/closeout/README.md) |
| 測試程式 | 人工程序與文件檢查；無自動化還原驗收 |
| 測試程序 | TC-020（[定義](04_TEST_PLAN.md)） |
| 證據 | EV-08（[分級與範圍](05_VERIFICATION_REPORT.md)） |
| 操作 | SOP-08（[步驟](06_OPERATIONS.md)） |

## 3. 維護規則與完整性

目前矩陣包含REQ-001至REQ-040，對應TC-001至TC-020及SOP-01至SOP-10。需求新增、刪除、程式搬移、測試更名或來源版本改變時須更新此表；已過時證據保留版本標示，不把狀態直接改為新版本通過。

有未對應項時應列為覆蓋缺口。原生瀏覽器、實測、正式簽核等不因本表所有欄都有連結而自動完成。文件連結與編號檢查結果記於 [DOCUMENTATION_AUDIT.json](DOCUMENTATION_AUDIT.json)。
