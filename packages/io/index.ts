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
export function unzipStored(bytes: Uint8Array) { if (bytes.length > 8 * 1024 * 1024)
    throw Error('File exceeds 8 MB'); const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), decoder = new TextDecoder(), files: Record<string, string> = {}; let offset = 0; while (offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    if (view.getUint16(offset + 8, true) !== 0)
        throw Error('目前只支援本系統直接匯出的 XLSX；Excel 另存後請改用 JSON');
    const length = view.getUint32(offset + 18, true), nameLength = view.getUint16(offset + 26, true), extra = view.getUint16(offset + 28, true);
    const name = decoder.decode(bytes.subarray(offset + 30, offset + 30 + nameLength));
    const start = offset + 30 + nameLength + extra;
    if (start + length > bytes.length)
        throw Error('Truncated workbook');
    const data = bytes.subarray(start, start + length);
    if (crc32(data) !== view.getUint32(offset + 14, true))
        throw Error('Workbook checksum mismatch');
    files[name] = decoder.decode(data);
    offset = start + length;
} return files; }
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
    const json = JSON.stringify(project);
    const chunks = json.match(/[\s\S]{1,16000}/g) ?? [''];
    const sheets: {
        name: string;
        rows: Cell[][];
    }[] = [{ name: 'Project_JSON', rows: chunks.map(v => [v]) }, { name: 'README', rows: [['HighwaySwapSim', '0.2.0'], ['schemaVersion', project.schemaVersion], ['Engine', result.engineVersion], ['Mode', result.mode], ['Currency', 'CNY — assumption'], ['Units', 'kW / kWh / minutes'], ['Replay', 'SOURCE_REPLAY does not calculate physical grid purchases'], ['Import', 'Import an unchanged application-exported workbook or use JSON']] }, { name: 'Service_Profile', rows: objectRows(project.services as unknown as Record<string, unknown>[]) }, { name: 'Equipment', rows: objectRows(project.topology.nodes as unknown as Record<string, unknown>[]) }, { name: 'Topology', rows: objectRows(project.topology.edges as unknown as Record<string, unknown>[]) }, { name: 'Hourly_Results', rows: objectRows(result.hours as unknown as Record<string, unknown>[]) }, { name: 'Transactions', rows: objectRows(result.transactions as unknown as Record<string, unknown>[]) }, { name: 'Sources', rows: objectRows(project.sources) }, { name: 'Validation', rows: objectRows(result.diagnostics as unknown as Record<string, unknown>[]) }, { name: 'Financial_Settings', rows: Object.entries(project.finance).map(([k, v]) => [k, v]) }, { name: 'KPI', rows: [['Metric', 'Value'], ...Object.entries(result.totals).map(([k, v]) => [k, v] as Cell[]), ['Hourly delivered cross-check', { formula: `SUM(Hourly_Results!D2:D49)`, value: result.totals.deliveredKWh }]] }];
    if(project.engineering){sheets.push({name:'Engineering_Settings',rows:Object.entries(project.engineering).map(([k,v])=>[k,typeof v==='number'?v:String(v)])});sheets.push({name:'Capacity_Case',rows:Object.entries(capacityCase(project)).map(([k,v])=>[k,typeof v==='number'?v:JSON.stringify(v)])});}
    // Explicit worksheet indices remain stable and are included in regression validation.
    const files: Record<string, string> = { '[Content_Types].xml': `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`, '_rels/.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>', 'xl/workbook.xml': `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${s.name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><calcPr fullCalcOnLoad="1"/></workbook>`, 'xl/_rels/workbook.xml.rels': `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>` };
    sheets.forEach((s, i) => files[`xl/worksheets/sheet${i + 1}.xml`] = sheet(s.rows));
    return zipStored(files);
}
export function importWorkbook(bytes: Uint8Array): Project { const files = unzipStored(bytes); const content = files['xl/worksheets/sheet1.xml']; if (!content)
    throw Error('Missing project sheet'); const chunks = [...content.matchAll(/<t xml:space="preserve">([\s\S]*?)<\/t>/g)].map(m => unesc(m[1])); return migrateProject(JSON.parse(chunks.join(''))); }
