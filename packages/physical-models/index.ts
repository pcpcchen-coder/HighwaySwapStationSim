/** Standalone engineering primitives. Inputs are configuration, never inferred catalogue facts.
 * All powers are kW; times hours; energies kWh; SOC/efficiency ratios are 0..1.
 * Disabled models are explicitly excluded. Enabled unknown values are blocking data gaps.
 */
export type Nullable = number | null;
export interface Issue { field: string; code: 'missing' | 'invalid'; message: string }
export type Checked<T> = { status: 'ready'; value: T; issues: [] } | { status: 'missing' | 'invalid'; issues: Issue[] };
export class PhysicalInputError extends Error { issues: Issue[]; constructor(issues: Issue[]) { super(issues.map(i => `${i.field}: ${i.message}`).join('; ')); this.name = 'PhysicalInputError'; this.issues = issues; } }
export function checked<T>(fn: () => T): Checked<T> { try { return { status: 'ready', value: fn(), issues: [] }; } catch (e) { if (!(e instanceof PhysicalInputError)) throw e; return { status: e.issues.some(i => i.code === 'invalid') ? 'invalid' : 'missing', issues: e.issues }; } }
function fail(field: string, message: string, code: Issue['code'] = 'invalid'): never { throw new PhysicalInputError([{field, code, message}]); }
export function known(value: Nullable | undefined, field: string, min = 0, max = Infinity): number { if (value === null || value === undefined) return fail(field, '待使用者填入，不能以零代替。', 'missing'); if (!Number.isFinite(value) || value < min || value > max) return fail(field, `須為 ${min} 至 ${max} 的有限數值。`); return value; }
function positive(value: Nullable | undefined, field: string): number { const n = known(value, field); if (n <= 0) return fail(field, '須大於零。'); return n; }
function eta(value: Nullable | undefined, field: string) { const n = known(value, field, 0, 1); if (!n) return fail(field, '效率須大於零。'); return n; }
function finite(value: Nullable | undefined, field: string) { return known(value, field, -Number.MAX_VALUE, Number.MAX_VALUE); }
const EPS = 1e-10;

export interface CurvePoint { x: Nullable; y: Nullable }
/** No extrapolation: tabulated inputs must cover the evaluated value. */
export function interpolate(draft: CurvePoint[] | null, x: number, field = 'curve'): number {
  const points=draft?.map((p,i)=>({x:finite(p.x,`${field}[${i}].x`),y:finite(p.y,`${field}[${i}].y`)}))??null;
  finite(x, `${field}.x`); if (points === null) return fail(field, '曲線資料待填。', 'missing');
  if (points.length < 2) return fail(field, '至少需要兩個不同橫坐標的曲線點。');
  for (let i=0; i<points.length; i++) { finite(points[i].x, `${field}[${i}].x`); finite(points[i].y, `${field}[${i}].y`); if (i && points[i].x <= points[i-1].x) return fail(field, '橫坐標須嚴格遞增。'); }
  if (x < points[0].x-EPS || x > points.at(-1)!.x+EPS) return fail(field, '目前輸入超出已提供曲線範圍，禁止未聲明的外推。', 'missing');
  if (x <= points[0].x) return points[0].y; if (x >= points.at(-1)!.x) return points.at(-1)!.y;
  const j=points.findIndex(p=>p.x>=x), a=points[j-1], b=points[j]; return a.y+(b.y-a.y)*(x-a.x)/(b.x-a.x);
}

