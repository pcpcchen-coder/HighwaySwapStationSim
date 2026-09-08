# Independent analytical verification oracle

This package contains **exactly three synthetic multi-day fixtures**. It verifies implementation against stated equations and event timing. It does not validate the model against measurements, manufacturer performance curves, an actual tariff contract, or operational records.

`fixtures.json` contains reviewed inputs and policy assumptions. `calculate.py` uses only Python's standard library, `Decimal` at 70-digit precision, and closed-form interval integration. It neither imports nor calls HighwaySwapSim's allocator, station simulator, billing code, or any implementation-derived expected values. `expected.json` is the immutable expected result, including every physical source-hour invoice, component, edge, and consumer-station hour. `expected-summary.json` contains the same totals, daily results, transactions, and aggregated ledgers in a smaller file. Decimal quantities are published as strings with 30 fractional digits.

Run `python calculate.py` to reproduce and byte-check the expectation file. The explicit `--write` option regenerates it after an intentional reviewed fixture change. `manifest.sha256` fingerprints the package.

## Boundaries and equations

All fixtures start with one full 100 kWh battery at each site, ready SOC 1 and return SOC 0. Initial inventory is created once at the beginning of the full horizon. Swap service occupies a bay for 7.5 minutes; the reserved pack cannot recharge during service. Each 100 kWh completed swap reduces station inventory by 100 kWh. Battery charging power is 50 kW at the battery side. Buses, cables, and ideal switching nodes have no losses. Efficiency is applied once per conversion stage.

Hourly conservation is checked separately for both customer stations:

`source-attributed import − conversion loss − auxiliary consumption − customer energy − inventory change = 0`.

A node's `inputKWh` and `outputKWh` describe its conversion boundary; `lossKWh = inputKWh − outputKWh`. For a terminal auxiliary sink, output means delivered auxiliary energy. For a terminal charger, output means delivered battery/EV charging energy. These terminal outputs are accounted as inventory inflow or customer/auxiliary consumption; outputs across all nodes must not be summed as customer delivery. Edge energy describes flow between adjacent node boundaries. There are no line-loss assumptions hidden in the edge values.

SST-path battery-side energy `E` needs `E / (0.98 × 0.95)` grid energy. The two stage losses are `E / 0.95 × (1 / 0.98 − 1)` for SST and `E × (1 / 0.95 − 1)` for DD.

PCS-path EV energy `E` and transformer-side AC consumption `A` need `(E / (0.96 × 0.95) + A) / 0.98` grid energy. AC auxiliary consumption bypasses PCS and DD. Transformer loss therefore includes both branches; PCS and DD losses include only the EV branch.

These fixtures explicitly assume zero mechanical and SST auxiliary power in V01 and V03 to isolate charging, inventory, and source attribution. V02 explicitly consumes 10 kW of transformer-fed AC auxiliary power at each site for all 96 hours. Zero auxiliary power in a synthetic fixture must not be interpreted as a claim about real station operation.

## Monetary contract

The fixture contract adopts CNY settlement to cents using `ROUND_HALF_UP`:

1. At customer arrival, lock the customer price to that site's arrival-hour grid-price field plus the 0.30 CNY/kWh service fee. During delivery, quantize cumulative delivered session energy and the locked tariff to six decimal places, multiply, and round to two decimal places. Each delivery interval recognizes the increase in that cumulative invoice. Energy delivered by an unfinished session remains recognized at the horizon.
2. For electricity, group physical import by **grid source and absolute hour**, quantize imported energy and source-hour tariff to six decimal places, multiply, and round each source-hour invoice to two decimal places. Sum those invoices over the horizon. Do not round separately by load station when one source feeds both stations.
3. Preserve unrounded analytical cost in parallel. Displaying a total to cents is different from summing invoices individually rounded to cents.

`revenueSettled − gridCostSettled` is the modeled operating contribution. Fixed and variable operating costs are explicitly zero in these analytical fixtures, and CAPEX is unspecified. These results are not accounting net profit, IRR, an investment forecast, or a sustainable steady-state margin. In V03, inventory ends 112.5 kWh below its initial level; the horizon's contribution includes that inventory drawdown. No refill cost is fabricated without a stated subsequent tariff and replenishment policy.

