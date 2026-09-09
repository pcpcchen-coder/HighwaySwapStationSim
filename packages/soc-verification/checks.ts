/** Browser-safe live comparison against the independent Decimal oracle.
 * A pass belongs to an exact fixed input snapshot and its current result only. */
import type {Project,RunResult} from '../contracts/index.ts';
import {batteryStateAt,type BatteryView} from '../battery-trace/index.ts';
import {integrateSignal} from '../power-trace/index.ts';
import {SOC_VERIFICATION_IDS,socVerificationProject,type SocVerificationId} from './index.ts';
import expectedData from '../../data/verification/soc-expected.json' with {type:'json'};

const descriptions=[
 {short:'SOC-1',title:'SOC 分段降功率',description:'線性能量／SOC，回站 20%，依 80%／90% 邊界降功率。'},
 {short:'SOC-2',title:'非線性能量／SOC',description:'同一充電曲線，改用非線性能量映射，逐時驗證電量與 SOC。'},
 {short:'SOC-3',title:'DD 限功率與停電',description:'每天第 20–35 分鐘限功率，第 35–42 分鐘停電，檢查回充延遲。'}
] as const;
const fixedCases=SOC_VERIFICATION_IDS.map((id,i)=>({id,project:socVerificationProject(id),...descriptions[i]}));
function canonical(value:unknown):string{return JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0)):v);}
const fingerprints=new Map(fixedCases.map(c=>[c.id,canonical(c.project)]));
export function socCaseOptions(){return fixedCases.map(c=>({id:c.id,short:c.short,title:c.title,description:c.description,days:3}));}
export function socCaseProject(id:string):Project{const c=fixedCases.find(c=>c.id===id);if(!c)throw Error('UNKNOWN_SOC_VERIFICATION_CASE');return structuredClone(c.project);}
export function socCaseJSON(id:string):string{return JSON.stringify(socCaseProject(id),null,2);}
export type SocCheckStatus='passed'|'failed'|'unavailable';
export interface SocCheckRow {
 id:string;label:string;group:'summary'|'cursor'|'event';unit:'kWh'|'min'|'次'|'SOC'|'ID'|'事件';
 expected:number|string;actual:number|string|null;absoluteDifference:number|null;tolerance:number;status:SocCheckStatus;source:string;
}
export interface SocLiveComparison {
 format:'HighwaySwapSim.SocLiveVerification';version:1;
 state:'NO_RESULT'|'INPUT_MISMATCH'|'MODE_MISMATCH'|'MISSING_DETAIL'|'MISSING_TRACE'|'MATCHED';
 caseId:SocVerificationId|null;caseTitle:string|null;horizonDays:number|null;engineVersion:string|null;
 inputMatches:boolean;allPassed:boolean;passed:number;failed:number;unavailable:number;
 checks:SocCheckRow[];notes:string[];
 benchmark:{source:string;artifact:string;numericTolerance:number;manufacturerCurve:false};
}
const finite=(value:unknown):number|null=>typeof value==='number'&&Number.isFinite(value)?value:null;
export function compareSocLive(result:RunResult|null):SocLiveComparison {
 const out:SocLiveComparison={format:'HighwaySwapSim.SocLiveVerification',version:1,state:result?'INPUT_MISMATCH':'NO_RESULT',caseId:null,caseTitle:null,horizonDays:result?.parameterSnapshot.horizonDays??null,engineVersion:result?.engineVersion??null,inputMatches:false,allPassed:false,passed:0,failed:0,unavailable:0,checks:[],notes:[],benchmark:{source:expectedData.method,artifact:'data/verification/soc-expected.json',numericTolerance:1e-6,manufacturerCurve:false}};
 if(!result)return out;
 const fingerprint=canonical(result.parameterSnapshot),selected=fixedCases.find(c=>fingerprints.get(c.id)===fingerprint);
 if(!selected){out.notes.push('完整參數快照與固定案例不同；修改後的案例不能沿用固定案例的通過結論。');return out;}
 out.caseId=selected.id;out.caseTitle=`${selected.short} · ${selected.title}`;out.inputMatches=true;
 if(result.mode!=='CONSTRAINED'){out.state='MODE_MISMATCH';out.notes.push('請執行受限物理測算，再核對 SOC 與電量。');return out;}
 const detail=result.detailedResult;
 if(!detail?.fleet?.totals||!Array.isArray(detail.serviceEvents)){out.state='MISSING_DETAIL';out.notes.push('此結果缺少完整服務帳本，請重新執行案例。');return out;}
 if(!detail.batteryTrace){out.state='MISSING_TRACE';out.notes.push('此結果沒有逐電池艙 SOC 時間軸，不能使用期末 SOC 代替逐時驗證。請重新執行案例。');return out;}
 out.state='MATCHED';
 const row=(id:string,label:string,group:SocCheckRow['group'],unit:SocCheckRow['unit'],expected:number|string,value:unknown,source:string)=>{
  const text=unit==='ID',e=text?String(expected):Number(expected),actual=text?(typeof value==='string'?value:null):finite(value);
  const tolerance=text||unit==='次'||unit==='事件'?0:1e-6;
  const difference=typeof actual==='number'&&typeof e==='number'?Math.abs(actual-e):null;
  const status:SocCheckStatus=actual===null||(!text&&!Number.isFinite(e))?'unavailable':text?(actual===e?'passed':'failed'):difference!==null&&difference<=tolerance?'passed':'failed';
  out.checks.push({id,label,group,unit,expected:e,actual,absoluteDifference:difference,tolerance,status,source});
 };
 const golden=expectedData.taper.find(c=>c.id===selected.id)!,total=golden.threeDay,service=detail.fleet.totals;
 const summary=(id:string,label:string,unit:SocCheckRow['unit'],expected:number|string,value:unknown,source:string)=>row(id,label,'summary',unit,expected,value,source);
 summary('completed','三日完成換電','次',total.completed,service.completed,'fleet.totals.completed');
 summary('initial','兩站期初電池庫存','kWh',1026,service.initialStoredKWh,'fleet.totals.initialStoredKWh');
 summary('final','兩站期末電池庫存','kWh',1026,service.finalStoredKWh,'fleet.totals.finalStoredKWh');
 summary('delivered','三日換電淨交付','kWh',total.deliveredKWh,service.swapDeliveredKWh,'fleet.totals.swapDeliveredKWh');
 summary('connector','三日電池充電端口輸入','kWh',total.connectorKWh,service.batteryTerminalKWh,'fleet.totals.batteryTerminalKWh');
 summary('battery-loss','三日電池吸收損耗','kWh',total.batteryLossKWh,service.batteryLossKWh,'fleet.totals.batteryLossKWh');
 summary('inventory-residual','服務電池庫存守恆殘差','kWh',0,service.inventoryResidualKWh,'fleet.totals.inventoryResidualKWh');
 summary('global-residual','全站能量守恆殘差','kWh',0,detail.energy?.balanceResidualKWh,'energy.balanceResidualKWh');
 summary('grid','三日電網購入','kWh',Number(total.connectorKWh)/(.98*.974),result.totals.gridKWh,'totals.gridKWh');
 summary('loss','三日所有轉換損耗','kWh',Number(total.connectorKWh)/(.98*.974)-Number(total.deliveredKWh),result.totals.lossKWh,'totals.lossKWh');
 const stateAt=(minute:number):BatteryView|null=>{try{return batteryStateAt(detail.batteryTrace,'A-rack-0',minute);}catch{return null;}};
 for(let day=0;day<3;day++){
  for(const [index,sample] of golden.rows.entries()){
   const minute=day*1440+Number(sample.minute),battery=stateAt(minute),id=`day-${day}-sample-${index}`,prefix=`第 ${day+1} 日 ${Number(sample.minute).toFixed(6)} 分`,source=`batteryTrace.A-rack-0@${minute}`;
   row(`${id}-stored`,`${prefix}：庫存電量`,'cursor','kWh',sample.energyKWh,battery?.energyKWh,source);
   row(`${id}-soc`,`${prefix}：SOC`,'cursor','SOC',sample.soc,battery?.soc,source);
   row(`${id}-remaining`,`${prefix}：剩餘回充需求`,'cursor','kWh',sample.remainingKWh,battery?.remainingKWh,source);
   const initialBatteryId=day===0?'initial':`swap-${day-1}:returned`,batteryId=Number(sample.minute)<7.5?initialBatteryId:`swap-${day}:returned`;
   row(`${id}-identity`,`${prefix}：電池識別`,'cursor','ID',batteryId,battery?.batteryId,source);
   let gridKWh:number|null=null;const grid=result.powerTrace?.nodes.find(n=>n.nodeId==='A-grid');
   if(grid&&result.powerTrace)try{gridKWh=integrateSignal(grid.samples,1,day*1440,minute,result.powerTrace.endMinute);}catch{/* Missing/broken signal remains unavailable. */}
   row(`${id}-grid`,`${prefix}：當日累計購電`,'cursor','kWh',Number(sample.terminalKWh)/(.98*.974),gridKWh,`powerTrace.A-grid@${minute}`);
  }
  const charging=detail.serviceEvents.filter(e=>e.kind==='battery-charge'&&e.slotId==='A-rack-0'&&e.atMinute>=day*1440&&e.atMinute<(day+1)*1440);
  summary(`full-${day}`,`第 ${day+1} 日回充完成（當日分鐘）`,'min',golden.fullMinute,charging.at(-1)?.toMinute===undefined?null:charging.at(-1)!.toMinute!-day*1440,`serviceEvents.A-rack-0.day-${day}.last.toMinute`);
  for(const endpoint of golden.endpoints){
   const found=charging.some(e=>typeof e.toMinute==='number'&&Math.abs(e.toMinute-(day*1440+Number(endpoint.minute)))<1e-6);
   row(`band-${day}-${endpoint.soc}`,`第 ${day+1} 日 SOC ${Number(endpoint.soc)*100}% 邊界切分`,'event','事件',1,found?1:0,'serviceEvents[].toMinute');
  }
 }
 const final=stateAt(4320);summary('horizon-energy','A 電池艙模擬終點電量','kWh',513,final?.energyKWh,'batteryTrace.A-rack-0@4320');summary('horizon-soc','A 電池艙模擬終點 SOC','SOC',1,final?.soc,'batteryTrace.A-rack-0@4320');
 out.passed=out.checks.filter(r=>r.status==='passed').length;out.failed=out.checks.filter(r=>r.status==='failed').length;out.unavailable=out.checks.filter(r=>r.status==='unavailable').length;
 out.allPassed=out.checks.length>0&&out.failed===0&&out.unavailable===0;
 out.notes.push('獨立參考使用 Python Decimal 60 位精度；能量、時間及 SOC 比例容差為 10⁻⁶，電池識別與事件存在性須完全一致。');
 out.notes.push('三個案例的充電曲線及能量／SOC 曲線均為合成測試假設。通過表示本次結果符合固定輸入與明列模型，不等同實測設備校準或實際獲利保證。');
 return out;
}
export function socComparisonJSON(result:RunResult|null):string{return JSON.stringify({...compareSocLive(result),generatedAt:new Date().toISOString(),parameterSnapshot:result?.parameterSnapshot??null},null,2);}
