import type { Project, ServiceRow, StationId } from '../contracts/index.ts';
import { serviceRowSchema } from '../schemas/index.ts';

export const SERVICE_COLUMNS=['day','station','hour','swapCount','swapKWh','chargeCount','chargeKWh','gridPrice','swapFee','chargeFee','swapTotalRaw','chargeTotalRaw','idleRaw'] as const;
const FORMAT='HighwaySwapSim.ServiceProfile';
const key=(r:ServiceRow)=>`${r.station}:${r.day}:${r.hour}`;
export type ImportMode='merge'|'replace';
export type ServiceField=Exclude<keyof ServiceRow,'day'|'station'|'hour'|'idleRaw'>;
function error(message:string):never{throw Error(message);}
function checkedRows(input:unknown[],horizon:number,complete:boolean):ServiceRow[]{
 if(!Number.isInteger(horizon)||horizon<1||horizon>31)error('連續天數須為 1–31 天。');
 if(!input.length||input.length>1488)error('需求檔須包含 1–1,488 列資料。');
 const seen=new Set<string>();let count=0;
 const rows=input.map((raw,i)=>{const parsed=serviceRowSchema.safeParse(raw);if(!parsed.success){const issue=parsed.error.issues[0];error(`第 ${i+1} 筆需求：${issue.path.join('.')||'車次／電量'} 不合法。車次須為 0–1,000 整數，數值不可空白或負值；零車次時總 kWh 須為 0。`);}const r=parsed.data;
  if(r.day>=horizon)error(`第 ${i+1} 筆的 day=${r.day+1} 超過目前 ${horizon} 天，請先調整連續天數。`);
  if(seen.has(key(r)))error(`需求重複：第 ${r.day+1} 天 ${r.station} 區 ${r.hour} 時。`);seen.add(key(r));count+=r.swapCount+r.chargeCount;return r;
 });
 if(complete&&rows.length!==horizon*48)error(`取代全期需要 ${horizon*48} 列：每一天 A/B 區各 24 小時；目前 ${rows.length} 列。`);
 if(count>20000)error('全期換電與充電車次合計不得超過 20,000。');
 return rows;
}
function fileRows(p:Project){return checkedRows(p.services,p.horizonDays,true).map(r=>({...r,day:r.day+1}));}
export function exportServiceCSV(p:Project){return '\uFEFF'+[SERVICE_COLUMNS.join(','),...fileRows(p).map(r=>SERVICE_COLUMNS.map(k=>r[k]===null?'':String(r[k])).join(','))].join('\r\n')+'\r\n';}
export function exportServiceJSON(p:Project){return JSON.stringify({format:FORMAT,version:1,dayBase:1,horizonDays:p.horizonDays,rows:fileRows(p)},null,2);}

