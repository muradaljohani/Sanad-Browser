export const ACCOUNT_ENDPOINT='https://ip-murad.com/api/browser/account';
const encode=value=>btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const random=()=>encode(crypto.getRandomValues(new Uint8Array(32)));
export async function pendingGoogleLogin(deviceId=crypto.randomUUID(),options={}) {const verifier=random();return {state:random(),verifier,challenge:encode(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))),deviceId,syncOnSignIn:options.syncOnSignIn===true,includeHistory:options.includeHistory===true,expiresAt:Date.now()+300000};}
export function googleLoginURL(pending,client='desktop'){if(!['desktop','web'].includes(client))throw Error('invalid_client');return 'https://ip-murad.com/auth/google?'+new URLSearchParams({client,state:pending.state,challenge:pending.challenge});}
export async function accountRequest(action,{token,body,query={},fetchImpl=fetch}={}) {
 const response=await fetchImpl(ACCOUNT_ENDPOINT+'?'+new URLSearchParams({action,...query}),{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',redirect:'error',signal:AbortSignal.timeout(25000)});
 const data=await response.json();if(!response.ok){const error=new Error(data?.error||'sync_unavailable');error.status=response.status;throw error;}return data;
}
export async function exchangeGoogleCode(callback,pending,fetchImpl=fetch){if(!pending||pending.expiresAt<Date.now()||callback.state!==pending.state||!/^[A-Za-z0-9_-]{43}$/.test(callback.code||''))throw Error('invalid_callback');
 const data=await accountRequest('exchange',{body:{code:callback.code,state:pending.state,verifier:pending.verifier,deviceId:pending.deviceId},fetchImpl});
 if(!/^sanad_[A-Za-z0-9_-]{43}$/.test(data.token||'')||typeof data.identity?.uid!=='string'||data.identity.provider!=='google.com')throw Error('invalid_session');
 return {client:data.client==='desktop'?'desktop':'web',token:data.token,identity:data.identity,deviceId:pending.deviceId,expiresAt:data.expiresAt,enabled:pending.syncOnSignIn===true,includeHistory:pending.syncOnSignIn===true&&pending.includeHistory===true,initialized:false,queue:[],seq:0};
}
