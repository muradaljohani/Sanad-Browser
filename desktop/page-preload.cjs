'use strict';
const {ipcRenderer}=require('electron');
// Main frame only; no API is exposed to web JavaScript, no passwords are read on load.
if(process.isMainFrame){addEventListener('submit',event=>{
 if(!event.isTrusted||location.protocol!=='https:'||!navigator.userActivation.hasBeenActive)return;
 const form=event.target;if(!(form instanceof HTMLFormElement)||new URL(form.action||location.href,location.href).origin!==location.origin)return;
 const visible=el=>!el.disabled&&el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden';
 const passwords=[...form.querySelectorAll('input[type="password"]')].filter(visible);if(passwords.length!==1||passwords[0].autocomplete==='new-password')return;
 const password=passwords[0].value;if(!password||password.length>2048)return;
 const username=[...form.querySelectorAll('input')].find(el=>visible(el)&&(el.autocomplete==='username'||el.type==='email'))||[...form.querySelectorAll('input[type="text"]')].find(visible);
 void ipcRenderer.invoke('sanad-browser:form-submission',{origin:location.origin,action:form.action||location.href,username:(username?.value||'').slice(0,320),password}).catch(()=>{});
},true);}