export interface CableConfig {
  enabled: boolean; domain: 'DC' | 'AC3'; sendingVoltageV: Nullable;
  lengthM: Nullable; conductorResistanceOhmPerKm: Nullable; parallelRuns: Nullable;
  referenceTemperatureC: Nullable; conductorTemperatureC: Nullable; resistanceAlphaPerC: Nullable;
  reactanceOhmPerKm: Nullable; loadPowerFactor: Nullable; reactiveSign: 'lagging' | 'leading';
  ampacityA: Nullable; ampacityDerating: Nullable; maxVoltageDropRatio: Nullable;
}
export const emptyCable = (domain: CableConfig['domain']): CableConfig => ({ enabled:false,domain,sendingVoltageV:null,lengthM:null,conductorResistanceOhmPerKm:null,parallelRuns:null,referenceTemperatureC:null,conductorTemperatureC:null,resistanceAlphaPerC:null,reactanceOhmPerKm:null,loadPowerFactor:null,reactiveSign:'lagging',ampacityA:null,ampacityDerating:null,maxVoltageDropRatio:null });
export interface CableFlow { inputKW:number; outputKW:number; lossKW:number; currentA:number; receivingVoltageV:number; voltageDropRatio:number; resistanceOhm:number; outputKvar:number; inputKvar:number; withinLimits:boolean; violations:string[] }
/** DC is a two-conductor loop. AC3 is a balanced series R+jX branch with no shunt.
 * Sending voltage is an explicit boundary, not a solved network bus voltage.
 * R given per one conductor/km and parallelRuns per pole/phase; AC R is per phase.
 */
export function cableForOutput(c:CableConfig, outputKW:number):CableFlow {
  known(outputKW,'outputKW'); if (!c.enabled) return {inputKW:outputKW,outputKW,lossKW:0,currentA:0,receivingVoltageV:0,voltageDropRatio:0,resistanceOhm:0,outputKvar:0,inputKvar:0,withinLimits:true,violations:[]};
  const vs=positive(c.sendingVoltageV,'sendingVoltageV'), length=known(c.lengthM,'lengthM'), rKm=known(c.conductorResistanceOhmPerKm,'conductorResistanceOhmPerKm'), runs=positive(c.parallelRuns,'parallelRuns'); if (!Number.isInteger(runs)) return fail('parallelRuns','並聯根數須為正整數。');
  const t=finite(c.conductorTemperatureC,'conductorTemperatureC'), tref=finite(c.referenceTemperatureC,'referenceTemperatureC'), alpha=known(c.resistanceAlphaPerC,'resistanceAlphaPerC'), correction=1+alpha*(t-tref); if (correction<=0) return fail('conductorTemperatureC','電阻溫度修正後須大於零。');
  const r=rKm*length/1000/runs*correction*(c.domain==='DC'?2:1), limit=positive(c.ampacityA,'ampacityA')*known(c.ampacityDerating,'ampacityDerating',0,1), maxDrop=known(c.maxVoltageDropRatio,'maxVoltageDropRatio',0,1);
  let current=0, vr=vs, q=0, x=0;
  if(c.domain==='DC') { const disc=vs*vs-4*r*outputKW*1000; if(disc<0) return {inputKW:Infinity,outputKW,lossKW:Infinity,currentA:Infinity,receivingVoltageV:0,voltageDropRatio:1,resistanceOhm:r,outputKvar:0,inputKvar:0,withinLimits:false,violations:['VOLTAGE_COLLAPSE']}; current=r>0?2*outputKW*1000/(vs+Math.sqrt(disc)):outputKW*1000/vs; vr=vs-r*current; }
  else {
    const pf=eta(c.loadPowerFactor,'loadPowerFactor'); q=outputKW*Math.sqrt(1-pf*pf)/pf*(c.reactiveSign==='leading'?-1:1); x=known(c.reactanceOhmPerKm,'reactanceOhmPerKm')*length/1000/runs;
    const b=2*(r*outputKW+x*q)*1000-vs*vs, k=(r*r+x*x)*(outputKW*outputKW+q*q)*1e6, disc=b*b-4*k;
    if(disc<0 || (-b+Math.sqrt(Math.max(0,disc)))/2<=0) return {inputKW:Infinity,outputKW,lossKW:Infinity,currentA:Infinity,receivingVoltageV:0,voltageDropRatio:1,resistanceOhm:r,outputKvar:q,inputKvar:Infinity,withinLimits:false,violations:['VOLTAGE_COLLAPSE']};
    vr=Math.sqrt((-b+Math.sqrt(disc))/2); current=Math.hypot(outputKW,q)*1000/(Math.sqrt(3)*vr);
  }
  const multiplier=c.domain==='DC'?1:3, loss=multiplier*current*current*r/1000, drop=(vs-vr)/vs, violations:string[]=[];
  if(current>limit+EPS)violations.push('AMPACITY'); if(Math.abs(drop)>maxDrop+EPS)violations.push('VOLTAGE_DROP');
  return {inputKW:outputKW+loss,outputKW,lossKW:loss,currentA:current,receivingVoltageV:vr,voltageDropRatio:drop,resistanceOhm:r,outputKvar:q,inputKvar:q+multiplier*current*current*x/1000,withinLimits:!violations.length,violations};
}

