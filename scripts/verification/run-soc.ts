/** Compare the complete electrical/service engine to the Decimal-only oracle. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {simulateDetailed} from '../../packages/detailed-model/engine.ts';
import {batteryStateAt} from '../../packages/battery-trace/index.ts';
import {socVerificationProject,hourlySohVerificationProject,type SocVerificationId} from '../../packages/soc-verification/index.ts';
import {integrateSignal} from '../../packages/power-trace/index.ts';
const expected=JSON.parse(fs.readFileSync('data/verification/soc-expected.json','utf8'));
const tolerance=1e-6;let checks=0,maxAbsoluteError=0;
function close(actual:number,value:number|string,label:string){checks++;const error=Math.abs(actual-Number(value));maxAbsoluteError=Math.max(maxAbsoluteError,error);assert.ok(Number.isFinite(actual)&&error<=tolerance,`${label}: ${actual} != ${value} (error ${error})`);}
const reports=[];
for(const golden of expected.taper){
 const project=socVerificationProject(golden.id as SocVerificationId),result=simulateDetailed(project),detail=result.detailedResult!,trace=detail.batteryTrace;
 assert.ok(trace);const actualRows=[];
 for(let day=0;day<3;day++)for(const row of golden.rows){
  const minute=day*1440+Number(row.minute),battery=batteryStateAt(trace,'A-rack-0',minute);assert.ok(battery,`missing battery state ${golden.id} at ${minute}`);
  close(battery.energyKWh,row.energyKWh,`${golden.id} d${day} t${row.minute} stored`);
  close(battery.soc,row.soc,`${golden.id} d${day} t${row.minute} SOC`);
  close(battery.remainingKWh,row.remainingKWh,`${golden.id} d${day} t${row.minute} remaining`);
  const initialBatteryId=day===0?'initial':`swap-${day-1}:returned`,batteryId=Number(row.minute)<7.5?initialBatteryId:`swap-${day}:returned`;
  assert.equal(battery.batteryId,batteryId);checks++;
  const grid=result.powerTrace!.nodes.find(n=>n.nodeId==='A-grid')!,gridKWh=integrateSignal(grid.samples,1,day*1440,minute,result.powerTrace!.endMinute);
  close(gridKWh,Number(row.terminalKWh)/(.98*.974),`${golden.id} d${day} t${row.minute} grid`);
  actualRows.push({minute,energyKWh:battery.energyKWh,soc:battery.soc,remainingKWh:battery.remainingKWh,inputKW:battery.inputKW,status:battery.status,gridKWh});
 }
 const total=golden.threeDay;
 close(detail.fleet.totals.completed,total.completed,`${golden.id} completed`);
 close(detail.fleet.totals.initialStoredKWh,1026,`${golden.id} initial two station inventories`);
 close(detail.fleet.totals.finalStoredKWh,1026,`${golden.id} final two station inventories`);
 close(detail.fleet.totals.swapDeliveredKWh,total.deliveredKWh,`${golden.id} delivered`);
 close(detail.fleet.totals.batteryTerminalKWh,total.connectorKWh,`${golden.id} connector`);
 close(detail.fleet.totals.batteryLossKWh,total.batteryLossKWh,`${golden.id} battery loss`);
 close(detail.fleet.totals.inventoryResidualKWh,0,`${golden.id} fleet inventory residual`);
 close(detail.energy.balanceResidualKWh,0,`${golden.id} global residual`);
 close(result.totals.gridKWh,Number(total.connectorKWh)/(.98*.974),`${golden.id} grid input`);
 close(result.totals.lossKWh,Number(total.connectorKWh)/(.98*.974)-Number(total.deliveredKWh),`${golden.id} total loss`);
 for(let day=0;day<3;day++){
  const charging=detail.serviceEvents.filter(e=>e.kind==='battery-charge'&&e.slotId==='A-rack-0'&&e.atMinute>=day*1440&&e.atMinute<(day+1)*1440);
  close(charging.at(-1)!.toMinute!,day*1440+Number(golden.fullMinute),`${golden.id} d${day} exact full minute`);
  for(const endpoint of golden.endpoints){assert.ok(charging.some(e=>Math.abs(e.toMinute!-(day*1440+Number(endpoint.minute)))<1e-6),`${golden.id} band boundary ${endpoint.soc}`);checks++;}
 }
 const final=batteryStateAt(trace,'A-rack-0',4320)!;close(final.energyKWh,513,`${golden.id} horizon final energy`);close(final.soc,1,`${golden.id} horizon final SOC`);
 reports.push({id:golden.id,days:3,totals:result.totals,serviceTotals:detail.fleet.totals,rows:actualRows});
}
for(const target of [410.4,300]){
 const result=simulateDetailed(hourlySohVerificationProject(target)),transaction=result.detailedResult!.fleet.transactions[0];
 close(transaction.requestedKWh!,target,`hourly SOH requested ${target}`);
 close(transaction.deliveredKWh,target===300?300:0,`hourly SOH delivered ${target}`);
 close(transaction.requestedKWh!-transaction.deliveredKWh,target===300?0:410.4,`hourly SOH unserved ${target}`);
 if(target===410.4){assert.equal(transaction.start,null);assert.equal(transaction.completion,null);checks+=2;}
 reports.push({id:`hourly_soh_${target}`,transaction,totals:result.totals});
}
const report={status:'passed',oracle:expected.method,tolerance,checks,maxAbsoluteError,syntheticCurve:true,reports};
const output='docs/evidence/v0.7.0/soc-verification.json';fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,checks,tolerance,maxAbsoluteError,cases:reports.length,output}));
