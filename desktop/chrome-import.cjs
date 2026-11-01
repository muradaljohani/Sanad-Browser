'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const {safeURL,mayRemember}=require('./policy.cjs');
const validURL=value=>{const url=safeURL(value);return url&&mayRemember(url)?url:null;};
const profileName=value=>typeof value==='string'&&/^(Default|Profile [0-9]{1,4})$/.test(value);
function chromeRoot({platform=process.platform,home=os.homedir(),localAppData=process.env.LOCALAPPDATA}={}){
 if(platform==='win32')return path.join(localAppData||path.join(home,'AppData','Local'),'Google','Chrome','User Data');
 return platform==='darwin'?path.join(home,'Library','Application Support','Google','Chrome'):path.join(home,'.config','google-chrome');
}
async function child(root,name,max){
 const candidate=path.join(root,name),stat=await fs.promises.lstat(candidate);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>max)throw Error('unsupported_file');
 const realRoot=await fs.promises.realpath(root),real=await fs.promises.realpath(candidate);if(path.dirname(real)!==realRoot)throw Error('unsafe_path');return {candidate,stat};
}
async function bytes(root,name,max){const {candidate,stat}=await child(root,name,max);const handle=await fs.promises.open(candidate,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));try{const data=Buffer.alloc(stat.size+1);const {bytesRead}=await handle.read(data,0,data.length,0);const after=await handle.stat();if(bytesRead!==stat.size||after.size!==stat.size||after.mtimeMs!==stat.mtimeMs)throw Error('file_changed');return data.subarray(0,bytesRead);}finally{await handle.close();}}
async function json(root,name,max){return JSON.parse((await bytes(root,name,max)).toString('utf8'));}
async function listProfiles(options={}){const root=chromeRoot(options);let cache={};try{cache=(await json(root,'Local State',2*1024*1024)).profile?.info_cache||{};}catch{}
 let dirs=[];try{dirs=await fs.promises.readdir(root,{withFileTypes:true});}catch{return [];}
 const result=[];for(const item of dirs){if(!item.isDirectory()||item.isSymbolicLink()||!profileName(item.name))continue;const real=await fs.promises.realpath(path.join(root,item.name));if(path.dirname(real)!==await fs.promises.realpath(root))continue;result.push({id:item.name,name:String(cache[item.name]?.name||item.name).slice(0,100)});}return result.slice(0,20);}
function parseBookmarks(data){const result=[],seen=new Set();let visited=0;function walk(node,folder='',depth=0){if(!node||typeof node!=='object'||depth>32||visited++>50000)return;
 const url=validURL(node.url);if(url&&!seen.has(url)){seen.add(url);result.push({url,title:String(node.name||url).slice(0,200),...(folder?{folder:folder.slice(0,200)}:{})});}
 if(Array.isArray(node.children))for(const child of node.children)walk(child,[folder,node.name].filter(Boolean).join(' / '),depth+1);
 }for(const node of Object.values(data?.roots||{}))walk(node);return {entries:result.slice(0,1000),total:result.length};}
function parseSessions(data){if(data.length<8||data.toString('ascii',0,4)!=='SNSS')throw Error('invalid_session');const version=data.readInt32LE(4);if(![1,3].includes(version))throw Error('encrypted_or_new_session');
 const tabs=new Map(),selected=new Map(),windows=new Map();let offset=8,records=0;
 while(offset+3<=data.length&&records++<100000){const size=data.readUInt16LE(offset);offset+=2;if(size<1||offset+size>data.length)break;const id=data[offset],payload=data.subarray(offset+1,offset+size);offset+=size;
 if(id===0&&payload.length>=8)windows.set(payload.readInt32LE(0),payload.readInt32LE(4));
 if(id===3&&payload.length>=4){tabs.delete(payload.readInt32LE(0));selected.delete(payload.readInt32LE(0));}
 if(id===4&&payload.length>=4){const win=payload.readInt32LE(0);for(const [tab,w]of windows)if(w===win)tabs.delete(tab);}
 if(id===7&&payload.length>=8)selected.set(payload.readInt32LE(0),payload.readInt32LE(4));
 if(id!==6||payload.length<20)continue;
 try{let pos=4;if(payload.readUInt32LE(0)>payload.length-4)continue;const tab=payload.readInt32LE(pos);pos+=4;const index=payload.readInt32LE(pos);pos+=4;const n=payload.readInt32LE(pos);pos+=4;if(n<0||n>4000||pos+n>payload.length)continue;const url=validURL(payload.toString('utf8',pos,pos+n));pos+=(n+3)&~3;if(!url||pos+4>payload.length)continue;const chars=payload.readInt32LE(pos);pos+=4;if(chars<0||chars>10000||pos+chars*2>payload.length)continue;const title=payload.toString('utf16le',pos,pos+chars*2).slice(0,200)||url;if(!tabs.has(tab))tabs.set(tab,new Map());tabs.get(tab).set(index,{url,title});}catch{}
 }
 return [...tabs].map(([id,nav])=>nav.get(selected.get(id))||[...nav.entries()].sort((a,b)=>b[0]-a[0])[0]?.[1]).filter(Boolean).slice(0,32);
}
function parsePreferences(data){const result={};const lang=String(data?.intl?.accept_languages||data?.intl?.selected_languages||'').split(',')[0].split('-')[0];if(['ar','en','fr','de','tr','ur','id'].includes(lang))result.language=lang;
 const size=Number(data?.webkit?.webprefs?.default_font_size);if(size>=20)result.zoom=1.3;else if(size>=18)result.zoom=1.15;
 if(data?.history?.saving_disabled===true)result.saveHistory=false;return result;}
