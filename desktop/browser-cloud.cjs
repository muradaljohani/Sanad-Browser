'use strict';
const crypto=require('node:crypto');
const {parseAuthCallback}=require('./browser-account-state.cjs');
const {listProfiles,inspectProfile}=require('./chrome-import.cjs');
const {readBoundedText}=require('./bounded-file.cjs');
async function createNativeAccount({store,session,readSnapshot,applyRemote,onStatus,openExternal,showPanel,notify,isPrivate,proxyEnabled,dialog,window,onAuthenticated=async()=>false,vault}){
 const {createBrowserSync}=await import('./browser-sync-controller.mjs');
 const {pendingGoogleLogin,googleLoginURL,exchangeGoogleCode}=await import('./browser-account-client.mjs');
 const {createVaultSync}=await import('./vault-sync-controller.mjs');
 const {normalizeSyncSnapshot}=await import('./browser-sync-model.mjs');
 const fetchImpl=session.fetch.bind(session);
 let profiles=[],preview=null,busy=false,exchanging=false;
 const engine=createBrowserSync({readAuth:()=>store.state.sync,writeAuth:auth=>{if(auth)store.state.sync=auth;else delete store.state.sync;store.persist();},readSnapshot,applyRemote,onStatus,fetchImpl,canSync:()=>!isPrivate()});
 const privateEngine=vault?createVaultSync({vault,readAccount:()=>store.state.sync,readSelection:()=>store.state.sync?.selection||{},fetchImpl,canSync:()=>!isPrivate(),onStatus}):null;
 const status=()=>{const base=engine.status(),secret=privateEngine?.status();return {...base,phase:base.signedIn&&!base.enabled?'paused':base.phase==='ready'&&['error','unavailable'].includes(secret?.phase)?'partial':base.phase,privateVault:secret,vaultProtection:vault?.protection.status,profiles,importBusy:busy,preview:preview?{id:preview.id,counts:{bookmarks:preview.data.bookmarks.length,history:preview.data.history.length,tabs:preview.data.tabs.length,settings:Object.keys(preview.data.settings).length},warnings:preview.data.warnings||[]}:null,protectedStorage:store.storageProtection.status==='encrypted'};};
 async function handleURL(raw){const callback=parseAuthCallback(raw);if(store.storageProtection.status!=='encrypted'||!callback||exchanging||!store.state.syncPending||callback.state!==store.state.syncPending.state)return false;exchanging=true;
 try{const auth=await exchangeGoogleCode(callback,store.state.syncPending,fetchImpl);if(await onAuthenticated(auth))return true;store.state.sync=auth;delete store.state.syncPending;await store.flush();const started=Promise.all([engine.start(),privateEngine?.start()]);showPanel('sync');await started;if(engine.status().phase==='ready')notify('تم تسجيل الدخول ومزامنة بيانات سَنَد الحرمين تلقائياً.');return true;}catch{notify('تعذر إكمال تسجيل الدخول أو انتهت صلاحية رابط العودة. أعد المحاولة من زر Google.');return false;}finally{exchanging=false;onStatus();}}
 async function run(action,data={}){
 if(action==='sync-sign-in'){
  if(store.storageProtection.status!=='encrypted'||store.storageProtection.readOnly)throw Error('يلزم تفعيل التخزين المشفر في النظام قبل حفظ جلسة المزامنة.');
  if(proxyEnabled())throw Error('تسجيل الدخول يفتح متصفح النظام خارج مسار الوسيط. أوقف وضع الوسيط من خيارات الاتصال قبل بدء هذا الإجراء.');
  const pending=await pendingGoogleLogin(store.state.deviceId||store.state.sync?.deviceId,{syncOnSignIn:true,includeHistory:data.history===true});store.state.syncPending=pending;await store.flush();await openExternal(googleLoginURL(pending,'desktop'));return;
 }
 if(action==='sync-enable'){await engine.enable(data.history===true);return;}
 if(action==='sync-now'){await Promise.all([engine.syncNow(),privateEngine?.syncNow()]);return;}
 if(action==='sync-selection'){const auth=store.state.sync;if(!auth?.token)throw Error('سجل الدخول أولاً.');const keys=['bookmarks','settings','history','tabs','passwords','autofill'];if(!keys.includes(data.type)||typeof data.enabled!=='boolean')throw Error('invalid_selection');if(['passwords','autofill'].includes(data.type)&&data.enabled&&(auth.client!=='desktop'||vault?.protection.status!=='encrypted'))throw Error('أعد تسجيل الدخول في التطبيق لتفعيل الخزنة المشفرة.');auth.selection={...auth.selection,[data.type]:data.enabled};if(data.type==='history')auth.includeHistory=data.enabled;await store.flush();await Promise.all([engine.syncNow(),privateEngine?.start()]);return;}
 if(action==='sync-pause'){const auth=store.state.sync;if(auth){auth.enabled=data.enabled===true;await store.flush();if(auth.enabled){await Promise.all([engine.start(),privateEngine?.start()]);}else{engine.stop();privateEngine?.stop();}}onStatus();return;}
 if(action==='sync-sign-out'){privateEngine?.stop();await engine.signOut();delete store.state.syncPending;store.persist();return;}
 if(action==='chrome-profiles'){profiles=await listProfiles();onStatus();return;}
 if(action==='chrome-preview'){
  if(busy)return;busy=true;onStatus();try{const imported=await inspectProfile(String(data.profileId||''));preview={id:crypto.randomUUID(),data:imported,expiresAt:Date.now()+300000};}finally{busy=false;onStatus();}return;
 }
 if(action==='chrome-file-import'){
  const result=await dialog.showOpenDialog(window(),{title:'استيراد ملف تصدير كروم',properties:['openFile'],filters:[{name:'Sanad Chrome export',extensions:['json']}]});if(result.canceled)return;
  const raw=JSON.parse(readBoundedText(result.filePaths[0],8*1024*1024));if(raw.format!=='sanad-chrome-export-v1'||['passwords','cookies','logins','tokens'].some(key=>Object.hasOwn(raw,key)))throw Error('استخدم ملف التصدير الصادر من مساعد كروم الخاص بسَنَد الحرمين.');
  const data=normalizeSyncSnapshot(raw);preview={id:crypto.randomUUID(),data:{...data,warnings:['يستورد هذا الملف البيانات التي اخترت تصديرها من كروم.']},expiresAt:Date.now()+300000};onStatus();return;
 }
 if(action==='chrome-import'){
  if(!preview||data.previewId!==preview.id||preview.expiresAt<Date.now())throw Error('انتهت المعاينة. أعد قراءة الملف الشخصي.');
  if(!['bookmarks','history','tabs','settings'].some(key=>data[key]===true))throw Error('اختر نوعاً واحداً على الأقل للاستيراد.');
  const chosen={bookmarks:data.bookmarks===true?preview.data.bookmarks:[],history:data.history===true?preview.data.history:[],tabs:data.tabs===true?preview.data.tabs:[],settings:data.settings===true?preview.data.settings:{}};
  const added=await applyRemote({snapshot:chosen,importing:true,restore:true,includeHistory:data.history===true,restoreDocument:{tabs:{chrome:{updated:Date.now(),entries:chosen.tabs}}}});preview=null;engine.changed();notify(added?`تمت إضافة ${added.bookmarks} مفضلة و${added.history} زيارة و${added.tabs} تبويب، وتطبيق ${added.settings} إعداد. تُتجاهل العناصر المكررة وما يتجاوز السعة. لم تُعدّل ملفات كروم.`:'اكتمل استيراد البيانات المختارة. لم تُعدّل ملفات كروم.');return;
 }
 throw Error('unknown_account_action');
 }
 return {status,handleURL,run,changed(){engine.changed();privateEngine?.changed();},start(){return Promise.all([engine.start(),privateEngine?.start()]);},stop(){engine.stop();privateEngine?.stop();}};
}
module.exports={createNativeAccount};
