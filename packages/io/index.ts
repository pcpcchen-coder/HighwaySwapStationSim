import {batteryWorkbookRows} from '../battery-trace/index.ts';
import {detailedRows} from '../detailed-profile/index.ts';
import {evaluateExtendedFinance} from '../extended-finance/index.ts';
import { capacityCase } from '../engineering/index.ts';
import type { Project, RunResult } from '../contracts/index.ts';
import { migrateProject } from '../schemas/index.ts';
type Cell = string | number | null | {
    formula: string;
    value: number;
};
const esc = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const unesc = (text: string) => text.replaceAll('&quot;', '"').replaceAll('&gt;', '>').replaceAll('&lt;', '<').replaceAll('&amp;', '&');
const encoder = new TextEncoder();
function crc32(bytes: Uint8Array) { let c = 0xffffffff; for (const b of bytes) {
    c ^= b;
    for (let k = 0; k < 8; k++)
        c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0);
} return (c ^ 0xffffffff) >>> 0; }
function join(parts: Uint8Array[]) { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let offset = 0; for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
} return out; }
function header(size: number, values: [
    number,
    number,
    number
][]) { const bytes = new Uint8Array(size), view = new DataView(bytes.buffer); for (const [offset, value, width] of values)
    width === 4 ? view.setUint32(offset, value, true) : view.setUint16(offset, value, true); return bytes; }
export function zipStored(files: Record<string, string>) { const parts: Uint8Array[] = [], central: Uint8Array[] = []; let offset = 0; for (const [name, content] of Object.entries(files)) {
    const filename = encoder.encode(name), data = encoder.encode(content), crc = crc32(data);
    const local = header(30, [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x800, 2], [14, crc, 4], [18, data.length, 4], [22, data.length, 4], [26, filename.length, 2]]);
    parts.push(local, filename, data);
    central.push(header(46, [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x800, 2], [16, crc, 4], [20, data.length, 4], [24, data.length, 4], [28, filename.length, 2], [42, offset, 4]]), filename);
    offset += local.length + filename.length + data.length;
} const directory = join(central); return join([...parts, directory, header(22, [[0, 0x06054b50, 4], [8, Object.keys(files).length, 2], [10, Object.keys(files).length, 2], [12, directory.length, 4], [16, offset, 4]])]); }
export function unzipStored(bytes:Uint8Array){
 if(bytes.length>64*1024*1024)throw Error('Workbook exceeds 64 MB');
 if(bytes.length<22)throw Error('Truncated workbook');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),decoder=new TextDecoder('utf-8',{fatal:true}),files:Record<string,string>={};
 const end=bytes.length-22;if(view.getUint32(end,true)!==0x06054b50||view.getUint16(end+20,true)!==0)throw Error('Missing complete workbook directory');
 const count=view.getUint16(end+10,true),directorySize=view.getUint32(end+12,true),directoryStart=view.getUint32(end+16,true);
 if(view.getUint16(end+4,true)!==0||view.getUint16(end+6,true)!==0||view.getUint16(end+8,true)!==count||directoryStart+directorySize!==end)throw Error('Invalid workbook directory');
 const locals=new Map<number,{name:string;length:number;crc:number}>();let offset=0;
 while(offset<directoryStart){
  if(offset+30>directoryStart||view.getUint32(offset,true)!==0x04034b50)throw Error('Invalid workbook entry');
  if(view.getUint16(offset+8,true)!==0||view.getUint16(offset+6,true)!==0x800)throw Error('只支援本系統直接匯出的 XLSX；Excel 另存後請改用 JSON');
  const length=view.getUint32(offset+18,true),nameLength=view.getUint16(offset+26,true),extra=view.getUint16(offset+28,true),start=offset+30+nameLength+extra;
  if(start+length>directoryStart||length!==view.getUint32(offset+22,true))throw Error('Truncated workbook entry');
  const name=decoder.decode(bytes.subarray(offset+30,offset+30+nameLength));if(name in files)throw Error('Duplicate workbook entry');
  const data=bytes.subarray(start,start+length),crc=view.getUint32(offset+14,true);if(crc32(data)!==crc)throw Error('Workbook checksum mismatch');
  files[name]=decoder.decode(data);locals.set(offset,{name,length,crc});offset=start+length;
 }
 if(locals.size!==count)throw Error('Workbook entry count mismatch');
 const referenced=new Set<number>();
 for(let i=0;i<count;i++){
  if(offset+46>end||view.getUint32(offset,true)!==0x02014b50)throw Error('Invalid central directory');
  const nameLength=view.getUint16(offset+28,true),extra=view.getUint16(offset+30,true),comment=view.getUint16(offset+32,true),next=offset+46+nameLength+extra+comment;
  if(next>end)throw Error('Truncated central directory');
  const localOffset=view.getUint32(offset+42,true),local=locals.get(localOffset),name=decoder.decode(bytes.subarray(offset+46,offset+46+nameLength));
  if(!local||referenced.has(localOffset)||local.name!==name||local.length!==view.getUint32(offset+20,true)||local.crc!==view.getUint32(offset+16,true))throw Error('Workbook central entry mismatch');
  referenced.add(localOffset);offset=next;
 }
 if(offset!==end)throw Error('Unexpected central directory data');return files;
}
function column(index: number) { let value = index + 1, result = ''; while (value) {
    value--;
    result = String.fromCharCode(65 + value % 26) + result;
    value = Math.floor(value / 26);
} return result; }
function sheet(rows: Cell[][]) { return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="30" width="22" customWidth="1"/></cols><sheetData>${rows.map((r, i) => `<row r="${i + 1}">${r.map((v, j) => { const ref = `${column(j)}${i + 1}`; if (v === null)
    return `<c r="${ref}"/>`; if (typeof v === 'number')
    return `<c r="${ref}"><v>${v}</v></c>`; if (typeof v === 'object')
    return `<c r="${ref}"><f>${esc(v.formula)}</f><v>${v.value}</v></c>`; return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`; }).join('')}</row>`).join('')}</sheetData></worksheet>`; }
