# HighwaySwapSim — Master Prompt 整合版 2026-09-08

本文件可整份交給 Kimi 執行。以使用者本次附上的 Master Prompt 為基底，完整保留原第 0–100 章，再追加第 101–114 章，納入四張新附件。這是需求整合文件，不代表程式已實作或案例已完成物理驗證。

**閱讀與實作順序：先讀本頁及第 101–114 章，再依原開發流程實作。新增章節屬於正式需求，不能當成可選的未來功能。**

| 原章節 | 本次生效的補充／修正 |
|---|---|
| 3、4、8、10、26 | 加入雙服務區實際供用電架構、SST、環網櫃、UPS、ATS、雙 800 V 母線與分期擴容。 |
| 13、60 | 效率採量測邊界與包含關係，禁止組件與已包含該組件的整機效率重複乘算。 |
| 19、21、83、86 | 保留原 Demo；另新增附件八月 24 小時案例，區分資料重播與受設備限制的動態模擬。 |
| 27、28、78 | 貨幣改為可配置；附件案例暫以 CNY 計價並標示 ASSUMPTION，原 NT$ 範例繼續保留。 |
| 30、33 | 電網購電成本已含損耗所需購入電量，Energy Loss Cost 僅為拆解指標，不能再次扣除。 |
| 58 | SST 從「未來新增插件示例」升為本次必備設備；新增設備不改 sim-kernel 的驗收仍成立。 |
| 67 | CAPEX、OPEX、損益兩平、回收期、NPV、IRR 與爬坡期现金流升為本次必備功能。 |
| 48–54、77、85、87 | 增加原始資料、推導值、假設、來源追蹤、案例對帳與財務驗收。 |
| 92–98 | 採第 114 章補充的交付門檻；保留原架構與 Kimi Websites 目標。 |

若原文與新增章節有衝突，以上表與第 101–114 章為準；未涉及部分維持原要求。不要刪除原有車流、電池庫存、EMS、3D、Excel、可擴充架構等需求。

---

# HighwaySwapSim

## 高速公路雙向換電站 Digital Twin / Energy / Traffic / EMS Simulator

我要你幫我設計並實作一套：

**高速公路雙向換電站 Digital Twin + 車流模擬 + 電力系統模擬 + EMS 能源管理 + 經濟收益最佳化 + 設備配置測算平台**

這不是單純 Dashboard，也不是只有漂亮動畫的展示網站。

它必須是一套真正可以用於：

- 換電站工程設計
- 車流與排隊模擬
- PCS / DCDC / ESS / Transformer 容量配置
- 電力損耗分析
- 電價套利
- EMS 策略比較
- 換電與充電商業模式分析
- Scenario 比較
- DOE / Batch Simulation
- 未來 AI / RL / MPC / MILP EMS 研究

的工程測算平台。

最終系統需要能部署至 **Kimi Websites**，並可公開分享。

---

# 0. 開發原則

整個專案最重要的三個原則：

## 0.1 Engineering Correctness First

優先順序：

1. 電力守恆
2. 拓撲合理性
3. 功率 / 電流 / 電壓限制
4. Battery SOC 正確
5. Battery Inventory 正確
6. Queue 正確
7. Traffic 正確
8. Financial calculation 正確
9. Simulation reproducibility
10. Excel 可驗證
11. 3D visualization
12. UI 美觀

任何漂亮 UI 都不能取代工程正確性。

---

## 0.2 Maintainability First

這個系統預期會持續多年修改。

未來可能增加：

- 新 PCS
- 新 DCDC
- 新 Transformer
- Li-ion / LiC / Sodium-ion / Solid-state battery
- 新車種
- 新 EMS
- MPC
- MILP
- RL
- AI Agent
- 新 Tariff
- 新 KPI
- 新 3D model

因此：

**所有架構必須優先考慮可修改、可替換、可擴充。**

---

## 0.3 Simulation 是 Truth Source

架構必須遵守：

```text
Configuration
      ↓
Simulation Engine
      ↓
Canonical State
      ↓
 ┌────┼────────┐
 ↓    ↓        ↓
2D   3D    Analytics
             ↓
       Excel / JSON

```

Rendering 不得控制 Simulation。

Animation 只負責 Visualization。

Simulation State 才是唯一真實資料來源。

---

# 1. 開始寫程式前先研究既有系統

先仔細研究：

## AIDC

