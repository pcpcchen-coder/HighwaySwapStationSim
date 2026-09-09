"use client";
import './detailed-finance.css';

/** Intended location: components/simulator/detailed-finance-panel.tsx.
 * Only the immutable successful result is accepted; no editable Project prop. */
import { useMemo, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Choice, Stat, fmt } from './controls';
import type { RunResult } from '../../packages/contracts/index.ts';
import type { FinanceIssue } from '../../packages/extended-finance/contracts.ts';
import { evaluateExtendedFinance } from '../../packages/extended-finance/index.ts';
import { lifecycleInvestmentMetrics } from '../../packages/extended-finance/projection-metrics.ts';

const money = (value: number | null | undefined) => value === null || value === undefined ? '尚未確認' : fmt(value, 2);
const number = (value: number | null | undefined, digits = 3) => value === null || value === undefined ? '尚未確認' : fmt(value, digits);
const percent = (value: number | null | undefined) => value === null || value === undefined ? '尚未確認' : `${fmt(value * 100, 2)}%`;
const ownership = { OWNED: '自有', LEASED: '租用', THIRD_PARTY: '第三方所有' } as const;
const costBasis = { CALENDAR_MONTH: 'CNY／曆月', OPERATING_DAY: 'CNY／營運日', DELIVERED_KWH: 'CNY／交付 kWh', REVENUE_RATIO: '收入比例' } as const;
const modeName = { NONE: '無基本費', CAPACITY_KVA: '契約容量 kVA', MAX_15MIN_KW: '最大 15 分鐘需量 kW' } as const;
const monthText = (value: number | null, zero: string) => value === null ? '尚未確認' : value === 0 ? zero : `第 ${value} 月`;

function Issues({ title, issues }: { title: string; issues: FinanceIssue[] }) {
  if (!issues.length) return null;
  return <details className="finance-details" open>
    <summary>{title} · {issues.length} 項待處理</summary>
    <p className="panel-note">可於「完整模型設定」填寫或匯入，再重新測算。空值表示未知；已確認沒有的成本請填 0。</p>
    <div className="finance-issues" role="status" tabIndex={0} aria-label={title}>{issues.map((issue, i) => <p className="diagnostic" key={`${issue.path}-${issue.code}-${i}`}>
      <strong>{issue.message}</strong><code>{issue.path} · {issue.code}</code>
    </p>)}</div>
  </details>;
}
function Heads({ cells }: { cells: string[] }) { return <TableHeader><TableRow>{cells.map(cell => <TableHead key={cell}>{cell}</TableHead>)}</TableRow></TableHeader>; }

