'use strict';
// No page-facing credential API. These actions are reachable only by the trusted shell.
function httpsOrigin(value){try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.origin:null;}catch{return null;}}
const fields={name:'name',givenName:'given-name',familyName:'family-name',organization:'organization',email:'email',phone:'tel',street:'address-line1',street2:'address-line2',city:'address-level2',region:'address-level1',postalCode:'postal-code',country:'country'};
function fillScript(kind,record,origin){
 const data=kind==='password'?{username:record.username,password:record.password}:Object.fromEntries(Object.entries(fields).filter(([key])=>record.fields[key]).map(([key,value])=>[value,record.fields[key]]));
 return `(()=>{if(location.origin!==${JSON.stringify(origin)}||location.protocol!=='https:')return false;const data=${JSON.stringify(data)},visible=el=>!el.disabled&&!el.readOnly&&el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden';const put=(el,value)=>{const proto=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:el instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));};let count=0;${kind==='password'?`const password=[...document.querySelectorAll('input[type="password"]')].find(el=>visible(el)&&el.autocomplete!=='new-password'&&(!el.form||new URL(el.form.action||location.href,location.href).origin===location.origin));if(!password)return false;const scope=password.form||document;const username=[...scope.querySelectorAll('input')].find(el=>visible(el)&&(el.autocomplete==='username'||el.type==='email'))||[...scope.querySelectorAll('input[type="text"]')].find(visible);if(username)put(username,data.username);put(password,data.password);count++;`:`for(const el of document.querySelectorAll('input,textarea,select')){const key=(el.autocomplete||'').trim().split(/\\s+/).pop();if(visible(el)&&Object.hasOwn(data,key)&&(!(el instanceof HTMLSelectElement)||[...el.options].some(option=>option.value===data[key]))&&!['password','hidden','file'].includes(el.type)&&(!el.form||new URL(el.form.action||location.href,location.href).origin===location.origin)){put(el,data[key]);count++;}}`}return count>0;})()`;
}
function createVaultActions({vault,active,profileId,expectedProfile,clipboard,dialog,window,onChange}){
 let disposed=false,clipTimer,clipValue;
 const valid=()=>!disposed&&profileId()===expectedProfile;
 function clearClipboard(){clearTimeout(clipTimer);if(clipValue&&clipboard.readText()===clipValue)clipboard.clear();clipValue=null;}
 async function run(action,data={}){if(!valid())throw Error('profile_changed');if(action==='list')return {protection:vault.protection.status,...vault.metadata(),origin:httpsOrigin(active()?.view?.webContents.getURL()),private:active()?.private===true};if(vault.protection.status!=='encrypted')throw Error('الخزنة المشفرة غير متاحة.');
 if(action==='save-password'){await vault.savePassword(data);onChange();return {saved:true};}
 if(action==='save-address'){await vault.saveAddress(data);onChange();return {saved:true};}
 if(action==='remove'){await vault.remove(data.type,data.id);onChange();return {removed:true};}
 const record=action==='fill-address'?vault.address(data.id):vault.password(data.id);if(!record)throw Error('العنصر غير موجود.');
 if(action==='reveal')return {password:record.password};
 if(action==='copy'){clearClipboard();clipValue=record.password;clipboard.writeText(clipValue);clipTimer=setTimeout(clearClipboard,30000);return {copied:true};}
 if(action==='fill-password'||action==='fill-address'){const tab=active(),wc=tab?.view?.webContents,url=wc?.getURL(),origin=httpsOrigin(url);if(!origin||(action==='fill-password'&&origin!==record.origin))throw Error('اختر تبويب HTTPS مطابقاً للموقع المحفوظ.');if(action==='fill-address'){const result=await dialog.showMessageBox(window(),{type:'question',title:'تعبئة البيانات الشخصية',message:'تعبئة البيانات في '+origin+'؟',buttons:['إلغاء','تعبئة'],defaultId:0,cancelId:0,noLink:true});if(result.response!==1)return {filled:false};}
 if(!valid()||active()!==tab||wc.isDestroyed()||wc.getURL()!==url)throw Error('page_changed');const filled=await wc.executeJavaScriptInIsolatedWorld(1006,[{code:fillScript(action==='fill-password'?'password':'address',record,origin)}]);return {filled:filled===true};}
 throw Error('unknown_vault_action');}
 return {run,dispose(){disposed=true;clearClipboard();}};
}
const recent=new WeakMap();
async function handleFormSubmission(event,data,{active,profileId,vault,dialog,window,onChange}){
 const tab=active(),wc=tab?.view?.webContents,origin=httpsOrigin(wc?.getURL()),pid=profileId(),currentVault=vault();
 if(!wc||event.sender!==wc||event.senderFrame!==wc.mainFrame||tab.private||!origin||data?.origin!==origin||httpsOrigin(data.action)!==origin||typeof data.username!=='string'||data.username.length>320||typeof data.password!=='string'||!data.password||data.password.length>2048||currentVault.protection.status!=='encrypted')return;
 if(Date.now()-(recent.get(wc)||0)<10000)return;recent.set(wc,Date.now());
 const existing=currentVault.snapshot().passwords.find(x=>x.origin===origin&&x.username===data.username);if(existing?.password===data.password)return;
 const response=await dialog.showMessageBox(window(),{type:'question',title:existing?'تحديث كلمة المرور':'حفظ كلمة المرور',message:origin+'\n'+data.username,detail:'تُحفظ مشفرة في ملفك الشخصي. تُزامن فقط إذا فعّلت مزامنة كلمات المرور.',buttons:['ليس الآن',existing?'تحديث':'حفظ'],defaultId:0,cancelId:0,noLink:true});
 if(response.response!==1||profileId()!==pid||vault()!==currentVault||active()!==tab||wc.isDestroyed()||httpsOrigin(wc.getURL())!==origin)return;
 await currentVault.savePassword({origin,username:data.username,password:data.password});onChange();
}
module.exports={createVaultActions,handleFormSubmission,fillScript,httpsOrigin};