Consumer-station ledgers retain exact source-attributed electricity cost. Cash settlement is authoritative at the physical source meter. Allocating an odd-cent source invoice equally across both consumers requires a separate rounding rule, so this oracle does not invent such an allocation.

## Expected totals

All energy columns are kWh. Currency columns are CNY.

| Quantity | V01: SST, 3 days | V02: PCS + AC + EV, 4 days | V03: cross-site outage, 5 days |
|---|---:|---:|---:|
| Customer energy requested | 600 | 800 | 1,000 |
| Customer energy delivered | 600 | 800 | 1,000 |
| Completed sessions | 6 | 8 | 10 |
| Grid import | 644.468313641246 | 2,854.278553526674 | 953.276047261010 |
| Conversion loss | 44.468313641246 | 134.278553526674 | 65.776047261010 |
| Auxiliary consumption | 0 | 1,920 | 0 |
| Battery charging input | 600 | 0 | 887.5 |
| Initial inventory | 200 | 200 | 200 |
| Final inventory | 200 | 200 | 87.5 |
| Invoice revenue | 480.00 | 680.00 | 1,050.00 |
| Unrounded electricity cost | 322.234156820623 | 1,569.853204439671 | 660.580021482277 |
| Settled electricity cost | 322.26 | 1,569.44 | 660.59 |
| Settled modeled contribution | 157.74 | −889.44 | 389.41 |
| Longest customer wait, min | 0 | 0 | 1,567.5 |

V01 has one swap per site at 00:00 daily. Service ends at 00:07.5, followed by two hours of charging. Battery energy restored per site in hours 0, 1, and 2 is 43.75, 50, and 6.25 kWh. Each physical source's hourly invoices sum to 53.71 CNY/day; both sites over three days total 322.26 CNY.

V02 has one 100 kWh EV session per site at noon daily. Each finishes at 14:00 using a 50 kW gun. Each source-hour includes 10 kWh AC load plus 50 kWh of EV delivery in hours 12 and 13, or only 10 kWh AC load during the other 22 hours. Daily total settled electricity costs are 285.36, 356.68, 428.04, and 499.36 CNY. The four purchase prices are 0.40, 0.50, 0.60, and 0.70 CNY/kWh, with the service fee added for customers.

## V03: cross-midnight recovery and source attribution

A single 200 kW SST at A supplies both stations through the ideal DC tie. The physical source is exclusively `A-grid`; B has no source import. A's daily purchase prices are 0.40, 0.50, 0.60, 0.70, and 0.80 CNY/kWh. B's customer grid-price field is 0.90 CNY/kWh every day. A's tariff pays for **both** sites' physical import; B's 0.90 field affects only B's locked retail invoices. This deliberate mismatch detects charging B's supplied energy at B's tariff.

The grid is off throughout absolute minutes `[1440, 4320)`, corresponding to days 2 and 3. Every site's 23:00 daily swap arrives even during the outage. With one pack per site, day 1's swap leaves only 43.75 kWh by midnight, so days 2 and 3 queue. The queue remains intact across midnight and clears after supply resumes.

| Day | Delivered | Battery restored | Grid import | Ending inventory | Ending queue, both sites | Revenue | Settled electricity |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | 200 | 87.5 | 93.984962406015 | 87.5 | 0 | 190.00 | 37.59 |
| 2 | 0 | 0 | 0 | 87.5 | 2 | 0.00 | 0.00 |
| 3 | 0 | 0 | 0 | 87.5 | 4 | 0.00 | 0.00 |
| 4 | 600 | 600 | 644.468313641246 | 87.5 | 0 | 630.00 | 451.14 |
| 5 | 200 | 200 | 214.822771213749 | 87.5 | 0 | 230.00 | 171.86 |

Per site, the analytical event times in absolute minutes are:

| Arrival day | Arrival | Swap start | Swap completion | Wait |
|---|---:|---:|---:|---:|
| 1 | 1,380 | 1,380 | 1,387.5 | 0 |
| 2 | 2,820 | 4,387.5 | 4,395 | 1,567.5 |
| 3 | 4,260 | 4,515 | 4,522.5 | 255 |
| 4 | 5,700 | 5,700 | 5,707.5 | 0 |
| 5 | 7,140 | 7,140 | 7,147.5 | 0 |

