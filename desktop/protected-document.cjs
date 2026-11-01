'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const {randomUUID}=require('node:crypto');
const {readBoundedText}=require('./bounded-file.cjs');
const {createStateCipher,MAX_STATE_BYTES}=require('./state-encryption.cjs');
async function openProtectedDocument(filename,{safeStorage,platform=process.platform,context,normalize,onError=()=>{}}){
 let state=normalize({}),encoded,status='encrypted',writes=Promise.resolve(),timer;
 try{encoded=readBoundedText(filename,2800000);}catch(error){if(error.code!=='ENOENT')status='locked';}
 const cipher=await createStateCipher(safeStorage,platform,{context});
 if(!cipher)status=encoded===undefined?'unavailable':'locked';
 if(status==='encrypted'&&encoded!==undefined){try{state=normalize(JSON.parse(await cipher.open(encoded)));}catch{status='locked';}}
 const protection={get status(){return status;},get readOnly(){return !['encrypted','error'].includes(status);}};
 function replace(value){if(protection.readOnly)throw Error('التخزين المشفر غير متاح؛ لم تُحفظ بيانات حساسة.');const clean=normalize(value);if(Buffer.byteLength(JSON.stringify(clean))>MAX_STATE_BYTES)throw Error('تجاوزت البيانات سعة الخزنة.');state=clean;return flush();}
 function flush(){clearTimeout(timer);if(protection.readOnly)return Promise.reject(Error('التخزين المشفر مقفل.'));const serialized=JSON.stringify(state);writes=writes.catch(()=>{}).then(async()=>{const tmp=filename+'.'+randomUUID()+'.tmp';try{const sealed=await cipher.seal(serialized);await fs.mkdir(path.dirname(filename),{recursive:true,mode:0o700});await fs.writeFile(tmp,sealed,{mode:0o600,flag:'wx',flush:true});await fs.rename(tmp,filename);status='encrypted';}catch(error){status='error';onError();throw error;}finally{await fs.unlink(tmp).catch(()=>{});}});return writes;}
 function persist(){clearTimeout(timer);timer=setTimeout(()=>void flush().catch(()=>{}),150);}
 return {get state(){return state;},protection,replace,flush,persist,close(){clearTimeout(timer);return writes;}};
}
module.exports={openProtectedDocument};