export interface ThermalConfig { enabled:boolean; thermalResistanceCPerKW:Nullable; heatCapacityKWhPerC:Nullable; maximumConductorC:Nullable; ampacityByAmbientC:CurvePoint[]|null }
/** Exact first-order RC temperature update for piecewise-constant loss/ambient. */
export function thermalStep(c:ThermalConfig, temperatureC:number, ambientC:number, lossKW:number, hours:number) {
  finite(temperatureC,'temperatureC'); finite(ambientC,'ambientC'); known(lossKW,'lossKW'); known(hours,'hours'); if(!c.enabled)return {temperatureC,derating:1,overTemperature:false};
  const r=positive(c.thermalResistanceCPerKW,'thermalResistanceCPerKW'), cap=positive(c.heatCapacityKWhPerC,'heatCapacityKWhPerC'), limit=finite(c.maximumConductorC,'maximumConductorC'), target=ambientC+r*lossKW;
  const next=target+(temperatureC-target)*Math.exp(-hours/(r*cap)), derating=interpolate(c.ampacityByAmbientC,ambientC,'ampacityByAmbientC'); known(derating,'derating',0,1);
  return {temperatureC:next,derating,overTemperature:next>limit+EPS};
}

export interface EfficiencyCurveConfig { enabled:boolean; ratedOutputKW:Nullable; points:CurvePoint[]|null; referenceTemperatureC:Nullable; temperatureCoefficientPerC:Nullable; standbyKW:Nullable }
/** Curve y is conversion efficiency excluding separately declared standbyKW.
 * This model REPLACES fixed eta. Never multiply by fixed eta again.
 */
export function converterForOutput(c:EfficiencyCurveConfig, outputKW:number, temperatureC:number, energized=true) {
  known(outputKW,'outputKW'); finite(temperatureC,'temperatureC'); if(!c.enabled)return {inputKW:outputKW,outputKW,lossKW:0,efficiency:1,withinLimits:true};
  const rated=positive(c.ratedOutputKW,'ratedOutputKW'), standby=known(c.standbyKW,'standbyKW'), reference=finite(c.referenceTemperatureC,'referenceTemperatureC'), slope=finite(c.temperatureCoefficientPerC,'temperatureCoefficientPerC');
  if(!energized){if(outputKW>EPS)return fail('outputKW','未帶電設備不能輸出。');return {inputKW:0,outputKW:0,lossKW:0,efficiency:1,withinLimits:true};}
  const fraction=outputKW/rated, clamped=Math.min(1,fraction), correction=slope*(temperatureC-reference), efficiency=eta(interpolate(c.points,clamped,'points')+correction,'curve.efficiency');
  // A monotone aggregate input law is essential for backward capacity search.
  for(let i=1;i<(c.points?.length??0);i++){const a=c.points![i-1],b=c.points![i],ax=finite(a.x,'point.x'),ay=finite(a.y,'point.y'),bx=finite(b.x,'point.x'),by=finite(b.y,'point.y'),m=(by-ay)/(bx-ax);if(ay+correction-ax*m<=0)return fail('points','此曲線在目前溫度會產生非單調輸入，無法用可行容量二分。');}
  const input=outputKW/efficiency+standby;return {inputKW:input,outputKW,lossKW:input-outputKW,efficiency,withinLimits:outputKW<=rated+EPS};
}

export interface TransformerLossConfig { enabled:boolean; ratedKVA:Nullable; noLoadKW:Nullable; ratedCopperKW:Nullable; noLoadKvar:Nullable; ratedLeakageKvar:Nullable; ratedCopperTemperatureC:Nullable; windingTemperatureC:Nullable; copperResistanceAlphaPerC:Nullable }
/** Rating is at receiving-side apparent power for the load fraction; caller must
 * additionally enforce nameplate input/output convention. Replaces fixed eta.
 */
