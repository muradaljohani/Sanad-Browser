'use strict';
window.SanadAccountPanel=function({root,command,element,button}){
 const intro=element('p','hint','سجّل الدخول بحساب Google لتبدأ مزامنة المفضلة والإعدادات والتبويبات العادية تلقائياً مع حساب سند. سجل التصفح اختياري. لا نطلب صلاحية Gmail.');
 const identity=element('div','sync-identity'),name=element('strong'),email=element('span');email.dir='ltr';identity.append(name,email);
 const status=element('p','hint');status.setAttribute('role','status');
 const signIn=button('تسجيل الدخول والمزامنة عبر Google',()=>void command('sync-sign-in',{history:historyChoice.checked}),'sync-primary');
 const consent=element('div','sync-consent'),consentText=element('p','hint','ستُدمج المفضلة والإعدادات والتبويبات العادية على هذا الجهاز مع بيانات حساب Google المعروض أعلاه.');
 const historyLabel=element('label','sync-check'),historyChoice=element('input');historyChoice.type='checkbox';historyLabel.append(historyChoice,document.createTextNode('مزامنة سجل التصفح أيضاً'));
 const enable=button('بدء المزامنة على هذا الحساب',()=>void command('sync-enable',{history:historyChoice.checked}),'sync-primary');consent.append(consentText,enable);
 const actions=element('div','actions'),now=button('المزامنة الآن',()=>void command('sync-now')),logout=button('تسجيل الخروج من المزامنة',()=>void command('sync-sign-out'));actions.append(now,logout);
 const details=element('p','hint','تشفير أثناء النقل وفي التخزين بمفاتيح تديرها خدمة سَنَد الحرمين. لا تُزامن التبويبات الخاصة أو كلمات المرور أو ملفات تعريف الارتباط.');
 const importHeading=element('h2','','استيراد بيانات Google Chrome'),importHint=element('p','hint','اختر ملفك الشخصي ثم اعرض المعاينة. لا تُغيّر عملية الاستيراد ملفات كروم. الحد الحالي: 1000 إشارة مرجعية، أحدث 200 زيارة، و32 تبويباً إجمالاً.');
 const profileRow=element('div','actions'),profiles=element('select');profiles.setAttribute('aria-label','ملف Chrome الشخصي');
 const detect=button('اكتشاف ملفات كروم',()=>void command('chrome-profiles')),inspect=button('عرض معاينة الاستيراد',()=>void command('chrome-preview',{profileId:profiles.value}));profileRow.append(profiles,detect,inspect);
 const file=button('استيراد ملف تصدير كروم',()=>void command('chrome-file-import')),help=button('مساعد تصدير الصفحات المحمية من كروم',()=>{void command('new');void command('navigate',{value:'https://ip-murad.com/browser/import/'});});
 const preview=element('div','sync-preview'),counts=element('p'),warnings=element('div'),choices=element('div','sync-choices'),checks={};
 for(const [key,label,checked]of [['bookmarks','المفضلة',true],['tabs','التبويبات المتاحة',true],['settings','الإعدادات المتوافقة',true],['history','سجل التصفح',false]]){const node=element('label','sync-check'),input=element('input');input.type='checkbox';input.checked=checked;checks[key]=input;node.append(input,document.createTextNode(label));choices.append(node);}
 let currentPreview;
 const apply=button('استيراد البيانات المختارة',()=>void command('chrome-import',{previewId:currentPreview,...Object.fromEntries(Object.entries(checks).map(([key,node])=>[key,node.checked]))}),'sync-primary');preview.append(counts,choices,warnings,apply);
 root.append(intro,identity,status,historyLabel,signIn,consent,actions,details,importHeading,importHint,profileRow,file,help,preview);
 let profileKey='';
 const phases={'signed-out':'لم تسجل الدخول بعد','awaiting-consent':'تم تسجيل الدخول. اختر بياناتك لبدء المزامنة.','syncing':'جارٍ المزامنة…','ready':'المزامنة مفعّلة','error':'تعذرت المزامنة مؤقتاً. التغييرات المحلية محفوظة.','expired':'انتهت جلسة المزامنة. سجل الدخول مجدداً.'};
 return {update(state){const sync=state.sync||{};identity.hidden=!sync.identity;name.textContent=sync.identity?.name||'';email.textContent=sync.identity?.email||'';status.textContent=phases[sync.phase]||'المزامنة';
 historyLabel.hidden=sync.signedIn===true&&sync.enabled===true;signIn.hidden=sync.signedIn===true;signIn.disabled=!sync.protectedStorage||state.locationPrivacy?.enabled;signIn.title=!sync.protectedStorage?'يلزم التخزين المشفر في النظام':state.locationPrivacy?.enabled?'تسجيل الدخول يستخدم متصفح النظام خارج مسار الوسيط':'';
 consent.hidden=!sync.signedIn||sync.enabled;now.hidden=!sync.signedIn||!sync.enabled;now.disabled=sync.phase==='syncing';logout.hidden=!sync.identity;
 const key=JSON.stringify(sync.profiles||[]);if(key!==profileKey){profileKey=key;const old=profiles.value;profiles.replaceChildren();for(const item of sync.profiles||[]){const option=element('option','',item.name);option.value=item.id;profiles.append(option);}if([...profiles.options].some(item=>item.value===old))profiles.value=old;}
 inspect.disabled=sync.importBusy||!profiles.value;detect.disabled=sync.importBusy;
 preview.hidden=!sync.preview;currentPreview=sync.preview?.id;if(sync.preview){const c=sync.preview.counts;counts.textContent=`المتاح للاستيراد: ${c.bookmarks} مفضلة · ${c.history} زيارة · ${c.tabs} تبويب · ${c.settings} إعداد`;
 warnings.replaceChildren();for(const text of sync.preview.warnings||[])warnings.append(element('p','hint',text));}
 }};
};