/** CSV supports BOM, CRLF, quoted/escaped cells; numeric conversion is strict. */
function csvRecords(text:string){const records:string[][]=[];let row:string[]=[],field='',quoted=false,closed=false;
 const cell=()=>{row.push(field);field='';closed=false;};
 const record=()=>{cell();if(row.some(v=>v.trim()!==''))records.push(row);row=[];if(records.length>1489)error('需求檔超過 1,488 列。');};
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;continue;}
  if(c===','){cell();continue;}if(c==='\r'||c==='\n'){record();if(c==='\r'&&text[i+1]==='\n')i++;continue;}
  if(closed){if(c===' '||c==='\t')continue;error('CSV 引號結束後有不合法字元。');}
  if(c==='"'){if(field.trim())error('CSV 引號必須位於儲存格開頭。');field='';quoted=true;}else field+=c;
 }
 if(quoted)error('CSV 引號未關閉。');if(field||row.length||closed)record();return records;
}
function strictRow(raw:unknown,i:number):Record<string,unknown>{if(!raw||typeof raw!=='object'||Array.isArray(raw))error(`第 ${i+1} 筆需求必須是資料物件。`);const r=raw as Record<string,unknown>,keys=Object.keys(r);
 if(keys.length!==SERVICE_COLUMNS.length||SERVICE_COLUMNS.some(k=>!Object.hasOwn(r,k)))error(`第 ${i+1} 筆的欄位不完整或包含未知欄位，請使用匯出的需求格式。`);return r;
}
export function parseServiceFile(content:string,format:'csv'|'json',horizon:number):ServiceRow[]{
 if(new TextEncoder().encode(content).length>2*1024*1024)error('需求檔上限為 2 MB。');const text=content.replace(/^\uFEFF/,'');let rows:unknown[];
 if(format==='json'){let value:unknown;try{value=JSON.parse(text);}catch{error('JSON 格式錯誤。');}const data=value as Record<string,unknown>;
  if(!data||data.format!==FORMAT||data.version!==1||data.dayBase!==1||!Array.isArray(data.rows)||!Number.isInteger(data.horizonDays)||Number(data.horizonDays)<1||Number(data.horizonDays)>31)error('請使用「需求 JSON」格式（version=1、dayBase=1）；完整專案請用上方匯入。');
  rows=data.rows.map((raw,i)=>{const row=strictRow(raw,i);if(typeof row.day!=='number'||!Number.isInteger(row.day)||row.day<1||row.day>Number(data.horizonDays))error(`第 ${i+1} 筆 day 超出檔案宣告天數。`);return {...row,day:row.day-1};});
 }else{const records=csvRecords(text);if(!records.length)error('CSV 是空檔案。');const header=records[0].map(v=>v.trim());
  if(header.length!==SERVICE_COLUMNS.length||new Set(header).size!==header.length||SERVICE_COLUMNS.some(k=>!header.includes(k)))error(`CSV 欄位須完整且不重複：${SERVICE_COLUMNS.join(',')}。請另存為 CSV UTF-8（逗號分隔）。`);
  rows=records.slice(1).map((cells,i)=>{if(cells.length!==header.length)error(`CSV 第 ${i+2} 行欄位數不符。`);const row:Record<string,unknown>={};header.forEach((name,col)=>{const value=cells[col].trim();if(name==='station')row[name]=value;else if(name==='idleRaw'&&(value===''||value==='null'))row[name]=null;else{if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value)||!Number.isFinite(Number(value)))error(`CSV 第 ${i+2} 行 ${name} 須為數字，不可空白、公式或含千分位逗號。`);row[name]=Number(value);}});row.day=Number(row.day)-1;return row;});
 }return checkedRows(rows,horizon,false);
}
/** Atomic keyed replacement preserves original array order and therefore seeded
 * arrival RNG consumption. The importer never changes physical configuration. */
export function importServiceProfile(p:Project,content:string,format:'csv'|'json',mode:ImportMode='merge'){
 const incoming=parseServiceFile(content,format,p.horizonDays);if(mode!=='merge'&&mode!=='replace')error('未知的需求匯入方式。');
 if(mode==='replace')checkedRows(incoming,p.horizonDays,true);
 const byKey=new Map(incoming.map(r=>[key(r),r]));const services=p.services.map(r=>byKey.get(key(r))??r);checkedRows(services,p.horizonDays,true);
 return {project:{...p,services},rows:incoming.length};
}
export function updateServiceValue(p:Project,station:StationId,day:number,hour:number,field:ServiceField,value:number):Project{
 if(!Number.isFinite(value)||value<0||(['swapCount','chargeCount'].includes(field)&&(!Number.isInteger(value)||value>1000)))error('車次須為 0–1,000 整數，電量與價格須為非負有限數字。');
 return {...p,services:p.services.map(r=>r.station===station&&r.day===day&&r.hour===hour?{...r,[field]:value}:r)};
}
export function swapEnergyPerVehicle(p:Project,station:StationId){const s=p.station[station];return s.capacityKWh*(s.readySOC-s.returnSOC);}
export function recalculateSwapDemand(p:Project,station:StationId,day:number):Project{const energy=swapEnergyPerVehicle(p,station);return {...p,services:p.services.map(r=>r.station===station&&r.day===day?{...r,swapKWh:r.swapCount*energy}:r)};}
export function demandWarnings(p:Project,station:StationId,day:number){const expected=swapEnergyPerVehicle(p,station),warnings:string[]=[];for(const r of p.services.filter(r=>r.station===station&&r.day===day)){
 if((r.swapCount===0&&r.swapKWh>0)||(r.chargeCount===0&&r.chargeKWh>0))warnings.push(`${r.hour} 時：零車次的總電量須設為 0，否則不能測算。`);
 if(r.swapCount>0&&Math.abs(r.swapKWh/r.swapCount-expected)>1e-6)warnings.push(`${r.hour} 時：每次換電 ${r.swapKWh/r.swapCount} kWh 與 SOC 窗口 ${expected} kWh 不符，受限模擬會保留排隊。`);
 if(r.chargeCount>0&&r.chargeKWh===0)warnings.push(`${r.hour} 時：充電車次大於 0，但補電需求為 0。`);
 }return warnings;
}
