import fixtures from '../../data/verification/fixtures.json' with {type:'json'};
import {defaultProject} from '../reference/index.ts';
import {makeNode} from '../../plugins/equipment/index.ts';
import type {Project,StationId} from '../contracts/index.ts';
export function verificationCases():{id:string;name:string;project:Project}[]{return fixtures.cases.map((f,index)=>{
 const p=defaultProject();p.name=['V01 · 3日 SST 庫存循環','V02 · 4日 PCS + 交流負載','V03 · 5日 停電與跨區恢復'][index];p.horizonDays=f.horizon_days;p.mode='CONSTRAINED';p.efficiency={...p.efficiency,mode:'ASSEMBLY',sst:.98,transformer:.98,pcs:.96,charger:.95};p.finance={...p.finance,fixedDaily:0,variablePerKWh:0};p.topology={nodes:[],edges:[]};
 const node=(s:StationId,type:string,id:string,x:number,y:number,params:Record<string,number>={})=>p.topology.nodes.push(makeNode(type,`${s}-${id}`,s,x+(s==='B'?540:0),y,params));
 const edge=(a:string,b:string)=>p.topology.edges.push({id:`${a}->${b}`,source:a,target:b,enabled:true});
 for(const s of ['A','B'] as const){p.station[s]={batteries:1,capacityKWh:100,readySOC:1,returnSOC:0,bays:1,swapMinutes:7.5,guns:1,gunKW:50,chargePoolKW:100,batteryChargeKW:50,auxiliaryKW:index===1?10:0};
 if(index!==2||s==='A')node(s,'grid','grid',50,40,{kva:1000,pf:1});
 if(index===1){node(s,'transformer','transformer',50,130,{kva:1000,pf:1});node(s,'lv-bus','lv',50,220);node(s,'pcs','pcs',50,310,{kw:100});node(s,'ac-load','aux',250,220,{kw:10});edge(`${s}-grid`,`${s}-transformer`);edge(`${s}-transformer`,`${s}-lv`);edge(`${s}-lv`,`${s}-pcs`);edge(`${s}-lv`,`${s}-aux`);}
 else if(index===0||s==='A'){node(s,'sst','sst',50,150,{kw:index===2?200:100});edge(`${s}-grid`,`${s}-sst`);}
 node(s,'bus','bus',50,400);node(s,'charger','charger',50,490,{kw:100});edge(`${s}-bus`,`${s}-charger`);
 if(index===1)edge(`${s}-pcs`,`${s}-bus`);else if(index===0||s==='A')edge(`${s}-sst`,`${s}-bus`);
 }
 if(index===2){node('A','dc-cable','tie',300,400,{kw:200,length:150});edge('A-bus','A-tie');edge('A-tie','B-bus');p.equipmentSchedule=[{atMinute:1440,equipmentId:'A-grid',enabled:false},{atMinute:4320,equipmentId:'A-grid',enabled:true}];}
 const base=defaultProject().services;p.services=Array.from({length:p.horizonDays},(_,day)=>base.map(row=>{const swap=index!==1&&row.hour===(index===2?23:0),charge=index===1&&row.hour===12,price=Number((row.station==='A'?f.grid_prices_A:f.grid_prices_B)[day]);return {...row,day,swapCount:swap?1:0,swapKWh:swap?100:0,chargeCount:charge?1:0,chargeKWh:charge?100:0,gridPrice:price,swapFee:.3,chargeFee:.3,swapTotalRaw:price+.3,chargeTotalRaw:price+.3,idleRaw:null};})).flat();p.sources=[{id:f.id,status:'CONTROLLED_SYNTHETIC',note:'封閉解析驗證情境；非實測場站。零輔助代表明示理想機械。期初每站100 kWh僅建立一次。'}];return {id:f.id,name:p.name,project:p};
});}
