"use client";
import {useMemo,useState} from 'react';
import {Button} from '../ui/button';
import {Table,TableHeader,TableHead,TableBody,TableCell,TableRow} from '../ui/table';
import {Stat,fmt} from './controls';
import type {Project,RunResult} from '../../packages/contracts/index.ts';
import {compareSocLive,socCaseOptions,socCaseProject,socCaseJSON,socComparisonJSON,type SocCheckRow} from '../../packages/soc-verification/checks.ts';

const options=socCaseOptions(),statusText={passed:'通過',failed:'不符',unavailable:'無法比對'} as const;
function downloadJSON(filename:string,text:string){const url=URL.createObjectURL(new Blob([text],{type:'application/json;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function valueText(value:number|string|null,unit:SocCheckRow['unit']):string{if(value===null)return '—';if(typeof value==='string')return value;return unit==='SOC'?`${fmt(value*100,6)}%`:fmt(value,unit==='次'||unit==='事件'?0:6);}
function CheckTable({rows}:{rows:SocCheckRow[]}){return <div className="table-scroll"><Table><TableHeader><TableRow>{['驗算項目','獨立預期','系統產出','絕對差','判定'].map(label=><TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.map(row=><TableRow key={row.id}>
 <TableCell>{row.label}<br/><small>{row.unit==='SOC'?'SOC 比例（顯示為 %）':row.unit}</small></TableCell>
 <TableCell>{valueText(row.expected,row.unit)}</TableCell><TableCell>{valueText(row.actual,row.unit)}</TableCell>
 <TableCell>{row.unit==='ID'?row.actual===null?'—':row.actual===row.expected?'一致':'不同':row.absoluteDifference===null?'—':row.absoluteDifference.toExponential(3)}</TableCell>
 <TableCell>{statusText[row.status]}</TableCell>
 </TableRow>)}</TableBody></Table></div>;}
export function SocVerificationPanel({result,busy,onRun}:{result:RunResult|null;busy:boolean;onRun:(project:Project)=>void}){
 const comparison=useMemo(()=>compareSocLive(result),[result]),[error,setError]=useState<string|null>(null);
 function execute(id:string){try{setError(null);onRun(socCaseProject(id));}catch(e){setError(e instanceof Error?e.message:String(e));}}
 const emptyMessage=comparison.state==='NO_RESULT'?'選擇一個三日案例，檢查本站引擎本次計算的電池 SOC 與能量。':comparison.state==='INPUT_MISMATCH'?'目前結果與三個固定 SOC 案例的完整輸入不同。請載入下方案例再測算，取得可比對的結果。':comparison.state==='MISSING_TRACE'?'這份結果缺少逐電池艙 SOC 時間軸，請重新執行案例。':comparison.state==='MODE_MISMATCH'?'請使用受限物理測算取得本次結果。':'這份結果缺少完整服務帳本，請重新執行案例。';
 return <section className="panel mt-6" aria-labelledby="soc-verification-title">
  <div className="panel-heading"><div><p className="eyebrow">BATTERY SOC · THREE-DAY VERIFICATION</p><h2 id="soc-verification-title">電池 SOC 三日驗證</h2></div></div>
  <p className="panel-note">三個案例檢查電池交換瞬間、逐時 SOC、回充能量、降功率邊界及電網用電。載入會替換目前方案；需要保留的設計請先匯出。</p>
  <div className="table-scroll"><Table><TableHeader><TableRow><TableHead>案例</TableHead><TableHead>驗證內容</TableHead><TableHead>操作</TableHead></TableRow></TableHeader><TableBody>{options.map(c=><TableRow key={c.id}>
   <TableCell><strong>{c.short} · {c.title}</strong></TableCell><TableCell>{c.description}</TableCell>
   <TableCell><div className="section-tools"><Button size="sm" disabled={busy} onClick={()=>execute(c.id)}>載入並執行 3 日</Button><Button size="sm" variant="outline" onClick={()=>downloadJSON(`${c.id}.json`,socCaseJSON(c.id))}>案例 JSON</Button></div></TableCell>
  </TableRow>)}</TableBody></Table></div>
  <p className="panel-note"><a href="https://github.com/pcpcchen-coder/HighwaySwapStationSim/blob/main/docs/BATTERY_SOC_AUDIT.md" target="_blank" rel="noreferrer">閱讀電池 SOC 修正與驗證紀錄 ↗</a></p>
  {error&&<p role="alert" className="notice error">{error}</p>}
  <div className="panel-heading mt-6"><h3>{comparison.caseTitle?`${comparison.caseTitle} · 本次比對`:'本次 SOC 比對結果'}</h3><Button variant="outline" disabled={!result||busy} onClick={()=>downloadJSON(`${comparison.caseId??'unmatched'}-soc-verification.json`,socComparisonJSON(result))}>匯出比對 JSON</Button></div>
  {busy&&<p role="status" className="notice">測算中；下方保留上一份成功結果快照，完成後更新。</p>}
  {comparison.state!=='MATCHED'?<p className="empty-state">{emptyMessage}</p>:<>
   <div className="stats-grid"><Stat label="本次比對" value={comparison.allPassed?'全部通過':'尚未全部通過'} note={`${comparison.engineVersion} · 3 日 · 完整輸入匹配`}/><Stat label="通過" value={fmt(comparison.passed)} unit="項"/><Stat label="不符" value={fmt(comparison.failed)} unit="項"/><Stat label="無法比對" value={fmt(comparison.unavailable)} unit="項"/></div>
   <p role="status" className={comparison.allPassed?'notice success':'notice error'}>{comparison.allPassed?'本次結果的列示數值符合獨立預期；下表顯示主要總量與完成時間。':'本次仍有不符或缺少的項目，請展開逐時明細確認。'}</p>
   <CheckTable rows={comparison.checks.filter(row=>row.group==='summary')}/>
   <details className="mt-4"><summary>查看逐時 SOC、電池識別與充電邊界明細（{comparison.checks.filter(row=>row.group!=='summary').length} 項）</summary><CheckTable rows={comparison.checks.filter(row=>row.group!=='summary')}/></details>
  </>}
  {comparison.notes.map((note,i)=><p key={i} className="panel-note">{note}</p>)}
  <p className="panel-note">以上曲線均為合成驗證假設。通過固定案例不代表設備實測校準或實際獲利保證；自訂設計與實測曲線仍須重新驗證。</p>
 </section>;
}
