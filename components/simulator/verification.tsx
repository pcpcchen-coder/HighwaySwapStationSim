"use client";
import { Button } from '../ui/button';
import { Table, TableHeader, TableHead, TableBody, TableCell, TableRow } from '../ui/table';
import { Stat, fmt } from './controls';
import { verificationCases } from '../../packages/verification/cases.ts';
import expected from '../../data/verification/expected-summary.json';
import evidence from '../../data/verification/release-summary.json';
import type { Project, RunResult } from '../../packages/contracts/index.ts';

const cases=verificationCases();
const metrics=[['交付電量','deliveredKWh','deliveredKWh','kWh'],['電網購入','gridKWh','gridKWh','kWh'],['路徑損耗','lossKWh','lossKWh','kWh'],['結算收入','revenueSettled','revenue','CNY'],['結算購電費','gridCostSettled','gridCost','CNY'],['期末庫存','finalStoredKWh','finalStoredKWh','kWh']] as const;
export function VerificationPanel({result,busy,onRun}:{result:RunResult;busy:boolean;onRun:(project:Project)=>void}) {
 const selected=cases.find(c=>JSON.stringify(c.project)===JSON.stringify(result.parameterSnapshot));
 const benchmark=expected.cases.find(c=>c.id===selected?.id);
 return <>
  <section className="panel"><div className="panel-heading"><div><p className="eyebrow">INDEPENDENT VERIFICATION / ENGINE 0.4.1</p><h2>三個案例，從元件一路對到結算。</h2></div><a href="/reports/HighwaySwapSim_Verification.pptx" download><Button variant="outline">下載 0.3.0 封存簡報 ↗</Button></a></div>
   <p className="panel-note">獨立 Python Decimal 70 位精度解析計算，與正式 TypeScript 引擎比較。此頁的驗證案例採受控參數，完整 513 kWh 設備範例另見上方案例選擇。數值一致只適用已測輸入與明定規則，實際獲利還需要實測電量、合約電價及完整成本校準。</p>
   <div className="stats-grid"><Stat label="已封存驗證案例" value="3" unit="例" note="3 日 / 4 日 / 5 日，共 288 小時"/><Stat label="獨立比對通過" value={fmt(evidence.passed)} unit="項" note={`${evidence.failed} 項失敗；詳見封存報告`}/><Stat label="能量允許絕對差" value="0.000001" unit="kWh"/><Stat label="結算金額允許差" value="0" unit="分" note="測試政策：電表小時結算、每筆交易累計四捨五入"/></div>
   <div className="table-scroll"><Table><TableHeader><TableRow>{['驗證案例','情境','預期購入 kWh','預期收入 CNY','預期電費 CNY','執行'].map(v=><TableHead key={v}>{v}</TableHead>)}</TableRow></TableHeader><TableBody>{cases.map((c,i)=><TableRow key={c.id}><TableCell>{c.name}</TableCell><TableCell>{['每日換電，SST 補回庫存','PCS 超充，持續交流輔助負載','停電 48 小時，跨區供電及排隊恢復'][i]}</TableCell><TableCell>{fmt(Number(expected.cases[i].totals.gridKWh),6)}</TableCell><TableCell>{fmt(Number(expected.cases[i].totals.revenueSettled),2)}</TableCell><TableCell>{fmt(Number(expected.cases[i].totals.gridCostSettled),2)}</TableCell><TableCell><Button disabled={busy} variant="outline" size="sm" onClick={()=>onRun(structuredClone(c.project))}>載入並測算</Button></TableCell></TableRow>)}</TableBody></Table></div>
   <p className="notice">V03 期末庫存缺口 112.5 kWh 是預期結果，系統應停止投資回報外推。三例收入減電費分別為 157.74、−889.44、389.41 CNY，均不代表會計淨利。</p>
  </section>
  <section className="panel mt-6"><div className="panel-heading"><div><p className="eyebrow">LIVE WORKER COMPARISON</p><h2>{selected?`${selected.name} · 本次結果`:'載入案例，核對本次執行結果。'}</h2></div></div>
   {benchmark?<><Table><TableHeader><TableRow><TableHead>指標</TableHead><TableHead>獨立預期</TableHead><TableHead>系統產出</TableHead><TableHead>絕對差</TableHead><TableHead>判定</TableHead></TableRow></TableHeader><TableBody>{metrics.map(([label,ek,ak,unit])=>{const e=Number(benchmark.totals[ek]),a=result.totals[ak],delta=Math.abs(a-e),pass=unit==='CNY'?Math.round(a*100)===Math.round(e*100):delta<=1e-6;return <TableRow key={ak}><TableCell>{label} · {unit}</TableCell><TableCell>{fmt(e,unit==='CNY'?2:6)}</TableCell><TableCell>{fmt(a,unit==='CNY'?2:6)}</TableCell><TableCell>{unit==='CNY'?`${Math.abs(Math.round(a*100)-Math.round(e*100))} 分`:delta.toExponential(3)}</TableCell><TableCell>{pass?'通過':'不符'}</TableCell></TableRow>;})}</TableBody></Table><p className="panel-note">此處即時比對六項總計。封存驗證另含逐時／逐日、節點／連線、來源電表、庫存、排隊及交易時間，並設容量與守恆的停止條件。修改任一參數後須重新執行；修改後的案例不繼承原驗證結論。</p></>:<p className="empty-state">尚無與三個固定驗證輸入完全相同的結果快照。請按上方「載入並測算」。</p>}
  </section>
  <section className="panel mt-6"><h2>可報告的結論與下一個驗收門檻</h2><p className="panel-note">「在版本 0.4.1、明列測試輸入與結算規則下，三個多日案例已通過獨立解析比對；能量絕對差不超過 10⁻⁶ kWh，結算金額逐分一致。」</p><p className="panel-note">投入投資決策前，應以同步來源電表、各轉換器輸出、電池 SOC、逐筆服務及帳單，完成獨立留出期間的實測驗證，再納入 CAPEX、需量費、維護、換電池、稅與需求不確定性。量測誤差與接受門檻需先約定，不能把解析測試容差當成真實場站的保證。</p><a href="https://github.com/pcpcchen-coder/HighwaySwapStationSim/blob/main/docs/VERIFICATION.md" target="_blank" rel="noreferrer">完整驗證紀錄、首次不符及修正紀錄 ↗</a></section>
 </>;
}