[https://ze57ewkeuaurg.kimi.site/](https://ze57ewkeuaurg.kimi.site/)

分析：

- Dashboard
- Layout
- Card
- Input
- Parameters
- Result
- Navigation
- Chart
- Engineering tool UX
- Scenario
- Project management

UI/UX 可以參考其工程測算系統的風格。

---

## AIDCalculator

https://github.com/pcpcchen-coder/AIDCalculator

至少閱讀：

README.md

HANDOFF.md

docs/ARCHITECTURE.md

docs/MODEL.md

docs/VERIFICATION.md

docs/DEPLOYMENT.md

分析：

- React
- TypeScript
- Vite
- Hono
- tRPC
- Drizzle
- MySQL / TiDB
- Equipment Catalog
- Parameters
- Algorithms
- Scenario
- parameterSnapshot
- verifier
- Kimi Websites deployment

新系統可以延續類似技術棧與工程理念。

但是：

**不要直接修改 AIDCalculator。**

建立新的 repo。

名稱：

`HighwaySwapSim`

---

# 2. Product Positioning

這套系統的定位：

> Highway Battery Swap Station Digital Twin & Energy Simulation Platform

同時模擬：

## Layer 1

Traffic

## Layer 2

Station Operation

## Layer 3

Electrical System

## Layer 4

EMS / Economics

資料流：

```text
Highway Traffic
      ↓
Vehicle Demand
      ↓
Swap / Charge Demand
      ↓
Battery Inventory
      ↓
Charger / DCDC
      ↓
DC Bus
      ↓
PCS
      ↓
ESS
      ↓
Transformer
      ↓
Grid
      ↓
Electricity Cost
      ↓
EMS Optimization
      ↓
Station Profit

```

---

# 3. 場域

建立高速公路雙向交流道場景。

```text
Direction A →→→→→→→

        Station A
            │
        Interchange
            │
        Station B

←←←←←←← Direction B

```

兩側各有換電站：

- Station A
- Station B

必須支援：

- 獨立運作
- AC Tie
- DC Tie
- Shared PCS
- Shared ESS
- Shared Transformer
- Cross-station power exchange

---

# 4. 附圖解析

我會提供不同電力架構附圖。

你必須仔細辨識：

- Grid
- Transformer
- AC Bus
- PCS
- DC Bus
- DCDC
- ESS
- Charger
- Battery Rack
- Swap Station
- Switch
- Breaker
- Cable
- Busbar
- Meter
- PV
- Load
- Vehicle
- Heavy Truck
- Passenger Vehicle

不要只把圖當圖片。

必須轉換成：

```text
Equipment
+
Parameters
+
Ports
+
Connections
+
Simulation Model

```

若有設備不確定：

標記：

`ASSUMPTION`

並寫入：

`docs/ASSUMPTIONS.md`

---

# 5. UI 風格

視覺與互動概念參考：

Maxis / Electronic Arts 的 SimCity 系列所代表的：

- city-builder interaction
- isometric simulation
- information overlay
- zoom / pan
- object selection
- visual traffic flow
- simulation time control

但：

不要複製：

- SimCity assets
- UI
- icons
- textures
- buildings
- artwork
- logo

Art Direction：

```text
SimCity-inspired
modern isometric city-builder
professional industrial digital twin
engineering simulation
clean visualization
data-driven overlays

```

目標：

> 第一眼像一套可以操作的城市建設模擬器。

但使用後發現：

> 它其實是一套真正的換電站 Digital Twin 工程工具。

---

# 6. 系統模式

系統主要有三大模式。

## DESIGN

2D Engineering Studio。

## SIMULATION

3D / 2.5D Digital Twin。

## ANALYTICS

工程結果分析。

另外增加：

## DEVELOPER

方便未來維護與 AI Agent 修改。

---

# 7. DESIGN — Power System Studio

建立類似：

- Simulink
- draw\.io
- Node-RED
- ETAP

概念的可拖拉拓撲編輯器。

建議：

`@xyflow/react`

Layout：

```text
┌──────────────┬──────────────────────┬──────────────┐
│ Component    │                      │ Parameter    │
│ Library      │ Power Canvas         │ Inspector    │
│              │                      │              │
└──────────────┴──────────────────────┴──────────────┘

```

---

# 8. Component Library

至少包含：

## Grid

Utility Grid

---

## Transformer

Parameters：

- Rated Power
- Primary Voltage
- Secondary Voltage
- Efficiency
- No-load Loss
- Load Loss
- Impedance %
- X/R
- Max Current

---

## PCS

- Rated Power
- Max Charge Power
- Max Discharge Power
- AC Voltage
- DC Voltage Range
- Efficiency Curve
- Standby Power
- PF
- Reactive Power
- Ramp Rate
- Bidirectional

---

## DCDC

- Rated Power
- Input Voltage
- Output Voltage
- Max Current
- Efficiency Curve
- Bidirectional
- Ramp Rate

---

## ESS

- Capacity kWh
- Rated Power kW
- SOC Initial
- SOC Min
- SOC Max
- Charge Efficiency
- Discharge Efficiency
- SOH
- Temperature
- Self-discharge
- Cycle Cost
- Degradation Cost

---

## Charger

- Rated Power
- Min Power
- Efficiency
- Voltage Range
- Current Limit
- Channels

---

## Battery Rack

- Battery Count
- Battery Capacity
- Initial SOC Distribution
- Ready SOC
- Min SOC
- Max SOC
- Battery Type
- SOH
- Temperature

---

## Swap Bay

- Number of Bays
- Swap Time
- Preparation Time
- Robot Time
- Max Queue
- Availability
- Failure Rate

---

## PV

- Rated Power
- Generation Curve
- Efficiency

---

## Cable

- Length
- Resistance
- Inductance
- Reactance
- Voltage
- Current Limit
- Power Limit

---

## AC Bus

- Voltage
- Current Limit

---

## DC Bus

- Nominal Voltage
- Voltage Range
- Current Limit

---

## Switch / Breaker

- Rated Voltage
- Rated Current
- Open / Closed

---

## Auxiliary Load

- Fixed Load
- Variable Load
- Schedule

---

## Meter

Measurement point。

---

# 9. Component 操作

所有元件支援：

- Drag
- Drop
- Move
- Duplicate
- Delete
- Connect
- Disconnect
- Edit
- Copy
- Rename

---

# 10. 拓撲

例如：

```text
GRID
 ↓
Transformer
 ↓
AC Bus
 ↓
PCS
 ↓
DC Bus
 ├─ ESS
 ├─ DCDC → Battery Rack
 └─ Charger

```

也可以：

```text
Station A
   │
DC Tie
   │
Station B

```

Topology 必須使用：

```text
Node[]
Edge[]

```

而不是 hardcode pipeline。

---

# 11. Port Architecture

每個設備都必須宣告 Port。

例如：

```ts
interface ElectricalPort {
  id: string

  domain:
    | "AC"
    | "DC"

  direction:
    | "input"
    | "output"
    | "bidirectional"

  voltageRange: {
    min: number
    max: number
  }

  maxCurrent: number

  phases?: number
}

```

PCS：

```text
AC Port
400Vac

DC Port
600–1000Vdc

```

DCDC：

```text
HV DC Port
LV DC Port

```

---

# 12. Topology Validation Engine

Start Simulation 前一定要 Validate。

至少驗證：

## AC / DC Compatibility

例如：

AC Bus 不可直接接 DC Bus。

---

## Voltage Compatibility

800V DC 不可直接接 400V AC。

---

## Power Rating

例如：

500kW Transformer

不能長時間供應：

900kW Load。

---

## Current Limit

DC：

```text
I = P / V

```

3-phase AC：

```text
I = P / (sqrt(3) × V × PF)

```

檢查：

- Cable
- PCS
- DCDC
- Bus
- Transformer
- Breaker

---

# 13. Electrical Loss

Cable：

```text
P_loss = I²R

```

Energy：

```text
E_loss = P_loss × dt

```

---

Converter：

```text
Pout = Pin × efficiency

```

需支援：

- Transformer loss
- PCS loss
- DCDC loss
- Charger loss
- Battery efficiency
- Cable loss

---

# 14. Energy Conservation

每個 step 必須驗證：

```text
Energy In
≈
Energy Out
+
Loss
+
ΔStored Energy

```

超過 tolerance：

WARNING / ERROR。

---

# 15. Simulation Architecture

採用：

## Hybrid Simulation

Traffic：

Discrete Event Simulation。

Electrical：

Time-Step Simulation。

---

# 16. Traffic Events

至少：

```text
VEHICLE_GENERATED

HIGHWAY_ENTER

STATION_DECISION

STATION_ENTER

QUEUE_ENTER

SWAP_START

SWAP_COMPLETE

CHARGE_START

CHARGE_COMPLETE

STATION_EXIT

HIGHWAY_EXIT

```

---

# 17. Simulation Time

Simulation Time 與 Rendering Time 完全分離。

Simulation Duration：

- 1 hour
- 6 hour
- 24 hour
- 7 day
- 30 day
- 1 year

Simulation Interval：

- 1 sec
- 5 sec
- 10 sec
- 30 sec
- 1 min
- 5 min
- 15 min
- 60 min
- Custom

Speed：

- Pause
- 1x
- 2x
- 5x
- 20x
- 100x
- MAX

MAX：

不要求逐 frame animation。

優先高速 calculation。

---

# 18. Vehicle Model

至少支援：

## Heavy Truck

## Passenger Vehicle

未來可增加：

- Bus
- LCV
- Other Vehicle

Vehicle：

```text
id
vehicleType
direction
arrivalTime
speed
batteryCapacity
initialSOC
targetSOC
swapProbability
chargeProbability
queueTolerance
status

```

---

# 19. Traffic Settings

可以調：

Traffic Volume：

vehicle/hour

vehicle/day

---

Vehicle Ratio：

Truck %

Passenger %

---

Behavior：

Swap %

Charge %

Pass Through %

---

Direction：

A %

B %

---

Traffic Profile：

- Constant
- Morning Peak
- Evening Peak
- Double Peak
- User Defined
- CSV Import

Arrival：

- Poisson
- Scheduled
- Custom Distribution
- CSV

---

# 20. Random Seed

支援：

Random Seed。

相同：

- Scenario
- Seed
- Model Version
- Input

必須產生相同結果。

---

# 21. Vehicle Decision

每輛車接近 station 時決定：

- Pass
- Swap
- Charge

依據：

- Vehicle Type
- SOC
- Price
- Queue
- Probability
- Station Status

未來可加入：

- dynamic pricing
- route selection
- queue avoidance

---

# 22. Queue

每站至少計算：

- Current Queue
- Average Queue
- Maximum Queue
- Average Wait
- Median Wait
- P95 Wait
- P99 Wait
- Bay Utilization
- Vehicles Served
- Rejected
- Abandoned

---

# 23. Battery Model

每顆 Battery 是獨立 object。

```text
batteryId
capacity
soc
soh
temperature
maxChargePower
maxDischargePower
status
cycleCount

```

Status：

- READY
- IN\_VEHICLE
- DEPLETED
- WAITING\_CHARGE
- CHARGING
- COOLING
- FAULT

---

# 24. Battery Inventory

追蹤：

- Ready
- Depleted
- Charging
- Cooling
- In Vehicle
- Fault

如果：

```text
Ready Battery = 0

```

即使 Swap Bay 是空的：

也不能完成換電。

---

# 25. Charging Strategies

至少：

1. Charge Immediately
2. TOU Charge
3. Peak Shaving
4. Price Arbitrage
5. Demand Forecast

架構預留：

- MPC
- MILP
- RL
- AI Agent EMS

---

# 26. Electrical Simulation

至少模擬：

- Grid
- Transformer
- PCS
- DCDC
- ESS
- Battery
- Charger
- Station Load
- Auxiliary Load
- PV

每個 interval 紀錄：

- Input Power
- Output Power
- Loss
- Current
- Voltage
- Energy
- Utilization
- Status

---

# 27. Tariff Editor

設定：

## Grid Purchase Price

NT$/kWh

## Grid Selling Price

NT$/kWh

## Swap Price

NT$/swap

或：

NT$/kWh

## Charging Price

NT$/kWh

---

# 28. TOU

支援任意時段。

例如：

```text
00:00–06:00  2.2
06:00–15:00  4.1
15:00–22:00  7.5
22:00–24:00  3.0

```

支援：

- Weekday
- Weekend
- Holiday
- Summer
- Non-Summer
- Custom Calendar
- CSV

---

# 29. Demand Charge

架構支援：

- Maximum Demand
- 15-min Demand
- Contract Demand
- Demand Charge
- Penalty

---

# 30. Economy

Revenue：

```text
Swap Revenue
+
Charging Revenue
+
Grid Selling Revenue
+
Other Revenue

```

Cost：

```text
Grid Purchase Cost
+
Demand Charge
+
ESS Degradation
+
Battery Degradation
+
Energy Loss Cost
+
Optional OPEX

```

Profit：

```text
Profit = Revenue - Cost

```

---

# 31. EMS

建立：

`EMSController`

Input：

```text
Tariff
Traffic Forecast
Swap Forecast
Charge Forecast
Battery SOC
Battery Inventory
ESS SOC
PV Forecast
Grid Limit
Transformer Limit
PCS Limit
DCDC Limit
Cable Limit

```

Output：

```text
PCS command
ESS command
DCDC command
Battery priority
Grid import
Grid export

```

---

# 32. EMS Strategy Pattern

不要把 EMS 寫成一個巨大 class。

建立：

```text
EMSStrategy

├─ ImmediateCharge
├─ TOU
├─ PeakShaving
├─ ProfitOptimization
├─ MPC
├─ MILP
├─ RL
└─ UserStrategy

```

Interface：

```ts
interface EMSStrategy {

  initialize(config): void

  decide(
    state,
    forecast,
    constraints,
    tariff
  ): EMSCommand

}

```

---

# 33. Optimization

Objective：

## Max Profit

```text
maximize:

Revenue
-
Energy Cost
-
Demand Charge
-
Battery Aging
-
ESS Aging

```

另外支援：

- Min Energy Cost
- Min Peak
- Min Waiting Time
- Balanced

Weight：

```text
Profit        50%
Waiting       20%
Peak          20%
Battery Aging 10%

```

---

# 34. Constraints

至少：

```text
SOCmin <= SOC <= SOCmax

P_ESS <= P_ESS_max

P_PCS <= P_PCS_max

P_DCDC <= P_DCDC_max

I_cable <= I_max

P_transformer <= rating

Battery Ready >= 0

Grid Export <= limit

Energy Balance

Inventory Balance

```

---

# 35. 3D Digital Twin

按：

`Build Digital Twin`

根據：

- Topology
- Highway
- Station A
- Station B
- Equipment
- Traffic

建立 2.5D / 3D Scene。

建議：

Three.js

React Three Fiber

Drei。

---

# 36. Camera

支援：

- Pan
- Zoom
- Rotate
- Object Selection

不需要 FPS camera。

---

# 37. Vehicle Animation

流程：

```text
Highway
 ↓
Ramp
 ↓
Station Entrance
 ↓
Queue
 ↓
Swap Bay / Charger
 ↓
Exit
 ↓
Highway

```

不要 teleport。

但：

動畫不得控制 simulation。

---

# 38. Information Layers

像 city-builder 的 Overlay：

## NORMAL

## TRAFFIC

## POWER

## BATTERY

## QUEUE

## ECONOMY

## EMS

---

# 39. POWER VIEW

呈現：

```text
GRID
 ↓
Transformer
 ↓
PCS
 ↓
DCDC
 ↓
Battery

```

用動畫表示 power direction。

線上顯示：

- kW
- A
- V
- Efficiency
- Loss

---

# 40. TRAFFIC VIEW

顯示：

- Vehicle Density
- Traffic Flow
- Congestion
- Queue
- Vehicle/hour

---

# 41. BATTERY VIEW

顯示：

- SOC
- Ready
- Charging
- Low SOC
- Cooling
- Fault

---

# 42. ECONOMY VIEW

顯示：

- Electricity Price
- Cost
- Revenue
- Profit
- Grid Sell Revenue

---

# 43. EMS VIEW

顯示：

- Actual Load
- EMS Command
- ESS Power
- Grid Power
- Charging Power
- Forecast
- Tariff
- Power Limit

---

# 44. Inspector

點任何元件：

例如：

PCS：

```text
Power
Voltage
Current
Efficiency
Utilization
Energy
Loss

```

Vehicle：

```text
ID
Type
SOC
Status
Waiting Time
Destination

```

Battery：

```text
SOC
SOH
Temperature
Status
Charging Power
Cycle Count

```

---

# 45. ANALYTICS

Traffic：

- Vehicles/day
- Vehicles swapped
- Vehicles charged
- Average Wait
- P95 Wait
- Max Queue

Station：

- Bay utilization
- Throughput
- Battery utilization
- Battery shortage
- Charger utilization

Energy：

- Grid Power
- Peak Power
- Energy Import
- Export
- Transformer Loss
- PCS Loss
- DCDC Loss
- Cable Loss
- Overall Efficiency

Economy：

- Electricity Cost
- Swap Revenue
- Charging Revenue
- Grid Sell Revenue
- Demand Charge
- Net Profit
- Profit / vehicle
- Profit / day

---

# 46. Charts

至少：

- Grid Power vs Time
- Electricity Price vs Time
- ESS SOC
- ESS Power
- Station Load
- Swap Demand
- Charging Demand
- Traffic Flow
- Queue Length
- Battery Ready
- SOC Distribution
- Revenue
- Cost
- Profit

---

# 47. Price / Power Alignment Chart

非常重要。

同一時間軸：

- Electricity Price
- Grid Power
- ESS Power
- Charging Power
- Swap Demand
- Revenue

讓使用者一眼看懂：

- 何時買電
- 何時充 ESS
- 何時放 ESS
- 何時賣電
- 何時需求高
- 為什麼獲利

---

# 48. Scenario Manager

支援：

- New
- Save
- Save As
- Duplicate
- Rename
- Delete
- Compare
- Export
- Import

Scenario 包含：

- Topology
- Equipment
- Parameters
- Traffic
- Vehicle
- Battery
- Tariff
- EMS
- Optimization
- Simulation Setting
- Random Seed
- Model Version
- Software Version

---

# 49. Canonical Project Format

系統真正的 Source of Truth 是：

`SimulationProject JSON`

不是 Database。

格式概念：

```json
{
  "schemaVersion": "1.0",

  "project": {},

  "topology": {},

  "equipment": {},

  "traffic": {},

  "battery": {},

  "tariff": {},

  "ems": {},

  "simulation": {},

  "randomSeed": 12345,

  "modelVersions": {}
}

```

Database 只是 persistence。

Excel 只是 human-readable interchange。

---

# 50. Schema Version & Migration

一定要建立：

```text
schemaVersion

```

例如：

```text
1.0
1.1
1.2

```

並建立：

```text
migrations/

1.0-to-1.1.ts
1.1-to-1.2.ts

```

舊 Project 未來仍可讀取。

---

# 51. Parameter Snapshot

每次 Simulation 必須保存：

`parameterSnapshot`

確保未來可以完整重現。

---

# 52. Excel Export

Mandatory。

Simulation 完成後：

下載 `.xlsx`。

至少：

## README

Simulation ID

Scenario

Version

Seed

Duration

Interval

## Scenario

全部設定。

## Topology

Source

Target

Port

Voltage

Cable

## Equipment

全部設備與 parameters。

## Traffic\_Settings

## Vehicle\_Log

## Battery\_Log

## Power\_TimeSeries

## Tariff\_TimeSeries

## EMS\_Log

## Financial

## KPI

## Validation

---

# 53. Excel Import

必須可以：

Import Excel

↓

重建：

- Topology
- Parameters
- Traffic
- Tariff
- EMS
- Seed

↓

Replay Simulation。

---

# 54. JSON Export / Import

JSON 為 canonical format。

支援：

Export Project

Import Project

Replay。

---

# 55. Architecture — Maintainability First

採用：

# Kernel + Plugin + Registry + Schema-driven

Simulation Kernel：

**不可以知道 PCS / DCDC / ESS / Vehicle / EMS 的具體 implementation。**

---

# 56. Monorepo Structure

建議：

```text
HighwaySwapSim/

apps/
  web/
  api/

packages/

  contracts/
  schemas/

  sim-kernel/

  topology-engine/

  traffic-engine/

  electrical-engine/

  battery-engine/

  station-engine/

  economics-engine/

  ems-engine/

  optimization-engine/

  metrics-engine/

  plugin-sdk/

plugins/

  equipment/
    grid/
    transformer/
    pcs/
    dcdc/
    ess/
    charger/
    battery-rack/
    cable/
    ac-bus/
    dc-bus/

  vehicles/
    passenger-car/
    heavy-truck/

  ems/
    immediate/
    tou/
    peak-shaving/
    profit-max/

  tariff/

  metrics/

  renderers/

extensions/

simulation-worker/

data/

docs/

tests/

verifier/

```

---

# 57. Equipment Plugin

建立：

```ts
interface EquipmentPlugin {

  type: string

  metadata: {
    name: string
    category: string
    version: string
  }

  parameterSchema: Schema

  ports: PortDefinition[]

  validate(
    config,
    context
  ): ValidationResult[]

  simulate(
    input,
    state,
    dt
  ): SimulationResult

  calculateLoss(
    operatingPoint
  ): number

  getMetrics(
    state
  ): Metric[]
}

```

---

# 58. 最重要的 Plugin 驗收

未來新增：

```text
Solid State Transformer

```

或：

```text
LiC Storage

```

時：

只需要新增：

```text
plugins/equipment/new-device/

```

**不得修改 sim-kernel。**

---

# 59. Schema Driven UI

所有參數 UI 不可以寫死。

例如設備 schema：

```json
{
  "ratedPower": {
    "type": "number",
    "unit": "kW",
    "default": 500
  },

  "efficiency": {
    "type": "number",
    "unit": "%",
    "default": 97
  }
}

```

Inspector 自動產生 UI。

新增 parameter：

不應該修改 React component。

---

# 60. Formula Registry

公式可版本化。

例如：

```text
pcs_efficiency_v1

pcs_efficiency_curve_v2

pcs_efficiency_map_v3

```

Scenario 指定：

```text
pcsLossModel:
pcs_efficiency_curve_v2

```

---

# 61. Plugin Registry

建立：

```text
PluginRegistry

```

負責註冊：

- Equipment
- Vehicle
- EMS
- Tariff
- Formula
- Metric
- Renderer

---

# 62. Simulation Kernel

Kernel 必須小。

只負責：

```text
SimulationClock

EventQueue

Random

PluginRegistry

StateStore

SimulationScheduler

MetricsCollector

```

Kernel 不應該知道：

什麼叫 PCS。

什麼叫 Truck。

什麼叫 TOU。

---

# 63. Simulation Pipeline

每 interval：

```text
1 Traffic Update

2 Vehicle Events

3 Station Demand

4 Battery Inventory

5 EMS Decision

6 Electrical Solve

7 Constraint Validation

8 Economic Calculation

9 Metrics

10 State Snapshot

```

---

# 64. Web Worker

Interactive simulation 必須放：

Web Worker。

架構：

```text
React UI
   │
Message
   ↓
Web Worker
   │
Simulation Kernel
   ↓
State
   ↓
React / Three.js

```

避免：

100x / MAX simulation 卡 UI。

---

# 65. Batch Simulation

DOE / Batch 走 Server Side。

例如：

```text
Swap Bays
2,4,6,8

Battery
40,60,80,100

PCS
250,500,750,1000

ESS
0,500,1000,2000

Traffic
100~2000 vehicle/hour

```

自動跑 N scenarios。

---

# 66. Pareto Analysis

找：

- Min CAPEX
- Min Waiting Time
- Min Peak Power
- Max Profit
- Max Throughput

產生：

Pareto Front。

---

# 67. CAPEX

Equipment Catalog 保留：

- Transformer Cost
- PCS Cost
- DCDC Cost
- ESS Cost
- Battery Cost
- Charger Cost
- Cable Cost
- Swap Bay Cost

未來計算：

- CAPEX
- OPEX
- ROI
- Payback
- NPV
- IRR

---

# 68. Equipment Catalog

類似 AIDCalculator。

每一設備：

- Vendor
- Model
- Category
- Specification
- Efficiency
- Cost
- Source URL
- Notes
- Custom

支援：

- CRUD
- Enable
- Disable
- Duplicate

---

# 69. Parameters

建立 Parameters Page。

包含：

- Default
- Current
- Unit
- Category
- Description
- Audit Log
- Reset

---

# 70. Algorithm Registry

至少：

- Vehicle Arrival
- Queue
- Battery Charging
- PCS Loss
- DCDC Loss
- Transformer Loss
- Cable Loss
- Tariff
- EMS
- Optimization

每個：

- Name
- Version
- Formula
- Parameter Binding
- Enabled

---

# 71. Metrics Registry

Analytics 不可以 hardcode。

Simulation 輸出：

```json
{
  "timestamp": 3600,

  "metrics": {
    "grid.power": 325,
    "stationA.queue": 8,
    "ess.soc": 0.65
  }
}

```

Dashboard 自己選擇顯示方式。

---

# 72. 3D Renderer Plugin

3D 不可以寫：

```text
if type === pcs

```

設備 plugin 宣告 Renderer。

例如：

```text
renderer:
cabinet

```

或：

```text
renderer:
gltf

```

Simulation model 與 3D asset 完全分離。

---

# 73. Developer Mode

建立：

## Developer

可以查看：

- Plugin Registry
- Equipment Types
- Vehicle Types
- EMS Strategies
- Algorithms
- Schemas
- Model Versions
- Simulation Events
- State Inspector

---

# 74. Extensions

建立：

```text
extensions/

README.md

equipment/
ems/
metrics/
formulas/

```

README 說明：

- How to add equipment
- How to add EMS
- How to add formula
- How to add KPI
- How to add renderer

---

# 75. Extension Acceptance

新增 Equipment Plugin：

不得修改：

`sim-kernel`

新增 EMS：

不得修改：

`electrical-engine`

新增 KPI：

不得修改：

`simulation engine`

新增 3D model：

不得修改：

`physics model`

---

# 76. Navigation

建議：

```text
Overview

Design Studio

Digital Twin

Simulation

Analytics

Scenario

Equipment

Parameters

Algorithms

Developer

Documentation

```

---

# 77. Documentation

內建：

`/docs`

至少：

- System Architecture
- Electrical Model
- Traffic Model
- Battery Model
- Simulation Model
- EMS Model
- Economic Model
- Formula
- Assumptions
- Units
- Verification
- Excel Format
- Extension Guide

---

# 78. Unit System

Power：

W / kW / MW

Energy：

Wh / kWh / MWh

Voltage：

V / kV

Current：

A

Resistance：

Ω

Price：

NT$/kWh

Time：

sec / min / hour

核心 calculation 使用統一 canonical unit。

UI 可以轉換。

---

# 79. Error / Warning

不能 silent failure。

例如：

```text
ERROR:
AC Bus cannot directly connect to DC Bus.

WARNING:
Transformer utilization = 112%.

WARNING:
PCS > 95% rating for 30 min.

ERROR:
Battery inventory < 0.

WARNING:
Station A P95 wait > 15 min.

```

---

# 80. Pre-check

Start Simulation 前：

1. Topology
2. Parameter
3. Voltage
4. Current
5. Rating
6. Battery
7. Traffic
8. Tariff
9. EMS

Critical Error：

禁止開始。

Warning：

允許繼續。

---

# 81. Reproducibility

相同：

- Project
- Seed
- schemaVersion
- modelVersions
- simulation engine version

結果必須一致。

---

# 82. Scenario Compare

比較：

2～4 scenarios。

至少：

- CAPEX
- Peak Power
- Energy
- Loss
- Vehicles Served
- P95 Wait
- Revenue
- Cost
- Profit
- ESS Size
- PCS Size
- Transformer Size
- Battery Count

---

# 83. Benchmark Scenarios

內建：

A Low Traffic

B Rush Hour

C Low Price

D High Peak Price

E ESS Enabled

F ESS Disabled

G Stations Independent

H Power Sharing

---

# 84. EMS Comparison

比較：

- No EMS
- Immediate
- TOU
- Peak Shaving
- Profit Optimization

輸出：

- Cost
- Profit
- Peak
- Service Level
- Battery Availability

---

# 85. Verification

建立：

```text
verifier/

```

至少：

- Unit Test
- Integration Test
- Topology Test
- Energy Balance Test
- Traffic Test
- Queue Test
- Battery Test
- Financial Test
- EMS Test
- Reproducibility Test
- Excel Round-trip Test

---

# 86. Demo Scenario

建立：

`Highway Dual Station Demo`

例如：

Station A：

4 Swap Bays

80 Batteries

40 Chargers

Station B：

4 Swap Bays

80 Batteries

40 Chargers

Traffic：

3000 vehicle/hour

Truck：

20%

Passenger：

80%

Swap：

Truck 20%

Passenger 5%

注意：

必須標：

`DEMO DEFAULT`

不能當成工程標準值。

---

# 87. Acceptance Scenario

```text
duration = 24h

interval = 1min

seed = 12345

```

驗證：

- No negative queue
- No negative battery inventory
- SOC valid
- PCS power valid
- DCDC valid
- Cable current valid
- Energy balance valid
- No NaN
- No Infinity
- Pause works
- Same seed same result
- Excel Export works
- Excel Import reproduces project

---

# 88. Technology Stack

優先延續 AIDCalculator：

Frontend：

React 19

TypeScript

Vite

Tailwind

shadcn/ui

Framer Motion

Topology：

@xyflow/react

3D：

Three.js

React Three Fiber

Charts：

ECharts

Backend：

Hono

tRPC

Database：

Drizzle

MySQL / TiDB

Schema：

Zod

---

# 89. Coding Rules

禁止：

- 所有程式塞 App.tsx
- Simulation 寫進 React component
- 參數 hardcode
- 大量 if(type === ...)
- Animation control simulation
- Engineering formula 寫死在 UI
- Silent error
- Excel 只 export summary
- Database 成為唯一 source of truth

---

# 90. Git

每 major phase commit。

例如：

```text
feat: initialize architecture

feat: add plugin sdk

feat: add project schema

feat: add topology editor

feat: add electrical engine

feat: add traffic simulation

feat: add station simulation

feat: add EMS

feat: add digital twin

feat: add Excel replay

```

---

# 91. Version

網站顯示：

- App Version
- Build Date
- Schema Version
- Simulation Engine Version

---

# 92. 開發階段

## Phase 0

Research。

建立：

```text
docs/REQUIREMENTS.md

docs/ARCHITECTURE.md

docs/ASSUMPTIONS.md

docs/ELECTRICAL_MODEL.md

docs/TRAFFIC_MODEL.md

docs/SIMULATION_MODEL.md

docs/ECONOMIC_MODEL.md

docs/VERIFICATION_PLAN.md

```

---

## Phase 1

先完成核心架構：

```text
PluginRegistry

Plugin SDK

SimulationProject Schema

Schema Migration

Topology Graph

SimulationKernel

```

---

## Phase 2

Equipment Catalog

Parameters

Algorithms

Scenario。

---

## Phase 3

Topology Editor。

---

## Phase 4

Electrical Engine。

---

## Phase 5

Traffic Engine。

---

## Phase 6

Battery / Swap Station。

---

## Phase 7

Tariff / Economic。

---

## Phase 8

EMS。

---

## Phase 9

Web Worker。

---

## Phase 10

2.5D / 3D Digital Twin。

---

## Phase 11

Information Overlay。

---

## Phase 12

Analytics。

---

## Phase 13

Excel / JSON Replay。

---

## Phase 14

Batch Simulation。

---

## Phase 15

Pareto / Optimization。

---

## Phase 16

Verification。

---

## Phase 17

Kimi Websites Deployment。

---

# 93. 每個 Phase Definition of Done

每 Phase：

1. Implementation
2. Unit Test
3. Integration Test
4. TypeScript Check
5. Build
6. Manual UI Check
7. Docs Update
8. Git Commit

才可進下一 Phase。

---

# 94. 第一個 Milestone

在漂亮 3D 前：

一定先完成：

## DESIGN

可拖：

- Grid
- Transformer
- PCS
- DCDC
- ESS
- Charger
- Battery Rack
- Cable
- AC/DC Bus

可連線。

可改參數。

---

## VALIDATE

基本 topology validation。

---

## SIMULATE

跑 24h power simulation。

---

## TRAFFIC

Truck / Passenger。

---

## STATION

Vehicle：

進站

排隊

換電

離站。

---

## ECONOMY

顯示：

Cost

Revenue

Profit。

---

## EXPORT

下載 Excel / JSON。

---

# 95. 第一階段最重要的架構驗收

在開始 3D 前，我要先驗收：

```text
① PluginRegistry

② EquipmentPlugin

③ SimulationProject Schema

④ Schema Migration

⑤ Topology Graph

⑥ SimulationKernel

⑦ Web Worker Interface

```

如果這些沒有設計好：

不要優先做漂亮場景。

---

# 96. 核心 Maintainability Acceptance

新增一個新 Equipment：

不得修改：

`sim-kernel`

新增新 EMS：

不得修改：

`electrical-engine`

新增新 Formula：

不得修改：

UI component

新增新 3D model：

不得修改：

simulation model

新增新 KPI：

不得修改：

core engine

---

# 97. Kimi 執行要求

收到需求後：

不要只規劃。

先完成 Phase 0 文件。

接著直接實作 Phase 1。

不要一直詢問我要不要繼續。

若遇到非關鍵 ambiguity：

做合理 assumption。

寫入：

`docs/ASSUMPTIONS.md`

並繼續開發。

---

# 98. Kimi Websites

最後必須實際完成：

- TypeScript Check
- Tests
- Build
- Preview
- Deploy

並驗證：

- Overview
- Design Studio
- Simulation
- Digital Twin
- Analytics
- Scenario
- Excel Export / Import

可正常使用。

---

# 99. 最終產品體驗

完整使用流程：

```text
New Project

↓

Choose Highway Scenario

↓

Place Station A / B

↓

Drag Equipment

↓

Connect Topology

↓

Edit Parameters

↓

Configure Traffic

↓

Configure Battery

↓

Configure Tariff

↓

Choose EMS

↓

Validate

↓

Start Simulation

↓

Watch Traffic / Power / Battery

↓

Switch Information Layer

↓

Analyze Result

↓

Optimize

↓

Compare Scenario

↓

Export Excel / JSON

↓

Future Import

↓

Replay Simulation

```

---

# 100. 最終產品定位

我要的不是：

「一個換電站動畫網站」。

我要的是：

> **一個像城市建設遊戲一樣直覺，但底層是一套真正可以做換電站車流、電力系統、EMS、能源套利、設備容量規劃與商業分析的工程 Digital Twin 平台。**

並且：

> **這套平台未來必須可以讓人類工程師與 AI Agent 安全持續修改，而不是一次性 Demo。**

這是整個專案最重要的設計要求。

---

# 101. 本次新增需求與資料來源規則

本次須把附件變成可編輯的設備、拓撲、效率資料集、時序案例、財務模型與驗證資料，不得只嵌入圖片。

| 來源 ID | 附件 | 用途 |
|---|---|---|
| SRC-POWER-01 | 4fad09cd-ec51-4df2-a939-e2e2008ef4fa.png | 服務區 A/B 供電與用電架構、分期容量、設備與開關。 |
| SRC-EFF-01 | 49445e09-e2f4-4b77-9ac3-cf6b6fd002be.png | SST-DD 與 PCS-DD 效率原表。 |
| SRC-SCENE-01 | 1ef7a1af-c2f4-4f67-97a3-df052bdfebb6.png | 八月電價、服務費、24 小時換充電案例。 |
| SRC-FIN-01 | 60ba9dbd-5af0-4741-bffe-7595c6873064.png | 服務費、日服務量、冗餘、爬坡期與回收期參考假設。 |

每個來源參數保存 sourceId、原始標籤、原始單位、sourceValue、effectiveValue、evidenceStatus、assumptionId、修改理由。狀態至少有 SOURCE_TRANSCRIBED、DERIVED、ASSUMPTION、USER_CONFIRMED、CONFLICT。來源轉錄不等於獨立證實。

原始資料不可被模擬輸出覆寫。使用者可編輯 effectiveValue，保留 sourceValue 與 audit log。來源未提供的電池額定容量、初始 SOC、線纜阻抗、CAPEX 等不得偽裝成附件數字；可用明確標記的 Demo 假設讓系統先运行。

附件含來源訪談，僅抽取數值與假設；公開分享版預設不放聊天截圖、聯絡人名稱或頭像。這份規格不對附件中的市場行情、電價有效日期或投資結論作外部背書。

# 102. 雙服務區供用電架構與分期方案

## 102.1 接入容量與分期

| 參數 | 一期 | 二期 | 單位／說明 |
|---|---:|---:|---|
| A 服務區接入容量 | 6000 | 9500 | kVA；二期新增 3500 kVA。 |
| B 服務區接入容量 | 2500 | 2500 | kVA。 |
| 兩側接入容量合計 | 8500 | 12000 | kVA；合計不代表各節點可任意取得的功率。 |
| A SST 台數 | 1 | 2 | 每台 1680 kW。 |
| B SST 台數 | 1 | 2 | 每台 1680 kW。 |
| 每側 SST 裝機功率 | 1680 | 3360 | kW；兩側合計 3360／6720 kW。 |
| SST 支路圖示容量 | 1750 | 3500 | kVA；原圖 1750(3500) kVA，與 1680 kW 分欄保存。 |

支援 phase timeline：投運日期、SST 增建、A 接入擴容、設備可用率及對應 CAPEX 時點。圖示為預留 SST 工位、接線調試、單日投運、無新增土建的方案描述；費用與停機時數仍須可調，不得因來源描述就把建設成本自動設為零。

所有 kVA 與 kW 分開儲存。交流以 sqrt(P²+Q²) ≤ 額定 kVA 與電流上限約束，不能把 6000 kVA 無条件當成 6000 kW。缺 PF 時使用有標記的假設。

## 102.2 附件拓撲的基準解讀

1. Grid A 10 kV → A 環網櫃 → 分支至 A 2500 kVA 箱變、A SST，並以跨站 10 kV 線路送至 B SST。
2. Grid B 10 kV → B 2500 kVA 箱變 → B AC 低壓母線。圖中不應臆測存在 Grid B 10 kV 與 A 10 kV 的直接並聯。
3. 各側箱變 → 各側 AC 母線 → PCS 1600 kW → DC 800 V 母線 2。
4. 各側 SST → DC 800 V 母線 1；一期一台、二期增加預留台。
5. DC 母線 1、2 各有跨站分段開關；A、B 各有母聯開關，連接同側兩條 DC 母線。
6. 重卡換電站的 DD 支路、電池倉與雙槍終端須按各支路建模；DC/DC 超充堆另有獨立分支。
7. 每側 AC 母線亦供乘用車換電站及重卡站輔助負載。重卡輔助負載可經 ATS 選擇箱變 AC 或選配 DC/AC 備援電源；UPS/SST 運行用電單獨計量。
8. 可擴展儲能、MPPT／光伏為選配支路；雲端 EAÓ／AI 能源控制圖示建模為控制與通訊層，不當成供電節點。品牌／字樣未確認不影響接口設計。

跨站線路中段的線纜型號字樣不足以確定線徑、長度與阻抗，保留 rawLabel 與待確認欄位，不推造電纜額定資料。

初始示範拓撲可採：跨站 DC 分段開關閉合、同側母聯開關斷開，兩條母線獨立；這是 ASSUMPTION，不代表原圖已給定開關狀態。母聯閉合且多轉換器並聯供電時，須先具備電壓參考／下垂或其他並聯控制分工與功率分攤模型；未支援的閉合網路需明確拒絕，不得默默當作樹狀網路求解。切換不可直接短接不同電壓／不相容控制源。

## 102.3 新增設備與參數

| 元件 | 圖示值／數量 | 必備可編輯欄位 |
|---|---|---|
| 環網櫃 | A 側 10 kV、680 A | 母線與支路額定、各開關狀態、保護／聯鎖簡化參數。 |
| 箱式變壓器 | A/B 各 2500 kVA，圖示「400V箱變」 | 10 kV/400 V 額定、負載率、PF、效率、空載損耗。 |
| AC 低壓母線 | 圖示 AC 380 V | 實際名義值、允許電壓範圍；400 V 與 380 V 不可直接視作相同標籤，設定相容範圍並記錄假設。 |
| SST | 每側 1680 kW × 1，二期 × 2 | MV AC／800 V DC ports、方向性、效率、限流、爬升率、待機與運行輔助用電。 |
| PCS | A/B 各 1600 kW | AC/DC 電壓、充放電額定、雙向效率、PF、運行模式。 |
| DC 母線 | 800 V 母線 1、2 | 每段 V/I/P 限值、線損、開關、跨站流向。 |
| DD 充電機組 | 每側有「充電機*2」與「充電機*6」，各標 560 kW | quantity=2/6、ratingValue=560、ratingBasis=PER_UNIT/PER_GROUP、共用功率池。 |
| 電池倉 | 每側標「電池倉1~2」「電池倉3~8」 | 倉位 ID、倉數、每倉電池數、電池規格；8 個倉不可直接等同 8 顆電池或 8 個換電工位。 |
| 換電站雙槍終端 | 每側標「*1」「*3」，附「480kW*2」「480kW*6」 | 終端數、每端 2 槍、額定值基準、共享上游功率、車輛並發數。 |
| DC/DC 超充堆 | 每側 1440 kW × 1 | 堆總額定、模組數、輸出分配、效率、熱降額。 |
| 超充堆雙槍終端 | 每侧圖示終端 1、2，均標 480 kW × 2 | 原圖數量與額定標籤保留；總槍數 4 是圖面解讀假設，允許增減。 |
| 重卡站 AC 負載 | 每側站內用電 200 kW | 負載上限、運行排程、固定／隨動部分、是否包含換電機械與冷卻。 |
| 乘用車換電站 | 每側站內用電 500 kW | 負載或完整站模型二選一、服務規模、排程、功率上限。 |
| SST 運行用電 | 圖示 10 kW | 每台／每櫃口徑、運行排程、是否已含在效率邊界。 |
| UPS、DC/AC、ATS | 圖示冗餘供電，部分選裝 | UPS kWh/kW、效率、供電範圍、ATS 來源優先、切換延遲、互鎖。 |
| 可擴展 ESS/PV/MPPT | 無足夠數值 | 預設停用；啟用時設定 kWh、kW、SOC、效率、PV 時序及接入支路。 |

560 kW／480 kW 的單機、單槍或整組額定口徑不能由標籤唯一確定。展示原標籤並要求可切換 ratingBasis；首個可跑 Demo 可暫採 560 kW/台、480 kW/槍，清楚標記 ASSUMPTION，不可標稱已確認設備規格。即使下游額定加總高於上游，也可代表功率共享，不能把所有額定同時當作實際輸出。

10 kW 暫按每側一期一套 SST 的運行輔助負載；二期是否翻倍以 auxScalingBasis 設定。200/500 kW 暫作配置上限，實際用電必須有排程／負載係數；禁止無條件當成 24 小時恆定耗電。

新增 SST、RMU、UPS、ATS、DC/AC、MPPT、功率共享組插件。既有 PCS／DD 仍為獨立插件，所有元件增加 unit cost、installation cost、lifetime、replacement policy、availability、source metadata。

# 103. 電力限制、功率共享與跨站結算

- 共享組需宣告供電資源、消費端與 dispatch policy。任一時刻各端口功率加總及損耗不得超過上游容量，不能每槍都獨立取得整台設備額定。
- 1440 kW 超充堆即使接 4 個標稱 480 kW 端口，總輸出仍不得超過 1440 kW；若接入上限更低，以實際約束為準。
- 同時檢查接入、箱變、SST、PCS、DD、母線、開關、線纜、電池接受功率。EMS 命令要經可行化，輸出 requestedPower 與 deliveredPower 及限制原因。
- 1680 kW 在理想 800 V DC 端對應 2100 A；1600 kW 對應 2000 A。這是 P/V 推導檢查點，不是替線纜指定額定。
- A/B 電網購入、A→B/B→A 跨站交換、站內耗電、交付客戶、儲能變化、損耗分別計量。Grid A 供給 B SST 的電量仍屬 Grid A 購電。
- 跨站能源互濟與車輛跨站可達性獨立設定。雙向高速道路的車流不能因電力互聯就自動跨越車道換站；需路網／交流道、允許路徑及繞行時間。
- 財務支援站點歸屬、購電表歸屬與內部轉撥價；站級 P&L 可含內部交易，雙站合併報表消除相同內部交易，總收入不可被灌大。
- 一期／二期、獨立／互濟、SST-only／PCS-only／混合、母聯開／閉、PV/ESS 關／開須可比較。單純切換方案不能改動客戶需求與隨機種子。
- 本系統先採可追溯的功率／能量級準靜態模型；若未實作 AC 潮流、短路／保護協調、切換暫態或 DC 動態穩定，介面須列明模型範圍，不能輸出已驗證電氣安全的結論。

# 104. 設備效率預設：完整保留來源表

UI 顯示百分比，核心使用 0–1。提供 PEAK、FULL_LOAD、WEIGHTED_REFERENCE、CUSTOM_CURVE 模式。WEIGHTED_REFERENCE 為基準測算預設，不得拿峰值當全年實際效率。來源未提供加權工況與負载曲線；不可由三個摘要值自行捏造效率曲線或以負載率線性插值。

## 104.1 SST-DD 充電機效率（SRC-EFF-01 原表）

| 項目 | 峰值效率 | 滿載效率 | 加權效率 |
|---|---:|---:|---:|
| SST | 98.50% | 98.00% | 98.12% |
| DD 模組 | 98.50% | 98.00% | 97.50% |
| 電纜 | 99.90% | 99.90% | 99.90% |
| 充電機效率 | 98.40% | 97.90% | 97.40% |
| 全流程效率 | 96.93% | 95.94% | 95.57% |

## 104.2 PCS-DD 充電機效率（SRC-EFF-01 原表）

| 項目 | 峰值效率 | 滿載效率 | 加權效率 |
|---|---:|---:|---:|
| 箱變 | 99.00% | 98.80% | 97.50% |
| PCS | 98.60% | 98.30% | 98.00% |
| DD 模組 | 98.50% | 98.00% | 97.50% |
| 電纜 | 99.90% | 99.90% | 99.90% |
| 充電機效率 | 98.40% | 97.90% | 97.40% |
| PCS-充電機效率 | 97.02% | 96.24% | 95.45% |
| 全流程效率 | 96.05% | 95.08% | 93.07% |

## 104.3 邊界、包含關係與計算

資料結構需有 boundaryStart、boundaryEnd、includedStages、direction、operatingBasis、sourcePrecision。根據原表乘積關係，基準解讀為：

```text
η_charger ≈ η_DD × η_cable
η_SST_path = η_SST × η_charger
η_PCS_charger = η_PCS × η_charger
η_PCS_path = η_transformer × η_PCS × η_charger
```

此包含關係標記為 DERIVED／待確認。不能計算 `SST × DD × cable × charger`，也不能在 charger 已含線損時再加一次相同線段的 I²R。

提供互斥的三種邊界模式：

1. SOURCE_CHAIN：以來源「全流程」摘要效率估算整段，禁止額外重複計入內含階段。
2. ASSEMBLY：依 SST／箱變／PCS 與「充電機效率」乘積計算；表內原值顯示於旁，供比對。
3. COMPONENT：用 DD、線纜等實體逐段模型；摘要整機效率僅供對照，不再加入損耗。

基準重播使用 SOURCE_CHAIN 加權值；工程方案比較預設 ASSEMBLY 或明確設定的 COMPONENT。選擇必須進 snapshot，不可混用。來源表經四捨五入，因此逐組件乘積與原表可有小幅差異。ASSEMBLY 加權結果：SST=0.9812×0.974=0.9556888；PCS=0.975×0.98×0.974=0.930657，分別顯示 95.57%、93.07%。

「全流程」在此暫解讀為上游供電端至充電機交付端，不自動包含電池儲存效率、站內輔助負載、未列出的跨站線路與 UPS。換電電池的充入／存儲／取出另設邊界，避免把整車電池效率重複套用。

效率與待機／運行輔助功率亦需 includesAuxiliaryLoss 欄位；同一損耗只計一次。無負載時不使用 Pin=Pout/η 代替待機模型。反向效率不從正向自動複製，缺資料時標記假設或停用反向。

## 104.4 公平比較口徑

固定交付電量 E_delivered、需求、設備可用率、輔助用電邊界，計算 E_grid=E_delivered/η；有儲能、換電電池跨時移轉時改用逐時能量帳，不能把售電時段直接視為購電時段。

以來源加權值比較：效率差為 95.57%−93.07%=2.50 個百分點。固定交付電量的購電節省率為 `1−0.9307/0.9557 ≈ 2.616%`，不是 2.50%。這只是該邊界的靜態換算，不等同全站總成本下降比例。

每條路徑輸出 delivered kWh、input kWh、loss kWh、總損耗成本拆解、設備負載率與效率模式；不得在不同交付能量或不同起迄庫存下直接比較效益。

# 105. 附件八月 24 小時場景：資料與計價

Scenario ID：`attachment_august_dual_station_v1`。時段為 [hour:00, hour+1:00)，共 24 筆；時區暫以 Asia/Shanghai、貨幣 CNY，皆標記 ASSUMPTION；月份為 8，年份、電價適用地區與有效日未提供，不得補成「最新官方電價」。電價與售價用固定小數／Decimal 邏輯計算。

服務费欄解讀為每 kWh 加價，總價原表是電價加服務費後顯示到小數 2 位；這是由表格關係推導。要分開 `gridPurchasePrice`、`customerEnergyRate`、`serviceFeeRate`、`customerTotalPriceRaw`、`customerTotalPriceComputed`，不可把服務費或售價當作電網購電價。

來源「谷／平／峰／尖」的售價欄可能依總價分類，並不等於購電時段。例如凌晨 A 充電服務費 0.50、總價 0.92 的欄位標「平」，但電網仍是谷價；電網時段與客戶價格標籤須分開。

## 105.1 電價、服務費及來源顯示總價（CSV）

下表從可見圖片精度轉錄；不得補造小數位。費率單位 CNY/kWh。`*_total_raw` 保存來源顯示值；這些顯示數字與 `grid_purchase + fee` 四捨五入到兩位一致。

```csv
hour,grid_purchase_CNY_per_kWh,grid_period,A_swap_fee,A_charge_fee,B_swap_fee,B_charge_fee,A_swap_total_raw,A_charge_total_raw,B_swap_total_raw,B_charge_total_raw
0,0.422744,valley,0.35,0.50,0.35,0.30,0.77,0.92,0.77,0.72
1,0.422744,valley,0.35,0.50,0.35,0.30,0.77,0.92,0.77,0.72
2,0.422744,valley,0.35,0.50,0.50,0.30,0.77,0.92,0.92,0.72
3,0.422744,valley,0.35,0.30,0.35,0.30,0.77,0.72,0.77,0.72
4,0.422744,valley,0.35,0.30,0.35,0.50,0.77,0.72,0.77,0.92
5,0.422744,valley,0.50,0.30,0.35,0.50,0.92,0.72,0.77,0.92
6,0.628011,flat,0.15,0.30,0.35,0.30,0.78,0.93,0.98,0.93
7,0.628011,flat,0.35,0.30,0.35,0.30,0.98,0.93,0.98,0.93
8,0.628011,flat,0.35,0.30,0.35,0.30,0.98,0.93,0.98,0.93
9,0.628011,flat,0.30,0.30,0.35,0.30,0.93,0.93,0.98,0.93
10,0.628011,flat,0.30,0.30,0.35,0.30,0.93,0.93,0.98,0.93
11,0.628011,flat,0.35,0.30,0.35,0.30,0.98,0.93,0.98,0.93
12,0.422744,valley,0.35,0.50,0.35,0.30,0.77,0.92,0.77,0.72
13,0.422744,valley,0.50,0.30,0.35,0.50,0.92,0.72,0.77,0.92
14,0.628011,flat,0.35,0.30,0.35,0.30,0.98,0.93,0.98,0.93
15,0.628011,flat,0.35,0.30,0.35,0.30,0.98,0.93,0.98,0.93
16,0.818449,peak,0.30,0.30,0.35,0.30,1.12,1.12,1.17,1.12
17,0.818449,peak,0.35,0.30,0.35,0.30,1.17,1.12,1.17,1.12
18,0.818449,peak,0.35,0.30,0.35,0.30,1.17,1.12,1.17,1.12
19,0.818449,peak,0.35,0.30,0.35,0.30,1.17,1.12,1.17,1.12
20,1.008497,critical_peak,0.35,0.30,0.35,0.30,1.36,1.31,1.36,1.31
21,1.008497,critical_peak,0.35,0.30,0.35,0.30,1.36,1.31,1.36,1.31
22,0.818449,peak,0.35,0.30,0.35,0.30,1.17,1.12,1.17,1.12
23,0.818449,peak,0.30,0.30,0.35,0.30,1.12,1.12,1.17,1.12
```

計價策略必須可選：

- EXACT_COMPONENTS（預設）：客戶電費單價使用未四捨五入的對應電價，另加服務費；只在帳單約定的結算點進行貨幣捨入。
- SOURCE_DISPLAY_PRICE：用來源兩位小數總價乘交付電量；服務費分解為參考值，需顯示與精確分項計價的差額。
- CUSTOM_CUSTOMER_RATE：客戶能源價與電網購價可分離；仍須公開完整價格組成。

原圖提出司機關注總價、每度成本、單次補能成本、繞行成本。司機決策至少輸入總價×需求 kWh、預估等待、時間價值、繞行距離與能耗；資料不足時用明確假設。A 提高充電費以引導換電屬於待測策略，不強制把 A 充電需求設為零，因來源表仍有充電。

# 106. 附件場景：完整時序、對帳與疑點

## 106.1 換充電原始表（CSV）

count 為來源次數／數量欄；kWh 為該小時總電量，不是每次電量。idle_raw 為來源「閒」欄，物理定義未確認，0 時空格保存為 null；不自行補 0。

```csv
hour,A_swap_count,A_swap_kWh,A_charge_count,A_charge_kWh,A_idle_raw,B_swap_count,B_swap_kWh,B_charge_count,B_charge_kWh,B_idle_raw
0,8,3280,1,410,,8,3280,1,410,
1,8,3280,0,0,0,2,820,1,410,4
2,6,2460,1,410,1,2,820,1,410,4
3,2,820,2,820,2,2,820,2,820,2
4,4,1640,1,410,2,6,2460,0,0,2
5,2,820,1,410,4,8,3280,0,0,0
6,8,3280,0,0,0,2,820,1,410,4
7,2,820,2,820,2,2,820,2,820,2
8,2,820,2,820,2,2,820,2,820,2
9,3,1230,1,410,3,3,1230,2,820,1
10,3,1230,2,820,1,3,1230,1,410,3
11,2,820,2,820,2,2,820,2,820,2
12,7,2870,1,2050,1,5,2050,0,0,3
13,0,0,4,1640,0,4,1640,0,0,4
14,2,820,2,820,2,2,820,2,820,2
15,2,820,2,820,2,2,820,2,820,2
16,1,410,2,500,5,1,410,2,500,3
17,1,410,2,500,5,1,410,2,500,3
18,1,410,2,500,5,1,410,2,500,3
19,1,410,2,500,5,1,410,2,500,3
20,0,0,0,0,8,0,0,0,0,8
21,0,0,0,0,8,0,0,0,0,8
22,1,410,2,500,5,1,410,2,500,3
23,1,410,2,500,5,1,410,2,500,3
```

## 106.2 來源總計與逐列重算

| 指標 | A 來源總計 | A 逐列重算 | B 來源總計 | B 逐列重算 |
|---|---:|---:|---:|---:|
| 換電次數 | 67 | 67 | 61 | 61 |
| 換電電量 kWh | 27470 | 27470 | 25010 | 25010 |
| 充電次數／數量 | 35 | 36 | 31 | 31 |
| 充電電量 kWh | 12430 | 14480 | 10790 | 10790 |

此表刻意同時保留原圖總計與重算值；如不一致，生成 source discrepancy，不得修改某一小時數字去湊原圖總計。

**已確認的算術差異：A 逐列充電合計為 36 次／14480 kWh，較來源總計多 1 次／2050 kWh，恰好等於 A 12 時那一列。** 可能是來源加總漏列或該列有特殊排除規則，現有圖片不足以判定原因，不能擅自採其中一種解釋。

依完整逐列資料：A 售電41950 kWh、B售電35800 kWh、雙站77750 kWh；換電128次／52480 kWh，充電67次／25270 kWh。資料集同時保存 rawFooterTotals 與 recomputedRowTotals，預設報表計算依逐列數據，明確標示与來源總計不同。

原圖總計口徑下：A 售電合計 39900 kWh，B 35800 kWh，双站 75700 kWh；換電 128 次／52480 kWh，充電 66 次／23220 kWh。這組總計是來源參考，實際 fixture 的收入與功率聚合必須基於完整逐列資料。

## 106.3 必須顯示的資料疑點

1. A 12 時「充=1、充電電量=2050 kWh」忠實保留；若「充」代表完成會話數，單會話就是 2050 kWh。這可能是欄位定義或輸入錯誤，不能默改成 410。
2. A/B 在 16–19、22–23 時「充=2、充電電量=500 kWh」表示時段總量 500；若按會話解讀，每次 250 kWh，不能乘成 1000。
3. 所有換電列皆可用次數×410 kWh 對帳；410 為本案例的計費／交付電量假設，不等同電池額定容量。物理模擬須用回收與交付電池能量差、SOC 及結算口徑映射。
4. 「閒」在兩站並非都能由固定工位數減去換／充算出；不得拿它直接推定換電 bay 數、電池數或所有小時的可用能力。
5. 來源註記「受共享充電模組與流程限制，每小時補能不超過 12 台、第一小時例外」應保存為可調的站級共享服務上限假設，預設作用於換＋充的服務數。第一小時例外須有初始 ready 庫存等物理解釋，不能解除功率、SOC、能量守恆。
6. 原圖前半段說交通局幹線資料以油車為主，新能源車隊未來可能改變作息。設置現況資料來源、車種、調查日期、EV 轉換與工作時段假設；圖中「油車工作時段」色塊無清楚數值，不能憑色塊編造車流百分比。
7. 售電小時的高能量可由先前充好的換電電池交付，不能單憑「3280 kWh 一小時」就判定當時一定向電網取 3280 kW；必須追蹤庫存與補電時間。

來源疑點不妨礙原表重播；受限物理模擬若缺少必要映射，用標記的假設建立獨立可跑變體，完整顯示可行／不可行及原因，不把兩者混成同一結果。

# 107. 重播、動態模擬與 EMS 案例矩陣

## 107.1 三種案例模式

| 模式 | 用途 | 限制 |
|---|---|---|
| SOURCE_REPLAY | 原樣呈現 24 小時表、原始總計、重算總計、價格與收入拆解。 | 不是設備可行性證明，不強制可疑行滿足電池模型。 |
| CONSTRAINED_SIMULATION | 將表格轉為有時間戳的服務請求，由排隊、電池、電力與 EMS 決定實際完成量。 | 保留 requested/completed/unserved/deferred；不能硬寫回來源總計。 |
| BEHAVIORAL_SIMULATION | 由車流、SOC、價格、等待與可達路網產生選站／換充決策。 | 調價後允許需求變化；不可再宣稱精確重播原表。 |

表格「充」欄的 countSemantic 預設 sessionCount，列為 ASSUMPTION；若後續確定是並發占用數，改用 concurrencyCount 並提供會話生成規則。每小時到達預設均勻排程，亦可 Poisson；同種子重現。replay 只按小時報表，模擬內部至少 1 分鐘且跨事件精確分割，不能以 60 分鐘 step 直接跳過換電／排隊事件。

兩站價格引導實驗要與固定需求的效率比較分開。固定需求比較仍保留到達／能量表；彈性需求比較需保存 elasticity、價格敏感度、等待與繞行成本假設。

## 107.2 必備可選案例

1. 附件原表重播與資料品質檢查。
2. 一期原拓撲＋ImmediateCharge，受限模擬。
3. 一期 SST 與 PCS 路徑效率對照；同交付量、同邊界。
4. 一期双站獨立／DC 互濟／SST 供電／PCS 供電的對照。
5. 二期 A 擴至 9500 kVA、兩側各新增 SST；比較容量瓶頸轉移與新增投資。
6. A 充電服務費上調、B 維持，測換充選擇與客流轉移。
7. PCS、SST、母線分段或電網支路停用，檢查 ATS/UPS/備援與服務降額。
8. PV/ESS 停用／啟用、TOU／PeakShaving／ProfitOptimization 比較。
9. 低／中／高交通量、0.20／0.25／0.30／0.35 服務費敏感度；此範圍是實驗值，不是市場報價。
10. 1 年與 2 年爬坡、一期到二期投資時間比較。

公平比較應約束期末 ESS 與換電庫存的能量／ready 狀態接近期初，或清楚計入期末存貨差額；不得靠耗盡初始已充電電池製造虛假套利。

# 108. 獲利能力：來源假設與數學修正

SRC-FIN-01 的訪談與敘述只作可編輯的經營參考，不作全產業標準或獲利保證。將以下欄位加入 Financial Assumptions：

| 欄位 | 來源值 | 定義／處理 |
|---|---:|---|
| 服務費 | 約 0.30 元/kWh | 幣別暫 CNY；是服務費，不是全額售價或淨利。 |
| 參考損益兩平售電量 | 15000 kWh/日/站 | 訪談基準，成本組成未知。 |
| 單次換電交付／計費電量 | 410 kWh | 案例換算，與電池額定 kWh 分離。 |
| 參考整數次數 | 37 次/日 | ceil(15000/410)=37。 |
| 設計冗餘比例 | 60% | 來源方案採用的容量安全邊際，可調。 |
| 來源設計目標 | 59 次/日 | 原文數字保留；實作精確值見下。 |
| 來源理論能力 | 192 次/日 | 相當於 8 次/小時×24h 的推導，實際 bay、時長與庫存未證實。 |
| 回收期參考 | 10 年 | 來源敘述，作可調比較標線，不硬寫模型回收期。 |
| 車輛爬坡期 | 1–2 年 | 來源假設，轉為逐月需求成長曲線。 |

必須保留兩種冗餘換算口徑並說明差異：

```text
continuous_break_even_swaps = 15000 / 410 = 36.58536585...
integer_break_even_swaps = ceil(continuous_break_even_swaps) = 37

energy_first_design_swaps = ceil(15000 * 1.60 / 410) = 59
integer_first_design_swaps = ceil(37 * 1.60) = 60
```

來源寫「37×160%、不低於59」：乘積為 59.2，若先取 37 再嚴格向上取整應為 60；若先按 15000 kWh 放大再換算，59 合理。UI 預設採連續能量口徑得到 59，並提供嚴格整數次數口徑 60，不隱藏捨入差異。

`59/192=30.7292%`、`60/192=31.25%` 僅為以來源理論能力作分母的服務量利用率，與電氣負載率、工位忙碌率分开。場景的「12 台/小時共享補能上限」亦不同於 192 次/日換電能力；兩者須是不同欄位，不能共用常數。

15000×0.30=4500 元/日 是服務費收入，不是已知每日成本或利潤。可提供 REFERENCE_CALIBRATION：若使用者明確選擇以此反推，標示「等效每日需覆蓋成本 4500，且假設服務費全數可用於覆蓋成本」；真實成本模式不得自動用這個數字當 OPEX。

來源所述「成熟期遠超 59 才能彌補前期虧損」轉化為待求解目標：在給定 CAPEX、月度爬坡、成本與報酬要求下，反推成熟期所需服務量，不直接把 59 當保證達標線。

# 109. 收入、成本與長期現金流模型

## 109.1 計費與能源成本

對每筆換／充交易保存計費電量、物理交付電量、能量費、服務費、折扣、固定次費、稅別與帳單時間。換電可選每次價或每 kWh 價；同筆不無條件兩種都收。

```text
swapRevenue = sum(swapBilledKWh * swapTotalPrice + explicitlyEnabledPerSwapFee)
chargeRevenue = sum(chargeBilledKWh * chargeTotalPrice)
externalRevenue = swapRevenue + chargeRevenue + permittedGridExportRevenue + otherExternalRevenue

gridEnergyCost = sum(actualGridImportKWh[t, meter] * gridPurchasePrice[t, meter])
cashOperatingCost = gridEnergyCost + demandCharge + rent + labor + maintenance
                    + insurance + software + otherCashOPEX
cashOperatingSurplus = externalRevenue - cashOperatingCost
```

损耗增加實際購電量，已在 gridEnergyCost 中；lossCost 作 waterfall 拆解，不再從盈餘扣一次。需求／基本費應按完整計費週期與實际表計契約計算，單日測算僅可顯示另有標示的分攤／估計，不能把日最大值無條件當月最大需量。

模型分开：服務費收入、能源價差、能源損耗、站內輔助用電、現金營運盈餘、經濟運行利潤、折舊後營業損益、投資現金流。ESS／換電電池耗損成本可用於 EMS 邊際決策；現金流則按實際更換時點列替換 CAPEX，不把非現金循環成本與同一次替換支出重複扣算。

換電電池須有期初能源成本與存貨帳；能量買入發生在補電時段，售出在換電時段。分开現金購電支出與按批次／加權平均分攤的已售電量成本，提供存貨成本調節表。禁止把當時谷／峰價直接乘當時換出的電量當成實際當期購電支出。

## 109.2 CAPEX / OPEX

CAPEX 至少：接入增容、箱變、SST、PCS、DD、線纜、母線、開關／保護、土建、站房、換電機械、電池倉、周轉電池、ESS、PV、UPS、消防／熱管理、安裝調試、設計費、備用金。選項可關閉，缺值標示不完整，不偷偷視為零成本。

OPEX 至少：購電、基本／需量費、租金、人力、維護、保險、通訊／雲端、耗材、管理費；另有稅費、通膨／漲價假設、電池與設備更換、殘值及營運資金。

區分資產所有權：站方自有／租賃電池、車主電池或第三方電池銀行，避免把不屬於站方的電池全數計入 CAPEX。乘用車站可選完整收入成本或僅作共用負載；後者不得偷計換電收入。

成本未齊時仍可跑能源、服務量與收入模型，但絕不可把未填項當零後顯示「已驗證獲利」。財務頁顯示缺項與暫估狀態。

## 109.3 損益兩平

```text
contributionPerKWh = realizedRevenuePerKWh - variableCostPerKWh
breakEvenKWhPerDay = fixedCostPerDay / contributionPerKWh
breakEvenSwapsPerDay = ceil(breakEvenKWhPerDay / expectedBilledKWhPerSwap)
```

以上只適用固定平均邊際貢獻的簡化單產品模型，需提供 SIMPLE_REFERENCE 模式。貢獻≤0 時回傳「無有限損益兩平點」，不能回傳負車次。

完整模型用模擬＋根搜尋求 profit(targetDemand)=0，包含換／充占比、峰谷補電、需求費、功率瓶頸、損耗及爬坡；目標服務量超出可持續能力時標示不可達。分开營運現金損益兩平、含折舊會計損益兩平與投資 NPV 損益兩平。

## 109.4 月度爬坡與投資回收

提供逐月 model：成熟期服務量×rampFactor[m]×當月營運天數，再受實際站能量／庫存／工位約束；可自訂 12 或 24 個月爬坡、季節性、工作日、停機率。不得用單日來源案例直接乘 365 當作已確認全年業績。

全投資、不含融資的預設口徑：

```text
FCF[m] = externalCashReceipts[m] - cashOPEX[m] - cashTaxes[m]
         - CAPEX[m] - replacementCAPEX[m] - changeInWorkingCapital[m]
         + residualValueReceipts[m]
NPV = sum(FCF[m] / (1 + annualDiscountRate) ** (m/12))
```

month 0 列初始投資，不再於 NPV 外重扣。稅務先採可配置的簡化假設，不聲稱符合特定地區稅法。選配股權現金流模式時才加入融資借還款與利息，與全投資口徑清楚區隔。

輸出：年度／月度盈虧、最低累計現金流、最大資金缺口、營運轉正月份、簡單／折現回收期、NPV、IRR、ROI、成熟期必要車次。分析年期預設 10 年是來源參考，可調 5/10/15/20 年。

回收期依累計現金流穿越零點計算，支援期間內線性插值；期內未轉正顯示「分析期間內未回收」，不以零或年限冒充回收期。IRR 用同一現金流序列求根，月 IRR 年化為 (1+r_month)^12−1；無根／多根／不適用需明確輸出狀態。

# 110. 新增資料契約、插件與檔案落點

延續 Kernel + Plugin + Registry + Schema-driven，不建立另一套硬寫死的「附件計算器」。下列為須實作的建議落點，既有 repo 結構可等價映射：

```text
packages/contracts/src/
  source-evidence.ts
  efficiency-boundary.ts
  power-sharing.ts
  service-profile.ts
  billing-policy.ts
  financial-scenario.ts
packages/schemas/src/migrations/
  1.0-to-1.1.ts
plugins/equipment/
  sst/  rmu/  ups/  ats/  dcac/  mppt/  power-sharing-group/
packages/electrical-engine/src/
  path-loss/  capacity-allocation/  converter-sharing/
packages/economics-engine/src/
  billing/  energy-inventory-cost/  internal-settlement/
  cashflow/  break-even/  investment-metrics/
data/reference/highway-dual-station/
  source-manifest.json
  equipment-defaults.json
  efficiency-source.json
  august-service-profile.csv
  august-price-profile.csv
  source-totals.json
  source-discrepancies.json
  financial-assumptions.json
data/scenarios/
  attachment-source-replay.json
  phase1-constrained.json
  phase2-expansion.json
  sst-vs-pcs.json
  ramp-up-12m.json
  ramp-up-24m.json
docs/
  SOURCE_MAPPING.md
  POWER_TOPOLOGY.md
  EFFICIENCY_BOUNDARIES.md
  CASE_AUGUST.md
  FINANCIAL_MODEL.md
  DATA_DICTIONARY.md
  ASSUMPTIONS.md
  CHANGELOG.md
verifier/fixtures/
  attachment-reference/
```

SimulationProject 增加 schema 1.1 欄位：sources、constructionPhases、efficiencyProfiles、serviceProfiles、billingPolicy、financialScenario、dataQuality。若實作時已有較新 schema，不回退版本，新增合法 migration。保留原 topology、equipment、traffic、battery、tariff、ems、simulation、randomSeed 與 modelVersions。

核心契約範例（完整程式需加單位型別、Zod schema 與驗證）：

```ts
type EvidenceStatus = 'SOURCE_TRANSCRIBED' | 'DERIVED' | 'ASSUMPTION' | 'USER_CONFIRMED' | 'CONFLICT'
interface SourcedValue<T> {
  sourceId: string
  rawLabel: string
  sourceValue: T | null
  effectiveValue: T | null
  unit: string
  evidenceStatus: EvidenceStatus
  assumptionId?: string
  note?: string
}
interface EfficiencyBoundary {
  id: string
  boundaryStart: string
  boundaryEnd: string
  includedStages: string[]
  peak: number
  fullLoad: number
  weightedReference: number
  direction: 'forward' | 'reverse'
  includesAuxiliaryLoss: boolean
  sourceId: string
}
interface HourlyServiceRequest {
  stationId: 'A' | 'B'
  hour: number
  swapCount: number
  swapEnergyKWh: number
  chargeCount: number
  chargeEnergyKWh: number
  idleRaw: number | null
  countSemantic: 'sessionCount' | 'concurrencyCount'
  mode: 'SOURCE_REPLAY' | 'CONSTRAINED_SIMULATION' | 'BEHAVIORAL_SIMULATION'
}
```

模型按用例依賴插件與接口；效率曲線、財務公式、tariff policy、dispatch policy、來源檢查都可版本化。讀取 CSV 不得執行欄位內公式或任意程式碼。重複小時、缺列、負值、NaN、不支援貨幣與額定單位衝突須顯示可定位錯誤。

# 111. 新增介面與匯出內容

UI 沿用原 DESIGN / SIMULATION / ANALYTICS / DEVELOPER，新增下列工作頁或面板：

1. **供電方案**：一期／二期切換、A/B 接入與各層額定、雙母線、ATS／母聯／分段開關、即時共享功率與瓶頸。
2. **效率對照**：原表、計算表、模式切換、邊界包含圖、輸入／交付／損耗與效率差；包含關係衝突直接警示。
3. **逐時案例編輯器**：A/B 換／充次數與 kWh、電網價、服務費、總價，24 行可直接編輯／匯入；原值／現值／合計差異並排。
4. **資料品質**：A 12 時 2050 kWh、充電總數對帳、idle 定義、額定口徑與來源總計差異，逐項可定位並記錄處理方式。
5. **獲利能力**：服務費收入、能源價差、電費與輔助負載、固定成本、現金流、NPV/IRR、缺項狀態；來源 15000／37／59／192 與模型值對照。
6. **敏感度與設計目標**：日車次×服務費盈虧熱圖、爬坡曲線、一期二期回收期、SST/PCS CAPEX 與節能差額。

增加 KPI：requested／completed／unserved energy、來源與重算合計差、cross-station energy、grid meter allocation、power-sharing saturation、cash flow minimum、break-even throughput、ramp-up funding gap。

Excel 保留原必要 sheets，另增加 Sources、Assumptions、Construction_Phases、Efficiency_Source、Efficiency_Calc、Service_Profile、Price_Profile、Source_Reconciliation、Power_Sharing、Energy_Inventory_Cost、Interstation_Settlement、CAPEX、OPEX、Cashflow_Monthly、Investment_KPI、Sensitivity。

重要合計與財務公式應提供 Excel 可檢查的公式或逐項計算欄，不只貼值。每個工作表註明單位、時間粒度、量測邊界、計價與捨入策略；Source 原始值、Current 值、Derived 值分开。JSON 為唯一完整交換真相；Excel round-trip 要保留 null、幣別、來源、模式、效率邊界、schema version 與假設。

# 112. 本次新增的具體驗收標準

## 112.1 資料重播與對帳

- 載入兩份 CSV 都恰有 24 個唯一小時，原始空白與 0 區分。
- 各站換電每列等於 count×410，合計 A=67/27470、B=61/25010。
- 充電列以來源時段電量求和，不用固定 410 乘所有 count。重算值必須對照第 106.2 章；來源不一致以 CONFLICT 呈現，不用程式「修正」。
- A 12 時 2050、峰時 2 次合計 500 原樣保存；受限模擬另報可行性，不可把原始場景當完成事件清單強灌。
- EXACT_COMPONENTS、SOURCE_DISPLAY_PRICE 收入可獨立重算；同一筆服務不得總價加完後再重收一次服務費。
- 以完整逐列資料和第105章費率驗算：服務費收入A=13835.50、B=12113.50 CNY；SOURCE_DISPLAY_PRICE總收入A=36824.20、B=32088.70 CNY。僅為來源資料的計費重播，未扣任何成本，不能當作利潤。

## 112.2 效率與物理約束

- SOURCE_CHAIN：固定交付 10000 kWh 時，SST 買入=10000/0.9557；PCS 買入=10000/0.9307。與独立計算器差異≤0.01 kWh。此 fixture 關閉另計輔助與外部線損。
- ASSEMBLY：加權 η_SST=0.9556888、η_PCS=0.930657，未捨入差異≤1e-9；顯示兩位小數百分比與來源加權全流程一致。
- 相同已包含 DD/cable 的 charger 再套 DD/cable，驗證器必須報 EFFICIENCY_BOUNDARY_OVERLAP。
- 4 槍向 1440 kW 共享堆各要求 480 kW 時，實際總輸出≤1440 kW，上游更嚴時再限流，未供應功率需有原因。
- 1680 kW／800 V 得 2100 A，kVA/PF 與 kW 不混用；超限命令被限流、排隊或拒絕，不能只是警告卻繼續超額輸出。
- 分段開關斷開之邊功率為零；ATS 不允許兩個來源無互鎖並接；不支援的並聯模式明確阻止。
- 每步、逐日、雙站均做能量平衡，涵蓋換電帶入／帶出、ESS、電池庫存及初始能量。容許誤差可配，基準 abs 0.01 kWh、rel 1e-6，以 max(abs,rel×throughput) 作門檻；超限出具定位診斷。

## 112.3 財務算法獨立小案例

這些數字是人為驗證 fixture，不是設備行情或站點預測：

1. 無損耗、無存貨變動：交付1000 kWh、客戶能源價0.50＋服務費0.30、電網價0.50 → 總收入800、購電500、服務費收入300、能源後貢獻300。
2. 加入路徑效率0.95且其他條件不變 → 購電1052.631579 kWh、電費526.315789、能源後貢獻273.684211；損耗成本26.315789僅拆解，不能再扣一次。
3. 固定每日需覆蓋成本4500、淨邊際貢獻0.30/kWh → 損益兩平15000 kWh、37次；此淨貢獻是 fixture，不把來源服務費0.30自動視為淨貢獻。
4. 來源冗餘：連續能量口徑59次，先取整口徑60次；59/192與60/192可正確顯示。
5. 無有限損益兩平、缺CAPEX、無IRR根、分析期間未回收等狀態，不輸出0或NaN冒充有效值。
6. 年期現金流[-1000,600,600]、折現率10% → NPV=41.322314、IRR約13.06624%、以年內線性插值的簡單回收期1.666667年；年／月折現單位一致。
7. A→B內部轉撥1000 kWh、轉撥價0.60 → A內部收入600、B內部成本600，合併報表抵銷為0，實際外部购電仍由原表計列入。
8. 延後爬坡且其餘投資／固定成本與單位正貢獻相同時，投資模型應反映更大的資金壓力；若出現反常結果，檢查需求、設備限制、存貨與更換成本差異，不硬寫成任意情況必然單調。

## 112.4 工程與可維護性

- 所有新參數在 UI、JSON、Excel、snapshot 一致；改效率／服務費／需求後，圖表、收入、現金流均重新計算。
- SST/RMU/UPS/ATS 新插件不修改 sim-kernel；財務算法不進 React UI；外部來源變更不修改引擎。
- 一期→二期同時更新拓撲可用設備、容量與投資時序，而非只換圖。
- 相同 Project／版本／seed 重現同樣結果；SOURCE_REPLAY 與 CONSTRAINED_SIMULATION 的輸出有明確模式標籤。

# 113. 未確認事項與預設處理清單

以下項目可先以有標記的假設繼續實作，不必因資料不足停止整個專案；但未確認的物理數值不能被標示已驗證。

| 項目 | 暫行處理 | 對結果的影響 |
|---|---|---|
| 560 kW／480 kW 額定口徑 | 原標籤保存，ratingBasis 可切換；Demo 暫 per-unit／per-gun。 | 改變裝機量、並發與共享瓶頸。 |
| 400 V 箱變對 380 V 母線 | 宣告相容電壓範圍與實際母線電壓假設。 | 電流與端口驗證。 |
| SST 正反向、母聯並聯控制 | 預設只啟用已支援方向；跨源並聯需控制策略。 | 互濟／備援可行性。 |
| 200／500／10 kW 排程及效率邊界 | 分別標注上限／運行輔助、負載係數與是否已含損耗。 | 購電、需量与盈利。 |
| 410 kWh 的物理／計費定義 | 案例計費能量，額定容量和SOC独立。 | 庫存補能與損耗。 |
| A 12 時 1／2050、峰時2／500 | 不改原值；source replay可跑，物理模式另作假設映射。 | 會話時長與能量可行性。 |
| 來源「閒」與「充」欄定義 | idle不作物理硬約束，充暫sessionCount。 | 工位利用率與到達映射。 |
| 充電總計差異 | 保留原圖與逐列值，報差異；不湊數。 | 交易數與單車指標。 |
| 幣別、時區、年份、電價適用區 | 暫CNY／Asia/Shanghai；年份與適用區留未提供。 | 僅重現來源案例，不冒充官方電價。 |
| 12台/時、192次/日與59次/日 | 分别作流程上限、來源理論能力、財務參考目標。 | 不得共用容量常數。 |
| 15000度、10年、60%冗餘 | 作來源參考；真實結果由成本與現金流反推。 | 不保證盈利或回收期。 |
| 設備／電池價格與成本 | 未提供；提供可填欄位與獨立Demo樣本。 | 成本未齊不得顯示確定投資結論。 |

# 114. Kimi 實作順序與新增交付門檻

這次仍是完整 Master Prompt。不得只做四張圖片展示或靜態財務卡片；依原 Phase 流程持續實作，並插入以下依賴：

1. Phase 0：先完成來源映射、資料字典、效率邊界、來源疑點、金融計價口徑與驗收 fixtures。來源不確定之處列 ASSUMPTIONS，不擅自改數字。
2. Phase 1–4：加入 schema migration、新設備插件、一期二期拓撲、共享功率、雙母線／開關、效率邊界與能量帳。
3. Phase 5–7：完成原表重播、請求映射、受限服務、價格編輯、收入成本拆解與來源對帳。附圖案例是必備 fixture，不能只留下原通用 Demo。
4. Phase 7–8：完成獲利能力、CAPEX/OPEX、月度爬坡、回收期、NPV/IRR、成熟期必要服務量，再做 EMS 對照。
5. Phase 10–13：將新設備／狀態接到 Digital Twin，補充 Analytics、Excel與JSON replay，驗證同一真實 state 驅動所有畫面。
6. Phase 14–17：完成敏感度／分期投資比較、驗收與 Kimi Websites 部署。實際部署及檢查是 Kimi 的後續執行工作，不能僅因這份提示詞存在就宣稱已完成。

第一個可審查里程碑至少包含：一期拓撲可編輯、SST/PCS效率比較、24小時原表與重算差異、受限模擬、服務費／售價分離、損益兩平兩種冗餘口徑、JSON/Excel匯出，以及可重現的驗證紀錄。

交付時列出已完成、已驗證、採用假設、待確認來源欄位與未實作範圍；不得用來源表的業績或財務目標冒充模擬達成結果。


---

# HighwaySwapSim — 設備與容量追加需求（2026-09-08）

適用基準：完整 Master Prompt 第 0–114 章；本文件亦追加為第 115–122 章。產品由 Codex / Astra 實作。資料來源為本次六張附件與 CATL 官方頁；原始八月資料、410 kWh 口徑和既有來源表保持不變。遇到衝突，顯示原值、重算值、採用口徑與原因。

# 115. 新增來源與版本

| ID | 附件 | 內容 |
|---|---|---|
| SRC-SUPPLEMENT-01 | ac0ff9d7-f23a-4bad-afc1-52bbc37181ef.png | 513 kWh、8 倉、560 kW DD、SST 小時補能 |
| SRC-SUPPLEMENT-02 | 22e9c01e-d48d-4913-814e-7bc92129c638.png | 2500 kVA 箱變、770 kW 交流負載、2000 kW PCS |
| SRC-SUPPLEMENT-03 | 3b607d2f-ccc1-4875-a719-3bc6fcd26f76.png | DD 倉數、PCS 餘量、双站 16 倉配置 |
| SRC-SUPPLEMENT-04 | 9711cc2e-1466-4100-a633-74144730f56f.png | 重卡電池選型、4 終端 8 槍共享超充 |
| SRC-SUPPLEMENT-05 | 076ca5e9-dbfa-48b6-ac65-624ef0d2a6da.png | 1440 kW × 2、PCS 範圍、同動率 |
| SRC-SUPPLEMENT-06 | 772afd80-8ccf-401c-83db-fbbec79cd711.png | 中低壓櫃體、跨站 150 m 線路、分期擴容 |

SHA256、原列與導出數值見 `data/reference/supplement-2026-09-08.json`。工程來源圖片不作為求解器資料真相；結構化情境須可獨立匯出、載入與重現。

# 116. 重卡站：電池、DD 與服務上限

| 參數 | 新設備案例值 | 口徑 |
|---|---:|---|
| 總電池電量 | 513 kWh | 171 kWh × 3 |
| 回收 / ready SOC | 20% / 100% | 補能窗口 |
| 每次補能 | 410.4 kWh | 513 × 0.8；舊表 410 不覆寫 |
| 電池倉 | 每側 8 倉 | 雙側合計 16，非換電工位數 |
| DD 額定 | 每倉 560 kW | 8 台 / 側；不等於同時能獲得 4480 kW |
| DD 充電機效率 | 97.4% | 包含原表組裝邊界，不再乘 DD 模組與同一段電纜效率 |
| 機械服務上限 | 每側 8 次 / h | 工程示範採 1 工位 × 7.5 分鐘，作業時間屬導出假設 |
| SST | 每台 1680 kW / DC 800 V | 新容量案例用 98% 轉換效率，舊加權 98.12% 保留 |

8 次補能 = 3283.2 kWh。97.4% 下 DD 平均輸入 = **3370.841889 kW**。附件列 3370.76，存在約 0.081889 kW 的算術／隱藏精度差；不可把圖示列值硬編成公式結果。兩台 SST 輸出 3360，短缺 **10.841889 kW**；可持續能量上限為 **7.974269 次 / h**。8 次機械能力、初始滿電庫存支援的暫態服務、長期補電平衡是三個不同約束。

保留電池選型資料：

| 電量 kWh | 原列 Ah | 原列電流 | 額定 V | 範圍 V |
|---:|---:|---|---:|---|
|400.61|324|300 A × 2|618.24|480–700.8|
|513|268|300 A × 2|637.56|495–722.7|
|528.13|268|300 A × 2 / 400 A × 2|656.88|510–744.6|
|600.92|324|300 A × 2 / 450 A × 2|618.24|480–700.8|
|704.17|268|268 A × 4 / 536 A × 2|656.88|510–744.6|
|801.23|324|300 A × 4 / 600 A × 2|618.24|480–700.8|

此表為附件轉錄，不宣稱官方已驗證；Ah / 並聯組數尚待型錄確認。不得以單組 V×Ah 覆蓋總電量；圖中的 1C / 2C 例子不構成所有電池的通用電流規格。

# 117. 乘用車：CATL 巧克力站

官方產品頁查核日期 2026-09-08：[CATL 巧克力換電解決方案](https://www.catl.com/brand/servicebrand/)。採 #20 / #25 站體配置；14–30 電池倉、99 秒換電、軸距相容範圍 2.55–3.10 m。示範選 14 倉，可調至 30。

[2024-12-19 官方發布稿](https://www.catl.com/news/8209.html) 寫 100 秒；作為歷史版本留存，現行設定用產品頁 99 秒。2022 EVOGO 的 48 電塊／單塊約 1 分鐘不混入此代站型。型號與發布年份須跟隨設備快照，不能只存泛稱「CATL」。

附件分配乘用車充電 500 kW + 站用 50 kW = 550 kW。這是**方案配置而非已核實 CATL 額定**。官方未提供的接入容量、充電模組功率、電池容量／化學體系、備用電源與成本不得自行補成官方規格。99 秒不直接等同持續日吞吐。

現階段採共用交流負載模式，係數可調，預設 0.5 明示為假設；不自動建立乘用車需求、不計乘用車換電收入。未來完整服務模式須補到站車流、電池庫存、SOC、排隊、價格與成本，再進入財務合併。

# 118. 箱變、PCS 與超充容量表

附件單側交流設計案：

- 箱變：2500 kVA × PF 0.99 × η 0.98 = **2425.5 kW**。
- 交流滿載：乘用車 550 + 重卡站用 200 + SST 輔助 10 × 2 = **770 kW**。
- PCS 可用輸入：2425.5 − 770 = **1655.5 kW**。
- PCS 2000 kW 額定、η 0.98，輸出 **1622.39 kW**。此型號是本次方案；舊架構 1600 kW 保留在歷史預設。

此交流案包含每側 2 台 SST，對應二期。切回一期每側 1 台，交流滿載 760，PCS 輸出 1632.19。不得只改期別標籤而沿用相同輔助功率。

| PCS 補電倉數（單側） | 原列 DD 總輸入 kW | 原列 DC 餘量 kW | 同動率 0.6 配置 kW |
|---:|---:|---:|---:|
|0|0|1622.39|2703.98|
|1|421.36|1201.03|2001.72|
|2|842.71|779.68|1299.47|
|3|1264.07|358.32|597.21|

未捨入每倉平均需求為 410.4 / 0.974 = 421.355236 kW。容量表全精度計算、最後顯示捨入。除以同動率只是裝機估算，實時可分配功率仍不得超過餘量。

超充堆：每側 1440 kW，兩側 2880 kW；每側 2 個雙槍終端 / 4 槍，雙側 4 終端 / 8 槍。原圖 4 台獨立 960 kW 柱合計 3840 為不採用配置；採用共享模組堆。

- 裝機分配例：6×480 = 2880；4×480 + 4×240 = 2880；8×480 需求 = 3840，須限功率。
- 液冷槍上限 600 A / 1000 V；P ≤ min(槍額定，車端 V×600/1000，上游可供功率)。800 V 才能以 600 A 達 480 kW；637.56 V 上限 382.536 kW，700 V 為 420 kW。
- 原圖雙側 PCS 餘量 1559.36–3244.78 kW。0.6/0.7/0.8/0.9/1.0 對應需求 1728/2016/2304/2592/2880。1559.36 < 1728，故不能宣稱全範圍皆滿足。
- 原圖餘量位於 DC 母線；若需求位於槍端，須再施加一次下游 DD 效率。不得混用輸入與輸出邊界。

# 119. 分期供電、設備與可見元件

一期 A 接入 6000、B 接入 2500 kVA，共 8500；每側 1 台 SST。二期 A 增至 9500、B 仍 2500，共 12000；每側 2 台 SST。

完整設備案例至少呈現並能點選：電力接入、進線櫃、計量櫃、出線櫃、負荷開關、每台 SST（含預留）、箱變、低壓饋線、功率補償櫃、PCS、兩条 DC 800 V 母線、跨站母聯、每倉 DD、每個電池倉、重卡換電工位、超充堆、雙槍終端、每支槍、CATL 站體與電池倉、站用負載。總覽須有設備形象及數量，不能只有抽象電力方塊。

中壓供電：Grid A → A 進線 / 計量 → 三支出線：A SST、B SST（AC10 kV 150 m）、A 箱變。Grid B 只供 B 箱變。每側箱變低壓分支供 PCS、乘用車、重卡站用及 SST 輔助。SST → 母線 1，PCS → 母線 2；跨站直流共享保持同類母線，不把獨立 AC 電網直接短接。

來源說明預留工位可減少二期施工；未核實前不把擴容、接線或停機成本設為零。150 m 線路目前僅保存長度與可調容量；未提供線材、截面、電阻，不能捏造 I²R。功率補償 kvar 待確認，當前 PF 是輸入參數。

來源雙站配置表保存 16/0 → 8、14/2 → 10、12/4 → 12、10/6 → 14（SST 倉 / PCS 倉 → 次每小時）；固定 SST 欄 8 次按一期兩台總量解讀。原圖推薦 12/4；此為容量分析參考，不能忽略 7.974269 的精確能量上限、機械工位與 PCS 其他負載。

# 120. 可執行案例與財務

1. 原表重播：48 列、總需求 77750 kWh、195 次；A 的原圖底部與逐列差異繼續可見。
2. 513 kWh 物理投影：保持車次與直接充電 kWh，僅將換電需求改為每次 410.4；合計需求 77801.2 kWh。來源與投影不能互相覆蓋。
3. 分期比較：一期 / 二期，逐台 SST 啟用及接入容量同步變動，保留需求與種子。
4. 倉位配置：每側 PCS 0/1/2/3 倉；其餘由 SST 充電，跨站共享開 / 關。
5. 限流案例：車端電壓 637.56 / 700 / 800 V，查驗槍、終端、堆及上游共享限制。
6. 停用案例：個別槍、DD、電池倉、PCS 或 SST 停用；不得憑圖示仍生成供能。開關為供電路徑狀態，不宣称完成保護暫態或 ATS 動態。

逐支槍保留 equipmentId；同一車次執行中不因另一車離場而換到另一支槍。每日能量帳包含實際購入、轉換損耗、輔助、客戶交付與電池存貨變化。

財務沿用服務費與購電分項、CAPEX/OPEX 缺值防護、爬坡及庫存能源調整；新增交流共用負載與線路損耗的成本納入代表日。乘用車負載模式不計服務收入。採訪 0.30 元 / 度、15000 度與 37 / 59 / 60 次仍為原始 410 kWh 口徑參考，不冒充本方案實測獲利。設備成本尚缺，不能由補電完成率推定盈利。

# 121. 契約、介面與匯出

Schema 1.2 新增 engineering 設定；1.0 / 1.1 匯入保留歷史模型，不強行遷移成新設備。預設產品介面展示完整設備，但初始化结果保持來源重播，避免把估算當實測。

- 總覽：雙站設備卡、8 倉 / 側、4 槍 / 側、CATL 電池倉、母聯狀態；設備可點選。
- 供電設計：完整 SVG、缩放與捲動、設備拖曳、鍵盤移動、參數及連線啟停。
- 設備與容量：需求重算、箱變餘量、同動率表、倉位配置、CATL 規格與來源、電池選型。
- 站務配置與工程配置重建拓撲時明示會替換手動連線；不要悄悄丟失編輯。
- JSON 完整存設定；XLSX 保留 11 個既有 sheet，詳細案例另加 Engineering_Settings / Capacity_Case，交易表保留槍 ID。源資料與導出量應可獨立辨識。

# 122. 驗收與能力邊界

至少驗證：513×0.8、每小時 8 次精確功率、2425.5/770/1655.5/1622.39、倉位餘量、同動率不足、600 A 槍限制、共享堆上限、Grid A→B SST 的來源歸屬、跨站開關、設備停用、固定種子重現、逐時守恆、JSON/XLSX 還原，以及正式產物可顯示站體與槍。

本輪以靜態有向供電路徑與庫存事件模型完成可執行示範。尚未宣稱完成：AC 潮流與無功補償控制、短路／保護協調、並聯暫態、ATS/UPS 備援切換、ESS/PV 真實時序、車端 SOC/溫度曲線、乘用車完整營運模型、全生命周期真實投資回報。既有 Master Prompt 的後續要求仍保留。


# 123. 連續多日與獨立驗證追加需求（2026-09-08）

本輪由 Codex / Astra 執行嚴格電氣、事件及財務稽核。既有第 0–122 章保留；以下明確化規則優先於先前互相衝突或未定義的描述。使用者要求三個多日測試案例、獨立預期與系統比較、PPT 驗證紀錄及公開發布。

# 124. 連續時鐘與事件契約

- Schema 1.3，horizonDays 為 1–31；每站每日 24 筆服務資料，day 從 0 起算，時間為期間開始後的絕對分鐘。
- 電池初始庫存只建立一次；午夜不得重置庫存、排隊、未完成換電或充電。
- 到站、補電完成、換電完成及停復電都是切分事件，不可延至下一整分鐘才釋放資源。
- 事件完成次數歸屬半開區間 [h,h+1)；最終期間終點作為最後一期關帳特例。日末狀態在下一日到站／開始事件之前取樣。
- 每筆服務到站時鎖定售電單價。充電收入按當時交付電量以累計交易金額差額歸屬，包含期末未完成服務已交付的部分；不假裝知道現場實際收款時間。
- 必要站務輔助電源不足時停止／暫停換電機械作業；SST 輔助電源不足時相依 SST 不可供電。合成驗證案例可明示零輔助的理想機械。
- 排程改变設備狀態後重新做完整拓撲驗證，禁止以先停用再啟用方式繞過 AC 並聯與 DD 邊界規則。

# 125. 電力邊界與工程帳

- 箱變 kVA×PF 為額定輸入有功上限，輸出受效率約束；SST／PCS／DD 依其已聲明的輸出容量共享限流。
- 每個時段保存元件 input/output/loss/terminal kWh、peak/capacity kW；每條連線保存 kWh 與峰值；每個實際來源電表保存進線量、峰值、電價及結算金額。
- 每步必須符合元件 input=output+loss、output=outgoing edges+terminal、非來源 input=incoming edges；逐時電量還須計入電池庫存變化。
- 相同上游額定容量不得在多請求或多路徑重複使用。路徑枚舉超過實作上限時明確停止，不可靜默截斷。
- SOURCE_CHAIN 將全流程摘要校準到對應轉換階段，不能把全部損耗推到輸出額定設備之後。詳細多分支案例使用 ASSEMBLY。
- 本版為有向、無環、固定效率的可行功率分配模型；不聲稱最優調度、AC 潮流／短路／保護配合或現場硬體認證。

# 126. 結算與財務邊界

- CNY 測試結算政策：交付 kWh 與单價先 HALF_UP 到六位小數；交易累計金額與「實際來源電表×小時」電费 HALF_UP 到分。以整數分比對；站別與固定輔助成本採最大餘數分攤，總分數不得改變。
- 單票及彙總金額絕對值不得超過 10^12 分（100 億 CNY），超出範圍停止計算，不能失去逐分精度後繼續輸出。
- 以上為明定測試政策。真實供電合約可能按其他週期結算、收需量費及稅，必須取得合約後另行建模與驗證。SOURCE_REPLAY 保留原表算術，並非正式分幣結算。
- 財務頁及 XLSX 必須使用同一不可變測算快照；不得拿新成本配舊需求結果。
- 多日外推前先正規化為每日平均。需求爬坡只作用於收入、服務用電與其他變動成本；固定輔助用電和固定 OPEX 按營運日照計。
- 期末電池能源不足期初時，不得用平均購價／效率虛構補回成本；停止投資回報外推。
- IRR 必須處理負值、無根、多符號變化及數值範圍，驗證正規化 NPV 殘差；不得輸出 NaN／Infinity 或不滿足根條件的回報率。
- 期間收入減電費為能源後貢獻，不是會計淨利。存貨成本、稅、折舊、替換資產與应收款未完整建模時不得宣稱真實獲利保證。

# 127. 三個獨立解析案例

| ID | 期間 | 驗證重點 |
|---|---:|---|
| V01_SST_3D | 3 日 | 每站每日 100 kWh 換電；SST 98%×DD 95%；庫存補回 |
| V02_PCS_AC_EV_4D | 4 日 | 兩站持續各 10 kW AC 輔助；箱變 98%×PCS 96%×DD 95%；每日各一次 100 kWh 超充 |
| V03_OUTAGE_CROSSSITE_5D | 5 日 | A 來源跨區供 B；中間 48 小時停電；排隊恢復與 112.5 kWh 期末缺口 |

案例是刻意簡化、可解析的受控輸入；與附件完整 513 kWh 元件案例分開保存。獨立 Python Decimal 70 位精度解析時段積分，不匯入模擬器，預期不得由系統輸出產生。逐時、逐日、全期、交易、節點、連線、電表皆須對帳。能量／功率／時間絕對容差 10^-6；完成數／庫存顆數精確；正式結算金額 0 分容差。首次不符、參考計算器更正、契約明確化及各版本雜湊須保留，不得抹除失敗來宣稱通過。

# 128. 正確性聲明與實測驗收

允許聲明：「在指定版本、輸入與明定模型契約下，已完成列出的獨立驗證，數值在聲明容差內一致。」有限测试不得延伸為所有情境零錯誤或真實獲利百分之百保證。

投資用途還須取得同步電表／SOC／交易／帳單，先約定量測不確定度與用途容差，分開校準期間與獨立留出驗證期間，覆蓋峰谷、低負載、滿載、跨區與故障恢復。建立誤差預算、成本清單、敏感度及保守需求情境，經電氣與財務獨立覆核後才擴大使用範圍。更改效率、拓撲、計價政策或模型版本後重跑回歸與適用的實測驗收。

# 129. 可報告與可重現交付

PPT 應列：稽核前問題、修正、能量邊界、三例輸入／每日結果／比對數值、最大誤差、金額規則、首次不符更正紀錄、尚未實測驗證範圍、適當報告口徑及下一階段驗收。文件、程式、測試與資料同步指定 GitHub；同專案公開網站延續既有授權直接發布。


# 130. 完整連接圖與時間軸逐節點驗算

新增「能量流驗算」頁，使用者能拖動1–31日連續時間軸，所有實際拓撲節點與连線同步顯示輸入、輸出、損耗及狀態；不能用簡化卡片取代完整元件。支援全圖／區域定位、平移縮放、節點搜尋與相鄰線追蹤、精確時間輸入、事件前後跳轉、播放及全圖原精度JSON匯出。

明確區分當下kW與小時kWh；從同一次受限模擬的真實分配區間記錄功率，採半開區間，不用每小時電量冒充當下功率、不插值。以無損訊號區間壓縮保留停機、恢復、充電完成與零需求的改變；期末顯示最後已模擬區間。原表重播與缺失trace必須標未計算。

側欄需列輸入＝輸出＋損耗、輸出＝出線＋末端吸收、非電源輸入＝入線之原數字與殘差，並提供功率積分和現有小時帳本的直接比對。全圖總量依實體電源計算；末端吸收不等於換電售電，存貨移轉不能重複記在電力線路。不可把零功率當未帶電，也不可把無功補償或理想線纜當完整AC潮流模型。

新增功能須重跑三個既有獨立多日案例，另以完整92節點／96連線案例核對全部節點、連線、實體電表與事件守恆；檢查exact boundary、期末微小事件、輔助閉鎖、供給受限、舊結果與零值。數值契約、操作及驗收記錄見ENERGY_FLOW_UI.md。原PPT保留原版本結論，不冒稱已覆蓋後續版本。


# 131. 能量流驗算的區間累計模式

在當下功率及小時電量之外，新增可指定起點與終點的「區間累計 kWh」。全站總輸入、總輸出、總損耗及所有節點／連線，必須按相同的 `[起點,終點)` 真實功率區間積分，不得將整小時電量按比例拆成任意短區間。

全站總輸入僅計實體電網進口；總輸出計所有末端吸收（電池回充、直充、輔助用電），不能把串接元件的輸出或全部連線相加而重複計量。換電交付是存貨移轉，不與供電末端吸收混為同一指標。

雙端時間軸及精確分鐘輸入需同步，支援期初至目前、完整期間。起訖夾在模擬範圍內；起點不得大於終點，空區間累計為0。切換模式不能保留逆序滑桿與另一組計算起訖。終點事件不屬於累計區間；峰值及狀態僅來自正長度交集。容量／峰值仍為kW，累計讀數為kWh。

原精度JSON匯出需保留起訖、模式、單位與全站量測邊界。缺少trace或來源重播不可虛構任意區間累計。驗收涵蓋短時充電、跨午夜停機、區間可加性、全期與帳本一致，以及跨站能量不重複計量。
