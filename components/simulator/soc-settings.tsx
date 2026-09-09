"use client";
import { useEffect, useState } from 'react';
import { Button } from '../ui/button';
import { NumberField, fmt } from './controls';
import { applyStationSOC, socWindowPreview } from '../../packages/station-settings/index.ts';
import type { Project, StationId } from '../../packages/contracts/index.ts';

export function SocRangeEditor({project,station,setProject}:{project:Project;station:StationId;setProject:(project:Project)=>void}){
 const applied=project.station[station];
 const [lower,setLower]=useState<number|null>(applied.returnSOC*100);
 const [upper,setUpper]=useState<number|null>(applied.readySOC*100);
 const [error,setError]=useState('');
 useEffect(()=>{setLower(applied.returnSOC*100);setUpper(applied.readySOC*100);setError('');},[applied,station]);
 let validation='',preview:ReturnType<typeof socWindowPreview>|null=null;
 try{
  if(lower===null||upper===null)throw Error('請填入 SOC 下限與上限。');
  preview=socWindowPreview(project,station,lower/100,upper/100);
 }catch(e){validation=e instanceof Error?e.message:String(e);}
 function apply(){
  if(lower===null||upper===null)return;
  try{
   setProject(applyStationSOC(project,station,lower/100,upper/100));
   setError('');
  }catch(e){setError(e instanceof Error?e.message:String(e));}
 }
 return <section aria-label={`${station} 區換電 SOC 設定`}>
  <h3>{station} 區 · 換電 SOC 範圍</h3>
  <p className="panel-note">目前已套用：{fmt(applied.returnSOC*100,2)}% → {fmt(applied.readySOC*100,2)}%。</p>
  <div className="form-grid">
   <NumberField label={`${station} 區回收 SOC 下限`} unit="%" value={lower} min={0} max={100} onChange={v=>{setLower(v);setError('');}}/>
   <NumberField label={`${station} 區交付 SOC 上限`} unit="%" value={upper} min={0} max={100} onChange={v=>{setUpper(v);setError('');}}/>
  </div>
  {preview&&<p className="metric-line">每次補電預覽 <strong>{fmt(preview.energyKWh,4)} kWh</strong> · 全期 {fmt(preview.swapCount)} 次，共 {fmt(preview.totalSwapKWh,4)} kWh</p>}
  <p className="tiny muted">離開此頁或修改該站其他參數前，請先套用；未套用輸入不保存。按下套用才更新設定，並依目前容量重算 {station} 區全部 {project.horizonDays} 天的換電需求；車次、直接充電與費率保持原值。這是同站換電電池的共用範圍，套用後請重新執行測算。</p>
  <Button variant="outline" disabled={!!validation} onClick={apply}>套用 {station} 區 SOC 並同步全期換電需求</Button>
  {validation&&<p className="notice error" role="alert">{validation}</p>}
  {error&&<p className="notice error" role="alert">{error}</p>}
 </section>;
}
