"use client";
import { useEffect, useRef, useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Choice, NumberField, Stat, fmt } from './controls';
import type { Project, StationId } from '../../packages/contracts/index.ts';
import { demandWarnings, exportServiceCSV, exportServiceJSON, importServiceProfile, recalculateSwapDemand, swapEnergyPerVehicle, updateServiceValue } from '../../packages/service-profile/index.ts';
import type { ImportMode, ServiceField } from '../../packages/service-profile/index.ts';

const fields: [ServiceField,string][]=[['swapCount','換電車次'],['swapKWh','換電總 kWh'],['chargeCount','充電車次'],['chargeKWh','充電總 kWh'],['gridPrice','購電價'],['swapFee','換電服務費'],['chargeFee','充電服務費']];
const rawFields: [ServiceField,string][]=[['swapTotalRaw','來源換電總價'],['chargeTotalRaw','來源充電總價']];
function downloadDemand(data:string,format:'csv'|'json'){
 const url=URL.createObjectURL(new Blob([data],{type:format==='csv'?'text/csv;charset=utf-8':'application/json;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download=`HighwaySwapSim-demand.${format}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function ServicePanel({project,setProject}:{project:Project;setProject:(p:Project)=>void}){
 const [station,setStation]=useState<StationId>('A'),[selectedDay,setDay]=useState('0'),[mode,setMode]=useState<ImportMode>('merge'),[advanced,setAdvanced]=useState(false),[reading,setReading]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const file=useRef<HTMLInputElement>(null),latest=useRef(project),readSequence=useRef(0);latest.current=project;
 useEffect(()=>()=>{readSequence.current++;},[]);
 const day=Math.min(Number(selectedDay),project.horizonDays-1),rows=project.services.filter(r=>r.station===station&&r.day===day).sort((a,b)=>a.hour-b.hour);
 const sum=(key:'swapCount'|'swapKWh'|'chargeCount'|'chargeKWh')=>rows.reduce((s,r)=>s+r[key],0);
 const warnings=demandWarnings(project,station,day),showRaw=advanced||project.billing==='SOURCE_DISPLAY_PRICE',columns=showRaw?[...fields,...rawFields]:fields;
 function attempt(action:()=>void){try{action();setError('');}catch(e){setMessage('');setError(e instanceof Error?e.message:String(e));}}
 async function read(f:File){const sequence=++readSequence.current;setReading(true);setError('');setMessage('');try{
  const extension=f.name.split('.').pop()?.toLowerCase();if(extension!=='csv'&&extension!=='json')throw Error('請選擇需求 CSV 或需求 JSON；結果 XLSX 請使用頁面上方匯入。');
  if(f.size>2*1024*1024)throw Error('需求檔上限為 2 MB。');
  const content=await f.text();if(sequence!==readSequence.current)return;const imported=importServiceProfile(latest.current,content,extension,mode);setProject(imported.project);
  setMessage(`已套用 ${imported.rows} 列需求（${mode==='merge'?'合併列入資料':'取代全部天數'}）。請重新執行測算，能量流與結果 XLSX 才會更新。`);
 }catch(e){if(sequence===readSequence.current)setError(e instanceof Error?e.message:String(e));}finally{if(sequence===readSequence.current)setReading(false);}}
 return <section className="panel">
  <div className="panel-heading"><div><p className="eyebrow">MULTI-DAY SERVICE PROFILE</p><h2>逐時補能與定價</h2></div><Choice label="服務區" value={station} onChange={v=>setStation(v as StationId)} options={[["A","A 服務區"],["B","B 服務區"]]}/><Choice label="日期" value={String(day)} onChange={setDay} options={Array.from({length:project.horizonDays},(_,d)=>[String(d),`第 ${d+1} 天`])}/></div>
  <p className="panel-note">直接修改每天、每站、每小時的到站車次及總需求。kWh 為該小時所有到站車輛的合計需求，平均分配給每台車；實際交付量由受限模擬決定。修改後請重新測算。</p>
  <div className="rounded-lg border p-4 my-4 space-y-3">
   <div className="flex flex-wrap items-end gap-3"><Choice label="需求匯入方式" value={mode} onChange={v=>setMode(v as ImportMode)} options={[["merge","合併列入資料"],["replace","取代全部天數"]]}/><input ref={file} type="file" accept=".csv,.json" aria-label="選擇逐時需求檔" hidden onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void read(f);}}/><Button variant="outline" disabled={reading} onClick={()=>file.current?.click()}>{reading?'讀取需求中…':'匯入需求 CSV / JSON'}</Button><Button variant="outline" onClick={()=>attempt(()=>downloadDemand(exportServiceCSV(project),'csv'))}>匯出需求 CSV</Button><Button variant="outline" onClick={()=>attempt(()=>downloadDemand(exportServiceJSON(project),'json'))}>匯出需求 JSON</Button></div>
   <p className="panel-note">匯出目前編輯中的全部 {project.horizonDays} 天、A/B 兩區需求，不必先測算。CSV 可用 Excel 修改，再另存為「CSV UTF-8（逗號分隔）」。檔案 day 從 1 開始、hour 為 0–23；合併只更新檔內列出的時段，取代須含全期 {project.horizonDays*48} 列。</p>
   <p className="panel-note">需求檔只更新逐時需求及價格；供電設計、站務、到站方式與計價模式沿用目前設定。完整備份請使用頁面上方「JSON」。<a className="underline" href="https://github.com/pcpcchen-coder/HighwaySwapStationSim/blob/main/docs/SERVICE_PROFILE.md" target="_blank" rel="noreferrer">需求檔格式與操作說明 ↗</a></p>
  </div>
  {error&&<p className="notice error" role="alert">{error}</p>}{message&&<p className="notice success" role="status">{message}</p>}
  <div className="flex flex-wrap items-end gap-4 my-4"><Choice label="每小時到站方式" value={project.arrival} onChange={v=>setProject({...project,arrival:v as Project['arrival']})} options={[["SCHEDULED","均勻排定"],["SEEDED","固定種子隨機"]]}/>{project.arrival==='SEEDED'&&<NumberField label="隨機種子" value={project.seed} min={0} max={4294967295} step={1} onChange={v=>attempt(()=>{if(v===null||!Number.isInteger(v)||v<0||v>4294967295)throw Error('隨機種子須為 0–4,294,967,295 整數。');setProject({...project,seed:v});})}/>}<Button variant="outline" onClick={()=>attempt(()=>{setProject(recalculateSwapDemand(project,station,day));setMessage(`已依目前電池 SOC 重算第 ${day+1} 天 ${station} 區換電需求。請重新測算。`);})}>本日換電量依 SOC 重算</Button></div>
  <p className="panel-note">均勻排定例如每小時 4 台，於第 0、15、30、45 分鐘到站；固定種子隨機會在該小時內產生可重現到站時間。此處以逐時需求產生事件，尚無單台車指定到站秒數功能。每次換電 SOC 電量為 {fmt(swapEnergyPerVehicle(project,station),4)} kWh。</p>
  <div className="stats-grid compact"><Stat label="換電到站" value={fmt(sum('swapCount'))} unit="次"/><Stat label="換電需求" value={fmt(sum('swapKWh'),2)} unit="kWh"/><Stat label="充電到站" value={fmt(sum('chargeCount'))} unit="次"/><Stat label="充電需求" value={fmt(sum('chargeKWh'),2)} unit="kWh"/></div>
  {warnings.length>0&&<details className="notice my-4"><summary>本日需求有 {warnings.length} 項待核對</summary><ul className="list-disc pl-5 mt-2">{warnings.map((w,i)=><li key={i}>{w}</li>)}</ul></details>}
  <div className="flex flex-wrap items-center gap-3 my-4"><Button size="sm" variant="outline" aria-pressed={showRaw} disabled={project.billing==='SOURCE_DISPLAY_PRICE'} onClick={()=>setAdvanced(!advanced)}>來源總價欄位：{showRaw?'顯示':'收起'}</Button><p className="panel-note">金額單位 CNY/kWh。{project.billing==='SOURCE_DISPLAY_PRICE'?'目前以「來源總價」計費，修改購電價或服務費不會改寫來源總價。':'目前以「購電價 + 服務費」計費；來源總價保留原值。'}單價在到站時鎖定。</p></div>
  <div className="table-scroll"><Table><TableHeader><TableRow><TableHead>時間</TableHead>{columns.map(([key,label])=><TableHead key={key}>{label}</TableHead>)}<TableHead>閒（原值）</TableHead></TableRow></TableHeader><TableBody>{rows.map(row=><TableRow key={row.hour}><TableCell className="mono">{String(row.hour).padStart(2,'0')}:00</TableCell>{columns.map(([key,label])=><TableCell key={key}><Input aria-label={`第 ${day+1} 天 ${station} 區 ${row.hour} 時 ${label}`} type="number" min="0" max={key.endsWith('Count')?1000:undefined} step={key.endsWith('Count')?1:'any'} value={row[key]} onChange={e=>attempt(()=>{if(e.target.value==='')throw Error('欄位不可空白；無需求請填 0。');setProject(updateServiceValue(project,station,day,row.hour,key,e.target.valueAsNumber));setMessage('');})}/></TableCell>)}<TableCell className="muted">{row.idleRaw??'未提供'}</TableCell></TableRow>)}</TableBody></Table></div>
 </section>;
}
