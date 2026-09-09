#!/usr/bin/env python3
"""Independent closed-form reference. Uses Decimal(60); imports no simulator code.

Synthetic validation curves are illustrative test inputs, not manufacturer data.
Units: energy=kWh, connector power=kW, time=minutes, SOC/energy fraction=0..1.
"""
from decimal import Decimal, getcontext
from pathlib import Path
import json

getcontext().prec = 60
D = Decimal
ZERO, ONE, SIXTY = D(0), D(1), D(60)
CAP, ETA, SWAP = D('513'), D('.96'), D('7.5')
LINEAR = [(ZERO, ZERO), (ONE, ONE)]
NONLINEAR = [(ZERO, ZERO), (D('.5'), D('.4')), (ONE, ONE)]
BANDS = [(D(0), D('.8'), D(560)), (D('.8'), D('.9'), D(280)), (D('.9'), D(1), D(140))]

def interpolate(x, curve):
    for (x0, y0), (x1, y1) in zip(curve, curve[1:]):
        if x <= x1:
            return y0 + (x-x0)*(y1-y0)/(x1-x0)
    raise ValueError(x)

def stored(soc, curve, soh=ONE):
    return CAP * soh * interpolate(soc, curve)

def soc_of(energy, curve, soh=ONE):
    return interpolate(energy / (CAP * soh), [(e, s) for s, e in curve])

def taper_case(name, curve, constraints=()):
    """Integrate constant-power rectangles, stopping at analytic band/schedule events."""
    t, energy = SWAP, stored(D('.2'), curve)
    returned, connector, segments, endpoints = energy, ZERO, [], []
    for lower, upper, requested in BANDS:
        target = stored(upper, curve)
        while energy < target:
            ceiling, accepted = D('1000000'), requested
            for start, end, cap in constraints:
                if start <= t < end:
                    ceiling, accepted = min(ceiling, end), min(accepted, cap)
                elif t < start:
                    ceiling = min(ceiling, start)
            stop = ceiling if accepted == 0 else min(ceiling, t + SIXTY*(target-energy)/(accepted*ETA))
            terminal = accepted*(stop-t)/SIXTY
            next_energy = min(target, energy + terminal*ETA)
            segments.append(dict(startMinute=t, endMinute=stop, requestedKW=requested,
                                 acceptedKW=accepted, initialEnergyKWh=energy,
                                 finalEnergyKWh=next_energy, terminalKWh=terminal))
            t, energy, connector = stop, next_energy, connector + terminal
        endpoints.append(dict(soc=upper, minute=t, storedKWh=energy))
    full = t
    # Endpoints and interior knots make wrong SOC interpolation observable.
    samples = {ZERO, SWAP-D('.000001'), SWAP, *(D(str(i*7.5)) for i in range(2,17))}
    samples.update(e['minute'] for e in endpoints)
    for s in segments:
        samples.update([s['startMinute'], s['endMinute']])
        for _, fraction in curve[1:-1]:
            knot = CAP*fraction
            if s['acceptedKW'] > 0 and s['initialEnergyKWh'] <= knot <= s['finalEnergyKWh']:
                samples.add(s['startMinute'] + SIXTY*(knot-s['initialEnergyKWh'])/(s['acceptedKW']*ETA))
    rows=[]
    for minute in sorted(samples):
        energy = CAP if minute < SWAP else returned
        terminal = ZERO
        if minute >= SWAP:
            for segment in segments:
                overlap = max(ZERO, min(minute, segment['endMinute'])-segment['startMinute'])
                terminal += segment['acceptedKW']*overlap/SIXTY
            energy = min(CAP, returned + terminal*ETA)
        rows.append(dict(minute=minute, energyKWh=energy, soc=soc_of(energy, curve),
                         remainingKWh=CAP-energy, terminalKWh=terminal,
                         batteryId='initial' if minute < SWAP else 'swap-0:returned'))
    return dict(id=name, curve=curve, eta=ETA, capacityKWh=CAP, returnSOC=D('.2'),
                constraints=constraints, returnedKWh=returned, deliveredKWh=CAP-returned,
                connectorKWh=connector, batteryLossKWh=connector-(CAP-returned), fullMinute=full,
                endpoints=endpoints, segments=segments, rows=rows,
                threeDay=dict(completed=3, deliveredKWh=3*(CAP-returned),
                              connectorKWh=3*connector, batteryLossKWh=3*(connector-(CAP-returned)),
                              initialStoredKWh=CAP, finalStoredKWh=CAP, inventoryResidualKWh=ZERO))

def soh_case(id, requested=None):
    soh, minimum = D('.8'), D('.2')
    outgoing, minimum_incoming = CAP*soh, CAP*soh*minimum
    maximum = outgoing-minimum_incoming
    if requested is None:
        requested = maximum
    feasible = requested <= maximum
    incoming = outgoing-requested if feasible else None
    return dict(id=id, capacityKWh=CAP, soh=soh, minReturnSOC=minimum,
                outgoingKWh=outgoing, maximumDeliverableKWh=maximum,
                requestedKWh=requested, feasible=feasible,
                deliveredKWh=requested if feasible else ZERO,
                unservedKWh=ZERO if feasible else requested,
                returnedKWh=incoming,
                returnSOC=incoming/(CAP*soh) if feasible else None,
                connectorKWh=requested/ETA if feasible else ZERO,
                fullMinute=SWAP+SIXTY*requested/(D(560)*ETA) if feasible else None)

def jsonable(v):
    if isinstance(v, Decimal): return str(v)
    if isinstance(v, dict): return {k:jsonable(x) for k,x in v.items()}
    if isinstance(v, (tuple,list)): return [jsonable(x) for x in v]
    return v

result = dict(method='Decimal precision 60; analytic constant-power energy integration; inverse piecewise-linear stored-energy/SOC map; no production imports',
              manufacturerCurve=False,
              formulas=dict(stored='nominal capacity × SOH × energyFraction(SOC)',
                            charged='connector kW × battery absorption efficiency × elapsed minutes / 60',
                            boundaryMinutes='60 × (stored energy at next SOC band boundary − present stored energy) / accepted connector kW / battery efficiency',
                            absoluteReturn='outgoing stored kWh − absolute requested kWh',
                            balance='initial stored + connector input − battery loss + returned − outgoing − final stored = 0'),
              taper=[taper_case('linear_taper',LINEAR),
                     taper_case('nonlinear_taper',NONLINEAR),
                     taper_case('nonlinear_curtailed_outage', NONLINEAR,
                                ((D(20),D(35),D(280)),(D(35),D(42),D(0))))],
              soh=[soh_case('absolute_infeasible_410_4', D('410.4')),
                   soh_case('absolute_feasible_300',D(300)),
                   soh_case('explicit_soc_20_percent')])

if __name__ == '__main__':
    target=Path(__file__).with_name('soc-expected.json')
    target.write_text(json.dumps(jsonable(result),ensure_ascii=False,indent=2)+'\n')
    for c in result['taper']:
        print(c['id'], 'full minute=', c['fullMinute'], 'connector=', c['connectorKWh'], 'loss=', c['batteryLossKWh'])
    print(target)
