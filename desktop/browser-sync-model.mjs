// Original, bounded operation model shared by the web client, desktop and service.
export const SYNC_VERSION = 1;
export const SYNC_SETTING_KEYS = ['theme','language','country','personalize','saveHistory','remoteSuggestions','cacheResults','dataSaver','imagePreviews','zoom'];
export function syncUrl(value) {
  try { const u=new URL(value); if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.href.length>4000||/\/(?:auth|oauth|sign-in|sign-up|reset-password)(?:\/|$)/i.test(u.pathname))return null;
    for(const key of u.searchParams.keys())if(/^(?:token|access_token|refresh_token|id_token|password|code|sync_code|state|session|key)$/i.test(key))return null;
    u.hash='';return u.href; } catch{return null;}
}
const record = value => value && typeof value==='object' && !Array.isArray(value);
const cleanTitle=value=>String(value??'').replace(/[\u0000-\u001f]/g,' ').slice(0,200);
export function emptySyncDocument(){return {version:1,bookmarks:{},history:{},settings:{},tabs:{},devices:{}};}
export function normalizeSyncSettings(value={}) {
 const out={};if(!record(value))return out;
 for(const key of SYNC_SETTING_KEYS){let v=value[key];if(key==='theme'&&!['dark','light'].includes(v))continue;
 if(key==='language'&&!['auto','ar','en','fr','de','tr','ur','id'].includes(v))continue;
 if(key==='country'&&!['auto','sa','ae','eg','kw','qa','us','gb','tr','id'].includes(v))continue;
 if(key==='zoom'&&![1,1.15,1.3].includes(v))continue;
 if(!['theme','language','country','zoom'].includes(key)&&typeof v!=='boolean')continue;out[key]=v;}return out;
}
export function normalizeSyncSnapshot(value={}) {
 const entries=(items,max)=>{const seen=new Set();return (Array.isArray(items)?items:[]).slice(0,max*2).flatMap(item=>{const url=syncUrl(item?.url);if(!url||item.private===true||item.isIncognito===true||seen.has(url))return [];seen.add(url);return [{url,title:cleanTitle(item.title||url),timestamp:Number.isFinite(item.timestamp)?Math.max(0,Math.min(item.timestamp,Date.now()+86400000)):0,pinned:item.pinned===true||item.isPinned===true,...(typeof item.folder==='string'&&item.folder?{folder:cleanTitle(item.folder)}:{})}];}).slice(0,max);};
 return {bookmarks:entries(value.bookmarks,1000),history:entries(value.history,200),settings:normalizeSyncSettings(value.settings),tabs:entries(value.tabs,32)};
}
export function syncSelection(auth={}){auth=auth||{};return {bookmarks:auth.selection?.bookmarks!==false,settings:auth.selection?.settings!==false,tabs:auth.selection?.tabs!==false,history:auth.selection?.history===undefined?auth.includeHistory===true:auth.selection.history===true};}
export function operationType(op){return op.kind==='setting.put'?'settings':op.kind?.split('.')[0];}
export function snapshotDiff(previous, current, sequence=0, includeHistory=false){
 const selected=typeof includeHistory==='object'?includeHistory:{bookmarks:true,settings:true,tabs:true,history:includeHistory===true};
 const before=normalizeSyncSnapshot(previous),after=normalizeSyncSnapshot(current),events=[];
 const add=(kind,key,value)=>events.push({seq:++sequence,kind,key,value});
 for(const type of ['bookmarks','history'].filter(type=>selected[type])){const old=new Map(before[type].map(x=>[x.url,x]));const next=new Map(after[type].map(x=>[x.url,x]));for(const [key,value]of next)if(JSON.stringify(value)!==JSON.stringify(old.get(key)))add(type+'.put',key,value);for(const key of old.keys())if(!next.has(key))add(type+'.remove',key,null);}
 for(const [key,value]of Object.entries(selected.settings?after.settings:{}))if(before.settings[key]!==value)add('setting.put',key,value);
 if(selected.tabs&&JSON.stringify(before.tabs)!==JSON.stringify(after.tabs))add('tabs.put','tabs',after.tabs);
 return {events,sequence};
}
export function applySyncBatch(input,deviceId,events,now=Date.now()) {
 if(!/^[a-zA-Z0-9_-]{16,80}$/.test(deviceId)||!Array.isArray(events)||events.length>5000)throw Error('invalid_batch');
 const doc=structuredClone(input?.version===1?input:emptySyncDocument());let seq=doc.devices[deviceId]?.seq||0;
 for(const op of events){if(!record(op)||!Number.isSafeInteger(op.seq)||op.seq<1)throw Error('invalid_operation');if(op.seq<=seq)continue;if(op.seq!==seq+1)throw Error('sequence_gap');
  if(op.kind==='noop'){}
  else if(op.kind==='setting.put'){const clean=normalizeSyncSettings({[op.key]:op.value});if(!Object.hasOwn(clean,op.key))throw Error('invalid_setting');doc.settings[op.key]=clean[op.key];}
  else if(op.kind==='tabs.put'){doc.tabs[deviceId]={updated:now,entries:normalizeSyncSnapshot({tabs:op.value}).tabs};}
  else if(/^(bookmarks|history)\.(put|remove)$/.test(op.kind)){const [type,action]=op.kind.split('.'),key=syncUrl(op.key);if(!key)throw Error('invalid_url');if(action==='remove')delete doc[type][key];else{const v=normalizeSyncSnapshot({[type]:[op.value]})[type][0];if(!v||v.url!==key)throw Error('invalid_record');doc[type][key]=v;}}
  else throw Error('unknown_operation');seq=op.seq;
 }
 doc.devices[deviceId]={seq,updated:now};
 for(const type of ['bookmarks','history']){const max=type==='bookmarks'?1000:200;const list=Object.values(doc[type]).sort((a,b)=>b.timestamp-a.timestamp).slice(0,max);doc[type]=Object.fromEntries(list.map(x=>[x.url,x]));}
 const keep=new Set(Object.entries(doc.devices).sort((a,b)=>b[1].updated-a[1].updated).slice(0,16).map(x=>x[0]));for(const id of Object.keys(doc.devices))if(!keep.has(id)){delete doc.devices[id];delete doc.tabs[id];}
 if(JSON.stringify(doc).length>1800000)throw Error('document_too_large');return doc;
}
export function snapshotFromDocument(doc){return normalizeSyncSnapshot({bookmarks:Object.values(doc?.bookmarks||{}),history:Object.values(doc?.history||{}),settings:doc?.settings||{}});}
export function otherDeviceTabs(doc,deviceId){return Object.entries(doc?.tabs||{}).filter(([id])=>id!==deviceId).sort((a,b)=>b[1].updated-a[1].updated).map(([id,v])=>({deviceId:id,updated:v.updated,tabs:normalizeSyncSnapshot({tabs:v.entries}).tabs}));}
