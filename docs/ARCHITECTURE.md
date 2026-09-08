# 架構
UI → SimulationProject (Zod) → Web Worker → SimulationKernel + plugins → immutable RunResult → Charts / tables / export。
packages/contracts：資料契約；schemas：驗證和migration；sim-kernel：時鐘、事件、seed、registry；topology-engine：圖與端口驗證；electrical-engine：逐路徑功率配置／容量與損耗；station-engine：排隊、電池、充電；economics-engine：計費與現金流。
plugins/equipment：可註冊的設備規格和參數。Kernel 不引用 SST/Truck 等具體類別。
apps 的邏輯入口在 app/，由環境既有 Vinext starter 提供渲染；將來可移至 apps/web，不影響 packages。
公式全部在 packages，React 僅輸入/展示。Snapshot含schema、模型版本、source和seed。
