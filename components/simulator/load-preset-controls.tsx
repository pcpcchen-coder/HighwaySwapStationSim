"use client";
import {useState} from 'react';
import type {Project} from '../../packages/contracts/index.ts';
import {applyLoadPreset,captureLoadProfile,demandSummary,loadPlanOf,LOAD_LABELS,LOAD_LEVELS,matchesLoadProfile,type LoadLevel} from '../../packages/load-planning/index.ts';
import {Button} from '../ui/button';
import {Choice,fmt} from './controls';
export function LoadPresetControls({project,day,onChange,onError}:{project:Project;day:number;onChange:(p:Project)=>void;onError:(message:string)=>void}){
 const plan=loadPlanOf(project),[target,setTarget]=useState<LoadLevel>(plan.activeLoad??'high');
 const attempt=(fn:()=>Project)=>{try{onChange(fn());onError('');}catch(e){onError(e instanceof Error?e.message:String(e));}};
 return <div className="load-presets">
  <div className="load-preset-cards">{LOAD_LEVELS.map(level=>{const d=demandSummary(plan.profiles[level]);return <article key={level} className={`load-card ${plan.activeLoad===level?'selected':''}`}>
   <div className="load-card-top"><strong>{LOAD_LABELS[level]}</strong><span>雙站／代表日</span></div>
   <b>{fmt(d.total.energyKWh)} <small>kWh</small></b>
   <p>換電 {fmt(d.total.swapCount)} 次 · 充電 {fmt(d.total.chargeCount)} 次</p>
   <p>AC {fmt(d.ac.energyKWh)} · DC {fmt(d.dc.energyKWh)} kWh</p>
   <Button variant={plan.activeLoad===level?'default':'outline'} onClick={()=>attempt(()=>{const next=applyLoadPreset(project,level);setTarget(level);return next;})}>載入{LOAD_LABELS[level]}劇本</Button>
  </article>;})}</div>
  <p className="plan-note">載入會套用 A/B 兩區至目前全部 {project.horizonDays} 天，包含來源電價與服務費。設備及 SOC 沿用目前設定。來源每次換電為 410 kWh；AC＝PCS 母線，DC＝SST 母線。</p>
  <div className="plan-toolbar"><Choice label="儲存為十年估算的代表日" value={target} onChange={v=>setTarget(v as LoadLevel)} options={LOAD_LEVELS.map(l=>[l,LOAD_LABELS[l]])}/><Button variant="outline" onClick={()=>attempt(()=>captureLoadProfile(project,target,day))}>將第 {day+1} 天 A＋B 更新至{LOAD_LABELS[target]}劇本</Button></div>
  <p className="plan-note">逐時編輯保留每天的獨立數據；按上方更新劇本後，「十年估算」立即重新計算。{plan.activeLoad?(matchesLoadProfile(project,plan.activeLoad,day)?`本日與${LOAD_LABELS[plan.activeLoad]}劇本一致。`:'本日已修改，尚未存回所選劇本。'):'目前逐時資料尚未選用高、中、低劇本。'}</p>
 </div>;
}
