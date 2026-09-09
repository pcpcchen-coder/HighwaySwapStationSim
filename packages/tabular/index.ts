function error(message:string):never{throw Error(message);}
/** CSV supports BOM, CRLF, quoted/escaped cells; numeric conversion is strict. */
export function csvRecords(text:string,maxRecords=1489){const records:string[][]=[];let row:string[]=[],field='',quoted=false,closed=false;
 const cell=()=>{row.push(field);field='';closed=false;};
 const record=()=>{cell();if(row.some(v=>v.trim()!==''))records.push(row);row=[];if(records.length>maxRecords)error('CSV 資料列超過上限。');};
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;continue;}
  if(c===','){cell();continue;}if(c==='\r'||c==='\n'){record();if(c==='\r'&&text[i+1]==='\n')i++;continue;}
  if(closed){if(c===' '||c==='\t')continue;error('CSV 引號結束後有不合法字元。');}
  if(c==='"'){if(field.trim())error('CSV 引號必須位於儲存格開頭。');field='';quoted=true;}else field+=c;
 }
 if(quoted)error('CSV 引號未關閉。');if(field||row.length||closed)record();return records;
}

export function csvCell(value:string|number){const s=String(value);return /[\",\r\n]/.test(s)?'\"'+s.replaceAll('\"','\"\"')+'\"':s;}
