import { z } from 'zod';
import type { Equipment, Project } from '../contracts/index.ts';
import { projectSchema, parseProject } from '../schemas/index.ts';
import { equipmentRegistry } from '../../plugins/equipment/index.ts';
import { supportsEfficiency } from '../equipment-efficiency/index.ts';
import { validateTopology } from '../topology-engine/index.ts';
import { csvCell, csvRecords } from '../tabular/index.ts';
const FORMAT='HighwaySwapSim.EquipmentProfile';
const COLUMNS=['equipmentId','type','field','value'] as const;
const settingsSchema=projectSchema.innerType().pick({phase:true,station:true,efficiency:true,topology:true,equipmentSchedule:true,engineering:true,detailed:true}).extend({engineering:projectSchema.innerType().shape.engineering.unwrap().nullable()}).strict();
const fileSchema=z.object({format:z.literal(FORMAT),version:z.literal(1),settings:settingsSchema}).strict();
function rejectDroppedFields(raw:unknown,parsed:unknown,path='file'){
 if(raw&&typeof raw==='object'){const r=raw as Record<string,unknown>,p=parsed as Record<string,unknown>;for(const key of Object.keys(r)){if(!p||!Object.hasOwn(p,key))throw Error(`未知欄位 ${path}.${key}；未套用設定。`);rejectDroppedFields(r[key],p[key],`${path}.${key}`);}}
}
// Reversible apostrophe escape prevents spreadsheet formula evaluation of text.
const needsEscape=(s:string)=>/^[\s]*[=+\-@']/.test(s)||/^[\t\r\n]/.test(s);
const spreadsheetText=(s:string)=>needsEscape(s)?"'"+s:s;
const fromSpreadsheet=(s:string)=>s.startsWith("'")&&needsEscape(s.slice(1))?s.slice(1):s;
export function parameterNote(n:Equipment,key:string){
 if(key==='efficiency')return '轉換效率；未設定時沿用全域';
 if(key==='outputEfficiency')return '舊版規格紀錄，不參與計算；有效效率由全域或個別效率決定';
 if(key==='kWh')return '規格紀錄；庫存容量由「站務配置」決定';
 if(key==='slots'||key==='swapSeconds')return '乘用車設計紀錄；完整營運參數於完整模型設定';
 if(key==='length')return '設計長度紀錄；啟用阻抗模型時，請於完整模型設定填 lengthM';
 if(key==='kvar')return '補償銘牌紀錄；啟用補償時，請於完整模型設定填 maximumKvar';
 return equipmentRegistry.get(n.type).parameters.some(p=>p.key===key)?'參與額定／容量限制':'額外規格紀錄，未參與計算';
}
export function editableParameter(n:Equipment,key:string){return key==='efficiency'?supportsEfficiency(n.type):equipmentRegistry.get(n.type).parameters.some(p=>p.key===key)&&!['length','kvar'].includes(key);}
export function setEquipmentEfficiency(p:Project,id:string,value:number|null):Project{
 const node=p.topology.nodes.find(n=>n.id===id);if(!node||!supportsEfficiency(node.type))throw Error('此設備不支援個別轉換效率。');
 if(value!==null&&(!Number.isFinite(value)||value<=0||value>1||p.efficiency.mode!=='ASSEMBLY'))throw Error('請選設備組裝模式，效率須大於 0 且不超過 100%。');
 const params={...node.params};if(value===null)delete params.efficiency;else params.efficiency=value;
 return {...p,topology:{...p.topology,nodes:p.topology.nodes.map(n=>n.id===id?{...n,params}:n)}};
}
function checked(p:Project):Project{
 const parsed=parseProject(p),issues=validateTopology(parsed.topology).filter(d=>d.severity==='error');
 if(!p.engineering)for(const station of ['A','B'])if(!p.topology.nodes.some(n=>n.id===`${station}-charger`&&n.type==='charger'))throw Error(`簡化站務缺少必要設備 ${station}-charger。`);
 if(p.efficiency.mode==='SOURCE_CHAIN'&&(p.efficiency.sstSource>p.efficiency.charger||p.efficiency.pcsSource>p.efficiency.pcs*p.efficiency.charger))throw Error('來源全流程效率與分段效率不相容，校準後效率不可超過 100%。');
 // Check scheduled activations as well as the current wiring.
 const scheduled=structuredClone(parsed.topology);
 for(const at of [...new Set(parsed.equipmentSchedule.map(e=>e.atMinute))].sort((a,b)=>a-b)){
  for(const event of parsed.equipmentSchedule.filter(e=>e.atMinute===at)){const n=scheduled.nodes.find(n=>n.id===event.equipmentId);if(n)n.enabled=event.enabled;}
  issues.push(...validateTopology(scheduled).filter(d=>d.severity==='error'));
 }
 if(issues.length)throw Error(issues.slice(0,8).map(d=>d.message).join('\n'));
 if(p.engineering&&p.efficiency.mode!=='ASSEMBLY')throw Error('完整設備案例須使用設備組裝效率模式。');
 return p;
}
export function exportEquipmentJSON(p:Project){checked(p);return JSON.stringify({format:FORMAT,version:1,settings:{phase:p.phase,engineering:p.engineering??null,station:p.station,efficiency:p.efficiency,topology:p.topology,equipmentSchedule:p.equipmentSchedule,...(p.detailed?{detailed:p.detailed}:{})}},null,2);}
export function exportEquipmentCSV(p:Project){checked(p);const rows:string[][]=[];
 for(const n of p.topology.nodes){for(const field of ['name','enabled','x','y'] as const)rows.push([n.id,n.type,field,String(n[field])]);
  for(const [key,value] of Object.entries(n.params))rows.push([n.id,n.type,`params.${key}`,String(value)]);
  if(supportsEfficiency(n.type)&&n.params.efficiency===undefined)rows.push([n.id,n.type,'params.efficiency','']);
 }
 return '\uFEFF'+[COLUMNS,...rows].map(r=>r.map(v=>csvCell(spreadsheetText(v))).join(',')).join('\r\n')+'\r\n';
}
export function importEquipmentProfile(p:Project,content:string,format:'csv'|'json'):{project:Project;rows:number}{
 if(new TextEncoder().encode(content).length>8*1024*1024)throw Error('設備設定檔上限為 8 MiB。');const text=content.replace(/^\uFEFF/,'');
 if(format==='json'){let raw:unknown;try{raw=JSON.parse(text);}catch{throw Error('設備 JSON 格式錯誤。');}const parsed=fileSchema.safeParse(raw);if(!parsed.success)throw Error('請使用「整套設備 JSON」格式；設定欄位、資料型別或數值範圍不合法。');
  rejectDroppedFields(raw,parsed.data);
  const s=parsed.data.settings,candidate:Project={...p,phase:s.phase,station:s.station,efficiency:s.efficiency,topology:s.topology,equipmentSchedule:s.equipmentSchedule};
  for(const n of s.topology.nodes){const allowed=new Set(equipmentRegistry.get(n.type).parameters.map(f=>f.key));if(supportsEfficiency(n.type))allowed.add('efficiency');for(const key of ({transformer:['outputEfficiency'],rack:['kWh'],passenger:['slots','swapSeconds']} as Record<string,string[]>)[n.type]??[])allowed.add(key);
   for(const key of Object.keys(n.params))if(!allowed.has(key)){const previous=p.topology.nodes.find(x=>x.id===n.id&&x.type===n.type);if(!previous||!Object.hasOwn(previous.params,key)||previous.params[key]!==n.params[key])throw Error(`${n.id}: 未知或未實作參數 ${key}。`);}
  }
  if(s.detailed)candidate.detailed=s.detailed;else delete candidate.detailed;
  if(s.engineering)candidate.engineering=s.engineering;else delete candidate.engineering;
  return {project:checked(candidate),rows:s.topology.nodes.length};
 }
 const records=csvRecords(text,20001),header=records.shift();if(!header||header.length!==4||new Set(header).size!==4||COLUMNS.some(c=>!header.includes(c)))throw Error(`CSV 欄位須為 ${COLUMNS.join(',')}。`);
 if(!records.length)throw Error('設備 CSV 沒有資料。');const nodes=new Map(p.topology.nodes.map(n=>[n.id,n])),updates=new Map<string,Equipment>(),seen=new Set<string>();
 for(let i=0;i<records.length;i++){const cells=records[i];if(cells.length!==4)throw Error(`第 ${i+2} 行欄位數不符。`);const row=Object.fromEntries(header.map((h,j)=>[h,fromSpreadsheet(cells[j])])),id=row.equipmentId,node=nodes.get(id),field=row.field,value=row.value;
  if(!node||node.type!==row.type)throw Error(`第 ${i+2} 行設備 ID／類型與目前設計不符；新增或更換拓撲請用整套設備 JSON。`);
  const unique=JSON.stringify([id,field]);if(seen.has(unique))throw Error(`重複設定：${id} ${field}`);seen.add(unique);
  const next=updates.get(id)??{...node,params:{...node.params}};updates.set(id,next);
  if(field==='name'){if(!value.trim()||value.length>120)throw Error(`${id}: 名稱須為 1–120 字。`);next.name=value;continue;}
  if(field==='enabled'){if(value!=='true'&&value!=='false')throw Error(`${id}: enabled 須為 true 或 false。`);next.enabled=value==='true';continue;}
  const key=field.startsWith('params.')?field.slice(7):null;
  if(key==='efficiency'&&value.trim()===''){if(!supportsEfficiency(node.type))throw Error(`${id}: 此設備沒有轉換效率。`);delete next.params.efficiency;continue;}
  if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())||!Number.isFinite(Number(value)))throw Error(`${id} ${field}: 須填有限數字，空白僅限繼承效率。`);const number=Number(value);
  if(field==='x'||field==='y'){next[field]=number;continue;}
  if(!key||(key!=='efficiency'&&!Object.hasOwn(node.params,key)))throw Error(`${id}: 未知參數 ${field}`);
  if(!editableParameter(node,key)&&number!==node.params[key])throw Error(`${id} ${key}: ${parameterNote(node,key)}，請勿在參數 CSV 改動此紀錄欄。`);
  if(key==='efficiency'&&(!supportsEfficiency(node.type)||number<=0||number>1))throw Error(`${id}: efficiency 須為 (0,1]，例如 98% 請填 0.98。`);
  next.params[key]=number;
 }
 const candidate={...p,topology:{...p.topology,nodes:p.topology.nodes.map(n=>updates.get(n.id)??n)}};
 return {project:checked(candidate),rows:updates.size};
}