export function transformerForOutput(c:TransformerLossConfig, outputKW:number, outputKvar:number, energized=true) {
  known(outputKW,'outputKW');finite(outputKvar,'outputKvar');if(!c.enabled)return {inputKW:outputKW,outputKW,lossKW:0,inputKvar:outputKvar,outputKvar,loadFraction:0,withinLimits:true};
  const rated=positive(c.ratedKVA,'ratedKVA'), iron=known(c.noLoadKW,'noLoadKW'), copper=known(c.ratedCopperKW,'ratedCopperKW'), q0=known(c.noLoadKvar,'noLoadKvar'), qLeak=known(c.ratedLeakageKvar,'ratedLeakageKvar'), ref=finite(c.ratedCopperTemperatureC,'ratedCopperTemperatureC'), temp=finite(c.windingTemperatureC,'windingTemperatureC'), alpha=known(c.copperResistanceAlphaPerC,'copperResistanceAlphaPerC'), correction=1+alpha*(temp-ref);
  if(correction<=0)return fail('windingTemperatureC','銅損溫度係數無效。');if(!energized){if(outputKW||outputKvar)return fail('outputKW','未帶電箱變不能輸出。');return {inputKW:0,outputKW:0,lossKW:0,inputKvar:0,outputKvar:0,loadFraction:0,withinLimits:true};}
  const fraction=Math.hypot(outputKW,outputKvar)/rated, loss=iron+copper*fraction*fraction*correction, inputKW=outputKW+loss, inputKvar=outputKvar+q0+qLeak*fraction*fraction;
  return {inputKW,outputKW,lossKW:loss,inputKvar,outputKvar,loadFraction:fraction,withinLimits:Math.hypot(inputKW,inputKvar)<=rated+EPS};
}

export interface CompensationConfig { enabled:boolean; maximumKvar:Nullable; targetPowerFactor:Nullable; stepKvar:Nullable; lossKWPerKvar:Nullable; allowLeading:boolean }
/** Automatic lagging PF correction at ONE declared bus; reactive flow must then
 * propagate upstream. Does not directly multiply or reduce active energy.
 */
export function compensate(c:CompensationConfig, activeKW:number, reactiveKvar:number) {
  known(activeKW,'activeKW');finite(reactiveKvar,'reactiveKvar');const base={activeKW,reactiveKvar,apparentKVA:Math.hypot(activeKW,reactiveKvar),powerFactor:activeKW||reactiveKvar?activeKW/Math.hypot(activeKW,reactiveKvar):1,compensationKvar:0,lossKW:0};if(!c.enabled)return base;
  const max=known(c.maximumKvar,'maximumKvar'), target=eta(c.targetPowerFactor,'targetPowerFactor'), step=positive(c.stepKvar,'stepKvar'), unitLoss=known(c.lossKWPerKvar,'lossKWPerKvar'), targetQ=activeKW*Math.sqrt(1-target*target)/target;
  const desired=Math.max(0,reactiveKvar-targetQ), raw=Math.min(max,desired), selected=Math.floor((raw+EPS)/step)*step, qc=c.allowLeading?selected:Math.min(Math.max(0,reactiveKvar),selected), loss=qc*unitLoss, p=activeKW+loss,q=reactiveKvar-qc;
  return {activeKW:p,reactiveKvar:q,apparentKVA:Math.hypot(p,q),powerFactor:p||q?p/Math.hypot(p,q):1,compensationKvar:qc,lossKW:loss};
}

