import {detailedVerificationProjects} from '../../packages/detailed-verification/index.ts';
import {compareDetailedResult,auditLedgers} from './detailed-checks.ts';
import {simulateDetailed} from '../../packages/detailed-model/engine.ts';
import fs from 'node:fs';
import crypto from 'node:crypto';
const root=process.cwd();
const sources=['packages','plugins','data/verification','scripts/verification'].flatMap(dir=>fs.readdirSync(dir,{recursive:true}).map(String).filter(f=>/\.(ts|json|py)$/.test(f)).map(file=>`${dir}/${file}`));
const sourceSHA256=Object.fromEntries(sources.map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
const results=[];
for(const c of detailedVerificationProjects()){
 const started=Date.now();
 try{const result=simulateDetailed(c.project),comparison=compareDetailedResult(c.id,result),ledgers=auditLedgers(result);results.push({id:c.id,status:'passed',durationMs:Date.now()-started,comparison,ledgers,totals:result.totals,energy:result.detailedResult!.energy});}
 catch(error){results.push({id:c.id,status:'failed',durationMs:Date.now()-started,error:String(error)});}
}
const report={format:'HighwaySwapSim.DetailedIntegrationVerification',timestamp:new Date().toISOString(),sourceSHA256,oracle:'data/verification/detailed-expected.json; independent Python Decimal70',inputFactory:'packages/detailed-verification/index.ts',allPassed:results.every(r=>r.status==='passed'),results};
const out=process.argv[2]??'artifacts/verification/detailed-comparison.json';fs.mkdirSync(out.slice(0,out.lastIndexOf('/')),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({allPassed:report.allPassed,cases:results.map(r=>({id:r.id,status:r.status,error:r.error,checks:r.comparison?.checks,ledgerChecks:r.ledgers?.checks,maxDelta:r.comparison?.maxDelta,ledgerMaxDelta:r.ledgers?.maxDelta})),report:out}));if(!report.allPassed)process.exitCode=1;
