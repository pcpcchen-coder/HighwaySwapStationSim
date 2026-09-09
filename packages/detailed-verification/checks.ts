/** Browser-safe live verification. Arithmetic and benchmark interpretation live
 * here, never in the presentation component. A saved test pass is not a live pass. */
import type {Project,RunResult} from '../contracts/index.ts';
import type {DetailedRun} from '../detailed-model/contracts.ts';
import {detailedVerificationProjects} from './index.ts';
import {billMeterMonths} from '../extended-finance/index.ts';
import {scaled} from '../money/index.ts';
import expectedData from '../../data/verification/detailed-expected.json' with {type:'json'};

type ExpectedRecord=Record<string,string|number|string[]|number[]>;
const oracle=expectedData as unknown as {cases:{id:string;expected:ExpectedRecord}[]};
const descriptions=[
 {short:'V04',title:'共享 DD 與母聯',description:'3 日：重卡補電與外接槍競爭功率，第二日母聯中斷後恢復。'},
 {short:'V05',title:'光伏、儲能與 UPS',description:'4 日：PV／ESS 持續庫存、ATS 切換、UPS 保留電量及未供負載。'},
 {short:'V06',title:'乘用換電與跨月電費',description:'5 日：14 倉乘用服務、來源小時計費、15 分鐘需量與跨月分攤。'},
] as const;
const fixedCases=detailedVerificationProjects().map((c,i)=>({...c,...descriptions[i]}));
function canonical(value:unknown):string{return JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0)):v);}
const fingerprints=new Map(fixedCases.map(c=>[c.id,canonical(c.project)]));
export function detailedCaseOptions(){return fixedCases.map(c=>({id:c.id,short:c.short,title:c.title,description:c.description,days:c.project.horizonDays}));}
export function detailedCaseProject(id:string):Project{const c=fixedCases.find(c=>c.id===id);if(!c)throw Error('UNKNOWN_DETAILED_VERIFICATION_CASE');return structuredClone(c.project);}
export function detailedCaseJSON(id:string){return JSON.stringify(detailedCaseProject(id),null,2);}
export type DetailedCheckStatus='passed'|'failed'|'unavailable';
export interface DetailedCheckRow {id:string;label:string;unit:'kWh'|'kW'|'min'|'CNY'|'次';expected:number;actual:number|null;absoluteDifference:number|null;tolerance:number;status:DetailedCheckStatus;source:string;}
export interface DetailedLiveComparison {
 format:'HighwaySwapSim.DetailedLiveVerification';version:1;
 state:'NO_RESULT'|'INPUT_MISMATCH'|'MODE_MISMATCH'|'MISSING_DETAIL'|'MATCHED';
 caseId:string|null;caseTitle:string|null;horizonDays:number|null;engineVersion:string|null;
 inputMatches:boolean;allPassed:boolean;passed:number;failed:number;unavailable:number;
 checks:DetailedCheckRow[];notes:string[];
 benchmark:{source:string;artifact:string;energyTolerance:number;timeTolerance:number;moneyToleranceCents:number};
}
const finite=(v:unknown):number|null=>typeof v==='number'&&Number.isFinite(v)?v:null;
/** Raw requested minus delivered power integrated over its actual event spans.
 * This is an audit of missing auxiliary delivery, not modeled vehicle revenue. */
