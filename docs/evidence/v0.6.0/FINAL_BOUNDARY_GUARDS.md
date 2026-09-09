# 最終整合狀態

候選防護已整合到正式 readiness；`tests/detailed-boundary-readiness.test.ts` 4 組通過，完整核心 134 組通過。下方保留修正前的重現及候選說明。

# Final bounded readiness audit

Scope: custom auxiliary loads sharing fleet endpoints; grid dispatch limit target types; construction events changing state-owned converter efficiency. Read-only production checkout. No allocator rewrite or wider scope.

## Reproduced findings

All inputs below passed current `detailedReadiness` before the candidate guard.

| Input mutation | Observed real-engine behavior | Why this must be gated before execution |
|---|---|---|
| V04, no arrivals, custom 1 kW load at `A-rack-0`, battery efficiency 0.8 | 72 kWh auxiliary energy, 96.670247 kWh grid, battery inventory stays at 200 kWh | The network applies the battery storage efficiency to an auxiliary request, while only a service battery request updates inventory. A numerically balanced result can still use a mixed energy boundary. |
| V06, custom 1 kW load at `A-100` gun | 120 kWh auxiliary energy additionally booked at the active service gun | The same node carries independently attributed vehicle energy and auxiliary terminal energy. Separate the auxiliary physical endpoint. |
| V06, automatic passenger idle power 1 kW and custom 1 kW at `A-passenger-aux` | 240 kWh auxiliary energy over five days | Automatic and custom requests both consume the same named endpoint. One setting must own this node. |
| V04, `gridLimits=[{sourceId:'A-dd',kw:0}]` | DD becomes zero capacity; only 4 service transactions complete | The field is presented as a grid boundary limit but accepts a downstream equipment ID. |
| PV export golden, `gridLimits=[{sourceId:'A-pv-source',kw:0}]` | PV still harvests 111.111111 kWh | The engine's dynamic PV source cap overwrites this setting silently. |
| V05, construction changes `A-ess-in.eta` from 0.9 to 0.8 | Runtime storage port-power exception | Topology allocation and storage state update no longer share an efficiency. |
| V05, construction changes `A-ess-out.eta` from 0.8 to 0.7 | End-of-run site balance error, −22.5 kWh | The storage state law uses the unchanged config while the network uses the scheduled eta. |
| V05, construction changes `A-pv-mppt.eta` from 0.9 to 0.8 | PV harvest changes from 400 to 450 kWh | Dispatch availability uses config efficiency while network conversion uses scheduled efficiency. |

Reproduction script: `final-boundary-probe.ts`. Full machine-readable output: `final-boundary-probe.json`.

## Minimal candidate contract

1. Reserve actual `compileFleet` swap slot sinks (including user overrides), configured gun sinks, and enabled passenger automatic auxiliary sinks. Custom loads must use a separate node. Do not reject by equipment type: the V05 auxiliary rack is intentionally not a service slot and remains valid.
2. Require every existing `dispatch.gridLimits.sourceId` to be a grid node. A grid cap of zero remains valid. Other equipment limits belong in equipment parameters / physical limits.
3. For enabled storage, PV/export, passenger charger, and ATS inverter owners, reject construction eta values different from the owning config. Same-value eta, on/off, power-cap changes, and independent converter eta events remain valid. A future time-varying state-model schema may support synchronized efficiency changes; the current schema does not express that.
4. Preserve nullable/unfinished imported drafts. `parseDetailedDraft` and JSON/CSV remain unchanged; readiness explains why an ambiguous draft cannot run. Import remains atomic.

The general `allocateDetailedPower` function correctly aggregates marginal inputs and shared capacities. It cannot determine service/inventory ownership and should retain that separation; the minimal fix belongs at model readiness.

## Patch and tests

- `readiness-final.patch`: unified diff of only `packages/detailed-model/readiness.ts`.
- `readiness-final.candidate.ts`: same candidate complete file.
- `detailed-boundary-readiness.test.ts`: copy target `tests/detailed-boundary-readiness.test.ts`.
- Local absolute-import adapter verified four focused tests against the candidate readiness, all passed.
- These guards establish a finite contract for supported inputs. They do not imply all possible physical inputs are correct or that an energy-balanced result alone certifies site profitability.
