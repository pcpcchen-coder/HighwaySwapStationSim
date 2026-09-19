import type {Project,RunResult} from '../contracts/index.ts';
import {equipmentEfficiency} from '../equipment-efficiency/index.ts';

/** Counterfactual conversion cost, not a dispatch/capacity simulation of PCS.
 * Replace each SST by a transformer + PCS supplying exactly its observed DC
 * bus output. Preserve the downstream DC/DC mix and normalize both paths to
 * the same inventory-adjusted customer delivery. Transformer efficiencies are
 * taken from the corresponding site's transformer, without using its spare
 * capacity or routing the replacement through the existing AC/DC chargers.
 */
export function sstPcsComparison(p:Project,run:Pick<RunResult,'componentEnergy'>,dcDeliveredKWh:number,pcsEfficiency:number,energyValueCnyPerKWh:number){
 const unavailable={sstConversionEfficiency:null,pcsReferenceEfficiency:null,sstComparisonInputKWh:null,pcsComparisonInputKWh:null,conversionSavedKWh:null,conversionSavingCNY:null};
 const d=p.detailed;
 if(!d||p.efficiency.mode!=='ASSEMBLY'||!(pcsEfficiency>0&&pcsEfficiency<=1)||!Number.isFinite(dcDeliveredKWh)||dcDeliveredKWh<0||!Number.isFinite(energyValueCnyPerKWh)||energyValueCnyPerKWh<0||
  d.storage.some(s=>s.config.enabled)||d.solar.some(s=>s.config.enabled)||d.backup.some(s=>s.config.enabled)||d.physics.some(m=>m.cable.enabled||m.curve.enabled||m.transformer.enabled||m.compensation.enabled))return unavailable;
 let output=0,sstInput=0,pcsInput=0;
 for(const station of ['A','B'] as const){
  output+=run.componentEnergy.filter(e=>e.nodeId===`${station}-dd-group-sst`).reduce((v,e)=>v+e.outputKWh,0);
  const ids=new Set(p.topology.nodes.filter(n=>n.type==='sst'&&n.station===station).map(n=>n.id));
  const energy=run.componentEnergy.filter(e=>ids.has(e.nodeId));
  const busOutput=energy.reduce((v,e)=>v+e.outputKWh,0);
  sstInput+=energy.reduce((v,e)=>v+e.inputKWh,0);
  const transformer=p.topology.nodes.find(n=>n.id===`${station}-transformer`&&n.type==='transformer');
  if(busOutput>0){if(!transformer)return unavailable;pcsInput+=busOutput/(equipmentEfficiency(p,transformer)*pcsEfficiency);}
 }
 const sstConversionEfficiency=output>0&&sstInput>0?output/sstInput:null;
 const pcsReferenceEfficiency=output>0&&pcsInput>0?output/pcsInput:null;
 if(dcDeliveredKWh===0)return {...unavailable,sstConversionEfficiency,pcsReferenceEfficiency,sstComparisonInputKWh:0,pcsComparisonInputKWh:0,conversionSavedKWh:0,conversionSavingCNY:0};
 if(sstConversionEfficiency===null||pcsReferenceEfficiency===null)return unavailable;
 const sstComparisonInputKWh=dcDeliveredKWh/sstConversionEfficiency,pcsComparisonInputKWh=dcDeliveredKWh/pcsReferenceEfficiency;
 const difference=pcsComparisonInputKWh-sstComparisonInputKWh;
 // Suppress only floating-point cancellation at genuinely equal efficiencies.
 const conversionSavedKWh=Math.abs(difference)<=64*Number.EPSILON*Math.max(1,pcsComparisonInputKWh,sstComparisonInputKWh)?0:difference;
 return {sstConversionEfficiency,pcsReferenceEfficiency,sstComparisonInputKWh,pcsComparisonInputKWh,conversionSavedKWh,conversionSavingCNY:conversionSavedKWh*energyValueCnyPerKWh};
}
