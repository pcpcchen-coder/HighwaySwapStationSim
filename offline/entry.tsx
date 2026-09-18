import {createElement} from 'react';
import {createRoot} from 'react-dom/client';
import Workbench from '../components/simulator/workbench';

const root=document.getElementById('root');
if(!root)throw Error('Missing application root');
createRoot(root,{onUncaughtError(error){
 const message=error instanceof Error?error.message:String(error);
 root.textContent=`離線程式啟動失敗：${message}。請重新下載最新離線版；已匯出的 JSON 檔可繼續使用。`;
 root.setAttribute('role','alert');
}}).render(createElement(Workbench));
