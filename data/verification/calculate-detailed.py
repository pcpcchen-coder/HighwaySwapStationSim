"""Independent Decimal reference; deliberately does not import the simulator.

Three closed synthetic multi-day contracts. These expected values are not a
claim that an implementation has passed: a separate runner must compare the
actual system output, record its source SHA, and report every discrepancy.
"""
from decimal import Decimal, getcontext, ROUND_HALF_UP
from datetime import date, timedelta
from calendar import monthrange
from pathlib import Path
import json

getcontext().prec = 70
D = Decimal
ZERO = D(0)


def money(value):
    return value.quantize(D('.01'), rounding=ROUND_HALF_UP)


def exact(value):
    if isinstance(value, Decimal):
        return format(value, 'f')
    if isinstance(value, dict):
        return {k: exact(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [exact(v) for v in value]
    return value


def assert_near(a, b, tolerance=D('1e-60')):
    assert abs(a-b) <= tolerance, (a, b)


def shared_dd():
    """V04: one shared DD serves a rack and external gun; tie feeds B.

    Each day rack replenishment need=60 kWh, A EV need=80 kWh, B EV=40.
    Rack request 60 kW has explicit first priority, so first-hour EV power
    is 40 kW although its own gun permits 80. After rack finishes, A EV
    uses 80 kW for half an hour. Day 2 tie opens for the first hour, making
    B wait to hour 2. All converter limits are on their output boundary.
    Bay operations are outside this isolated electrical contract: the rack
    begins with an explicitly recorded 60 kWh deficit caused by a swap.
    """
    eta_dd, eta_sst = D('.95'), D('.98')
    intervals = []
    for day in range(3):
        # t0..60: rack 60 + A gun 40 consume all shared-DD output 100.
        # t60..90: A gun 80; B restoration may coincide and must share SST.
        tie_first = ZERO if day == 1 else D(40)
        for start, end, rack, a, b, tie in [
            (0, 60, D(60), D(40), tie_first, day != 1),
            (60, 90, ZERO, D(80), D(40) if day == 1 else ZERO, True),
            (90, 120, ZERO, ZERO, D(40) if day == 1 else ZERO, True),
        ]:
            duration = D(end-start)/60
            shared_output = rack + a
            b_output = b
            sst_output = (shared_output + b_output) / eta_dd
            grid = sst_output / eta_sst
            assert shared_output <= 100
            assert b_output <= 40
            assert sst_output <= 200
            if not tie:
                assert b == 0
            loss_dd = (shared_output+b_output) * (1/eta_dd-1)
            loss_sst = sst_output * (1/eta_sst-1)
            assert_near(grid, rack+a+b+loss_dd+loss_sst)
            intervals.append(dict(day=day, fromMinute=start+day*1440,
                toMinute=end+day*1440, tieClosed=tie, rackKW=rack,
                aGunKW=a, bGunKW=b, sharedDDOutputKW=shared_output,
                tieKW=b/eta_dd, sstOutputKW=sst_output, gridKW=grid,
                durationHours=duration, ddLossKW=loss_dd, sstLossKW=loss_sst))
    energy = lambda field: sum((r[field]*r['durationHours'] for r in intervals), ZERO)
    totals = dict(rackReplenishmentKWh=energy('rackKW'), aEVKWh=energy('aGunKW'),
        bEVKWh=energy('bGunKW'), gridKWh=energy('gridKW'),
        ddLossKWh=energy('ddLossKW'), sstLossKWh=energy('sstLossKW'),
        crossBusTieKWh=energy('tieKW'), completedEVs=6,
        aEVCompletionMinute=[D('90')+1440*d for d in range(3)],
        bEVCompletionMinute=[D(60), D(1560), D(2940)])
    totals['lossKWh'] = totals['ddLossKWh']+totals['sstLossKWh']
    totals['terminalKWh'] = totals['rackReplenishmentKWh']+totals['aEVKWh']+totals['bEVKWh']
    assert totals['rackReplenishmentKWh'] == 180
    assert totals['aEVKWh'] == 240
    assert totals['bEVKWh'] == 120
    assert_near(totals['gridKWh'], totals['terminalKWh']+totals['lossKWh'])
    return dict(id='V04_SHARED_DD_TIE_3D', horizonDays=3,
        assumptions=dict(sstOutputKW=200, sharedDDOutputKW=100,
            bDDOutputKW=40, sstEfficiency=eta_sst, ddEfficiency=eta_dd,
            allocationPriority=['rack','A external gun','B external gun'],
            cableLoss=0, otherLoads=0, voltageCurrentLimits='non-binding',
            tie='same-side SST-to-PCS support path, no AC paralleling'),
        intervals=intervals, expected=totals)


def storage_pv_ups():
    """V05: four repeats do not reset ESS or UPS SOC at midnight.

    PV available is pre-MPPT; curtailedBusEquivalent also exposes the common
    post-MPPT convention. Curtailment is unused resource, not heat loss.
    All fade and self discharge coefficients are explicitly zero.
    """
    ess = D(50)
    ups = D(20)
    days = []
    for day in range(4):
        opening_ess, opening_ups = ess, ups
        pv_available_raw, eta_mppt = D(120), D('.9')
        normal_load, charge_input = D(40), D(50)
        pv_bus = normal_load+charge_input
        pv_harvested = pv_bus/eta_mppt
        pv_curtailed = pv_available_raw-pv_harvested
        ess += charge_input*D('.9')
        assert ess == 95
        ess_after_charge = ess
        peak_output = D(36)
        ess -= peak_output/D('.8')
        assert ess == opening_ess
        ups_requested = D(16) if day == 2 else D(8)
        ups_output = min(ups_requested, (ups-D(10))*D('.8'))
        ups -= ups_output/D('.8')
        assert ups == 10
        ups_after_discharge = ups
        grid_recharge = (D(20)-ups)/D('.8')
        ups += grid_recharge*D('.8')
        assert ups == opening_ups
        pv_loss = pv_harvested-pv_bus
        ess_loss = charge_input*(1-D('.9'))+peak_output*(1/D('.8')-1)
        ups_loss = grid_recharge*(1-D('.8'))+ups_output*(1/D('.8')-1)
        terminal = normal_load+peak_output+ups_output
        loss = pv_loss+ess_loss+ups_loss
        assert_near(pv_harvested+grid_recharge, terminal+loss)
        days.append(dict(day=day, openingESSKWh=opening_ess,
            essAfterChargeKWh=ess_after_charge, closingESSKWh=ess,
            openingUPSKWh=opening_ups, upsAfterDischargeKWh=ups_after_discharge,
            closingUPSKWh=ups, pvAvailableRawKWh=pv_available_raw,
            pvHarvestedRawKWh=pv_harvested, pvBusKWh=pv_bus,
            curtailedRawEquivalentKWh=pv_curtailed,
            curtailedBusEquivalentKWh=pv_curtailed*eta_mppt,
            mainTerminalKWh=normal_load+peak_output, upsTerminalKWh=ups_output,
            unservedUPSKWh=ups_requested-ups_output, gridKWh=grid_recharge,
            pvLossKWh=pv_loss, essLossKWh=ess_loss, upsLossKWh=ups_loss,
            terminalKWh=terminal, lossKWh=loss))
    columns = ['pvAvailableRawKWh','pvHarvestedRawKWh','pvBusKWh',
        'curtailedRawEquivalentKWh','curtailedBusEquivalentKWh','mainTerminalKWh',
        'upsTerminalKWh','unservedUPSKWh','gridKWh','pvLossKWh','essLossKWh',
        'upsLossKWh','terminalKWh','lossKWh']
    totals = {key: sum((r[key] for r in days), ZERO) for key in columns}
    totals.update(initialStoredKWh=D(70), finalStoredKWh=ess+ups)
    assert totals['gridKWh'] == 50
    assert totals['terminalKWh'] == 336
    assert totals['lossKWh'] == 114
    assert totals['unservedUPSKWh'] == 8
    assert_near(totals['pvHarvestedRawKWh']+totals['gridKWh'],
        totals['terminalKWh']+totals['lossKWh'])
    return dict(id='V05_PV_ESS_UPS_4D', horizonDays=4,
        assumptions=dict(essCapacityKWh=100, essMinSOC=D('.1'), essMaxSOC=1,
            essChargeEfficiency=D('.9'), essDischargeEfficiency=D('.8'),
            upsCapacityKWh=20, upsMinSOC=D('.5'), upsMaxSOC=1,
            upsChargeEfficiency=D('.8'), upsDischargeEfficiency=D('.8'),
            selfDischargePerHour=0, calendarFadePerDay=0,
            cycleFadePerEquivalentCycle=0, gridExport=False,
            ATSDelayMinutes=0, allOtherLoads=0), days=days, expected=totals)


def passenger_tariff():
    """V06: local-date month split, passenger stock, tariff scope.

    One A passenger arrival daily at 09:00, swap duration 7.5 min, net100
    kWh. The 100kWh battery recharges at50kW from09:07.5 to11:07.5.
    Other direct-charge terminal loads use explicit15min schedules 00..01.
    All physical efficiencies are1. Monthly billing values are user-defined
    synthetic tariffs, not an assertion about a jurisdiction's current law.
    """
    start = date(2026, 1, 30)
    profiles = dict(A=[ZERO,D(100),D(200),ZERO], B=[ZERO,D(80),D(40),ZERO])
    prices = dict(A=D('.5'), B=D('.8'))
    rows = []
    periods = {}
    for day in range(5):
        current = start+timedelta(days=day)
        month = current.strftime('%Y-%m')
        period = periods.setdefault(month, dict(days=0, calendarDays=monthrange(current.year,current.month)[1],
            A=dict(kWh=ZERO, energyCost=ZERO), B=dict(kWh=ZERO, energyCost=ZERO)))
        period['days'] += 1
        for station in ['A','B']:
            direct_energy = sum(profiles[station])*D('.25')
            passenger_energy = D(100) if station == 'A' else ZERO
            energy = direct_energy+passenger_energy
            # Existing settlement is per source/hour, not a daily aggregate.
            # A passenger recharge spans 09:07.5..11:07.5, hence 43.75,50,
            # 6.25kWh. 21.875->21.88 and3.125->3.13 add0.01CNY/day.
            hourly_energy = {0:direct_energy}
            if station == 'A':
                hourly_energy.update({9:D('43.75'),10:D(50),11:D('6.25')})
            cost = sum((money(kwh*prices[station]) for kwh in hourly_energy.values()),ZERO)
            period[station]['kWh'] += energy
            period[station]['energyCost'] += cost
            rows.append(dict(day=day,date=current.isoformat(),station=station,
                directKWh=direct_energy,passengerKWh=passenger_energy,
                importKWh=energy,energyCost=cost,hourlyImportKWh=hourly_energy,
                source15MinutePeakKW=max(profiles[station]),
                revenue=money(energy)))
    basic_total = ZERO
    energy_total = ZERO
    for period in periods.values():
        share = D(period['days'])/period['calendarDays']
        period['partialMonthPolicy'] = 'PRORATE_OBSERVED_ESTIMATE'
        period['strictFullMonthInvoice'] = None
        for station, monthly in [('A',D(1000)*D(2)),('B',D(80)*D(3))]:
            bill = period[station]
            bill['basicChargeEstimate'] = money(monthly*share)
            bill['estimatedInvoice'] = bill['energyCost']+bill['basicChargeEstimate']
            basic_total += bill['basicChargeEstimate']
            energy_total += bill['energyCost']
    revenue = sum((r['revenue'] for r in rows), ZERO)
    bill = energy_total+basic_total
    totals = dict(passengerTransactions=5, passengerDeliveredKWh=D(500),
        passengerRevenue=D(500), sourceAKWh=D(875), sourceBKWh=D(150),
        sourceAObservedPeakKW=D(200), sourceBObservedPeakKW=D(80),
        deliveredKWh=D(1025), gridKWh=D(1025), lossKWh=ZERO,
        initialPassengerStockKWh=D(100), finalPassengerStockKWh=D(100),
        revenue=revenue, energyCharge=energy_total,
        proratedBasicChargeEstimate=basic_total, estimatedInvoice=bill,
        cashContributionAfterEstimatedBill=revenue-bill,
        passengerSwapCompletionMinutes=[D('547.5')+1440*d for d in range(5)],
        passengerChargeCompletionMinutes=[D('667.5')+1440*d for d in range(5)])
    assert totals['energyCharge'] == D('557.55')
    assert totals['proratedBasicChargeEstimate'] == D('384.51')
    assert totals['cashContributionAfterEstimatedBill'] == D('82.94')
    # Separate controlled cost-accounting contract: cash vs stock valuation.
    opening_e, opening_value, inflow_e, inflow_cost = D(100), D(40), D(100), D(60)
    issued_e, closing_e, inventory_revenue = D(150), D(50), D(100)
    weighted_cost = (opening_value+inflow_cost)/(opening_e+inflow_e)
    cogs, closing_value = issued_e*weighted_cost, closing_e*weighted_cost
    assert_near(opening_value+inflow_cost,cogs+closing_value)
    inventory = dict(openingKWh=opening_e,openingValue=opening_value,
        inflowKWh=inflow_e,inflowCost=inflow_cost,issuedKWh=issued_e,
        closingKWh=closing_e,averageCost=weighted_cost,costOfGoodsSold=cogs,
        closingValue=closing_value,cashContribution=inventory_revenue-inflow_cost,
        stockAdjustedContribution=inventory_revenue-cogs)
    return dict(id='V06_PASSENGER_TARIFF_5D', horizonDays=5,
        assumptions=dict(startDate=start.isoformat(),passengerCapacityKWh=100,
            passengerReadySOC=1,passengerReturnSOC=0,passengerInitialSOC=1,
            passengerBays=1,passengerSwapMinutes=D('7.5'),passengerChargeKW=50,
            allEfficiencies=1,otherLoads=0,allServicePrices=1,
            basicA='capacity1000kVA * 2 CNY/kVA/month',
            basicB='observed15minPeak80kW * 3 CNY/kW/month',
            peakWindow='clock-aligned 15 minutes; observed period only',
            energySettlement='HALF_UP 2 decimals for each source/hour, then sum'),
        days=rows,months=periods,expected=totals,inventorySubcase=inventory)


def main():
    export_generated = (D(40)+D(48)/D('.8'))/D('.9')
    result = dict(format='HighwaySwapSim.IndependentGapOracle',version=1,
        arithmetic='Python Decimal precision70; money ROUND_HALF_UP 2 decimals',
        implementationCompared=False,
        cases=[shared_dd(),storage_pv_ups(),passenger_tariff()],
        pvExportGolden=dict(pvAvailableKWh=D(120),localLoadKWh=D(40),
            mpptEfficiency=D('.9'),exportEfficiency=D('.8'),
            exportConverterKW=D(50),exportLimitKW=D(48),
            gridImportKWh=ZERO,exportKWh=D(48),pvGeneratedKWh=export_generated,
            curtailedKWh=D(120)-export_generated,lossKWh=export_generated-D(40)-D(48),
            exportUnitPrice=D('.25'),exportRevenue=D(12)))
    path=Path(__file__).with_name('detailed-expected.json')
    path.write_text(json.dumps(exact(result),ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'output':str(path),'cases':3,'oracleSelfChecks':'passed',
        'implementationCompared':False}))


if __name__ == '__main__':
    main()