function objectRows(rows: Record<string, unknown>[]): Cell[][] { if (!rows.length)
    return [['No rows']]; const keys = [...new Set(rows.flatMap(r => Object.keys(r)))]; return [keys, ...rows.map(r => keys.map(k => { const v = r[k]; return v === null || v === undefined ? null : typeof v === 'number' ? v : typeof v === 'object' ? JSON.stringify(v) : String(v); }))]; }
export function exportWorkbook(project: Project, result: RunResult) {
    const canonical=(value:unknown):string=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
    if(canonical(project)!==canonical(result.parameterSnapshot))throw Error('EXPORT_SNAPSHOT_MISMATCH');
    const json = JSON.stringify(project);
    const hourlyRows=objectRows(result.hours as unknown as Record<string,unknown>[]);
    const deliveredColumn=column((hourlyRows[0] as string[]).indexOf('deliveredKWh'));
    const deliveredFormula=`SUM(Hourly_Results!${deliveredColumn}2:${deliveredColumn}${result.hours.length+1})`;
    const chunks = json.match(/[\s\S]{1,16000}/gu) ?? [''];
    const sheets: {
        name: string;
        rows: Cell[][];
    }[] = [{ name: 'Project_JSON', rows: chunks.map(v => [v]) }, { name: 'README', rows: [['HighwaySwapSim', '0.3.0'], ['schemaVersion', project.schemaVersion], ['Engine', result.engineVersion], ['Mode', result.mode], ['Currency', 'CNY — assumption'], ['Units', 'kW / kWh / absolute minutes; day is zero-based'], ['Horizon days',project.horizonDays],['Settlement','Quantity and rate: 6 decimal HALF_UP; invoice: CNY 2 decimals; source-hour grouping; arrival-locked customer rates'], ['Replay', 'SOURCE_REPLAY does not calculate physical grid purchases'], ['Import', 'Import an unchanged application-exported workbook or use JSON']] }, { name: 'Service_Profile', rows: objectRows(project.services as unknown as Record<string, unknown>[]) }, { name: 'Equipment', rows: objectRows(project.topology.nodes as unknown as Record<string, unknown>[]) }, { name: 'Topology', rows: objectRows(project.topology.edges as unknown as Record<string, unknown>[]) }, { name: 'Hourly_Results', rows: hourlyRows }, { name: 'Transactions', rows: objectRows(result.transactions as unknown as Record<string, unknown>[]) }, { name: 'Sources', rows: objectRows(project.sources) }, { name: 'Validation', rows: objectRows(result.diagnostics as unknown as Record<string, unknown>[]) }, { name: 'Financial_Settings', rows: Object.entries(project.finance).map(([k, v]) => [k, v]) }, { name: 'KPI', rows: [['Metric', 'Value'], ...Object.entries(result.totals).map(([k, v]) => [k, v] as Cell[]), ['Hourly delivered cross-check', { formula: deliveredFormula, value: result.totals.deliveredKWh }]] }];
    if(project.engineering){sheets.push({name:'Engineering_Settings',rows:Object.entries(project.engineering).map(([k,v])=>[k,typeof v==='number'?v:String(v)])});sheets.push({name:'Capacity_Case',rows:Object.entries(capacityCase(project)).map(([k,v])=>[k,typeof v==='number'?v:JSON.stringify(v)])});}
    sheets.push({name:'Component_Energy',rows:objectRows(result.componentEnergy as unknown as Record<string,unknown>[])},{name:'Edge_Energy',rows:objectRows(result.edgeEnergy as unknown as Record<string,unknown>[])},{name:'Source_Meters',rows:objectRows(result.sourceMeters as unknown as Record<string,unknown>[])},{name:'Equipment_Schedule',rows:objectRows(project.equipmentSchedule as unknown as Record<string,unknown>[])});

    if(project.detailed){
      sheets.push({name:'Detailed_Settings',rows:[['JSON pointer','Type','Value (null = 待填)'],...detailedRows(project.detailed)]});
      const d=result.detailedResult;
      if(d){const batteries=batteryWorkbookRows(d.batteryTrace);for(const [name,values] of [['Service_Detail',d.fleet.transactions],['Battery_Inventory',d.fleet.batteries],['Battery_SOC_Trace',batteries.intervals],['Battery_SOC_Curves',batteries.curves],['Service_Events',d.serviceEvents],['Storage_Ledger',d.storage],['Electrical_Readings',d.electrical],['PV_Ledger',d.pv],['Export_Meters',d.exports??[]],['Switching_Events',d.switching],['Inventory_Flows',d.inventory]] as const)sheets.push({name,rows:objectRows(values as unknown as Record<string,unknown>[])});sheets.push({name:'Site_Energy_Boundary',rows:Object.entries(d.energy).map(([key,value])=>[key,value??null])});
       try{const f=evaluateExtendedFinance(result,project.detailed.finance,d.inventory);for(const [name,values]of [['Monthly_Bills',f.billing.rows],['Inventory_Valuation',f.inventory.rows],['Lifecycle_Cashflows',f.projection.rows],['Finance_Missing',[...f.billing.issues,...f.inventory.issues,...f.observed.issues,...f.projection.issues]]] as const)sheets.push({name,rows:objectRows(values as unknown as Record<string,unknown>[])});sheets.push({name:'Finance_Summary',rows:[['Section','Full result JSON'],['Observed',JSON.stringify(f.observed)],['Inventory',JSON.stringify({...f.inventory,rows:undefined})],['Projection',JSON.stringify({...f.projection,rows:undefined})]]});}
       catch(error){sheets.push({name:'Finance_Missing',rows:[['Status','Reason'],['VALIDATION_ERROR',String(error)]]});}
      }
    }
    // Explicit worksheet indices remain stable and are included in regression validation.
    const files: Record<string, string> = { '[Content_Types].xml': `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`, '_rels/.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>', 'xl/workbook.xml': `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${s.name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><calcPr fullCalcOnLoad="1"/></workbook>`, 'xl/_rels/workbook.xml.rels': `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>` };
    sheets.forEach((s, i) => files[`xl/worksheets/sheet${i + 1}.xml`] = sheet(s.rows));
    return zipStored(files);
}
export function importWorkbook(bytes: Uint8Array): Project { const files = unzipStored(bytes); const content = files['xl/worksheets/sheet1.xml']; if (!content)
    throw Error('Missing project sheet'); const chunks = [...content.matchAll(/<t xml:space="preserve">([\s\S]*?)<\/t>/g)].map(m => unesc(m[1])); const json=chunks.join('');if(encoder.encode(json).length>8*1024*1024)throw Error('Project JSON exceeds 8 MB');return migrateProject(JSON.parse(json)); }
