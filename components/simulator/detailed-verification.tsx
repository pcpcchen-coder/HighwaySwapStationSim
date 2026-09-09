"use client";
import {useMemo,useState} from 'react';
import {Button} from '../ui/button';
import {Table,TableHeader,TableHead,TableBody,TableCell,TableRow} from '../ui/table';
import {Stat,fmt} from './controls';
import type {Project,RunResult} from '../../packages/contracts/index.ts';
import {compareDetailedLive,detailedCaseOptions,detailedCaseProject,detailedCaseJSON,detailedComparisonJSON} from '../../packages/detailed-verification/checks.ts';

const options=detailedCaseOptions();
function downloadJSON(filename:string,text:string){const url=URL.createObjectURL(new Blob([text],{type:'application/json;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
const statusText={passed:'通過',failed:'不符',unavailable:'無法比對'} as const;
export function DetailedVerificationPanel({result,busy,onRun}:{result:RunResult|null;busy:boolean;onRun:(project:Project)=>void}){
 const comparison=useMemo(()=>compareDetailedLive(result),[result]);
 const [error,setError]=useState<string|null>(null);
 function execute(id:string){try{setError(null);onRun(detailedCaseProject(id));}catch(e){setError(e instanceof Error?e.message:String(e));}}
 const emptyMessage=comparison.state==='NO_RESULT'?'尚未執行新增驗證案例。請選擇下方 3 日、4 日或 5 日案例。':comparison.state==='INPUT_MISMATCH'?'上次結果的完整參數快照與固定驗證案例不同，不能沿用其預期數值。請載入固定案例並測算。':comparison.state==='MODE_MISMATCH'?'此結果為來源回放；請執行受限物理測算後比對。':'結果缺少完整模型帳本，請重新執行所選案例。';
 return <>
  <section className="panel mt-6" aria-labelledby="detailed-verification-title">
   <div className="panel-heading"><div><p className="eyebrow">V04–V06 · LIVE INDEPENDENT VERIFICATION</p><h2 id="detailed-verification-title">新增完整模型，親自執行與驗算。</h2></div></div>
   <p className="panel-note">三個固定案例採獨立 Python Decimal 70 位精度期望值。按下執行後，使用網站同一個測算引擎產生結果，再逐項比較。載入案例會替換目前設計、參數與到站資料；需要保留的自訂方案請先匯出。</p>
   <p className="panel-note"><a href="/reports/HighwaySwapSim-v0.6-Verification.pptx" download>下載驗證說明 PPT</a> · <a href="/reports/HighwaySwapSim-v0.6-Verification.pdf" target="_blank" rel="noreferrer">閱讀驗證說明 PDF</a> · <a href="https://github.com/pcpcchen-coder/HighwaySwapStationSim/blob/main/docs/COMPLETE_MODEL_GUIDE.md" target="_blank" rel="noreferrer">完整模型操作文件</a></p>
   <div className="table-scroll"><Table><TableHeader><TableRow><TableHead>案例</TableHead><TableHead>驗證內容</TableHead><TableHead>連續期間</TableHead><TableHead>操作</TableHead></TableRow></TableHeader><TableBody>
    {options.map(c=><TableRow key={c.id}><TableCell><strong>{c.short} · {c.title}</strong></TableCell><TableCell>{c.description}</TableCell><TableCell>{c.days} 日</TableCell><TableCell><div className="section-tools"><Button size="sm" disabled={busy} onClick={()=>execute(c.id)}>載入並執行 {c.days} 日</Button><Button size="sm" variant="outline" onClick={()=>downloadJSON(`${c.id}.json`,detailedCaseJSON(c.id))}>案例 JSON</Button></div></TableCell></TableRow>)}
   </TableBody></Table></div>
   {error&&<p role="alert" className="notice error">{error}</p>}
  </section>
  <section className="panel mt-6" aria-labelledby="detailed-live-title">
   <div className="panel-heading"><div><p className="eyebrow">LAST SUCCESSFUL RESULT SNAPSHOT</p><h2 id="detailed-live-title">{comparison.caseTitle?`${comparison.caseTitle} · 即時比對`:'新增案例的本次比對結果'}</h2></div><Button variant="outline" disabled={!result||busy} onClick={()=>downloadJSON(`${comparison.caseId??'unmatched'}-verification-report.json`,detailedComparisonJSON(result))}>匯出驗證報告 JSON</Button></div>
   {busy&&<p role="status" className="notice">測算執行中；下方仍保留上一份成功結果快照。</p>}
   {comparison.state!=='MATCHED'?<p className="empty-state">{emptyMessage}</p>:<>
    <div className="stats-grid"><Stat label="本次比對" value={comparison.allPassed?'全部通過':'尚未全部通過'} note={`${comparison.engineVersion} · ${comparison.horizonDays} 日 · 固定輸入完全匹配`}/><Stat label="數值通過" value={fmt(comparison.passed)} unit="項"/><Stat label="數值不符" value={fmt(comparison.failed)} unit="項"/><Stat label="缺少結果／無法比對" value={fmt(comparison.unavailable)} unit="項"/></div>
    <p role="status" className={comparison.allPassed?'notice success':'notice error'}>{comparison.allPassed?'這份結果的全部列示數值均符合獨立預期。':'請查看「不符」或「無法比對」的項目；目前不能宣稱此案例通過。'}</p>
    <div className="table-scroll"><Table><TableHeader><TableRow>{['驗算項目','獨立預期','系統產出','絕對差','允許差','判定'].map(label=><TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader><TableBody>{comparison.checks.map(row=><TableRow key={row.id}>
     <TableCell>{row.label}<br/><small>{row.unit}</small></TableCell><TableCell>{fmt(row.expected,row.unit==='CNY'?2:6)}</TableCell><TableCell>{row.actual===null?'—':fmt(row.actual,row.unit==='CNY'?2:6)}</TableCell><TableCell>{row.absoluteDifference===null?'—':row.absoluteDifference.toExponential(3)}</TableCell><TableCell>{row.tolerance===0?'0':row.tolerance.toExponential(0)} {row.unit}</TableCell><TableCell>{statusText[row.status]}</TableCell>
    </TableRow>)}</TableBody></Table></div>
   </>}
   {comparison.notes.map((note,i)=><p key={i} className="panel-note">{note}</p>)}
   <p className="panel-note">報告包含結果使用的完整參數快照、引擎版本、獨立預期、實際值、差異與容差。金額按結算到分比較；編輯目前設計不會改寫上次測算報告，請重新執行後取得新結果。</p>
  </section>
 </>;
}