export interface StorageConfig { enabled:boolean; capacityKWh:Nullable; minSOC:Nullable; maxSOC:Nullable; chargeKW:Nullable; dischargeKW:Nullable; chargeEfficiency:Nullable; dischargeEfficiency:Nullable; selfDischargePerHour:Nullable; calendarFadePerDay:Nullable; cycleFadePerEquivalentCycle:Nullable }
export interface StorageState { energyKWh:number; soh:number; equivalentCycles:number }
export const emptyStorage=():StorageConfig=>({enabled:false,capacityKWh:null,minSOC:null,maxSOC:null,chargeKW:null,dischargeKW:null,chargeEfficiency:null,dischargeEfficiency:null,selfDischargePerHour:null,calendarFadePerDay:null,cycleFadePerEquivalentCycle:null});
function storageValues(c:StorageConfig,s:StorageState){const capacity=positive(c.capacityKWh,'capacityKWh'),min=known(c.minSOC,'minSOC',0,1),max=known(c.maxSOC,'maxSOC',0,1);if(min>=max)return fail('minSOC','須低於 maxSOC。');const soh=known(s.soh,'state.soh',0,1);known(s.energyKWh,'state.energyKWh',0,capacity*soh*(1+EPS));known(s.equivalentCycles,'state.equivalentCycles');return {capacity,min,max,soh,charge:known(c.chargeKW,'chargeKW'),discharge:known(c.dischargeKW,'dischargeKW'),etaC:eta(c.chargeEfficiency,'chargeEfficiency'),etaD:eta(c.dischargeEfficiency,'dischargeEfficiency'),decay:known(c.selfDischargePerHour,'selfDischargePerHour'),calendar:known(c.calendarFadePerDay,'calendarFadePerDay',0,1),cycle:known(c.cycleFadePerEquivalentCycle,'cycleFadePerEquivalentCycle',0,1)};}
/** Constant-rate energy ODE: dE/dt = etaC*Pcharge - Pdischarge/etaD - lambda*E.
 * Controller must split at boundaryHours; no implicit simultaneous charge/discharge.
 */
export function storageBoundaryHours(c:StorageConfig,s:StorageState,inputKW:number,outputKW:number):number {
  known(inputKW,'inputKW');known(outputKW,'outputKW');if(!c.enabled)return inputKW||outputKW?fail('enabled','停用儲能不能充放電。'):Infinity;const v=storageValues(c,s);if(inputKW>EPS&&outputKW>EPS)return fail('dispatch','禁止同時充放電。');if(inputKW>v.charge+EPS||outputKW>v.discharge+EPS)return fail('dispatch','超過儲能端口功率。');
  const q=v.etaC*inputKW-outputKW/v.etaD, target=q>0?v.capacity*v.soh*v.max:v.capacity*v.soh*v.min;
  if(!inputKW&&!outputKW)return Infinity;if(q>0&&s.energyKWh>=target-EPS||q<0&&s.energyKWh<=target+EPS)return 0;
  const fadeRate=v.calendar/24+v.cycle*(v.etaC*inputKW+outputKW/v.etaD)/(2*v.capacity);
  if(fadeRate>0){
    const life=v.soh/fadeRate,ratio=q>0?v.max:v.min;
    const energyAt=(h:number)=>v.decay?s.energyKWh*Math.exp(-v.decay*h)+q*(-Math.expm1(-v.decay*h))/v.decay:s.energyKWh+q*h;
    const difference=(h:number)=>energyAt(h)-v.capacity*ratio*Math.max(0,v.soh-fadeRate*h);
    // The operation may terminate at exhausted SOH even before the lower SOC threshold.
    if(q<0&&difference(life)>0)return life;
    let low=0,high=life;for(let i=0;i<100;i++){const mid=(low+high)/2,over=q>0?difference(mid)>=0:difference(mid)<=0;if(over)high=mid;else low=mid;}return high;
  }
  if(!v.decay)return (target-s.energyKWh)/q;
  const equilibrium=q/v.decay, ratio=(target-equilibrium)/(s.energyKWh-equilibrium);return ratio>0&&ratio<1?-Math.log(ratio)/v.decay:Infinity;
}
export function storageStep(c:StorageConfig,s:StorageState,inputKW:number,outputKW:number,hours:number) {
  known(hours,'hours');known(inputKW,'inputKW');known(outputKW,'outputKW');if(!c.enabled){if(inputKW||outputKW)return fail('enabled','停用儲能不能充放電。');return {state:{...s},inputKWh:0,outputKWh:0,lossKWh:0,selfDischargeKWh:0,capacitySpillKWh:0,storageDeltaKWh:0,balanceResidual:0,boundaryHours:Infinity};}
  const v=storageValues(c,s),boundary=storageBoundaryHours(c,s,inputKW,outputKW);if(hours>boundary+1e-8)return fail('hours',`請先在 SOC 邊界 ${boundary} 小時切分事件。`);
  const input=inputKW*hours,output=outputKW*hours,q=v.etaC*inputKW-outputKW/v.etaD;
  const decayFactor=Math.exp(-v.decay*hours), unaged=v.decay?s.energyKWh*decayFactor+q*(-Math.expm1(-v.decay*hours))/v.decay:s.energyKWh+q*hours;
  const self=Math.max(0,s.energyKWh+q*hours-unaged), cycles=(input*v.etaC+output/v.etaD)/(2*v.capacity), newSoh=Math.max(0,v.soh-v.calendar*hours/24-v.cycle*cycles), available=v.capacity*newSoh, spill=Math.max(0,unaged-available), next=Math.max(0,unaged-spill), loss=input*(1-v.etaC)+output*(1/v.etaD-1)+self+spill, delta=next-s.energyKWh;
  return {state:{energyKWh:next,soh:newSoh,equivalentCycles:s.equivalentCycles+cycles},inputKWh:input,outputKWh:output,lossKWh:loss,selfDischargeKWh:self,capacitySpillKWh:spill,storageDeltaKWh:delta,balanceResidual:input-output-loss-delta,boundaryHours:boundary};
}
export interface StoragePolicy { mode:'SELF_CONSUMPTION'|'TOU'|'RESERVE'|'MANUAL'; chargeBelow:Nullable; dischargeAbove:Nullable; reserveSOC:Nullable; manualKW:Nullable }
/** Positive result charges, negative discharges. Residual load is after PV.
 * Source/sink availability and boundary slicing remain allocator responsibilities.
 */