function unmetAuxiliary(result:RunResult,nodeId:string):number|null{
 const trace=result.powerTrace,signal=trace?.nodes.find(n=>n.nodeId===nodeId);if(!trace||!signal?.samples.length)return null;
 let value=0;for(let i=0;i<signal.samples.length;i++){const s=signal.samples[i],end=signal.samples[i+1]?.[0]??trace.endMinute;if(!Number.isFinite(s[5])||!Number.isFinite(s[4])||end<s[0])return null;value+=Math.max(0,s[5]-s[4])*(end-s[0])/60;}return value;
}
export function compareDetailedLive(result:RunResult|null):DetailedLiveComparison{
 const out:DetailedLiveComparison={format:'HighwaySwapSim.DetailedLiveVerification',version:1,state:result?'INPUT_MISMATCH':'NO_RESULT',caseId:null,caseTitle:null,horizonDays:result?.parameterSnapshot.horizonDays??null,engineVersion:result?.engineVersion??null,inputMatches:false,allPassed:false,passed:0,failed:0,unavailable:0,checks:[],notes:[],benchmark:{source:'Independent Python Decimal, precision 70',artifact:'data/verification/detailed-expected.json',energyTolerance:1e-6,timeTolerance:1e-6,moneyToleranceCents:0}};
 if(!result)return out;
 const fingerprint=canonical(result.parameterSnapshot),selected=fixedCases.find(c=>fingerprints.get(c.id)===fingerprint);
 if(!selected){out.notes.push('結果快照未與任一固定驗證輸入完全相同。修改後的案例不能沿用原案例通過結論。');return out;}
 out.caseId=selected.id;out.caseTitle=`${selected.short} · ${selected.title}`;out.inputMatches=true;
 if(result.mode!=='CONSTRAINED'){out.state='MODE_MISMATCH';out.notes.push('來源回放結果不具備物理驗證資格。');return out;}
 const d=(result as DetailedRun).detailedResult;
 if(!d){out.state='MISSING_DETAIL';out.notes.push('這份結果缺少完整模型的庫存、儲能與物理帳本。請重新執行。');return out;}
 out.state='MATCHED';
 const row=(id:string,label:string,unit:DetailedCheckRow['unit'],expected:unknown,value:unknown,source:string)=>{
  const e=Number(expected);let actual=finite(value);let difference:number|null=null;
  const tolerance=unit==='CNY'||unit==='次'?0:1e-6;
  if(actual!==null){if(unit==='CNY'){try{actual=Number(scaled(actual,2))/100;difference=Math.abs(Number(scaled(actual,2))-Number(scaled(e,2)))/100;}catch{actual=null;}}else difference=Math.abs(actual-e);}
  const status:DetailedCheckStatus=actual===null||difference===null||!Number.isFinite(e)?'unavailable':difference<=tolerance?'passed':'failed';
  out.checks.push({id,label,unit,expected:e,actual,absoluteDifference:difference,tolerance,status,source});
 };
 const idx=fixedCases.findIndex(c=>c.id===selected.id),e=oracle.cases[idx].expected,f=d.fleet;
 row('site-residual','全站能量守恆殘差','kWh',0,d.energy.balanceResidualKWh,'detailedResult.energy.balanceResidualKWh');
 row('inventory-residual','服務電池庫存殘差','kWh',0,f.totals.inventoryResidualKWh,'detailedResult.fleet.totals.inventoryResidualKWh');
 if(idx===0){
  row('grid','來源購電','kWh',e.gridKWh,result.totals.gridKWh,'totals.gridKWh');row('loss','轉換總損耗','kWh',e.lossKWh,result.totals.lossKWh,'totals.lossKWh');
  row('delivery','換電及充電淨交付','kWh',e.terminalKWh,result.totals.deliveredKWh,'totals.deliveredKWh');row('revenue','服務收入','CNY',540,result.totals.revenue,'totals.revenue');row('completed','完成服務','次',9,f.totals.completed,'fleet.totals.completed');
  row('initial','期初電池庫存','kWh',200,f.totals.initialStoredKWh,'fleet.totals.initialStoredKWh');row('final','期末電池庫存','kWh',200,f.totals.finalStoredKWh,'fleet.totals.finalStoredKWh');
  const a=e.aEVCompletionMinute as string[],b=e.bEVCompletionMinute as string[];
  for(let day=0;day<3;day++){
   const tx=(id:string)=>f.transactions.find(t=>t.id===id)?.completion;
   row(`swap-${day}`,`第 ${day+1} 日換電完成（全期分鐘）`,'min',day*1440+7.5,tx(`swap-${day}`),`fleet.transactions.swap-${day}.completion`);
   row(`a-${day}`,`第 ${day+1} 日 A 外充完成（全期分鐘）`,'min',Number(a[day])+7.5,tx(`a-charge-${day}`),`fleet.transactions.a-charge-${day}.completion`);
   row(`b-${day}`,`第 ${day+1} 日 B 外充完成（全期分鐘）`,'min',Number(b[day])+7.5,tx(`b-charge-${day}`),`fleet.transactions.b-charge-${day}.completion`);
  }
  out.notes.push('Project 版本以真實 7.5 分鐘換電產生補電缺口；外充時間較電氣原始 oracle 平移 7.5 分鐘，能量不變。');
 }else if(idx===1){
  row('grid','UPS 補電購電','kWh',e.gridKWh,result.totals.gridKWh,'totals.gridKWh');row('pv','PV 實際採收','kWh',e.pvHarvestedRawKWh,d.energy.pvKWh,'detailedResult.energy.pvKWh');row('loss','所有轉換損耗','kWh',e.lossKWh,result.totals.lossKWh,'totals.lossKWh');row('aux','末端負載交付','kWh',e.terminalKWh,d.energy.auxiliaryKWh,'detailedResult.energy.auxiliaryKWh');
  row('store-initial','ESS 與 UPS 期初庫存','kWh',e.initialStoredKWh,d.energy.storageInitialKWh,'detailedResult.energy.storageInitialKWh');row('store-final','ESS 與 UPS 期末庫存','kWh',e.finalStoredKWh,d.energy.storageFinalKWh,'detailedResult.energy.storageFinalKWh');
  row('curtail','PV 未採收（棄光）','kWh',e.curtailedRawEquivalentKWh,d.pv.reduce((s,x)=>s+x.curtailedKWh,0),'detailedResult.pv[].curtailedKWh');
  row('ess-final','ESS 期末庫存','kWh',50,d.storage.filter(s=>s.id==='A-ess').at(-1)?.storedKWh,'detailedResult.storage.A-ess.last');row('ups-final','UPS 期末庫存','kWh',20,d.storage.filter(s=>s.id==='A-ups').at(-1)?.storedKWh,'detailedResult.storage.A-ups.last');
  row('ups-unmet','UPS 未供負載','kWh',e.unservedUPSKWh,unmetAuxiliary(result,'A-backup-load'),'powerTrace.A-backup-load requested minus delivered');
  out.notes.push('棄光與未供負載另列，不計作轉換損耗；本例沒有車輛交易收入。');
 }else{
  row('grid','來源購電','kWh',e.gridKWh,result.totals.gridKWh,'totals.gridKWh');row('delivery','乘用及直接充電交付','kWh',e.deliveredKWh,result.totals.deliveredKWh,'totals.deliveredKWh');row('revenue','服務收入','CNY',e.revenue,result.totals.revenue,'totals.revenue');row('energy-cost','逐来源逐小時電量費','CNY',e.energyCharge,result.totals.gridCost,'totals.gridCost');row('loss','轉換損耗','kWh',0,result.totals.lossKWh,'totals.lossKWh');
  row('initial','期初庫存（14 倉及重卡）','kWh',1600,f.totals.initialStoredKWh,'fleet.totals.initialStoredKWh');row('final','期末庫存（14 倉及重卡）','kWh',1600,f.totals.finalStoredKWh,'fleet.totals.finalStoredKWh');
  const tx=f.transactions.filter(t=>t.kind==='passenger-swap'),times=e.passengerSwapCompletionMinutes as string[];row('passenger-count','乘用換電完成','次',5,tx.filter(t=>t.completion!==null).length,'fleet.transactions passenger-swap completed');
  for(let day=0;day<5;day++)row(`passenger-${day}`,`第 ${day+1} 日乘用換電完成（全期分鐘）`,'min',times[day],tx[day]?.completion,`fleet.transactions passenger-swap[${day}].completion`);
  try{const bill=billMeterMonths(result,result.parameterSnapshot.detailed!.finance);
   row('invoice','含基本費的分攤帳單估計','CNY',e.estimatedInvoice,bill.total,'billMeterMonths.total');row('contribution','扣上述帳單後現金貢獻','CNY',e.cashContributionAfterEstimatedBill,bill.total===null?null:result.totals.revenue-bill.total,'revenue minus estimated invoice');
   for(const station of ['A','B'] as const)for(const month of ['2026-01','2026-02']){const b=bill.rows.find(r=>r.sourceId===`${station}-grid`&&r.month===month);row(`peak-${station}-${month}`,`${station} 電表 ${month} 觀測 15 分鐘峰值`,'kW',station==='A'?e.sourceAObservedPeakKW:e.sourceBObservedPeakKW,b?.observedMaximum15minKW,`billMeterMonths.${station}.${month}.observedMaximum15minKW`);}
   if(bill.issues.length)out.notes.push(...bill.issues.map(issue=>`${issue.path}: ${issue.message}`));
  }catch(error){row('invoice','含基本費的分攤帳單估計','CNY',e.estimatedInvoice,null,'billMeterMonths.total');out.notes.push(`帳單比對無法完成：${error instanceof Error?error.message:String(error)}`);}
  out.notes.push('使用合成電價；2 日一月與 3 日二月採明示分攤估計，觀測峰值不代表完整計費月最大需量。');
 }
 out.passed=out.checks.filter(r=>r.status==='passed').length;out.failed=out.checks.filter(r=>r.status==='failed').length;out.unavailable=out.checks.filter(r=>r.status==='unavailable').length;out.allPassed=out.checks.length>0&&out.failed===0&&out.unavailable===0;
 out.notes.push('此頁即時核對所列總量、庫存與事件；正式回歸另有逐節點／連線／來源小時帳本驗證。通過只適用相同固定輸入與明定模型，並非實測盈利保證。');
 return out;
}
export function detailedComparisonJSON(result:RunResult|null){return JSON.stringify({...compareDetailedLive(result),generatedAt:new Date().toISOString(),parameterSnapshot:result?.parameterSnapshot??null},null,2);}
