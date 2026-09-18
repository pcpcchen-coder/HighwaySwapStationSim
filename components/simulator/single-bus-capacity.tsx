"use client";
import type {Project} from '../../packages/contracts/index.ts';
import {singleBusCapacity} from '../../packages/engineering/single-bus-capacity.ts';
import {EquipmentEfficiencyTable} from './equipment-settings';
import {SocRangeEditor} from './soc-settings';
import {NumberField,Stat,fmt} from './controls';
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from '../ui/table';

export function SingleBusCapacityPanel({project,setProject,efficiencyOnly=false}:{project:Project;setProject:(p:Project)=>void;efficiencyOnly?:boolean}){
 const summary=singleBusCapacity(project);
 return <>
  <section className="panel"><div className="panel-heading"><div><p className="eyebrow">SINGLE DC BUS / PHASE 1</p><h2>{efficiencyOnly?'AC/DC 與 DC/DC 效率邊界':'第一期設備與共享容量'}</h2></div><span className="pill">十年維持目前設備</span></div>
   <div className="stats-grid compact"><Stat label="兩側 SST 額定輸出" value={fmt(summary.sstKW)} unit="kW"/><Stat label="AC/DC 充電機輸出合計" value={fmt(summary.acOutputKW)} unit="kW"/><Stat label="DC/DC 充電機輸出合計" value={fmt(summary.dcOutputKW)} unit="kW"/><Stat label="兩側外接充電槍" value={fmt(summary.gunCount)} unit="槍"/></div>
   <p className="panel-note">A 區 10 kV 供兩側 SST；兩側箱變分別供本側 AC/DC 與站用負載。公共 DC 母線可雙向支援，供電能力不重複計算。AC、DC 各組回充／外槍互斥，外槍優先。</p>
   <div className="table-scroll"><Table><TableHeader><TableRow>{['服務區','SST','AC/DC','DC/DC','電池倉','雙槍終端／槍','AC/DC整機有效效率','箱變→AC/DC 效率'].map(h=><TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader><TableBody>{summary.sites.map(s=><TableRow key={s.station}><TableCell>{s.station}</TableCell><TableCell>{s.sstCount} 台／{fmt(s.sstKW)} kW</TableCell><TableCell>{s.acCount} 台／{fmt(s.acOutputKW)} kW</TableCell><TableCell>{s.dcCount} 台／{fmt(s.dcOutputKW)} kW</TableCell><TableCell>{s.rackCount}</TableCell><TableCell>{s.terminalCount}／{s.gunCount}</TableCell><TableCell>{s.acdcEfficiency===null?'—':`${fmt(s.acdcEfficiency*100,4)}%`}</TableCell><TableCell>{s.acPathEfficiency===null?'—':`${fmt(s.acPathEfficiency*100,4)}%`}</TableCell></TableRow>)}</TableBody></Table></div>
   <p className="plan-note">效率摘要按啟用設備額定輸出加權，不含站用負載、電池內部效率與另行啟用的線損／曲線模型。單槍預設額定480 kW，受600 A × 637.56 V限制，實際上限382.536 kW；各槍共同受充電機與上游供電限制。單台差異及實際負載分配以重新測算後的元件帳為準。</p>
  </section>
  {!efficiencyOnly&&<><div className="two-column">{summary.sites.map(s=><section className="panel" key={s.station}><h2>{s.station} 區箱變滿載檢核</h2><div className="capacity-flow"><p>箱變可用輸出（kVA × PF × 效率）<strong>{fmt(s.transformerOutputKW,2)} kW</strong></p><p>AC/DC 全部滿載所需輸入<strong>{fmt(s.acInputKW,2)} kW</strong></p><p>其他負載額定合計<strong>{fmt(s.auxNameplateKW,2)} kW</strong></p><p>{s.fullLoadMarginKW<0?'滿載缺口':'滿載餘量'}<strong>{fmt(Math.abs(s.fullLoadMarginKW),2)} kW</strong></p></div><p className="notice">這是額定同時滿載的容量檢核；逐時實際用電採「完整模型設定」的負載排程。不得將外槍額定再加到其共用充電機功率池。</p></section>)}</div><section className="panel"><h2>換電 SOC 設定</h2><div className="two-column">{(['A','B'] as const).map(station=><SocRangeEditor key={station} project={project} station={station} setProject={setProject}/>)}</div></section></>}
  {efficiencyOnly&&<section className="panel"><h2>全域效率預設</h2><div className="form-grid">{(['sst','transformer','charger'] as const).map(key=><NumberField key={key} label={{sst:'SST',transformer:'箱變',charger:'DC/DC 充電機'}[key]} value={project.efficiency[key]*100} unit="%" min={.1} max={100} onChange={v=>{if(v!==null&&v>0&&v<=100)setProject({...project,efficiency:{...project.efficiency,[key]:v/100}});}}/>)}</div><p className="panel-note">AC/DC 整機預設 95.35%，在下表逐台調整。AC 路徑只串乘箱變與 AC/DC；DC 路徑使用 SST 與 DC/DC。個別覆寫優先於全域預設。</p></section>}
  <EquipmentEfficiencyTable project={project} setProject={setProject}/>
 </>;
}