export function DetailedFinancePanel({ result }: { result: RunResult | null }) {
  const [meterDay, setMeterDay] = useState('0');
  const evaluated = useMemo(() => {
    const config = result?.parameterSnapshot.detailed?.finance;
    if (!result || !config || !result.detailedResult) return null;
    try {
      const value = evaluateExtendedFinance(result, config, result.detailedResult.inventory);
      return { value, metrics: lifecycleInvestmentMetrics(value.projection.flows, config.investment.annualDiscountRate), error: null };
    } catch (error) { return { value: null, metrics: null, error: error instanceof Error ? error.message : '財務資料驗證失敗' }; }
  }, [result]);
  if (!result) return <section className="panel"><h2>完整財務驗算</h2><p className="notice" role="status">尚未測算。先完成完整模型設定與財務輸入，再執行測算；結果使用同一次成功測算的參數快照。</p></section>;
  const config = result.parameterSnapshot.detailed?.finance;
  if (!config || !result.detailedResult) return <section className="panel"><h2>完整財務驗算</h2><p className="notice" role="status">此結果沒有完整模型的財務與存貨明細。請執行完整模型後再查看。</p></section>;
  if (!evaluated || evaluated.error || !evaluated.value || !evaluated.metrics) return <section className="panel"><h2>完整財務驗算</h2><p className="notice error" role="alert">本次財務帳未通過資料驗證，已停止財務結論。{evaluated?.error}</p><p className="panel-note">請保留本次結果，依錯誤檢查來源電表、存貨流量及成本設定；不要將缺項改成零以略過檢查。</p></section>;
  const { billing, inventory, observed, projection } = evaluated.value, metrics = evaluated.metrics;
  const day = Math.min(Math.max(0, Number(meterDay)), result.parameterSnapshot.horizonDays - 1);
  const date = config.calendar.startDate ?? '起始日期尚未填寫';
  const cashContribution = observed.cashOperatingContributionBeforeTaxCapexAndCollections;
  const accrualContribution = observed.inventoryAdjustedOperatingResultBeforeTaxAndDisposals;
  const investmentReady = projection.status === 'ASSUMPTION_BASED_PROJECTION';
  const irrStatus = metrics.irrStatus === 'multiple-sign-changes' ? '現金流多次變號，不能判定唯一 IRR'
    : metrics.irrStatus === 'no-root' ? '無可確認的 IRR' : metrics.irrStatus === 'incomplete' ? '分月假設尚未齊備' : '依完整月現金流年化';

  return <div className="detailed-finance">
    <section className="panel">
      <div className="panel-heading"><div><p className="eyebrow">DETAILED FINANCIAL AUDIT</p><h2>先核對帳，再判讀獲利。</h2></div><span className="pill">CNY · {result.parameterSnapshot.horizonDays} 日快照</span></div>
      <p className="panel-note">{result.parameterSnapshot.name} · {date} · Engine {result.engineVersion}。本頁使用最後成功測算的供電、服務與成本設定。修改設計或匯入新設定後，請重新測算再匯出 XLSX。</p>
      <div className="stats-grid compact">
        <Stat label="期間已結算收入" value={money(result.totals.revenue)} unit="CNY" />
        <Stat label="來源逐時購電費" value={money(billing.energyCost)} unit="CNY" note="含供電損失所需購電；不再另扣損耗費" />
        <Stat label={billing.estimated ? '期間電費合計 · 分攤估算' : '期間電費合計'} value={money(billing.total)} unit={billing.total === null ? '' : 'CNY'} note="能源費、基本費、超約及 PF 調整" />
        <Stat label="收入減購電費" value={money(observed.energyContribution)} unit="CNY" note="尚未扣其他成本，不是淨利" />
      </div>
      <div className="stats-grid compact two">
        <Stat label="稅前營運現金貢獻" value={money(cashContribution)} unit={cashContribution === null ? '' : 'CNY'} note="未含資產投資、處置與應收款收現時差" />
        <Stat label="存貨調整後稅前營運結果" value={money(accrualContribution)} unit={accrualContribution === null ? '' : 'CNY'} note="含所填 OPEX、租金及折舊；尚未含稅與處置損益" />
      </div>
      <p className="notice">短期觀測與長期假設分開呈現。完整月度資料未齊時，不以幾日結果推定月最大需量或稅後淨利；下方每一個「尚未確認」都保留為未知。</p>
      <Issues title="電表契約與計費資料" issues={billing.issues} />
      <Issues title="存貨成本資料" issues={inventory.issues} />
      <Issues title="期間設備與營運成本" issues={observed.issues} />
    </section>

    <section className="panel">
      <div className="panel-heading"><div><p className="eyebrow">SOURCE METER BILLING</p><h2>每張電表，逐月核對。</h2></div><span className="pill">15 分鐘固定區段</span></div>
      <p className="panel-note">需量由實際來源電表逐事件功率積分取得。容量基本費與需量基本費按各電表契約選擇；跨站供電仍由原來源電表計價。</p>
      {billing.estimated && <p className="notice" role="status">目前採「觀測期間分攤估算」。基本／超約費依觀測日數除以真實曆月天數分攤；觀測最大需量不是已確認的全月最大需量。</p>}
      <div className="table-scroll"><Table><Heads cells={['來源／月份', '計費方式', '觀測／曆月日數', '購入 kWh', '能源費 CNY', '觀測最大 15 分鐘 kW', '基本費 CNY', '超約 CNY', 'PF 調整 CNY', '合計 CNY', '狀態']} /><TableBody>
        {billing.rows.map(row => { const meter = config.meters.find(m => m.sourceId === row.sourceId); return <TableRow key={`${row.sourceId}-${row.month}`}>
          <TableCell><strong>{row.sourceId}</strong><br />{row.month}</TableCell>
          <TableCell>{meter?.basicMode ? modeName[meter.basicMode] : '尚未確認'}</TableCell>
          <TableCell>{row.coveredDays}／{row.calendarDays}</TableCell><TableCell>{number(row.importKWh, 6)}</TableCell><TableCell>{money(row.energyCost)}</TableCell>
          <TableCell>{number(row.observedMaximum15minKW)}<br /><small>{row.trueMonthlyMaximumKnown ? '完整月已覆蓋' : '全月峰值尚未確認'}</small></TableCell>
          <TableCell>{money(row.basicCharge)}</TableCell><TableCell>{money(row.excessDemandCharge)}</TableCell><TableCell>{money(row.pfAdjustment)}</TableCell><TableCell>{money(row.total)}</TableCell>
          <TableCell>{row.status === 'COMPLETE_MONTH' ? '完整計費月' : row.status === 'PRORATED_OBSERVED_ESTIMATE' ? '分攤估算' : '資料不足'}</TableCell>
        </TableRow>; })}
      </TableBody></Table></div>
      {!billing.rows.length && <p className="panel-note">填妥起始日期、固定時區與電表契約後重新測算，才能建立曆月帳單。</p>}
      <details className="finance-details"><summary>檢視實際來源逐時購電帳</summary>
        <div className="section-tools"><Choice label="觀測日期" value={String(day)} onChange={setMeterDay} options={Array.from({ length: result.parameterSnapshot.horizonDays }, (_, d) => [String(d), `第 ${d + 1} 天`])} /></div>
        <div className="table-scroll"><Table><Heads cells={['實際來源', '小時', '購入 kWh', '單價 CNY/kWh', '已結算 CNY']} /><TableBody>{result.sourceMeters.filter(m => m.day === day).map(m => <TableRow key={`${m.sourceId}-${m.day}-${m.hour}`}>
          <TableCell>{m.sourceId}</TableCell><TableCell>{m.hour}:00</TableCell><TableCell>{number(m.importKWh, 6)}</TableCell><TableCell>{number(m.unitPrice, 6)}</TableCell><TableCell>{money(m.cost)}</TableCell>
        </TableRow>)}</TableBody></Table></div>
        <p className="panel-note">逐筆來源電表／小時先結算到分，再加總。不可改成整日 kWh 乘平均電價，否則可能產生分幣差異。</p>
      </details>
    </section>

    <section className="panel">
      <div className="panel-heading"><div><p className="eyebrow">INVENTORY COST RECONCILIATION</p><h2>存貨移轉，合併時只計一次。</h2></div><span className="pill">周期加權成本</span></div>
      <p className="panel-note">ESS 轉入重卡電池等內部流動保留在個別池成本，合併全站時同時消除轉入成本與對應出庫成本。成本包含已購電支出的損失，不再另扣一次。</p>
      <div className="stats-grid compact">
        <Stat label="各池完整入庫成本" value={money(inventory.fullInflowPurchaseCost)} unit="CNY" />
        <Stat label="消除內部轉撥" value={money(inventory.internalTransferCost)} unit="CNY" />
        <Stat label="對外入庫購電成本" value={money(inventory.externalInflowPurchaseCost)} unit="CNY" />
        <Stat label="存貨調整後能源費用" value={money(inventory.energyExpense)} unit={inventory.energyExpense === null ? '' : 'CNY'} />
      </div>
      <div className="table-scroll"><Table><Heads cells={['存貨池', '期初 kWh／價值', '入庫 kWh／完整成本', '含內部轉入 CNY', '出庫 kWh／加權成本', '期末 kWh／價值', '加權 CNY/kWh']} /><TableBody>
        {result.detailedResult.inventory.map(flow => { const row = inventory.rows.find(r => r.poolId === flow.poolId); return <TableRow key={flow.poolId}>
          <TableCell>{flow.poolId}</TableCell><TableCell>{number(flow.openingKWh)}／{money(row?.openingValue)}</TableCell>
          <TableCell>{number(flow.inflowKWh)}／{money(flow.inflowPurchaseCost)}</TableCell><TableCell>{money(flow.internalTransferCost ?? 0)}</TableCell>
          <TableCell>{number(flow.issuedKWh)}／{money(row?.costOfIssues)}</TableCell><TableCell>{number(flow.closingKWh)}／{money(row?.closingValue)}</TableCell><TableCell>{number(row?.unitCost, 6)}</TableCell>
        </TableRow>; })}
      </TableBody></Table></div>
      <div className="formula-card"><span>全站調節</span><strong>殘差 {number(inventory.reconciliationResidual, 9)} CNY</strong><code>外部購電＋其他轉換成本＋期初存貨價值−期末存貨價值＝能源費用</code></div>
      {inventory.issues.length > 0 && <p className="notice">有存貨成本未填，畫面仍列出實際流量；加權單價、期末價值與會計能源費用保持未知。</p>}
    </section>

    <section className="panel">
      <div className="panel-heading"><div><p className="eyebrow">ASSET AND COST SNAPSHOT</p><h2>本次採用的設備與成本清單。</h2></div><span className="pill">{config.assets.length} 筆資產／{config.opex.length} 筆 OPEX</span></div>
      <p className="panel-note">所有權、單價、分期購入、租用與替換時點都讀取本次快照。第 0 月購入代表營運前投資；處置「持有至期末」不代表期末自動出售或回收殘值。</p>
      <details className="finance-details" open><summary>設備 BOM、電池所有權與分期資產</summary><div className="table-scroll"><Table><Heads cells={['資產／設備 ID', '所有權', '數量', '購入單價 CNY', '購入月份', '折舊月數', '殘值單價 CNY', '處置月份', '處置單價 CNY', '租金 CNY/顆/月']} /><TableBody>
        {config.assets.map(asset => <TableRow key={asset.id}>
          <TableCell>{asset.name}<br /><small className="mono">{asset.id}／{asset.equipmentId ?? '非節點成本'}</small></TableCell>
          <TableCell>{asset.ownership === null ? '尚未確認' : ownership[asset.ownership]}</TableCell><TableCell>{number(asset.quantity, 0)}</TableCell>
          <TableCell>{asset.ownership === 'THIRD_PARTY' || asset.ownership === 'LEASED' ? '不列站方購入' : money(asset.unitPurchaseCost)}</TableCell>
          <TableCell>{monthText(asset.purchaseMonth, '營運前')}</TableCell><TableCell>{asset.ownership === null ? '尚未確認' : asset.ownership === 'OWNED' ? number(asset.depreciationMonths, 0) : '不列站方折舊'}</TableCell>
          <TableCell>{asset.ownership === null ? '尚未確認' : asset.ownership === 'OWNED' ? money(asset.residualUnitValue) : '不適用'}</TableCell><TableCell>{monthText(asset.disposalMonth, '持有至期末')}</TableCell>
          <TableCell>{asset.disposalMonth === 0 ? '無排定處置' : money(asset.disposalUnitProceeds)}</TableCell><TableCell>{asset.ownership === null ? '尚未確認' : asset.ownership === 'LEASED' ? money(asset.monthlyLeasePerUnit) : '不適用'}</TableCell>
        </TableRow>)}
      </TableBody></Table></div></details>
      <details className="finance-details"><summary>租金、人力、維修、保險與其他營運成本</summary><div className="table-scroll"><Table><Heads cells={['項目', '費率', '基準', '開始／結束', '年調整率', '期間採計 CNY']} /><TableBody>
        {config.opex.map(cost => <TableRow key={cost.id}><TableCell>{cost.name}<br /><small className="mono">{cost.id}</small></TableCell>
          <TableCell>{cost.basis === 'REVENUE_RATIO' ? percent(cost.rate) : money(cost.rate)}</TableCell><TableCell>{costBasis[cost.basis]}</TableCell>
          <TableCell>{monthText(cost.startMonth, '營運前')}／{monthText(cost.endMonth, '持續')}</TableCell><TableCell>{percent(cost.escalationAnnual)}</TableCell>
          <TableCell>{money(observed.costRows.find(row => row.category === 'OPEX' && row.id === cost.id)?.amount)}</TableCell></TableRow>)}
      </TableBody></Table></div></details>
    </section>

    <section className="panel">
      <div className="panel-heading"><div><p className="eyebrow">MONTHLY INVESTMENT ASSUMPTIONS</p><h2>分月稅、資金與回收。</h2></div><span className="pill">{config.investment.horizonMonths === null ? '期間待填' : `${config.investment.horizonMonths} 個月`} · 假設測算</span></div>
      <p className="panel-note">長期表使用另行填寫並確認的每月營運假設，包含各月能源現金支出、存貨調整後費用與基本費；不自動外推上方短期觀測。稅制、租賃與殘值為所選模型假設。</p>
      <div className="two-column">
        <div><h3>稅與折舊</h3><p className="metric-line"><span>所得稅模型</span><strong>{config.tax.model === null ? '尚未確認' : config.tax.model === 'MONTHLY_NO_LOSS_RELIEF' ? '每月正利潤課稅' : '曆年合併／虧損結轉'}</strong></p>
          <p className="metric-line"><span>所得稅率</span><strong>{percent(config.tax.incomeTaxRate)}</strong></p><p className="metric-line"><span>收入比例稅</span><strong>{percent(config.tax.revenueLevyRate)}</strong></p>
          <p className="metric-line"><span>其他稅 CNY/月</span><strong>{money(config.tax.otherTaxPerMonth)}</strong></p><p className="metric-line"><span>期初可抵虧損 CNY</span><strong>{money(config.tax.openingTaxLossCarryForward)}</strong></p>
        </div>
        <div><h3>應收款與週轉金</h3><p className="metric-line"><span>收款延後天數</span><strong>{number(config.workingCapital.receivableDays, 1)}</strong></p>
          <p className="metric-line"><span>期初應收款 CNY</span><strong>{money(config.workingCapital.openingReceivables)}</strong></p><p className="metric-line"><span>期初能源存貨投入 CNY</span><strong>{money(config.workingCapital.openingEnergyInventoryFunding)}</strong></p>
          <p className="metric-line"><span>期初／目標準備金 CNY</span><strong>{money(config.workingCapital.openingOperatingReserve)}／{money(config.workingCapital.targetOperatingReserve)}</strong></p>
          <p className="metric-line"><span>期末釋放準備金</span><strong>{config.workingCapital.releaseAtHorizon ? '是；不提前收回应收' : '否'}</strong></p>
        </div>
      </div>
      <Issues title="投資假設與分月資料" issues={projection.issues} />
      {!investmentReady ? <p className="notice" role="status">完整分月假設尚未齊備，NPV、IRR、回收期與稅後損益暫不成立。請補齊每月輸入，明確確認後重新測算。</p> : <>
        <div className="stats-grid compact">
          <Stat label="假設投資 NPV" value={money(projection.npv)} unit="CNY" note={`年折現率 ${percent(config.investment.annualDiscountRate)}`} />
          <Stat label="假設年化 IRR" value={metrics.annualIRR === null ? '不適用' : percent(metrics.annualIRR)} note={irrStatus} />
          <Stat label="簡單回收期" value={metrics.paybackMonths === null ? '期內未回收' : number(metrics.paybackMonths, 2)} unit={metrics.paybackMonths === null ? '' : '月'} note={metrics.laterFundingDeficit ? '曾回正後再轉負，仍有後續資金需求' : '累計現金流首次回正時間'} />
          <Stat label="最大累計資金缺口" value={money(metrics.fundingGap)} unit="CNY" />
        </div>
        <p className="panel-note">折現回收期：{metrics.discountedPaybackMonths === null ? '期內未回收' : `${number(metrics.discountedPaybackMonths, 2)} 月`}。全期假設會計損益：{money(projection.accountingProfit)} CNY。折舊只影響損益及稅；設備購入與替換只在實際月份列現金投資。</p>
        <details className="finance-details" open><summary>月現金流：收入、收款、投資與期末餘額</summary><div className="table-scroll"><Table><Heads cells={['月', '收入', '實際收款', '期末應收', '購電支出', '基本／調整', 'OPEX／租金', '稅支出', 'CAPEX', '處置收入', '準備金變化', '月淨現金', '累計現金']} /><TableBody>
          {projection.rows.map(row => <TableRow key={row.month}><TableCell>{row.month}</TableCell><TableCell>{money(row.revenue)}</TableCell><TableCell>{money(row.cashCollections)}</TableCell><TableCell>{money(row.closingReceivables)}</TableCell>
            <TableCell>{money(row.energyPurchases)}</TableCell><TableCell>{money(row.basicAndAdjustmentCharges)}</TableCell><TableCell>{money(row.opex)}／{money(row.lease)}</TableCell><TableCell>{money(row.incomeTax)}＋{money(row.levyAndOtherTax)}</TableCell>
            <TableCell>{money(row.capex)}</TableCell><TableCell>{money(row.disposalProceeds)}</TableCell><TableCell>{money(row.workingCapitalChange)}</TableCell><TableCell>{money(row.netCashFlow)}</TableCell><TableCell>{money(row.cumulativeCashFlow)}</TableCell></TableRow>)}
        </TableBody></Table></div></details>
        <details className="finance-details"><summary>月損益：能源費用、折舊、處置損益與稅</summary><div className="table-scroll"><Table><Heads cells={['月', '收入', '存貨調整能源費用', '基本／調整', 'OPEX', '租金', '折舊', '處置損益', '收入比例／其他稅', '抵虧前損益', '所得稅', '稅後損益']} /><TableBody>
          {projection.rows.map(row => <TableRow key={row.month}><TableCell>{row.month}</TableCell><TableCell>{money(row.revenue)}</TableCell><TableCell>{money(row.energyExpense)}</TableCell><TableCell>{money(row.basicAndAdjustmentCharges)}</TableCell><TableCell>{money(row.opex)}</TableCell><TableCell>{money(row.lease)}</TableCell>
            <TableCell>{money(row.depreciation)}</TableCell><TableCell>{money(row.disposalGain)}</TableCell><TableCell>{money(row.levyAndOtherTax)}</TableCell><TableCell>{money(row.taxableBeforeLossRelief)}</TableCell><TableCell>{money(row.incomeTax)}</TableCell><TableCell>{money(row.accountingProfit)}</TableCell></TableRow>)}
        </TableBody></Table></div></details>
        <p className="notice">上表金額單位為 CNY。應收款依實際曆月天數與設定延遲天數計算；期末未收款不當成現金。曆年稅模型在年底及模型結束時結算，期中欄位不代表法定稅負應計。</p>
      </>}
    </section>
  </div>;
}
