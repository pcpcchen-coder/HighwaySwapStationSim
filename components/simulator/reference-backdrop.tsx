import type {Equipment} from '../../packages/contracts/index.ts';
import {referenceGroups,REFERENCE_WIDTH} from '../../packages/reference-layout/index.ts';

export function ReferenceBackdrop({nodes}:{nodes:Equipment[]}){
 const voltage=(kind:string)=>[...new Set(nodes.filter(n=>n.id.endsWith(`-bus-${kind}`)).map(n=>n.params.voltage).filter(Boolean))].join('／');
 return <g className="reference-backdrop" aria-hidden="true" pointerEvents="none">
  <text x={900} y={35} className="reference-area">服務區 A</text>
  <text x={REFERENCE_WIDTH-1150} y={35} className="reference-area">服務區 B</text>
  <text x={REFERENCE_WIDTH/2} y={80} textAnchor="middle" className="reference-heading">雙服務區供用電連接圖</text>
  <text x={REFERENCE_WIDTH/2} y={138} textAnchor="middle" className="reference-caption">交流接入在上方，直流母線橫跨中央；所有線段對應實際連線</text>
  <text x={REFERENCE_WIDTH/2} y={1090} textAnchor="middle" className="reference-bus-label">DC {voltage('sst')} V 母線 1 · SST 路徑</text>
  <text x={REFERENCE_WIDTH/2} y={1380} textAnchor="middle" className="reference-bus-label">DC {voltage('pcs')} V 母線 2 · PCS 路徑</text>
  {referenceGroups(nodes).map(g=><g key={g.id} data-reference-group={g.id}><rect x={g.x} y={g.y} width={g.w} height={g.h} rx={16} fill="none" stroke={g.color} strokeWidth={2} strokeDasharray="14 10"/><text x={g.x+20} y={g.y+42} fill={g.color} className="reference-group-title">{g.name}</text></g>)}
 </g>;
}