The battery-side charge intervals, in absolute minutes, are `[1387.5,1440]`, `[4320,4387.5]`, `[4395,4515]`, `[4522.5,4642.5]`, `[5707.5,5827.5]`, and `[7147.5,7200]`. Each station charges at 50 kW inside these intervals. Their durations total 532.5 minutes per site, giving `2 × 50 × 532.5 / 60 = 887.5 kWh`.

Day 4's grid return must make the first queued service start at **4,387.5**, not the next whole minute. A minute-stepped simulator that ignores battery-ready thresholds can conserve total energy yet misstate waiting times, later charge windows, and hourly tariffs. This fixture checks physical completion timing as well as totals.

The cross-site cable carries exactly `443.75 / 0.95 = 467.105263157895 kWh`. Source import is `(87.5 + 600 + 200) / 0.931`. The unrounded electricity cost is `(87.5 × 0.4 + 600 × 0.7 + 200 × 0.8) / 0.931 = 615 / 0.931`, and source-hour settlement gives 660.59 CNY.

## Comparing an implementation run

Compare physical totals, each day, source meter, node input/output/loss, edge flow, station inventory, queue, and transaction timestamps against the immutable expectations. Edge keys in this oracle are `source->target`, independent of arbitrary edge IDs. Missing zero-flow records may be treated as zero. Suggested absolute tolerance is `1e-8` for physical kWh and minutes; settled currency must match exactly as integer cents. Keep full-precision values through comparisons and round only for presentation.

The JSON's `hourlyPhysicalLedgers` books physical EV energy and cumulative-invoice increments in their delivery intervals. Completion events use half-open hour intervals: a 14:00 finish counts in hour 14, while its final delivery occurred in hour 13. Source-hour invoice rows include all hours, including zero-energy hours. End-hour and end-day inventory, readiness, and queue snapshots include completions at the closing boundary, but precede arrivals and service starts exactly at that boundary. A new midnight swap therefore cannot reserve a pack in the preceding day's readiness snapshot. No boundary triggers an inventory reset.


## Oracle correction C01

Root review identified that the first version incorrectly marked V01's packs reserved at the prior day-end by swaps starting exactly at the next midnight. The same boundary predicate affected V03 readiness and queues immediately before 23:00. The initial independent review failed to challenge this boundary convention and its readiness/queue correctness claim was too broad.

The corrected end-period snapshot precedes arrivals and starts at its closing timestamp. Reservation now requires `start < boundary < completion`; queued requests require `arrival < boundary <= start`. V01 daily ready packs are now 2, 2, 2 across both sites. Fourteen hourly boundary state values changed; all energy, money, inventory, and transaction times are unchanged. `corrections.json` enumerates each difference and old/new expectation hashes, and `correction-boundaries-before.json` preserves the previous boundary values. The correction was derived from the stated event ordering, without inspecting an implementation result.


## Oracle contract clarification C02

The first complete implementation comparison was preserved as a failure: 47,033 assertions included 192 transformer capacity metadata differences, 16 hourly revenue differences, and 16 completion-count differences. Root then clarified the formal contract: transformer kVA × PF is its input rating; conversion efficiency gives output capacity, so this fixture's transformer output limit is 980 kW. Revenue is accrued as cumulative delivered-energy invoice increments, including unfinished sessions, and completion counts use half-open hour intervals.

The oracle was independently recalculated from 50 kW EV sessions running 12:00–14:00 and locked retail prices 0.70/0.80/0.90/1.00. Each site therefore recognizes 35/40/45/50 CNY in both hours 12 and 13, with one completion in hour 14. Exactly 48 V02 hourly scalar values and the fixture hash changed. Reversing only those changes reconstructs the original expected file byte-for-byte; all physical energy, source invoices, transactions, inventory, daily totals and horizon totals are unchanged. `corrections-C02.json` records the contract, differences, independent review and hashes.

After resolving those contract differences, the comparator passes all 47,489 primary assertions, including 456 explicit source-hour invoice-energy quantization checks added since the first run. Two separate in-memory mutation checks intentionally add 1 kWh to a physical source meter or 0.01 CNY to an invoice and must fail. They reuse an existing case, do not add scenarios, do not alter saved actual results, and are excluded from primary assertion counts.
