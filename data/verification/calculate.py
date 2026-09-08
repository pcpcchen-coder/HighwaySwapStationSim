#!/usr/bin/env python3
"""Independent Decimal oracle. No HighwaySwapSim imports or solver execution.

Inputs are immutable reviewed analytical fixtures. This calculator integrates
closed-form charging intervals over hour windows; it does not allocate power,
advance events, reset inventory each day, or call the implementation under test.
Default invocation checks that checked-in expectations exactly reproduce.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from collections import defaultdict
from decimal import Decimal, localcontext, ROUND_HALF_UP
from pathlib import Path

HERE = Path(__file__).resolve().parent
D = Decimal
ZERO = D(0)
ONE = D(1)
HOUR = D(60)
DAY = D(1440)
STATIONS = ('A', 'B')
ENERGY_QUANTUM = D('0.000001')
CURRENCY_QUANTUM = D('0.01')
REPORT_QUANTUM = D('0.000000000000000000000000000001')

def invoice(energy, tariff):
    """Explicit source-hour/session invoice contract, not display-only rounding."""
    return (energy.quantize(ENERGY_QUANTUM, rounding=ROUND_HALF_UP)
            * tariff.quantize(ENERGY_QUANTUM, rounding=ROUND_HALF_UP)).quantize(
                CURRENCY_QUANTUM, rounding=ROUND_HALF_UP)

def integral(intervals, h, power):
    start, end = D(h)*HOUR, D(h+1)*HOUR
    return sum((max(ZERO, min(end,b)-max(start,a))*power/HOUR
                for a,b in intervals), ZERO)

def nrec(input_kwh, output_kwh=None):
    output_kwh = input_kwh if output_kwh is None else output_kwh
    return {'inputKWh':input_kwh, 'outputKWh':output_kwh,
            'lossKWh':input_kwh-output_kwh}

def sum_records(records):
    out = defaultdict(lambda: defaultdict(lambda: ZERO))
    for record in records:
        for node, fields in record.items():
            for key, value in fields.items():
                out[node][key] += value
    return {node:dict(fields) for node,fields in out.items()}

def sum_maps(records):
    out = defaultdict(lambda:ZERO)
    for record in records:
        for key,value in record.items(): out[key] += value
    return dict(out)

def case_intervals(c):
    """Closed-form battery-side charge intervals, equal for both stations."""
    if c['id'] == 'V01_SST_3D':
        return [(D(d)*DAY+D('7.5'),D(d)*DAY+D('127.5'))
                for d in range(c['horizon_days'])]
    if c['id'] == 'V02_PCS_AC_EV_4D':
        return []
    # Grid blackout truncates the first restoration. Waiting requests consume
    # full packs at 4395 and 4522.5; reservation prevents restoration in a bay.
    return [(D(a),D(b)) for a,b in (
        ('1387.5','1440'),('4320','4387.5'),('4395','4515'),
        ('4522.5','4642.5'),('5707.5','5827.5'),('7147.5','7200'))]

def case_transactions(c, inv):
    transactions=[]
    for s in STATIONS:
        for d in range(c['horizon_days']):
            if c['id'] == 'V02_PCS_AC_EV_4D':
                kind='charge'; arrival=D(d)*DAY+D(720); start=arrival
                completion=start+D(120)
            else:
                kind='swap'; arrival=D(d)*DAY+D(c['swap_arrival_hour_each_day'])*HOUR
                start=arrival
                if c['id'] == 'V03_OUTAGE_CROSSSITE_5D':
                    start=[D(1380),D('4387.5'),D(4515),D(5700),D(7140)][d]
                completion=start+D(inv['swap_minutes'])
            energy=D(inv['pack_kWh'])
            unitprice=D(c[f'grid_prices_{s}'][d])+D(inv['service_fee'])
            transactions.append({'station':s,'kind':kind,'arrivalDay':d,
                'arrivalMinute':arrival,'startMinute':start,
                'completionMinute':completion,'waitingMinutes':start-arrival,
                'deliveredKWh':energy,'unitPrice':unitprice,
                'revenueExact':energy*unitprice,'revenueSettled':invoice(energy,unitprice)})
    return transactions

def physical_hour(c, battery, ev, aux):
    """Apply only series efficiency arithmetic on fixture-specific known paths."""
    eta_dd=D(c['dd_efficiency'])
    nodes={};edges={};source={};load={}
    dc=(battery+ev)/eta_dd
    if c['id'] == 'V03_OUTAGE_CROSSSITE_5D':
        g=2*dc/D(c['sst_efficiency'])
        source={'A-grid':g}
        nodes.update({'A-grid':nrec(g),'A-sst':nrec(g,2*dc),
                      'A-bus':nrec(2*dc),'A-tie':nrec(dc),'B-bus':nrec(dc)})
        edges.update({'A-grid->A-sst':g,'A-sst->A-bus':2*dc,
                      'A-bus->A-tie':dc,'A-tie->B-bus':dc})
        for s in STATIONS:
            nodes[f'{s}-charger']=nrec(dc,battery+ev)
            edges[f'{s}-bus->{s}-charger']=dc
            load[s]={'gridKWh':g/2,'lossKWh':g/2-battery-ev,'auxiliaryKWh':ZERO}
    else:
        for s in STATIONS:
            if c['id'] == 'V01_SST_3D':
                g=dc/D(c['sst_efficiency'])
                nodes.update({f'{s}-grid':nrec(g),f'{s}-sst':nrec(g,dc),
                              f'{s}-bus':nrec(dc),f'{s}-charger':nrec(dc,battery+ev)})
                edges.update({f'{s}-grid->{s}-sst':g,f'{s}-sst->{s}-bus':dc,
                              f'{s}-bus->{s}-charger':dc})
            else:
                pcs_input=dc/D(c['pcs_efficiency'])
                tx_output=pcs_input+aux
                g=tx_output/D(c['transformer_efficiency'])
                nodes.update({f'{s}-grid':nrec(g),f'{s}-transformer':nrec(g,tx_output),
                    f'{s}-lv':nrec(tx_output),f'{s}-pcs':nrec(pcs_input,dc),
                    f'{s}-bus':nrec(dc),f'{s}-charger':nrec(dc,ev),f'{s}-aux':nrec(aux)})
                edges.update({f'{s}-grid->{s}-transformer':g,
                    f'{s}-transformer->{s}-lv':tx_output,
                    f'{s}-lv->{s}-pcs':pcs_input,f'{s}-pcs->{s}-bus':dc,
                    f'{s}-bus->{s}-charger':dc,f'{s}-lv->{s}-aux':aux})
            source[f'{s}-grid']=g
            load[s]={'gridKWh':g,'lossKWh':g-battery-ev-aux,'auxiliaryKWh':aux}
    return nodes,edges,source,load

def calculate_case(c, inv):
    days=c['horizon_days'];hours=days*24
    tx=case_transactions(c,inv);intervals=case_intervals(c)
    records=[];source_rows=[];day_rows=[]
    stored={s:D(inv['pack_kWh'])*D(inv['packs_per_station']) for s in STATIONS}
    initial=sum(stored.values(),ZERO)
    for h in range(hours):
        d=h//24
        battery=integral(intervals,h,D(inv['battery_charge_kW']))
        ev=(D(50) if c['id']=='V02_PCS_AC_EV_4D' and h%24 in (12,13) else ZERO)
        aux=D(c['auxiliary_kW_per_site'])
        nodes,edges,source,load=physical_hour(c,battery,ev,aux)
        billed=[]
        for grid_id,energy in source.items():
            price=D(c[f'grid_prices_{grid_id[0]}'][d])
            source_rows.append({'absoluteHour':h,'day':d,'hour':h%24,
                'sourceId':grid_id,'importKWh':energy,'gridPrice':price,
                'energyForInvoiceKWh':energy.quantize(ENERGY_QUANTUM,rounding=ROUND_HALF_UP),
                'costExact':energy*price,'costSettled':invoice(energy,price)})
            billed.append(source_rows[-1])
        station_rows={}
        for s in STATIONS:
            # Formal C02 contract: completion events belong to the half-open
            # hour interval [start,end); a 14:00 finish is counted at hour14.
            completed=[j for j in tx if j['station']==s and D(h)*HOUR<=j['completionMinute']<D(h+1)*HOUR]
            swaps=sum((j['deliveredKWh'] for j in completed if j['kind']=='swap'),ZERO)
            rev_exact=sum((j['revenueExact'] for j in completed if j['kind']=='swap'),ZERO)
            rev_settled=sum((j['revenueSettled'] for j in completed if j['kind']=='swap'),ZERO)
            # EV monetary accrual uses independently integrated delivered
            # energy. The interval receives the change in cumulative invoice,
            # so unfinished but delivered energy remains recognized.
            for j in tx:
                if j['station']!=s or j['kind']!='charge': continue
                before_ev=min(j['deliveredKWh'],max(ZERO,D(h)*HOUR-j['startMinute'])*D(c['gun_output_kW'])/HOUR)
                after_ev=min(j['deliveredKWh'],max(ZERO,D(h+1)*HOUR-j['startMinute'])*D(c['gun_output_kW'])/HOUR)
                rev_exact+=(after_ev-before_ev)*j['unitPrice']
                rev_settled+=invoice(after_ev,j['unitPrice'])-invoice(before_ev,j['unitPrice'])
            # End-hour snapshots are after completions at the boundary but before
            # arrivals and service starts at that boundary. Therefore a swap
            # starting exactly at midnight cannot reserve yesterday's pack.
            # Physical EV energy and cumulative-invoice increments both belong
            # to their delivery interval, with arrival-time unit price locked.
            before=stored[s];stored[s]+=battery-swaps
            grid_source='A' if c['id']=='V03_OUTAGE_CROSSSITE_5D' else s
            exact_cost=load[s]['gridKWh']*D(c[f'grid_prices_{grid_source}'][d])
            delivered=ev+swaps
            residual=load[s]['gridKWh']-load[s]['lossKWh']-aux-delivered-(stored[s]-before)
            assert abs(residual)<D('1e-50'),(c['id'],h,s,residual)
            station_rows[s]={**load[s],'batteryChargeKWh':battery,'evDeliveredKWh':ev,
                'swapDeliveredKWh':swaps,'deliveredKWh':delivered,
                'initialStoredKWh':before,'finalStoredKWh':stored[s],
                'storedDeltaKWh':stored[s]-before,'completedSessions':len(completed),
                'revenueExact':rev_exact,'revenueSettled':rev_settled,
                'gridCostExact':exact_cost,'balanceResidualKWh':residual,
                'readyPacks':int(stored[s]>=D(inv['pack_kWh']) and not any(
                    j['station']==s and j['kind']=='swap' and j['startMinute']<D(h+1)*HOUR<j['completionMinute'] for j in tx)),
                'queuedSessions':sum(j['station']==s and j['arrivalMinute']<D(h+1)*HOUR<=j['startMinute'] for j in tx)}
        rec={'absoluteHour':h,'day':d,'hour':h%24,'nodes':nodes,'edges':edges,
             'stations':station_rows,'gridCostSettled':sum((b['costSettled'] for b in billed),ZERO)}
        records.append(rec)
    for d in range(days):
        rows=records[d*24:(d+1)*24];daytx=[j for j in tx if D(d)*DAY<=j['completionMinute']<D(d+1)*DAY]
        bystation={}
        for s in STATIONS:
            all_s=[r['stations'][s] for r in rows]
            summable=['gridKWh','lossKWh','auxiliaryKWh','batteryChargeKWh',
                      'evDeliveredKWh','swapDeliveredKWh','deliveredKWh',
                      'storedDeltaKWh','completedSessions','revenueExact','revenueSettled','gridCostExact']
            item={k:sum((r[k] for r in all_s),ZERO) for k in summable}
            item.update({'initialStoredKWh':all_s[0]['initialStoredKWh'],
                         'finalStoredKWh':all_s[-1]['finalStoredKWh'],
                         'endReadyPacks':all_s[-1]['readyPacks'],
                         'endQueuedSessions':all_s[-1]['queuedSessions']})
            bystation[s]=item
        summed={k:sum((v[k] for v in bystation.values()),ZERO) for k in bystation['A']}
        summed['gridCostSettled']=sum((r['gridCostSettled'] for r in rows),ZERO)
        summed['modeledOperatingContributionExact']=summed['revenueExact']-summed['gridCostExact']
        summed['modeledOperatingContributionSettled']=summed['revenueSettled']-summed['gridCostSettled']
        summed['balanceResidualKWh']=summed['gridKWh']-summed['lossKWh']-summed['auxiliaryKWh']-summed['deliveredKWh']-summed['storedDeltaKWh']
        assert abs(summed['balanceResidualKWh'])<D('1e-50')
        day_rows.append({'day':d,'dayLabel':d+1,'totals':summed,'stations':bystation,
                         'nodes':sum_records([r['nodes'] for r in rows]),
                         'edges':sum_maps([r['edges'] for r in rows])})
    # Independent boundary facts: V01 fully restores each pack by 02:07.5
    # daily; V02 never depletes it; V03 leaves 43.75 kWh per pack each midnight.
    expected_ready = 0 if c['id']=='V03_OUTAGE_CROSSSITE_5D' else 2
    assert all(r['totals']['endReadyPacks']==expected_ready for r in day_rows)
    if c['id']=='V03_OUTAGE_CROSSSITE_5D':
        assert [r['totals']['endQueuedSessions'] for r in day_rows]==[0,2,4,0,0]
    excluded={'initialStoredKWh','finalStoredKWh','balanceResidualKWh','endReadyPacks','endQueuedSessions'}
    totals={k:sum((r['totals'][k] for r in day_rows),ZERO)
            for k in day_rows[0]['totals'] if k not in excluded}
    totals['initialStoredKWh']=initial;totals['finalStoredKWh']=sum(stored.values(),ZERO)
    totals['endReadyPacks']=day_rows[-1]['totals']['endReadyPacks']
    totals['endQueuedSessions']=day_rows[-1]['totals']['endQueuedSessions']
    totals['requestedKWh']=D(len(tx))*D(inv['pack_kWh'])
    totals['unservedKWh']=totals['requestedKWh']-totals['deliveredKWh']
    totals['balanceResidualKWh']=totals['gridKWh']-totals['lossKWh']-totals['auxiliaryKWh']-totals['deliveredKWh']-totals['storedDeltaKWh']
    totals['maxWaitMinutes']=max(j['waitingMinutes'] for j in tx)
    totals['inventoryRestorationRequiredKWh']=max(ZERO,initial-totals['finalStoredKWh'])
    totals['settlementRoundingDifference']=totals['gridCostSettled']-totals['gridCostExact']
    nodes=sum_records([r['nodes'] for r in records]);edges=sum_maps([r['edges'] for r in records])
    assert abs(sum((v['lossKWh'] for v in nodes.values()),ZERO)-totals['lossKWh'])<D('1e-50')
    assert abs(totals['balanceResidualKWh'])<D('1e-50')
    source_totals={}
    for sid in sorted(set(r['sourceId'] for r in source_rows)):
        sr=[r for r in source_rows if r['sourceId']==sid]
        source_totals[sid]={k:sum((r[k] for r in sr),ZERO) for k in ('importKWh','costExact','costSettled')}
    return {'id':c['id'],'name':c['name'],'horizonDays':days,
        'totals':totals,'days':day_rows,'nodes':nodes,'edges':edges,
        'sourceMeters':source_totals,'sourceHourInvoices':source_rows,
        'transactions':tx,'batteryChargeIntervalsPerStationMinutes':intervals,
        'hourlyPhysicalLedgers':records}

def encode(x):
    if isinstance(x,D):
        if abs(x)<D('1e-50'): x=ZERO
        return format(x.quantize(REPORT_QUANTUM,rounding=ROUND_HALF_UP),'f')
    if isinstance(x,dict): return {k:encode(v) for k,v in x.items()}
    if isinstance(x,(tuple,list)): return [encode(v) for v in x]
    return x

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write',action='store_true',help='Explicitly regenerate immutable expectations; default verifies unchanged')
    args=parser.parse_args()
    raw=(HERE/'fixtures.json').read_bytes();fixture=json.loads(raw)
    assert len(fixture['cases'])==fixture['case_count']==3
    with localcontext() as ctx:
        ctx.prec=70;ctx.rounding=ROUND_HALF_UP
        result={'oracle':'independent Python stdlib Decimal closed-form integration',
                'precisionDecimalDigits':70,'publishedFractionDigits':30,
                'fixtureSHA256':hashlib.sha256(raw).hexdigest(),
                'cases':[calculate_case(c,fixture['invariants']) for c in fixture['cases']]}
        encoded=encode(result)
    payload=json.dumps(encoded,ensure_ascii=False,indent=2)+'\n'
    target=HERE/'expected.json'
    if args.write:
        target.write_text(payload)
        summary={**{k:v for k,v in encoded.items() if k!='cases'},'cases':[{k:v for k,v in c.items() if k not in ('hourlyPhysicalLedgers','sourceHourInvoices')} for c in encoded['cases']]}
        (HERE/'expected-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
        print(f'Wrote {target} ({len(payload)} characters)')
    else:
        if not target.exists() or target.read_text()!=payload:
            raise SystemExit('Immutable expected.json differs from independent recalculation')
        print('PASS: exactly 3 immutable Decimal expectations reproduced byte-for-byte')
    for c in encoded['cases']:
        t=c['totals']
        print(c['id'],json.dumps({k:t[k] for k in ('deliveredKWh','gridKWh','lossKWh','auxiliaryKWh','initialStoredKWh','finalStoredKWh','revenueSettled','gridCostExact','gridCostSettled','modeledOperatingContributionSettled','maxWaitMinutes')}))

if __name__=='__main__': main()