async function readProfile(profileId,options={}){if(!profileName(profileId))throw Error('invalid_profile');const profiles=await listProfiles(options);if(!profiles.some(x=>x.id===profileId))throw Error('profile_not_found');const root=path.join(chromeRoot(options),profileId),result={bookmarks:[],history:[],tabs:[],settings:{},warnings:[],counts:{bookmarks:0}};
 try{const books=parseBookmarks(await json(root,'Bookmarks',8*1024*1024));result.bookmarks=books.entries;result.counts.bookmarks=books.total;if(books.total>1000)result.warnings.push('تدعم هذه النسخة استيراد أول 1000 إشارة مرجعية.');}catch{result.warnings.push('تعذر قراءة مفضلة هذا الملف الشخصي.');}
 try{result.settings=parsePreferences(await json(root,'Preferences',4*1024*1024));}catch{result.warnings.push('تعذر قراءة الإعدادات المتوافقة.');}
 try{
  const {DatabaseSync}=require('node:sqlite');const temporary=await fs.promises.mkdtemp(path.join(os.tmpdir(),'sanad-chrome-import-'));
  try{await fs.promises.writeFile(path.join(temporary,'History'),await bytes(root,'History',128*1024*1024));try{await fs.promises.writeFile(path.join(temporary,'History-wal'),await bytes(root,'History-wal',32*1024*1024));}catch{}
   const db=new DatabaseSync(path.join(temporary,'History'),{timeout:1000,allowExtension:false});try{db.exec('PRAGMA query_only=ON');result.history=db.prepare('SELECT url,title,CAST(last_visit_time / 1000 - 11644473600000 AS INTEGER) AS visited_ms FROM urls WHERE hidden=0 ORDER BY last_visit_time DESC LIMIT 200').all().flatMap(row=>{const url=validURL(row.url);return url?[{url,title:String(row.title||url).slice(0,200),timestamp:Math.max(0,Number(row.visited_ms))}]:[];});}finally{db.close();}
  }finally{await fs.promises.rm(temporary,{recursive:true,force:true});}
 }catch{result.warnings.push('تعذر قراءة السجل الآن. أغلق كروم وأعد المعاينة؛ يمكن استخدام ملف التصدير أيضاً.');}
 try{const sessions=path.join(root,'Sessions'),stat=await fs.promises.lstat(sessions);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error();const files=(await fs.promises.readdir(sessions)).filter(name=>/^Session_[0-9]+$/.test(name)).sort().reverse();if(!files[0])throw Error();result.tabs=parseSessions(await bytes(sessions,files[0],16*1024*1024));}
 catch{result.warnings.push('قد تكون جلسة كروم محمية بتشفير النظام. لاستيراد الصفحات المفتوحة استخدم ملف التصدير من مساعد كروم.');}
 return result;
}
function inspectProfile(profileId,options={}){return new Promise((resolve,reject)=>{const worker=new Worker(__filename,{workerData:{profileId,options},resourceLimits:{maxOldGenerationSizeMb:128}});const timer=setTimeout(()=>{void worker.terminate();reject(Error('import_timeout'));},15000);worker.once('message',value=>{clearTimeout(timer);value.error?reject(Error(value.error)):resolve(value.data);});worker.once('error',error=>{clearTimeout(timer);reject(error);});worker.once('exit',code=>{clearTimeout(timer);if(code!==0)reject(Error('import_failed'));});});}
if(!isMainThread)readProfile(workerData.profileId,workerData.options).then(data=>parentPort.postMessage({data}),error=>parentPort.postMessage({error:error.message}));
module.exports={listProfiles,inspectProfile,readProfile,parseBookmarks,parsePreferences,parseSessions,chromeRoot};
