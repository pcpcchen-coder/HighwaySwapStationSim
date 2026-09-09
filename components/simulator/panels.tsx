"use client";
import { EquipmentEfficiencyTable } from './equipment-settings';
import { useState } from 'react';
import { Area, AreaChart, Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { NumberField, Choice, Stat, fmt } from './controls';
import { NetworkDiagram } from './topology';
import { FacilityMap } from './facility';
import { engineeringTopology } from '../../packages/engineering/index.ts';
import type { Project, RunResult, StationId } from '../../packages/contracts/index.ts';
import { compareEfficiency } from '../../packages/electrical-engine/index.ts';
import { breakEven, investmentCase } from '../../packages/economics-engine/index.ts';
import { equipmentRegistry } from '../../plugins/equipment/index.ts';
type Props={project:Project;setProject:(p:Project)=>void;result:RunResult|null};
const chartStyle={fontSize:11,fill:'#6d8179'};
export function DailyChart({result}:{result:RunResult}){const data=Array.from({length:24*result.parameterSnapshot.horizonDays},(_,absoluteHour)=>{const day=Math.floor(absoluteHour/24),hour=absoluteHour%24;return {hour:`D${day+1} ${hour.toString().padStart(2,'0')}:00`,A:result.hours.find(h=>h.station==='A'&&h.day===day&&h.hour===hour)?.deliveredKWh??0,B:result.hours.find(h=>h.station==='B'&&h.day===day&&h.hour===hour)?.deliveredKWh??0,price:result.parameterSnapshot.services.find(r=>r.station==='A'&&r.day===day&&r.hour===hour)?.gridPrice??0}});return <div className="chart"><ResponsiveContainer width="100%" height="100%" initialDimension={{width:800,height:245}}><ComposedChart data={data} margin={{top:15,right:5,bottom:0,left:5}}><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#e2eae5"/><XAxis dataKey="hour" tick={chartStyle} axisLine={false} tickLine={false} interval={Math.max(3,result.parameterSnapshot.horizonDays*4-1)}/><YAxis tick={chartStyle} axisLine={false} tickLine={false} width={48}/><YAxis yAxisId="price" orientation="right" tick={chartStyle} axisLine={false} tickLine={false} domain={[0,'auto']} width={32}/><Tooltip formatter={(value:unknown,name:unknown)=>[fmt(Number(value),2),name==='A'?'A 區 kWh':name==='B'?'B 區 kWh':'購電 CNY/kWh']}/><Bar dataKey="A" fill="#137e6f" radius={[3,3,0,0]} maxBarSize={12}/><Bar dataKey="B" fill="#94c6b4" radius={[3,3,0,0]} maxBarSize={12}/><Line dataKey="price" yAxisId="price" type="stepAfter" stroke="#c69a43" strokeWidth={2} dot={false}/></ComposedChart></ResponsiveContainer></div>;}
export function Overview({project,result,onDesign}:{project:Project;result:RunResult|null;onDesign:()=>void}){if(!result)return <section className="panel network-overview"><div className="panel-heading"><div><h1>{project.name}</h1><p className="panel-note">先調整供電、站務、需求與成本，再按上方「執行測算」。</p></div><Button variant="outline" onClick={onDesign}>檢視供電設計 ↗</Button></div><p className="notice" role="status">尚未測算；交付電量、收入、購電與損耗將於測算完成後顯示。</p>{project.engineering?<FacilityMap project={project} onDesign={onDesign}/>:<NetworkDiagram project={project}/>}</section>;const t=result.totals,synthetic=result.parameterSnapshot.sources.some(s=>s.status==='CONTROLLED_SYNTHETIC');return <><div className="hero"><div><p className="eyebrow accent">HIGHWAY ENERGY LAB / 雙站協同</p><h1>每一度電，<br/>都有清楚的去向。</h1><p className="hero-copy">連接供電配置、補能需求與營運收益。<br/>從來源案例出發，驗證你的下一個設計。</p><Button variant="outline" onClick={onDesign}>檢視供電設計 ↗</Button></div><div className="hero-summary"><div className="status-line"><span className="status-dot"/>{result.parameterSnapshot.name}<span className="mono">{result.parameterSnapshot.horizonDays*24} h</span></div><div className="hero-number">{fmt(t.deliveredKWh/1000,2)}<span>MWh</span></div><p>{result.mode==='SOURCE_REPLAY'?'來源逐列交付電量':'受限模擬實際交付電量'}</p><div className="mini-pair"><span>A / B 服務區</span><strong>{fmt(t.completed)} 次已完成</strong></div></div></div><div className="stats-grid"><Stat label="補能需求" value={fmt(t.requestedKWh)} unit="kWh" note="來源逐時合計，保留資料疑點"/><Stat label="交付完成率" value={fmt(t.requestedKWh?t.deliveredKWh/t.requestedKWh*100:0,1)} unit="%" note={result.mode==='SOURCE_REPLAY'?'重播值；尚非設備可行性驗證':`尚未交付 ${fmt(t.unservedKWh)} kWh`}/><Stat label="計費收入" value={fmt(t.revenue)} unit="CNY" note="能源費 + 服務費，尚未扣成本"/><Stat label={result.mode==='SOURCE_REPLAY'?'資料來源差額':'最大能量殘差'} value={result.mode==='SOURCE_REPLAY'?'2,050':fmt(t.maxBalanceResidual,6)} unit="kWh" note={result.mode==='SOURCE_REPLAY'?'A 區充電總計少列 12 時資料':'每小時輸入 − 輸出 − 損耗 − 庫存變化'}/></div><div className="overview-grid"><section className="panel"><div className="panel-heading"><div><p className="eyebrow">DAILY ENERGY PROFILE</p><h2>需求與電價，放在同一條時間軸。</h2></div><div className="legend"><i/>A 區 <i className="light"/>B 區 <i className="gold"/>電價</div></div><DailyChart result={result}/></section><section className="panel source-card">{synthetic?<><p className="eyebrow">CONTROLLED VERIFICATION CASE</p><h2>固定輸入，核對每一層。</h2><p>此為可獨立解析的驗證情境。切換「三例獨立驗證」可查看預期與系統產出；各元件及來源電表詳見模擬結果。</p><div className="notice">跨日保留電池庫存與排隊，不在午夜重置。初期 {fmt(t.initialStoredKWh,3)} ／期末 {fmt(t.finalStoredKWh,3)} kWh。</div></>:<><p className="eyebrow">DATA RECONCILIATION</p><h2>讓差異保持可見。</h2><p>來源原表與逐列計算並不完全相同。系統保留兩者，不為了配合總計改動單筆資料。</p><div className="reconcile-row"><span>A 區原圖充電</span><strong>35 次 / 12,430 kWh</strong></div><div className="reconcile-row"><span>A 區逐列重算</span><strong>36 次 / 14,480 kWh</strong></div><div className="notice">差額 = 12 時的 1 次 / 2,050 kWh</div></>}</section></div><section className="panel network-overview"><div className="panel-heading"><div><p className="eyebrow">ELECTRICAL CONFIGURATION</p><h2>雙服務區供電概覽</h2></div><Button variant="ghost" onClick={onDesign}>開啟工程工作室 ↗</Button></div>{project.engineering?<FacilityMap project={project} onDesign={onDesign}/>:<NetworkDiagram project={project}/>}</section></>;}
export { ServicePanel } from './service-panel';
export function EfficiencyPanel({project,setProject}:{project:Project;setProject:(p:Project)=>void}){const e=project.efficiency;const comparison=compareEfficiency(project);const {sst,pcs}=comparison;const refs=[['SST',98.5,98,98.12],['箱變',99,98.8,97.5],['PCS',98.6,98.3,98],['DD 模組',98.5,98,97.5],['電纜',99.9,99.9,99.9],['充電機（含 DD / 電纜）',98.4,97.9,97.4],['SST 全流程',96.93,95.94,95.57],['PCS 全流程',96.05,95.08,93.07]];return <><div className="two-column"><section className="panel"><div className="panel-heading"><div><p className="eyebrow">EFFICIENCY BOUNDARIES</p><h2>全域預設的路徑比較。</h2></div></div><div className="efficiency-path"><span>10 kV</span><b>SST</b><span>→</span><b>充電機</b><strong>{fmt(sst*100,2)}%</strong></div><div className="efficiency-path secondary"><span>10 kV</span><b>箱變</b><span>→</span><b>PCS</b><span>→</span><b>充電機</b><strong>{fmt(pcs*100,2)}%</strong></div><div className="stats-grid compact two"><Stat label="效率差" value={fmt(comparison.percentagePoints,2)} unit="百分點"/><Stat label="固定交付購電節省" value={fmt(comparison.purchaseSavingPercent,3)} unit="%"/></div><p className="notice">充電機效率已包含 DD 與電纜；不能再乘一次。這是全域預設的摘要比較，不包含個別設備覆寫及實際連線。修改後的購電與損耗請重新測算，並到能量流驗算查看。</p><Table><TableHeader><TableRow><TableHead>來源項目</TableHead><TableHead>峰值</TableHead><TableHead>滿載</TableHead><TableHead>加權</TableHead></TableRow></TableHeader><TableBody>{refs.map(row=><TableRow key={row[0]}>{row.map((v,i)=><TableCell key={i}>{i===0?v:`${Number(v).toFixed(2)}%`}</TableCell>)}</TableRow>)}</TableBody></Table></section><aside className="panel inspector"><h2>全域效率預設</h2><Choice label="計算邊界" value={e.mode} onChange={mode=>setProject({...project,efficiency:{...e,mode:mode as typeof e.mode}})} options={[["SOURCE_CHAIN","來源全流程摘要"],["ASSEMBLY","設備組裝乘積"]]}/>{(e.mode==='SOURCE_CHAIN'?(['sstSource','pcsSource'] as const):(['sst','transformer','pcs','charger'] as const)).map(key=><NumberField key={key} label={({sstSource:'SST 全流程',pcsSource:'PCS 全流程',sst:'SST',transformer:'箱變',pcs:'PCS',charger:'充電機'})[key]} value={e[key]*100} unit="%" min={1} max={100} onChange={value=>setProject({...project,efficiency:{...e,[key]:(value??1)/100}})}/>)}<hr/><h3>交付 10,000 kWh 的靜態換算</h3><p className="metric-line">SST 購電 <strong>{fmt(comparison.sstInputKWh,2)} kWh</strong></p><p className="metric-line">PCS 購電 <strong>{fmt(comparison.pcsInputKWh,2)} kWh</strong></p><p className="tiny muted">僅包含所選效率邊界，另計輔助負載與電池庫存；不能當作完整日電費。</p></aside></div><EquipmentEfficiencyTable project={project} setProject={setProject}/></>;}
export function StationPanel({project,setProject}:{project:Project;setProject:(p:Project)=>void}){const fields=[['batteries','站內電池數','顆'],['capacityKWh','電池額定容量','kWh'],['readySOC','Ready SOC','0–1'],['returnSOC','回收 SOC','0–1'],['bays','換電工位','位'],['swapMinutes','每次換電時間','min'],['guns','充電槍數','支'],['gunKW','單槍上限','kW'],['chargePoolKW','充電共享功率','kW'],['batteryChargeKW','每顆電池補電上限','kW'],['auxiliaryKW','固定輔助負載','kW']] as const;return <div className="two-column">{(['A','B'] as const).map(s=><section className="panel" key={s}><div className="panel-heading"><h2>{s} 服務區 · 營運配置</h2><span className="pill">{project.engineering?'附件 513 kWh 規格':'DEMO ASSUMPTION'}</span></div><div className="form-grid">{fields.map(([key,label,unit])=><NumberField key={key} label={label} unit={unit} value={project.station[s][key]} onChange={value=>{const next={...project,station:{...project.station,[s]:{...project.station[s],[key]:value??0}}};setProject(next.engineering?{...next,topology:engineeringTopology(next)}:next);}}/>)}</div><p className="notice">詳細案例採附件 8 倉、513 kWh、SOC 20–100%、DD 560 kW。每側 1 工位 / 7.5 分鐘為對應 8 次每小時的作業假設。修改此處會同步重建詳細拓撲；換電需求须與 SOC 窗口匹配。</p></section>)}</div>;}
export function FinancePanel({project,setProject,result}:Props){
 const f=project.finance;
 const snapshot=result?.parameterSnapshot??project;
 const projection=result?investmentCase(result.parameterSnapshot,result):null;
 const finance=projection?.projection;
 const reference=breakEven(4500,.3)!;
 const financeDraftChanged=result!==null&&JSON.stringify(f)!==JSON.stringify(snapshot.finance);
 const blockedReason=!result
  ? '尚未測算。可先填入成本，再按上方「執行測算」取得結果。'
  : !projection
  ? '原表重播只提供來源收入。請執行受限模擬，取得實際購電與營運成本結果。'
  : projection.status==='ENDING_INVENTORY_INCOMPLETE'
   ? `期末電池能源較期初少 ${fmt(projection.replenishmentKWh,3)} kWh，已停止投資回報外推。未假設補回庫存的電價或成本；當期現金貢獻不能當作可持續獲利。`
   : projection.status==='AUXILIARY_COST_ATTRIBUTION_MISSING'
    ? '本次結果缺少固定輔助負載的購電成本拆分，無法可靠計算車流爬坡。請重新執行測算。'
    : projection.status==='INCOMPLETE_COST_INPUTS'
     ? '本次測算尚缺 CAPEX 或每日固定成本。填入成本後重新執行，才能建立假設投資試算。'
     : '本次財務參數無法形成有效投資試算，請檢查成本與分析期間。';
 return <>
  <div className="two-column">
   <section className="panel">
    <div className="panel-heading"><div><p className="eyebrow">INVESTMENT CASE</p><h2>先看營運，再看回收。</h2></div><span className="pill">CNY · 假設測算</span></div>
    <p className="panel-note">成本與需求尚未經實地確認。來源 0.30 元服務費並不等於每度淨利；數值對帳通過不能保證真實場站獲利。</p>
    <div className="form-grid">
     <NumberField label="初始投資 CAPEX" unit="CNY" value={f.capex} onChange={capex=>setProject({...project,finance:{...f,capex}})}/>
     <NumberField label="每日固定成本" unit="CNY/day" value={f.fixedDaily} onChange={fixedDaily=>setProject({...project,finance:{...f,fixedDaily}})}/>
     <NumberField label="其他變動成本" unit="CNY/kWh" value={f.variablePerKWh} onChange={v=>setProject({...project,finance:{...f,variablePerKWh:v??0}})}/>
     <NumberField label="年折現率" unit="%" max={100} value={f.discountRate*100} onChange={v=>setProject({...project,finance:{...f,discountRate:(v??0)/100}})}/>
     <NumberField label="分析年期" unit="年" min={1} max={30} step={1} value={f.years} onChange={v=>setProject({...project,finance:{...f,years:v??10}})}/>
     <NumberField label="車流爬坡期" unit="月" max={120} step={1} value={f.rampMonths} onChange={v=>setProject({...project,finance:{...f,rampMonths:v??0}})}/>
     <NumberField label="初期需求比例" unit="%" max={100} value={f.startLoad*100} onChange={v=>setProject({...project,finance:{...f,startLoad:(v??0)/100}})}/>
     <NumberField label="每年營運日數" unit="day" max={366} min={1} value={f.operatingDaysPerYear} onChange={v=>setProject({...project,finance:{...f,operatingDaysPerYear:v??365}})}/>
    </div>
    <Button variant="outline" onClick={()=>setProject({...project,finance:{...f,capex:6000000,fixedDaily:3000,variablePerKWh:.02}})}>載入財務示範值（非報價）</Button>
    {financeDraftChanged&&<p className="notice">成本參數已修改。下方結果仍使用上次測算的成本與需求；請重新執行以更新結果。</p>}
   </section>
   <section className="panel">
    <p className="eyebrow">REFERENCE THRESHOLDS</p><h2>59 次與 60 次，都保留算式。</h2>
    <div className="stats-grid compact two"><Stat label="訪談售電量門檻" value={fmt(reference.energy)} unit="kWh/日"/><Stat label="換電次數換算" value={fmt(reference.swaps)} unit="次/日"/></div>
    <div className="formula-card"><span>能量先增加 60% 再取整</span><strong>{reference.energyFirst} 次／日</strong><code>ceil(15000 × 1.6 ÷ 410)</code></div>
    <div className="formula-card"><span>次數先取整再增加 60%</span><strong>{reference.integerFirst} 次／日</strong><code>ceil(37 × 1.6)</code></div>
    <p className="tiny muted">4500 元／日只是重現訪談門檻的驗證設定，並非已確認成本。真正損益兩平需要完整成本與淨邊際貢獻。</p>
   </section>
  </div>
  {projection&&result&&<>
   <div className="stats-grid">
    <Stat label={`${projection.horizonDays} 日已結算收入`} value={fmt(result.totals.revenue,2)} unit="CNY"/>
    <Stat label={`${projection.horizonDays} 日購電支出`} value={fmt(result.totals.gridCost,2)} unit="CNY"/>
    <Stat label="能源後貢獻" value={fmt(projection.energyContribution,2)} unit="CNY" note="期間收入 − 期間購電支出"/>
    <Stat label="模型營運現金貢獻" value={projection.modeledOperatingContribution===null?'固定成本未填':fmt(projection.modeledOperatingContribution,2)} unit={projection.modeledOperatingContribution===null?'':'CNY'} note={`${projection.horizonDays} 日合計；再扣所填固定與其他變動成本`}/>
   </div>
   <p className="notice">以上為假設交付結算即收款的期間計算（未建應收帳款），未含期初／期末存貨成本調節、稅、折舊及設備替換。能源後貢獻與模型營運現金貢獻都不是會計淨利。</p>
  </>}
  {!finance?<div className="notice">{blockedReason}</div>:<>
   <div className="stats-grid">
    <Stat label="假設投資淨現值 NPV" value={fmt(finance.npv)} unit="CNY"/>
    <Stat label="假設年化 IRR" value={finance.irr===null?'不適用':fmt(finance.irr*100,2)} unit={finance.irr===null?'':'%'} note={finance.irrStatus}/>
    <Stat label="簡單回收期" value={finance.paybackMonths===null?'期內未回收':fmt(finance.paybackMonths/12,2)} unit={finance.paybackMonths===null?'':'年'}/>
    <Stat label="最大累計資金缺口" value={fmt(finance.fundingGap)} unit="CNY"/>
   </div>
   <section className="panel">
    <div className="panel-heading"><h2>假設累計現金流</h2><span className="pill">逐月 · {snapshot.finance.years} 年</span></div>
    <div className="chart"><ResponsiveContainer width="100%" height="100%" initialDimension={{width:800,height:245}}><AreaChart data={finance.rows}><CartesianGrid vertical={false} strokeDasharray="3 5"/><XAxis dataKey="month" tick={chartStyle}/><YAxis tick={chartStyle} width={70} tickFormatter={v=>`${fmt(Number(v)/10000)}萬`}/><Tooltip formatter={(v:unknown)=>[`${fmt(Number(v))} CNY`,'累計現金流']}/><Area type="monotone" dataKey="cumulative" stroke="#087f70" fill="#d4e9df" strokeWidth={2}/></AreaChart></ResponsiveContainer></div>
    <p className="notice">先將 {snapshot.horizonDays} 日實際測算除以日數，建立每日平均，再按每年營運日數外推。車流爬坡只縮放收入、服務用電與其他變動成本；固定輔助用電及每日固定成本按營運天數照計。這是代表日假設模型，未包含完整年度調度、存貨成本、稅及替換資產。</p>
   </section>
  </>}
 </>;
}

export function ResultsPanel({result}:{result:RunResult}) {
 const physical=result.mode==='CONSTRAINED';const [selectedDay,setDay]=useState('0');const day=Math.min(Number(selectedDay),result.parameterSnapshot.horizonDays-1);
 const nodes=new Map(result.parameterSnapshot.topology.nodes.map(n=>[n.id,n.name]));
 return <section className="panel"><div className="panel-heading"><div><p className="eyebrow">CANONICAL RUN RESULT</p><h2>逐時結果與工程帳</h2></div><span className="pill">Engine {result.engineVersion} · {result.parameterSnapshot.horizonDays} 日</span><Choice label="檢視日期" value={String(day)} onChange={setDay} options={Array.from({length:result.parameterSnapshot.horizonDays},(_,d)=>[String(d),`第 ${d+1} 天`])}/></div>
 <div className="stats-grid compact"><Stat label="全期電網購入" value={physical?fmt(result.totals.gridKWh):'—'} unit="kWh"/><Stat label="全期路徑損耗" value={physical?fmt(result.totals.lossKWh):'—'} unit="kWh"/><Stat label="全期購電支出" value={physical?fmt(result.totals.gridCost,2):'—'} unit="CNY"/><Stat label="期末電池能源" value={physical?fmt(result.totals.finalStoredKWh):'—'} unit="kWh"/></div><DailyChart result={result}/>
 <p className="panel-note">上圖與 KPI 為整段連續期間；下表為第 {day+1} 天。服務區購入量按用電者歸屬，實際進線量請查看來源電表。每筆到站單價鎖定，電費按來源電表／小時結算至分。</p>
 <div className="table-scroll"><Table><TableHeader><TableRow>{['站','時','需求 kWh','交付 kWh','換 / 充次','歸屬購入 kWh','損耗 kWh','收入 CNY','電費 CNY','Ready','排隊','守恆殘差'].map(v=><TableHead key={v}>{v}</TableHead>)}</TableRow></TableHeader><TableBody>{result.hours.filter(h=>h.day===day).sort((a,b)=>a.hour-b.hour||a.station.localeCompare(b.station)).map(h=><TableRow key={`${h.day}-${h.station}-${h.hour}`}><TableCell><span className={`station-tag ${h.station==='B'?'b':''}`}>{h.station}</span></TableCell><TableCell className="mono">{h.hour}:00</TableCell><TableCell>{fmt(h.requestedKWh)}</TableCell><TableCell>{fmt(h.deliveredKWh,3)}</TableCell><TableCell>{h.swapCount} / {h.chargeCount}</TableCell><TableCell>{physical?fmt(h.gridKWh,3):'—'}</TableCell><TableCell>{physical?fmt(h.lossKWh,3):'—'}</TableCell><TableCell>{fmt(h.revenue,2)}</TableCell><TableCell>{physical?fmt(h.gridCost,2):'—'}</TableCell><TableCell>{physical?h.ready:'—'}</TableCell><TableCell>{physical?h.queue:'—'}</TableCell><TableCell>{physical?h.balanceResidual.toExponential(1):'—'}</TableCell></TableRow>)}</TableBody></Table></div>
 {physical&&<><h3 className="mt-6">實際來源電表 · 第 {day+1} 天</h3><div className="table-scroll"><Table><TableHeader><TableRow>{['來源','時','進線 kWh','尖峰 kW','購價 CNY/kWh','結算 CNY'].map(v=><TableHead key={v}>{v}</TableHead>)}</TableRow></TableHeader><TableBody>{result.sourceMeters.filter(m=>m.day===day).map(m=><TableRow key={`${m.sourceId}-${m.hour}`}><TableCell>{m.sourceId}</TableCell><TableCell>{m.hour}:00</TableCell><TableCell>{fmt(m.importKWh,6)}</TableCell><TableCell>{fmt(m.peakKW,3)}</TableCell><TableCell>{fmt(m.unitPrice,6)}</TableCell><TableCell>{fmt(m.cost,2)}</TableCell></TableRow>)}</TableBody></Table></div>
 <h3 className="mt-6">逐元件能源帳 · 第 {day+1} 天</h3><p className="panel-note">元件輸入 = 輸出 + 損耗；輸出 = 下游連線電量 + 終端消耗。中間元件電量不能跨層相加作為總購電。</p><div className="table-scroll"><Table><TableHeader><TableRow>{['元件','時','輸入 kWh','輸出 kWh','損耗 kWh','終端 kWh','峰值 / 容量 kW','最大殘差 kWh'].map(v=><TableHead key={v}>{v}</TableHead>)}</TableRow></TableHeader><TableBody>{result.componentEnergy.filter(n=>n.day===day).map(n=><TableRow key={`${n.nodeId}-${n.hour}`}><TableCell>{nodes.get(n.nodeId)}<br/><small className="mono">{n.nodeId}</small></TableCell><TableCell>{n.hour}:00</TableCell><TableCell>{fmt(n.inputKWh,6)}</TableCell><TableCell>{fmt(n.outputKWh,6)}</TableCell><TableCell>{fmt(n.lossKWh,6)}</TableCell><TableCell>{fmt(n.terminalKWh,6)}</TableCell><TableCell>{fmt(n.peakOutputKW,2)} / {fmt(n.capacityKW,2)}</TableCell><TableCell>{n.maxBalanceResidual.toExponential(2)}</TableCell></TableRow>)}</TableBody></Table></div><p className="tiny muted">完整連線帳、交易時間與元件帳可從上方匯出 XLSX。零流量元件省略列示。</p></>}
 </section>;
}
export function DeveloperPanel({result}:{result:RunResult|null}){return <div className="two-column"><section className="panel"><p className="eyebrow">PLUGIN REGISTRY</p><h2>讓模型可以繼續成長。</h2><Table><TableHeader><TableRow><TableHead>Type</TableHead><TableHead>設備</TableHead><TableHead>參數數</TableHead></TableRow></TableHeader><TableBody>{equipmentRegistry.list().map(p=><TableRow key={p.type}><TableCell className="mono">{p.type}</TableCell><TableCell>{p.label}</TableCell><TableCell>{p.parameters.length}</TableCell></TableRow>)}</TableBody></Table><p className="panel-note">時鐘、事件、亂數與 Registry 放在 sim-kernel。設備、電力、站務與財務公式獨立於畫面。</p></section><section className="panel"><p className="eyebrow">SCOPE & VALIDATION</p><h2>模型範圍</h2><ul className="scope-list"><li>1–31 日連續模擬，分鐘內按到站、充滿、完工及停復電切分事件。</li><li>有向無環供電路徑、共享容量、逐元件守恆與來源电表銷帳。</li><li>換電電池庫存、工位排隊、充電共享功率。</li><li>Immediate / TOU 補電策略與固定種子到達。</li><li>月度爬坡財務試算與 JSON / 本系統 XLSX 交換。</li></ul><p className="notice">尚未支援完整雙母線並聯控制、保護暫態、3D 車流、PV/ESS 調度、MPC/RL、完整替換資產模型與通用 Excel 編輯後重播。完整需求保留於 repo。</p>{result?.diagnostics.map((d,i)=><p className={`diagnostic ${d.severity}`} key={i}><code>{d.code}</code><span>{d.message}</span></p>)}<a className="repo-link" href="https://github.com/pcpcchen-coder/HighwaySwapStationSim/tree/main/docs" target="_blank" rel="noreferrer">開啟工程文件 ↗</a></section></div>;}