export function storageDispatch(c:StorageConfig,s:StorageState,policy:StoragePolicy,gridPrice:number,residualLoadKW:number,gridAvailable=true) {
  finite(gridPrice,'gridPrice');finite(residualLoadKW,'residualLoadKW');if(!c.enabled)return 0;const v=storageValues(c,s),soc=v.soh?s.energyKWh/(v.capacity*v.soh):0, reserve=known(policy.reserveSOC,'reserveSOC',v.min,v.max), canC=v.soh>0&&soc<v.max-EPS,canD=v.soh>0&&soc>reserve+EPS;
  if(policy.mode==='MANUAL'){const kw=finite(policy.manualKW,'manualKW');return kw>=0?(canC?Math.min(kw,v.charge):0):(canD?-Math.min(-kw,v.discharge):0);}
  if(residualLoadKW<0)return canC?Math.min(-residualLoadKW,v.charge):0;
  if(policy.mode==='RESERVE')return !gridAvailable&&canD?-Math.min(residualLoadKW,v.discharge):0;
  if(policy.mode==='SELF_CONSUMPTION')return canD?-Math.min(residualLoadKW,v.discharge):0;
  const low=finite(policy.chargeBelow,'chargeBelow'),high=finite(policy.dischargeAbove,'dischargeAbove');if(low>=high)return fail('chargeBelow','谷價門檻須低於峰價門檻。');if(gridAvailable&&gridPrice<=low&&canC)return v.charge;if((!gridAvailable||gridPrice>=high)&&canD)return -Math.min(residualLoadKW,v.discharge);return 0;
}

export interface PvConfig { enabled:boolean; stcKW:Nullable; referenceIrradianceWm2:Nullable; referenceCellC:Nullable; temperatureCoefficientPerC:Nullable; dcDerating:Nullable; mpptEfficiency:Nullable; mpptOutputKW:Nullable; exportLimitKW:Nullable }
export const emptyPv=():PvConfig=>({enabled:false,stcKW:null,referenceIrradianceWm2:null,referenceCellC:null,temperatureCoefficientPerC:null,dcDerating:null,mpptEfficiency:null,mpptOutputKW:null,exportLimitKW:null});
/** Explicit measured/modelled cell temperature and effective irradiance are inputs.
 * Linear STC engineering model; not a claim to reproduce full PVWatts weather pipeline.
 */
