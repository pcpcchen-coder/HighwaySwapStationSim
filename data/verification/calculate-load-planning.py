"""Independent Decimal oracle: hand-transcribed annual table and station totals.
Does not import the application or its reference JSON.
"""
from decimal import Decimal, getcontext
from pathlib import Path
import json
getcontext().prec = 40
D = Decimal
inputs = [
    (2027, 'low', '771.63', '0.9181', '0.9588', 36750, 15580),
    (2028, 'medium', '1124.37', '0.9256', '0.9596', 50280, 15990),
    (2029, 'medium', '1477.12', '0.9256', '0.9596', 50280, 15990),
] + [(year, 'high', '1829.86', '0.9288', '0.9585', 62990, 17630) for year in range(2030, 2037)]
rows = []
cumulative = D(0)
for year, level, sales, traditional, sst, daily_dc, daily_ac in inputs:
    q = D(sales) * 10000
    factor = q / (D(daily_dc) * 365)
    ac = D(daily_ac) * 365 * factor
    traditional_input, sst_input = q / D(traditional), q / D(sst)
    saved = traditional_input - sst_input
    benefit = saved * D('0.67')
    cumulative += benefit
    values = dict(demandFactor=factor, dcSalesKWh=q, acSalesKWh=ac,
                  totalSalesKWh=q+ac, traditionalInputKWh=traditional_input,
                  sstInputKWh=sst_input, savedKWh=saved, benefitCNY=benefit,
                  cumulativeBenefitCNY=cumulative)
    rows.append(dict(year=year, load=level, **{k:str(v) for k,v in values.items()}))
output = Path('data/verification/load-planning-expected.json')
output.write_text(json.dumps(dict(method='Python Decimal 40-digit; independent screenshot transcription; equal DC customer-side output energy', rows=rows), indent=2) + '\n')
print(output)
