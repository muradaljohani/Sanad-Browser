import { normalizeSyncSnapshot,snapshotDiff,applySyncBatch,snapshotFromDocument } from './browser-sync-model.mjs';
import { accountRequest } from './browser-account-client.mjs';
// Credentials stay in the caller's protected store; status() never exposes them.
export function createBrowserSync({readAuth,writeAuth,readSnapshot,applyRemote,onStatus=(_status)=>{},fetchImpl=fetch,canSync=()=>true}){
 let running=false,stopped=false,initializing=false,hasRestored=false,timer,interval,phase='signed-out',lastSync=0,error='';
 const persist=auth=>{writeAuth(auth);};
 const update=(next,message='')=>{phase=next;error=message;onStatus(status());};
 function status(){const auth=readAuth();return {phase,identity:auth?.identity||null,signedIn:Boolean(auth?.token),enabled:auth?.enabled===true,includeHistory:auth?.includeHistory===true,lastSync,error,pending:auth?.queue?.length||0};}
 function capture(){const auth=readAuth();if(!auth?.enabled||!auth.initialized||initializing)return;
 const current=normalizeSyncSnapshot(readSnapshot()),diff=snapshotDiff(auth.observed||{},current,auth.seq||0,auth.includeHistory);
 if(diff.events.length){if((auth.queue?.length||0)+diff.events.length>5000){update('error','local_changes_too_large');return;}auth.queue=[...(auth.queue||[]),...diff.events];auth.seq=diff.sequence;auth.observed=current;persist(auth);return true;}return false;}
 function changed(){if(stopped||!capture())return;clearTimeout(timer);timer=setTimeout(()=>void syncNow(),1200);}
 function effective(document,auth){return auth.queue?.length?applySyncBatch(document,auth.deviceId,auth.queue):document;}
 async function adopt(document,auth){const doc=effective(document,auth),remote=snapshotFromDocument(doc),current=normalizeSyncSnapshot(readSnapshot());
 const restore=!hasRestored;hasRestored=true;
 auth.observed=structuredClone({...remote,history:auth.includeHistory?remote.history:current.history,tabs:current.tabs});persist(auth);
 await applyRemote({snapshot:remote,document:doc,restoreDocument:document,deviceId:auth.deviceId,restore,includeHistory:auth.includeHistory});}
 async function syncNow(){if(running||stopped||!canSync())return;let auth=readAuth();if(!auth?.token||!auth.enabled){update(auth?.token?'awaiting-consent':'signed-out');return;}
 const activeToken=auth.token;const current=()=>!stopped&&canSync()&&readAuth()?.token===activeToken;
 running=true;try{update('syncing');
 if(!auth.initialized){initializing=true;const response=await accountRequest('sync',{token:auth.token,fetchImpl});if(!current())return;if(response.identity?.uid!==auth.identity.uid||response.deviceId!==auth.deviceId)throw Error('account_mismatch');
  const remote=snapshotFromDocument(response.document),local=normalizeSyncSnapshot(readSnapshot());
  const union=(left,right)=>[...new Map([...left,...right].map(x=>[x.url,x])).values()];
  const first=normalizeSyncSnapshot({bookmarks:union(remote.bookmarks,local.bookmarks),history:auth.includeHistory?union(remote.history,local.history):local.history,settings:{...local.settings,...remote.settings},tabs:local.tabs});
  auth.seq=response.document.devices?.[auth.deviceId]?.seq||0;const diff=snapshotDiff({},first,auth.seq,auth.includeHistory);auth.queue=diff.events;auth.seq=diff.sequence;auth.observed=first;auth.initialized=true;persist(auth);await adopt(response.document,auth);initializing=false;
 }else{if(!hasRestored&&auth.observed){auth.observed.tabs=normalizeSyncSnapshot(readSnapshot()).tabs;persist(auth);}capture();}
 let iterations=0;
 do{auth=readAuth();const sent=(auth.queue||[]).slice(0,200);const response=await accountRequest('sync',{token:auth.token,...(sent.length?{body:{events:sent}}:{}),fetchImpl});
  if(!current())return;if(response.identity?.uid!==auth.identity.uid||response.deviceId!==auth.deviceId)throw Error('account_mismatch');
  // Capture edits made while the request was in flight before applying remote data.
  capture();auth=readAuth();const acknowledged=response.document.devices?.[auth.deviceId]?.seq||0;auth.queue=(auth.queue||[]).filter(op=>op.seq>acknowledged);auth.seq=Math.max(auth.seq||0,acknowledged);persist(auth);
  initializing=true;await adopt(response.document,auth);initializing=false;
 }while(readAuth()?.queue?.length&&++iterations<30&&!stopped);
 if(current()){lastSync=Date.now();update('ready');}
 }catch(failure){if(!current())return;initializing=false;if(failure.status===401){const auth=readAuth();if(auth){delete auth.token;auth.enabled=false;persist(auth);}update('expired','session_expired');}else update('error',failure.message||'sync_unavailable');}
 finally{running=false;initializing=false;}}
 function start(){stopped=false;clearInterval(interval);interval=setInterval(()=>void syncNow(),30000);return syncNow();}
 async function enable(includeHistory=false){const auth=readAuth();if(!auth?.token)return;auth.enabled=true;auth.includeHistory=includeHistory===true;persist(auth);return start();}
 async function signOut(){const auth=readAuth();stopped=true;clearInterval(interval);clearTimeout(timer);if(auth?.token)await accountRequest('logout',{token:auth.token,body:{},fetchImpl}).catch(()=>{});writeAuth(null);update('signed-out');}
 function stop(){stopped=true;clearInterval(interval);clearTimeout(timer);}
 return {start,stop,changed,syncNow,enable,signOut,status};
}