export function pvAvailable(c:PvConfig,irradianceWm2:Nullable,cellTemperatureC:Nullable) {
  if(!c.enabled)return {availableDcKW:0,availableBusKW:0,maximumExportKW:0,mpptEfficiency:1};const rated=known(c.stcKW,'stcKW'),g0=positive(c.referenceIrradianceWm2,'referenceIrradianceWm2'),t0=finite(c.referenceCellC,'referenceCellC'),gamma=finite(c.temperatureCoefficientPerC,'temperatureCoefficientPerC'),derate=known(c.dcDerating,'dcDerating',0,1),eff=eta(c.mpptEfficiency,'mpptEfficiency'),limit=known(c.mpptOutputKW,'mpptOutputKW'),exportLimit=known(c.exportLimitKW,'exportLimitKW'),g=known(irradianceWm2,'irradianceWm2'),t=finite(cellTemperatureC,'cellTemperatureC'),temperatureFactor=1+gamma*(t-t0);if(temperatureFactor<0)return fail('cellTemperatureC','溫度輸入使線性光伏模型失效。');
  const availableDcKW=rated*g/g0*temperatureFactor*derate;return {availableDcKW,availableBusKW:Math.min(availableDcKW*eff,limit),maximumExportKW:exportLimit,mpptEfficiency:eff};
}
export function pvForOutput(c:PvConfig,irradianceWm2:Nullable,cellTemperatureC:Nullable,outputKW:number) {
  known(outputKW,'outputKW');const a=pvAvailable(c,irradianceWm2,cellTemperatureC);if(outputKW>a.availableBusKW+EPS)return fail('outputKW','超出光伏當時可供功率。');const generatedDcKW=outputKW/a.mpptEfficiency;return {...a,generatedDcKW,outputKW,lossKW:generatedDcKW-outputKW,curtailedDcKW:a.availableDcKW-generatedDcKW};
}

export interface ProtectionConfig { enabled:boolean; continuousA:Nullable; overloadPickupA:Nullable; overloadDelayHours:Nullable; instantaneousPickupA:Nullable; instantaneousDelayHours:Nullable; interruptionRatingA:Nullable; automaticReset:boolean; resetDelayHours:Nullable }
export interface ProtectionState { closed:boolean; overloadHours:number; faultHours:number; healthyHours:number; trippedReason:'overload'|'fault'|null }
/** Configured definite-time relay/event model, not coordination/arc/EMT certification.
 * Fault current is a supplied study/event input; never invented from kW demand.
 */
export function protectionStep(c:ProtectionConfig,s:ProtectionState,currentA:number,faultA:Nullable,hours:number,manualReset=false) {
  known(currentA,'currentA');known(hours,'hours');if(!c.enabled)return {state:{...s},nextBoundaryHours:Infinity,breakingRatingExceeded:false};const continuous=positive(c.continuousA,'continuousA'),pick=positive(c.overloadPickupA,'overloadPickupA'),delay=known(c.overloadDelayHours,'overloadDelayHours'),instant=positive(c.instantaneousPickupA,'instantaneousPickupA'),instantDelay=known(c.instantaneousDelayHours,'instantaneousDelayHours'),breaking=positive(c.interruptionRatingA,'interruptionRatingA'),reset=c.automaticReset?known(c.resetDelayHours,'resetDelayHours'):Infinity;if(pick<continuous||instant<pick)return fail('overloadPickupA','保護整定須 continuous ≤ overload ≤ instantaneous。');const fault=known(faultA,'faultA'),isFault=fault>=instant,isOver=currentA>=pick,healthy=!isFault&&!isOver;
  const next={...s};let boundary=Infinity;if(s.closed){const tf=isFault?Math.max(0,instantDelay-s.faultHours):Infinity,to=isOver?Math.max(0,delay-s.overloadHours):Infinity;boundary=Math.min(tf,to);if(hours>boundary+1e-9)return fail('hours',`請在保護動作 ${boundary} 小時切分事件。`);next.faultHours=isFault?s.faultHours+hours:0;next.overloadHours=isOver?s.overloadHours+hours:0;next.healthyHours=healthy?s.healthyHours+hours:0;if(isFault&&next.faultHours>=instantDelay-EPS){next.closed=false;next.trippedReason='fault';}else if(isOver&&next.overloadHours>=delay-EPS){next.closed=false;next.trippedReason='overload';}}
  else{if(c.automaticReset&&healthy){boundary=Math.max(0,reset-s.healthyHours);if(hours>boundary+1e-9)return fail('hours',`請在保護復歸 ${boundary} 小時切分事件。`);}next.healthyHours=healthy?s.healthyHours+hours:0;if(healthy&&(manualReset||c.automaticReset&&next.healthyHours>=reset-EPS)){next.closed=true;next.trippedReason=null;next.overloadHours=0;next.faultHours=0;next.healthyHours=0;}}
  return {state:next,nextBoundaryHours:boundary,breakingRatingExceeded:fault>breaking};
}

