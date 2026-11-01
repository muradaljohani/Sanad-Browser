'use strict';
function normalizedSyncState(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||JSON.stringify(value).length>1200000)return null;
 const identity=value.identity;if(!identity||typeof identity.uid!=='string'||identity.uid.length>128||identity.provider!=='google.com'||typeof identity.email!=='string')return null;
 if(typeof value.deviceId!=='string'||!/^[A-Za-z0-9_-]{16,80}$/.test(value.deviceId))return null;
 const token=typeof value.token==='string'&&/^sanad_[A-Za-z0-9_-]{43}$/.test(value.token)?value.token:undefined;
 return {identity:{uid:identity.uid,email:identity.email.slice(0,320),name:String(identity.name||'').slice(0,200),provider:'google.com'},deviceId:value.deviceId,...(token?{token}:{}),expiresAt:Number(value.expiresAt)||0,enabled:Boolean(token&&value.enabled===true),includeHistory:value.includeHistory===true,initialized:value.initialized===true,seq:Number.isSafeInteger(value.seq)&&value.seq>=0?value.seq:0,queue:Array.isArray(value.queue)?value.queue.slice(0,5000):[],observed:value.observed&&typeof value.observed==='object'?value.observed:undefined};
}
function normalizedPendingLogin(value){if(!value||typeof value!=='object'||value.expiresAt<Date.now()||value.expiresAt>Date.now()+300001)return null;
 for(const key of ['state','verifier','challenge'])if(typeof value[key]!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(value[key]))return null;
 if(typeof value.deviceId!=='string'||!/^[A-Za-z0-9_-]{16,80}$/.test(value.deviceId))return null;
 return {state:value.state,verifier:value.verifier,challenge:value.challenge,deviceId:value.deviceId,expiresAt:value.expiresAt};}
function parseAuthCallback(raw){try{if(typeof raw!=='string'||raw.length>500)return null;const url=new URL(raw);if(url.protocol!=='sanad:'||url.hostname!=='auth-callback'||!['','/'].includes(url.pathname)||url.username||url.password||url.port||url.hash)return null;
 const keys=[...url.searchParams.keys()];if(keys.length!==2||!keys.includes('code')||!keys.includes('state'))return null;const code=url.searchParams.get('code'),state=url.searchParams.get('state');if(!/^[A-Za-z0-9_-]{43}$/.test(code||'')||!/^[A-Za-z0-9_-]{43}$/.test(state||''))return null;return {code,state};}catch{return null;}}
module.exports={normalizedSyncState,normalizedPendingLogin,parseAuthCallback};
