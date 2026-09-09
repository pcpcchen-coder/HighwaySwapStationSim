import type {Project} from '../contracts/index.ts';
import {parseDetailedDraft} from '../detailed-model/schema.ts';
import {csvCell,csvRecords} from '../tabular/index.ts';
const FORMAT='HighwaySwapSim.DetailedProfile';
type Value=null|string|number|boolean|Value[]|{[key:string]:Value};
const esc=(s:string)=>s.replaceAll('~','~0').replaceAll('/','~1');
const unesc=(s:string)=>s.replaceAll('~1','/').replaceAll('~0','~');
const spreadsheet=(s:string)=>/^[\s]*[=+\-@']/.test(s)?"'"+s:s;
const undo=(s:string)=>s.startsWith("'")&&/^[\s]*[=+\-@']/.test(s.slice(1))?s.slice(1):s;
export function detailedRows(value:unknown):string[][]{
 const rows:string[][]=[];
 function walk(v:Value,path:string){
  if(Array.isArray(v)){rows.push([path,'array',String(v.length)]);v.forEach((x,i)=>walk(x,`${path}/${i}`));}
  else if(v!==null&&typeof v==='object'){rows.push([path,'object',JSON.stringify(Object.keys(v))]);for(const [key,x]of Object.entries(v))walk(x,`${path}/${esc(key)}`);}
  else rows.push([path,'value',JSON.stringify(v)]);
 }
 walk(value as Value,'');return rows;
}
export function exportDetailedJSON(p:Project){if(!p.detailed)throw Error('尚未啟用完整模型');return JSON.stringify({format:FORMAT,version:1,settings:parseDetailedDraft(p.detailed)},null,2);}
export function exportDetailedCSV(p:Project){if(!p.detailed)throw Error('尚未啟用完整模型');const value={format:FORMAT,version:1,settings:parseDetailedDraft(p.detailed)};return '\uFEFF'+[['path','type','value'],...detailedRows(value)].map(r=>r.map(v=>csvCell(spreadsheet(v))).join(',')).join('\r\n')+'\r\n';}
export function importDetailedProfile(p:Project,content:string,format:'json'|'csv'):Project{
 if(new TextEncoder().encode(content).length>8*1024*1024)throw Error('完整設定檔上限8MiB');let raw:unknown;
 if(format==='json')raw=JSON.parse(content.replace(/^\uFEFF/,''));else{
  const rows=csvRecords(content.replace(/^\uFEFF/,''),100001),header=rows.shift();if(header?.join(',')!=='path,type,value')throw Error('CSV欄位必須為 path,type,value');
  const records=new Map<string,{type:string;value:string}>();for(const cells of rows){if(cells.length!==3)throw Error('CSV每列必須3欄');const [path,type,value]=cells.map(undo);if(records.has(path))throw Error(`重複路徑:${path}`);records.set(path,{type,value});}
  const used=new Set<string>();
  function read(path:string,depth=0):Value{if(depth>30)throw Error('設定巢狀超過上限');const row=records.get(path);if(!row)throw Error(`缺少路徑:${path}`);used.add(path);
   if(row.type==='value'){const value=row.value.trim()===''?null:JSON.parse(row.value);if(value!==null&&typeof value==='object')throw Error(`值欄不能替代結構:${path}`);if(typeof value==='number'&&!Number.isFinite(value))throw Error('非有限數值');return value;}
   if(row.type==='array'){const count=Number(row.value);if(!/^\d+$/.test(row.value)||!Number.isInteger(count)||count>44640)throw Error(`不合法陣列長度:${path}`);return Array.from({length:count},(_,i)=>read(`${path}/${i}`,depth+1));}
   if(row.type==='object'){const keys=JSON.parse(row.value) as unknown;if(!Array.isArray(keys)||keys.some(k=>typeof k!=='string'||['__proto__','prototype','constructor'].includes(k))||new Set(keys).size!==keys.length)throw Error(`不合法物件欄位:${path}`);return Object.fromEntries(keys.map(key=>[key,read(`${path}/${esc(key)}`,depth+1)]));}
   throw Error(`未知CSV類型:${row.type}`);
  }
  raw=read('');if(used.size!==records.size)throw Error('CSV有未被引用的多餘路徑');
 }
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('完整設定格式不正確');const file=raw as Record<string,unknown>;
 if(Object.keys(file).sort().join(',')!=='format,settings,version'||file.format!==FORMAT||file.version!==1)throw Error('請使用HighwaySwapSim完整模型設定v1');
 return {...p,detailed:parseDetailedDraft(file.settings)};
}