export interface AtsConfig { enabled:boolean; preferred:'normal'|'backup'; failDelayHours:Nullable; transferDeadHours:Nullable; returnDelayHours:Nullable; automaticReturn:boolean }
export interface AtsState { selected:'normal'|'backup'|null; pending:'normal'|'backup'|null; healthySinceHours:number|null; unavailableSinceHours:number|null; deadUntilHours:number|null }
/** Absolute-time open-transition selector. Exactly one source may be selected.
 * Invoke at all health changes and nextEventHour. Grid parallel closure is impossible.
 */
export function atsAt(c:AtsConfig,s:AtsState,timeHours:number,normalHealthy:boolean,backupHealthy:boolean) {
  known(timeHours,'timeHours');if(!c.enabled)return {state:{...s,selected:normalHealthy?'normal' as const:null,pending:null,deadUntilHours:null},nextEventHour:Infinity};const failDelay=known(c.failDelayHours,'failDelayHours'),dead=known(c.transferDeadHours,'transferDeadHours'),ret=c.automaticReturn?known(c.returnDelayHours,'returnDelayHours'):Infinity;
  const next={...s},health={normal:normalHealthy,backup:backupHealthy},preferred=c.preferred,other=preferred==='normal'?'backup':'normal';let event=Infinity;
  if(next.deadUntilHours!==null){if(timeHours+EPS<next.deadUntilHours)return {state:next,nextEventHour:next.deadUntilHours};next.selected=next.pending&&health[next.pending]?next.pending:null;next.pending=null;next.deadUntilHours=null;next.unavailableSinceHours=null;}
  const desired=health[preferred]?preferred:health[other]?other:null;
  if(next.selected&&!health[next.selected]) {if(next.unavailableSinceHours===null)next.unavailableSinceHours=timeHours;const when=next.unavailableSinceHours+failDelay;if(timeHours+EPS<when)return {state:next,nextEventHour:when};next.selected=null;next.pending=desired;next.deadUntilHours=timeHours+dead;next.healthySinceHours=null;return {state:next,nextEventHour:next.deadUntilHours};}
  next.unavailableSinceHours=null;
  if(!next.selected&&desired){next.pending=desired;next.deadUntilHours=timeHours+dead;return {state:next,nextEventHour:next.deadUntilHours};}
  if(next.selected&&next.selected!==preferred&&health[preferred]&&c.automaticReturn){if(next.healthySinceHours===null)next.healthySinceHours=timeHours;const when=next.healthySinceHours+ret;if(timeHours+EPS>=when){next.selected=null;next.pending=preferred;next.deadUntilHours=timeHours+dead;next.healthySinceHours=null;event=next.deadUntilHours;}else event=when;}else next.healthySinceHours=null;
  return {state:next,nextEventHour:event};
}

/** Storage-aware site boundary. Include ONLY boundary sources/terminals once. */
export function siteEnergyResidual(v:{gridImportKWh:number;pvGenerationKWh:number;exportKWh:number;deliveredKWh:number;auxiliaryKWh:number;lossKWh:number;swapBatteryDeltaKWh:number;essDeltaKWh:number;upsDeltaKWh:number}) {
  for(const [key,value] of Object.entries(v))finite(value,key);return v.gridImportKWh+v.pvGenerationKWh-v.exportKWh-v.deliveredKWh-v.auxiliaryKWh-v.lossKWh-v.swapBatteryDeltaKWh-v.essDeltaKWh-v.upsDeltaKWh;
}
