const $=s=>document.querySelector(s),DAYS=["ì›”","í™”","ìˆ˜","ëª©","ê¸ˆ"],deviceId=localStorage.deviceId||=crypto.randomUUID();
let schedule=[],cycle="weekly",anchorDate="2026-01-05",selectedDay=Math.min(Math.max(new Date().getDay(),1),5),selectedWeek="A",pushSubscription=null,pushEnabled=false,installPrompt=null;
const toMinutes=t=>{const[h,m]=t.split(":").map(Number);return h*60+m};
function toast(message){const el=$("#toast");el.textContent=message;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2400)}
function escapeHtml(value){const div=document.createElement("div");div.textContent=value;return div.innerHTML}
function seoulNow(){const p=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit",weekday:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date()),get=t=>p.find(x=>x.type===t)?.value,map={Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6,Sun:7};return{date:`${get("year")}-${get("month")}-${get("day")}`,day:map[get("weekday")],minutes:Number(get("hour"))*60+Number(get("minute"))}}
function currentMonday(){const now=seoulNow(),date=new Date(`${now.date}T00:00:00Z`);date.setUTCDate(date.getUTCDate()-Math.min(now.day-1,6));return date.toISOString().slice(0,10)}
function activeCycleWeek(date=seoulNow().date){const weeks=Math.floor((Date.parse(`${date}T00:00:00Z`)-Date.parse(`${anchorDate}T00:00:00Z`))/604800000);return((weeks%2)+2)%2===0?"A":"B"}
function renderCycle(){$("#cycle").value=cycle;$("#anchorDate").value=anchorDate;$("#anchorField").hidden=cycle!=="biweekly";$("#weekTabs").hidden=cycle!=="biweekly";$("#classWeekField").hidden=cycle!=="biweekly";document.querySelectorAll(".week-tab").forEach(b=>b.classList.toggle("active",b.dataset.week===selectedWeek))}
function renderDays(){$("#days").innerHTML=DAYS.map((d,i)=>`<button class="day ${selectedDay===i+1?"active":""}" data-day="${i+1}">${d}</button>`).join("");$("#dayTitle").textContent=`${DAYS[selectedDay-1]}ìš”ì¼${cycle==="biweekly"?` Â· ${selectedWeek}ì£¼`:""}`}
const appliesToWeek=(item,week)=>cycle==="weekly"||!item.week||item.week==="ALL"||item.week===week;
function renderClasses(){const items=schedule.filter(x=>x.day===selectedDay&&appliesToWeek(x,selectedWeek)).sort((a,b)=>a.start.localeCompare(b.start));$("#classList").innerHTML=items.length?items.map(x=>`<button class="class-item" data-id="${x.id}"><span class="class-time">${x.start}</span><span class="class-info"><strong>${escapeHtml(x.name)}${cycle==="biweekly"?`<span class="week-badge">${x.week==="ALL"?"ë§¤ì£¼":`${x.week||"A"}ì£¼`}</span>`:""}</strong><span>${escapeHtml(x.room||"ê°•ì˜ì‹¤ ë¯¸ì •")} Â· ${x.end} ì¢…ë£Œ</span></span><span class="chevron">â€º</span></button>`).join(""):`<div class="empty">ë“±ë¡ëœ ìˆ˜ì—…ì´ ì—†ìŠµë‹ˆë‹¤.</div>`}
function renderNext(){const now=seoulNow(),week=cycle==="biweekly"?activeCycleWeek(now.date):"ALL",next=schedule.filter(x=>x.day===now.day&&toMinutes(x.end)>now.minutes&&appliesToWeek(x,week)).sort((a,b)=>a.start.localeCompare(b.start))[0];if(!next){$("#nextName").textContent=schedule.length?"ì˜¤ëŠ˜ ìˆ˜ì—…ì´ ëë‚¬ì–´ìš”":"ì‹œê°„í‘œë¥¼ ì¶”ê°€í•´ ì£¼ì„¸ìš”";$("#nextMeta").textContent=schedule.length?"ê³ ìƒí–ˆì–´ìš”. ë‹¤ìŒ ìˆ˜ì—… ë•Œ ë§Œë‚˜ìš”.":"ì•„ëž˜ì—ì„œ ìˆ˜ì—…ì„ ë“±ë¡í•  ìˆ˜ ìžˆì–´ìš”.";$("#countdown").textContent="â€”";return}const diff=toMinutes(next.start)-now.minutes;$("#nextName").textContent=next.name;$("#nextMeta").textContent=`${next.start}â€“${next.end}${next.room?` Â· ${next.room}`:""}`;$("#countdown").textContent=diff>0?`${diff}ë¶„ í›„`:"ì§„í–‰ ì¤‘"}
async function save(){const r=await fetch("/api/device",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({deviceId,schedule,cycle,anchorDate,reminderMinutes:Number($("#reminder").value),subscription:pushSubscription})});if(!r.ok)throw new Error((await r.json()).error||"ì €ìž¥í•˜ì§€ ëª»í–ˆìŠµë‹ˆë‹¤.")}
function openDialog(item){$("#classId").value=item?.id||"";$("#className").value=item?.name||"";$("#classRoom").value=item?.room||"";$("#classWeek").value=item?.week||selectedWeek;$("#classStart").value=item?.start||"09:00";$("#classEnd").value=item?.end||"10:15";$("#deleteButton").hidden=!item;$("#classDialog").showModal()}
function decodeKey(v){const p="=".repeat((4-v.length%4)%4),b=(v+p).replace(/-/g,"+").replace(/_/g,"/");return Uint8Array.from(atob(b),c=>c.charCodeAt(0))}
async function enablePush(){if(!("serviceWorker"in navigator)||!("PushManager"in window))throw new Error("ì´ ê¸°ê¸°ì—ì„œëŠ” ì›¹ í‘¸ì‹œë¥¼ ì§€ì›í•˜ì§€ ì•ŠìŠµë‹ˆë‹¤.");const standalone=matchMedia("(display-mode: standalone)").matches||navigator.standalone;if(/iPhone|iPad|iPod/.test(navigator.userAgent)&&!standalone)throw new Error("Safari ê³µìœ  ë²„íŠ¼ì—ì„œ â€˜í™ˆ í™”ë©´ì— ì¶”ê°€â€™í•œ ë’¤ ë‹¤ì‹œ ì—´ì–´ ì£¼ì„¸ìš”.");if(await Notification.requestPermission()!=="granted")throw new Error("iPhone ì„¤ì •ì—ì„œ ì•Œë¦¼ì„ í—ˆìš©í•´ ì£¼ì„¸ìš”.");const reg=await navigator.serviceWorker.ready,{vapidPublicKey}=await fetch("/api/config").then(r=>r.json());pushSubscription=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decodeKey(vapidPublicKey)});await save();pushEnabled=true;$("#pushStatus").textContent="ë‹¤ìŒ ìˆ˜ì—… ì „ì— ì•Œë ¤ë“œë¦´ê²Œìš”.";$("#pushButton").textContent="ì¼œì§";toast("ì•Œë¦¼ì„ ì¼°ìŠµë‹ˆë‹¤.")}
async function disablePush(){const reg=await navigator.serviceWorker.ready,current=await reg.pushManager.getSubscription();if(current)await current.unsubscribe();const r=await fetch("/api/push/disable",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({deviceId})});if(!r.ok)throw new Error("ì•Œë¦¼ì„ ë„ì§€ ëª»í–ˆìŠµë‹ˆë‹¤.");pushSubscription=null;pushEnabled=false;$("#pushStatus").textContent="í™ˆ í™”ë©´ì— ì„¤ì¹˜í•˜ë©´ í‘¸ì‹œ ì•Œë¦¼ì„ ë°›ì„ ìˆ˜ ìžˆì–´ìš”.";$("#pushButton").textContent="ì•Œë¦¼ ì¼œê¸°";toast("ì•Œë¦¼ì„ ê»ìŠµë‹ˆë‹¤.")}
function validImportedClass(x){return x&&Number.isInteger(x.day)&&x.day>=1&&x.day<=5&&["A","B","ALL",undefined].includes(x.week)&&typeof x.name==="string"&&x.name.trim()&&typeof x.room==="string"&&/^([01]\d|2[0-3]):[0-5]\d$/.test(x.start)&&/^([01]\d|2[0-3]):[0-5]\d$/.test(x.end)&&toMinutes(x.end)>toMinutes(x.start)}
async function importTimetable(file){const data=JSON.parse(await file.text());if(data.format!=="next-class-timetable"||data.version!==1||!["weekly","biweekly"].includes(data.cycle)||!/^\d{4}-\d{2}-\d{2}$/.test(data.anchorDate)||!Array.isArray(data.classes)||data.classes.length>80||!data.classes.every(validImportedClass))throw new Error("ì§€ì›í•˜ì§€ ì•ŠëŠ” ì‹œê°„í‘œ íŒŒì¼ìž…ë‹ˆë‹¤.");if(!confirm(`í˜„ìž¬ ì‹œê°„í‘œë¥¼ ${data.classes.length}ê°œ ìˆ˜ì—…ìœ¼ë¡œ êµì²´í• ê¹Œìš”?`))return;schedule=data.classes.map(x=>({...x,id:x.id||crypto.randomUUID(),week:x.week||"ALL"}));cycle=data.cycle;anchorDate=data.anchorDate;$("#reminder").value=String([5,10,15,30].includes(data.reminderMinutes)?data.reminderMinutes:10);selectedWeek=cycle==="biweekly"?activeCycleWeek():"A";await save();renderCycle();renderDays();renderClasses();renderNext();toast("ì‹œê°„í‘œë¥¼ ê°€ì ¸ì™”ìŠµë‹ˆë‹¤.")}
function exportTimetable(){const data={format:"next-class-timetable",version:1,cycle,anchorDate,reminderMinutes:Number($("#reminder").value),classes:schedule},blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"}),link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download=`next-class-${new Date().toISOString().slice(0,10)}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000)}
async function init(){$("#todayLabel").textContent=new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",weekday:"long",month:"long",day:"numeric"}).format(new Date());if("serviceWorker"in navigator)await navigator.serviceWorker.register("/sw.js");const data=await fetch(`/api/device/${deviceId}`).then(r=>r.json()).catch(()=>({}));schedule=data.schedule||[];cycle=data.cycle||"weekly";anchorDate=data.anchorDate||currentMonday();selectedWeek=cycle==="biweekly"?activeCycleWeek():"A";pushEnabled=Boolean(data.pushEnabled);$("#reminder").value=String(data.reminderMinutes||10);if(pushEnabled){$("#pushStatus").textContent="ë‹¤ìŒ ìˆ˜ì—… ì „ì— ì•Œë ¤ë“œë¦´ê²Œìš”.";$("#pushButton").textContent="ì¼œì§"}renderCycle();renderDays();renderClasses();renderNext()}
$("#days").addEventListener("click",e=>{const b=e.target.closest("[data-day]");if(b){selectedDay=Number(b.dataset.day);renderDays();renderClasses()}});
$("#weekTabs").addEventListener("click",e=>{const b=e.target.closest("[data-week]");if(b){selectedWeek=b.dataset.week;renderCycle();renderDays();renderClasses()}});
$("#cycle").addEventListener("change",async e=>{cycle=e.target.value;if(!anchorDate)anchorDate=currentMonday();selectedWeek=cycle==="biweekly"?activeCycleWeek():"A";await save();renderCycle();renderDays();renderClasses();renderNext();toast(cycle==="biweekly"?"ê²©ì£¼ ì‹œê°„í‘œë¥¼ ì¼°ìŠµë‹ˆë‹¤.":"ë§¤ì£¼ ì‹œê°„í‘œë¡œ ë³€ê²½í–ˆìŠµë‹ˆë‹¤.")});
$("#anchorDate").addEventListener("change",async e=>{anchorDate=e.target.value;selectedWeek=activeCycleWeek();await save();renderCycle();renderDays();renderClasses();renderNext();toast("Aì£¼ ê¸°ì¤€ ë‚ ì§œë¥¼ ë³€ê²½í–ˆìŠµë‹ˆë‹¤.")});
$("#classList").addEventListener("click",e=>{const b=e.target.closest("[data-id]");if(b)openDialog(schedule.find(x=>x.id===b.dataset.id))});$("#addButton").addEventListener("click",()=>openDialog());
$("#classForm").addEventListener("submit",async e=>{e.preventDefault();const item={id:$("#classId").value||crypto.randomUUID(),day:selectedDay,week:cycle==="biweekly"?$("#classWeek").value:"ALL",name:$("#className").value.trim(),room:$("#classRoom").value.trim(),start:$("#classStart").value,end:$("#classEnd").value};if(toMinutes(item.end)<=toMinutes(item.start))return toast("ì¢…ë£Œ ì‹œê°„ì€ ì‹œìž‘ ì‹œê°„ë³´ë‹¤ ëŠ¦ì–´ì•¼ í•©ë‹ˆë‹¤.");const i=schedule.findIndex(x=>x.id===item.id);i>=0?schedule[i]=item:schedule.push(item);try{await save();$("#classDialog").close();renderClasses();renderNext();toast("ì‹œê°„í‘œë¥¼ ì €ìž¥í–ˆìŠµë‹ˆë‹¤.")}catch(error){toast(error.message)}});
$("#deleteButton").addEventListener("click",async()=>{schedule=schedule.filter(x=>x.id!==$("#classId").value);await save();$("#classDialog").close();renderClasses();renderNext();toast("ìˆ˜ì—…ì„ ì‚­ì œí–ˆìŠµë‹ˆë‹¤.")});$("#closeDialogButton").addEventListener("click",()=>$("#classDialog").close());
$("#reminder").addEventListener("change",()=>save().then(()=>toast("ì•Œë¦¼ ì‹œì ì„ ë³€ê²½í–ˆìŠµë‹ˆë‹¤.")).catch(e=>toast(e.message)));$("#pushButton").addEventListener("click",()=>{(pushEnabled?disablePush():enablePush()).catch(e=>toast(e.message))});
$("#testButton").addEventListener("click",async()=>{const r=await fetch("/api/push/test",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({deviceId})}),result=await r.json();toast(r.ok?"í…ŒìŠ¤íŠ¸ ì•Œë¦¼ì„ ë³´ëƒˆìŠµë‹ˆë‹¤.":result.error||"ì•Œë¦¼ ì „ì†¡ì— ì‹¤íŒ¨í–ˆìŠµë‹ˆë‹¤.")});
$("#importButton").addEventListener("click",()=>$("#importFile").click());$("#importFile").addEventListener("change",e=>{const file=e.target.files[0];if(file)importTimetable(file).catch(error=>toast(error.message));e.target.value=""});$("#exportButton").addEventListener("click",exportTimetable);
$("#promptButton").addEventListener("click",async()=>{try{const prompt=await fetch("/ai-import-prompt.txt").then(r=>r.text());await navigator.clipboard.writeText(prompt);toast("AI ë³€í™˜ í”„ë¡¬í”„íŠ¸ë¥¼ ë³µì‚¬í–ˆìŠµë‹ˆë‹¤.")}catch{toast("í”„ë¡¬í”„íŠ¸ë¥¼ ë³µì‚¬í•˜ì§€ ëª»í–ˆìŠµë‹ˆë‹¤.")}});
addEventListener("beforeinstallprompt",e=>{e.preventDefault();installPrompt=e;$("#installButton").hidden=false});$("#installButton").addEventListener("click",async()=>installPrompt?installPrompt.prompt():toast("ê³µìœ  ë²„íŠ¼ì—ì„œ â€˜í™ˆ í™”ë©´ì— ì¶”ê°€â€™ë¥¼ ì„ íƒí•˜ì„¸ìš”."));setInterval(renderNext,60000);init();
$("#refreshButton").addEventListener("click",async()=>{try{toast("ìµœì‹  ë²„ì „ì„ í™•ì¸í•˜ê³  ìžˆì–´ìš”.");if("serviceWorker"in navigator){const reg=await navigator.serviceWorker.getRegistration();if(reg)await reg.update()}if("cachg]5ï{h‘éì¶»§q«^wÊHŠBˆ˜š[™
\Ù\’Y]šXÙOËœØÚY[WÚœÛÛˆÏÈ”ÓÓ‹œÝš[™ÚYžJ›Ü›X[^™TØÚY[J×JJK]šXÙOËœ™[Z[™\—ÛZ[]\ÈÏÈL
Kˆ[‹‘‹œ™\\™J•TUH]šXÙ\ÈÑU\Ù\—ÚYHÈÒT‘HYHÈŠK˜š[™
\Ù\’Y›ÙK™]šXÙRY
Kˆ[‹‘‹œ™\\™J’S”ÑT•S•ÈÙ\ÜÚ[ÛœÈ
ÚÙ[—Ú\Ú\Ù\—ÚY^\™\×Ø]
HSQTÈ
ËËÊHŠBˆ˜š[™
Ù\ÜÚ[Û‹ÚÙ[’\Ú\Ù\’YÙ\ÜÚ[Û‹™^\™\Ð]
KˆJNÂˆHØ]Ú
\œ›ÜŠHÂˆÛÛœÛÛK™\œ›ÜŠœÚYÛ\˜Z[Y‹\œ›ÜŠNÂˆ™]\›ˆœÛÛŠÈ\œ›ÜŽˆ»f£;&ä:¬ ;'¡{'a;&a:èã;ef;)à:ê®ûe¢;"­zââ:âéˆ;'¨;"ç;fá:âé;"ç;"ç:ãá;em;(ï;!.;&¥ˆˆKL
NÂˆBˆ]ØZ]ÛX\]]][\
[‹ÚYÛ\Ù^JNÂˆ™]\›ˆ]]œÛÛŠÈ\Ù\ŽˆÈYˆ\Ù\’Y\Ù\›˜[YHHKÙ\ÜÚ[ÛÛÛÚÚYJÙ\ÜÚ[Û‹ÚÙ[‹Ù\ÜÚ[Û‹™^\™\ÊKŒJNÂˆB‚ˆYˆ
\›œ]˜[YHOOH‹Ø\KØ]]ÛÙÚ[ˆˆ	‰ˆ™\]Y\Ý›Y]ÙOOH”ÔÕŠHÂˆÛÛœÝ›ÙHH]ØZ]™\]Y\ÝšœÛÛÈ\Ù\›˜[YOÎˆ[šÛ›ÝÛŽÈ\ÜÝÛÜ™Îˆ[šÛ›ÝÛŽÈ]šXÙRYÎˆ[šÛ›ÝÛŽÈ[Y]X›PÚÚXÙOÎˆ[šÛ›ÝÛˆOŠ
Bˆ˜Ø]Ú


HOˆ
ßH\ÈÈ\Ù\›˜[YOÎˆ[šÛ›ÝÛŽÈ\ÜÝÛÜ™Îˆ[šÛ›ÝÛŽÈ]šXÙRYÎˆ[šÛ›ÝÛŽÈ[Y]X›PÚÚXÙOÎˆ[šÛ›ÝÛˆJJNÂˆYˆ
]˜[Y\Ù\›˜[YJ›ÙK\Ù\›˜[YJH]˜[Y\ÜÝÛÜ™
›ÙKœ\ÜÝÛÜ™
H]˜[Y]šXÙRY
›ÙK™]šXÙRY
JHÂˆ™]\›ˆœÛÛŠÈ\œ›ÜŽˆ»%a;'m:å%:æ$:â¥:îa:ì :ì¢;f.:éo;fe{'n;em;(ï;!.;&¥ˆˆK
NÂˆBˆÛÛœÝ›Ü›X[^™Y\Ù\›˜[YHH›ÙK\Ù\›˜[YKÓÝÙ\Ø\ÙJ
NÂˆÛÛœÝÙÚ[’Ù^HHÙÚ[Ž‰Ü™\]Y\ÝÛY[Ù^J™\]Y\Ý›ÙK™]šXÙRY
_N‰Û›Ü›X[^™Y\Ù\›˜[Y_XÂˆYˆ
]ØZ]]][Z]
[‹ÙÚ[’Ù^KLL
JH™]\›ˆœÛÛŠÈ\œ›ÜŽˆºèg:­î;'n;"ç:ãá:¬ :á":ë-:éã»"­zââ:âéˆMzí¡;fá:âé;"ç;"ç:ãá;em;(ï;!.;&¥ˆˆKŽJNÂˆÛÛœÝ\Ù\ˆH]ØZ][‹‘‹œ™\\™J”ÑSPÕY\Ù\›˜[YK\ÜÝÛÜ™Ú\Ú\ÜÝÛÜ™ÜØ[”“ÓH\Ù\œÈÒT‘H\Ù\›˜[YHHÈŠBˆ˜š[™
›Ü›X[^™Y\Ù\›˜[YJK™š\œÝÈYˆÝš[™ÎÈ\Ù\›˜[YNˆÝš[™ÎÈ\ÜÝÛÜ™Ú\ÚˆÝš[™ÎÈ\ÜÝÛÜ™ÜØ[ˆÝš[™ÈOŠ
NÂˆÛÛœÝØ[™Y]HH\Ù\‚ˆÈ]ØZ]\Ú\ÜÝÛÜ™
›ÙKœ\ÜÝÛÜ™\Ù\‹œ\ÜÝÛÜ™ÜØ[
Bˆˆ]ØZ]\Ú\ÜÝÛÜ™
›ÙKœ\ÜÝÛÜ™˜[™ÛUÚÙ[ŠMŠJNÂˆYˆ
]\Ù\ˆY\]X[ÙXÜ™]
Ø[™Y]K\Ù\‹œ\ÜÝÛÜ™Ú\Ú
JHÂˆ]ØZ]™XÛÜ™]]][\
[‹ÙÚ[’Ù^KL
NÂˆ™]\›ˆœÛÛŠÈ\œ›ÜŽˆ»%a;'m:å%:æ$:â¥:îa:ì :ì¢;f.:¬ ;&+:ì%:ém;)à;%b»"­zââ:âéˆˆKJNÂˆBˆ]ØZ]ÛX\]]][\
[‹ÙÚ[’Ù^JNÂˆÛÛœÝ]šXÙHH]ØZ][‹‘‹œ™\\™J”ÑSPÕ\Ù\—ÚYØÚY[WÚœÛÛ‹™[Z[™\—ÛZ[]\È”“ÓH]šXÙ\ÈÒT‘HYHÈŠBˆ˜š[™
›ÙK™]šXÙRY
K™š\œÝÈ\Ù\—ÚYˆÝš[™È[ÈØÚY[WÚœÛÛŽˆÝš[™ÎÈ™[Z[™\—ÛZ[]\Îˆ[X™\ˆOŠ
NÂˆYˆ
]šXÙOË\Ù\—ÚY	‰ˆ]šXÙK\Ù\—ÚYOOH\Ù\‹šY
HÂˆ™]\›ˆœÛÛŠÈ\œ›ÜŽˆ»'m:®,:®,:â¥:âé:én:¬á;(%{%ä;%ì:¬¬:ä&;%­;'¢;"­zââ:âéˆ:®,;(m:¬á;(%{%ä;!':ê/;( :èg:­î;%a;&àûem;(ï;!.;&¥ˆˆKÊNÂˆBˆÛÛœÝXØÛÝ[H]ØZ][‹‘‹œ™\\™J”ÑSPÕØÚY[WÚœÛÛ‹™[Z[™\—ÛZ[]\È”“ÓH[Y]X›\ÈÒT‘H\Ù\—ÚYHÈŠBˆ˜š[™
\Ù\‹šY
K™š\œÝÈØÚY[WÚœÛÛŽˆÝš[™ÎÈ™[Z[™\—ÛZ[]\Îˆ[X™\ˆOŠ
NÂˆÛÛœÝÛÛ™›XÝH]šXÙH	‰ˆY]šXÙK\Ù\—ÚY	‰ˆXØÛÝ[	‰ˆØÚY[\ÑY™™\Š]šXÙKœØÚY[WÚœÛÛ‹XØÛÝ[œØÚY[WÚœÛÛŠNÂˆYˆ
ÛÛ™›XÝ	‰ˆVÈ˜XØÛÝ[‹™]šXÙH—Kš[˜ÛY\ÊÝš[™Ê›ÙK[Y]X›PÚÚXÙJJJHÂˆ™]\›ˆœÛÛŠÈ\œ›ÜŽˆ»f!;'«:®,:®,;&`:¬á;(%{'f;"ç:¬!;dg:¬ :âé:é¡zââ:âéˆ‹ÛÛ™›XÝˆYHKJNÂˆBˆÛÛœÝÙ\ÜÚ[ÛˆH]ØZ]™]ÔÙ\ÜÚ[ÛŠ
NÂˆÛÛœÝÝ][Y[ÎˆT™\\™YÝ][Y[×HH×NÂˆYˆ
ÛÛ™›XÝ	‰ˆ›ÙK[Y]X›PÚÚXÙHOOH™]šXÙHŠHÂˆÝ][Y[Ëœ\Ú
[‹‘‹œ™\\™JTUH[Y]X›\ÈÑUØÚY[WÚœÛÛˆHË™[Z[™\—ÛZ[]\ÈHË\]YØ]HÕT”‘S•ÕSQTÕSTˆÒT‘H\Ù\—ÚYHØ
K˜š[™
]šXÙKœØÚY[WÚœÛÛ‹]šXÙKœ™[Z[™\—ÛZ[]\Ë\Ù\‹šY
JNÂˆBˆÝ][Y[Ëœ\Ú
[‹‘‹œ™\\™J•TUH]šXÙ\ÈÑU\Ù\—ÚYHÈÒT‘HYHÈŠK˜š[™
\Ù\‹šY›ÙK™]šXÙRY
JNÂˆÝ][Y[Ëœ\Ú
[‹‘‹œ™\\™J’S”ÑT•S•ÈÙ\ÜÚ[ÛœÈ
ÚÙ[—Ú\Ú\Ù\—ÚY^\™\×Ø]
HSQTÈ
ËËÊHŠBˆ˜š[™
Ù\ÜÚ[Û‹ÚÙ[’\Ú\Ù\‹šYÙ\ÜÚ[Û‹™^\™\Ð]
JNÂˆžHÂˆ]ØZ][‹‘‹˜˜]Ú
Ý][Y[ÊNÂˆHØ]Ú
\œ›ÜŠHÂˆÛÛœÛÛK™\œ›ÜŠ›ÙÚ[ˆ˜Z[Y‹\œ›ÜŠNÂˆ™]\›ˆœÛÛŠÈ\œ›ÜŽˆºèg:­î;'n;'a;&a:èã;ef;)à:ê®ûe¢;"­zââ:âéˆ;'¨;"ç;fá:âé;"ç;"ç:ãá;em;(ï;!.;&¥ˆˆKL
NÂˆBˆ™]\›ˆ]]œÛÛŠÈ\Ù\ŽˆÈYˆ\Ù\‹šY\Ù\›˜[YNˆ\Ù\‹\Ù\›˜[YHHKÙ\ÜÚ[ÛÛÛÚÚYJÙ\ÜÚ[Û‹ÚÙ[‹Ù\ÜÚ[Û‹™^\™\ÊJNÂˆB‚ˆYˆ
\›œ]˜[YHOOH‹Ø\KØ]]ÛÙÛÝ]ˆ	‰ˆ™\]Y\Ý›Y]ÙOOH”ÔÕŠHÂˆÛÛœÝ›ÙHH]ØZ]™\]Y\ÝšœÛÛÈ]šXÙRYÎˆ[šÛ›ÝÛˆOŠ
K˜Ø]Ú


HOˆ
ßH\ÈÈ]šXÙRYÎˆ[šÛ›ÝÛˆJJNÂˆÛÛœÝ\Ù\ˆH]ØZ]Ý\œ™[\Ù\Š™\]Y\Ý[ŠNÂˆÛÛœÝÚÙ[ˆHÙ\ÜÚ[Û•ÚÙ[Š™\]Y\Ý
NÂˆYˆ
ÚÙ[ŠH]ØZ][‹‘‹œ™\\™J‘SUH”“ÓHÙ\ÜÚ[ÛœÈÒT‘HÚÙ[—Ú\ÚHÈŠK˜š[™
]ØZ]ÚLMŠÚÙ[ŠJKœ[Š
NÂˆYˆ
\Ù\ˆ	‰ˆ˜[Y]šXÙRY
›ÙK™]šXÙRY
JHÂˆ]ØZ][‹‘‹œ™\\™JTUH]šXÙ\ÈÑUˆØÚY[WÚœÛÛˆHÓÐSTÐÑJ
ÑSPÕØÚY[WÚœÛÛˆ”“ÓH[Y]X›\ÈÒT‘H\Ù\—ÚYHÊKØÚY[WÚœÛÛŠKˆ™[Z[™\—ÛZ[]\ÈHÓÐSTÐÑJ
ÑSPÕ™[Z[™\—ÛZ[]\È”“ÓH[Y]X›\ÈÒT‘H\Ù\—ÚYHÊK™[Z[™\—ÛZ[]\ÊKˆÝXœØÜš\[Û—ÚœÛÛˆH•S\Ù\—ÚYH•S\]YØ]HÕT”‘S•ÕSQTÕSTˆÒT‘HYHÈS‘\Ù\—ÚYHØ
K˜š[™
\Ù\‹šY\Ù\‹šY›ÙK™]šXÙRY\Ù\‹šY
Kœ[Š
NÂˆBˆ™]\›ˆ]]œÛÛŠÈÚÎˆYHKÛX\”Ù\ÜÚ[ÛÛÛÚÚYJ
JNÂˆB‚ˆYˆ
\›œ]˜[YHOOH‹Ø\KØÛÛ™šYÈˆ	‰ˆ™\]Y\Ý›Y]ÙOOH‘ÑUŠHÂˆ™]\›ˆœÛÛŠÈ˜\YX›XÒÙ^Nˆ[‹•TQÔP“P×ÒÑVHJNÂˆB‚ˆYˆ
\›œ]˜[YKœÝ\ÕÚ]
‹Ø\KÙ]šXÙKÈŠH	‰ˆ™\]Y\Ý›Y]ÙOOH‘ÑUŠHÂˆÛÛœÝYHXÛÙUT’PÛÛ\Û™[
\›œ]˜[YKœÛXÙJ‹Ø\KÙ]šXÙKÈ‹›[™Ý
JNÂˆYˆ
]˜[Y]šXÙRY
Y
JH™]\›ˆœÛÛŠÈ\œ›ÜŽˆ»'¦:ê®úä':®,:®,Q;'¡zââ:âéˆˆK
NÂˆÛÛœÝ\Ù\ˆH]ØZ]Ý\œ™[\Ù\Š™\]Y\Ý[ŠNÂˆYˆ
J]ØZ]]šXÙPXØÙ\ÜÐ[ÝÙY
[‹Y\Ù\ËšYÏÈ[
JJHÂˆ™]\›ˆœÛÛŠÈ\œ›ÜŽˆ\Ù\ˆÈ»'m:®,:®,:éo;(l;f£;eh:­£;eg;'m;%á»"­zââ:âéˆˆˆºèg:­î;'n;'m;ea;&¥;eg:®,:®,;'¡zââ:âéˆˆK\Ù\ˆÈÈˆJNÂˆBˆYˆ
\Ù\ŠH]ØZ][‹‘‹œ™\\™J•TUH]šXÙ\ÈÑU\Ù\—ÚYHÈÒT‘HYHÈŠK˜š[™
\Ù\‹šYY
Kœ[Š
NÂˆÛÛœÝ›ÝÈH\Ù\‚ˆÈ]ØZ][‹‘‹œ™\\™JÑSPÕ[Y]X›\ËœØÚY[WÚœÛÛ‹[Y]X›\Ëœ™[Z[™\—ÛZ[]\ËˆVTÕÊÑSPÕH”“ÓH]šXÙ\ÈÒT‘HYHÈS‘ÝXœØÜš\[Û—ÚœÛÛˆTÈ“Õ•S
HTÈ\ÚÙ[˜X›Yˆ”“ÓH[Y]X›\ÈÒT‘H\Ù\—ÚYHØ
K˜š[™
Y\Ù\‹šY
Bˆ™š\œÝÈØÚY[WÚœÛÛŽˆÝš[™ÎÈ™[Z[™\—ÛZ[]\Îˆ[X™\ŽÈ\ÚÙ[˜X›Yˆ[X™\ˆOŠ
Bˆˆ]ØZ][‹‘‹œ™\\™Jˆ”ÑSPÕØÚY[WÚœÛÛ‹™[Z[™\—ÛZ[]\ËÝXœØÜš\[Û—ÚœÛÛˆTÈ“Õ•STÈ\ÚÙ[˜X›Y”“ÓH]šXÙ\ÈÒT‘HYHÈ‹ˆ
K˜š[™
Y
K™š\œÝÈØÚY[WÚœÛÛŽˆÝš[™ÎÈ™[Z[™\—ÛZ[]\Îˆ[X™\ŽÈ\ÚÙ[˜X›Yˆ[X™\ˆOŠ
NÂˆYˆ
\›ÝÊH™]\›ˆœÛÛŠÂˆØÚY[Nˆ×K™[Z[™\“Z[]\ÎˆL\Ú[˜X›Yˆ˜[ÙKˆÞXÛNˆÙYZÛH‹[˜ÚÜ‘]NˆŒŒ‹LKLH‹ˆJNÂˆÛÛœÝØ]™YH›Ü›X[^™TØÚY[J”ÓÓ‹œ\œÙJ›ÝËœØÚY[WÚœÛÛŠJNÂˆ™]\›ˆœÛÛŠÂˆØÚY[NˆØ]™Y˜Û\ÜÙ\ËˆÞXÛNˆØ]™Y˜ÞXÛKˆ[˜ÚÜ‘]NˆØ]™Y˜[˜ÚÜ‘]Kˆ™[Z[™\“Z[]\Îˆ›ÝËœ™[Z[™\—ÛZ[]\Ëˆ\Ú[˜X›Yˆ›ÛÛX[Š›ÝËœ\ÚÙ[˜X›Y
KˆJNÂˆB‚ˆYˆ
\›œ]˜[YHOOH‹Ø\KÙ]šXÙHˆ	‰ˆ™\]Y\Ý›Y]ÙOOH”UŠHÂˆÛÛœÝ›ÙHH]ØZ]™\]Y\ÝšœÛÛ™XÛÜ™Ýš[™Ë[šÛ›ÝÛŠ
K˜Ø]Ú


HOˆ[
NÂˆYˆ
X›ÙH]˜[Y]šXÙRY
›ÙK™]šXÙRY
H]˜[YØÚY[J›ÙKœØÚY[JJHÂˆ™]\›ˆœÛÛŠÈ\œ›ÜŽˆ»( ;'©{eh;"ç:¬!;dg;f%{"ç{'m;&+:ì%:ém;)à;%b»"­zââ:âéˆˆK
NÂˆBˆÛÛœÝ™[Z[™\ˆH[X™\Š›ÙKœ™[Z[™\“Z[]\ÊNÂˆYˆ
VÍKLMKÌKš[˜ÛY\Ê™[Z[™\ŠJH™]\›ˆœÛÛŠÈ\œ›ÜŽˆ»%c:é¯;"ç:¬!;'a;fe{'n;em;(ï;!.;&¥ˆˆK
NÂˆÛÛœÝÞXÛHH›ÙK˜ÞXÛHOOH˜š]ÙYZÛHˆÈ˜š]ÙYZÛHˆˆÙYZÛHŽÂˆYˆ
]˜[Y]J›ÙK˜[˜ÚÜ‘]JJH™]\›ˆœÛÛŠÈ\œ›ÜŽˆº¬ª{(ï:®,;) :à¨;)ç:éo;fe{'n;em;(ï;!.;&¥ˆˆK
NÂˆÛÛœÝØÚY[Q]NˆØÚY[Q]HHÂˆ›Ü›X]ˆ›™^XÛ\ÜË][Y]X›H‹™\œÚ[ÛŽˆKÞXÛKˆ[˜ÚÜ‘]Nˆ›ÙK˜[˜ÚÜ‘]KˆÛ\ÜÙ\Îˆ›ÙKœØÚY[K›X\

][JHOˆ
È‹‹š][KÙYZÎˆ][KÙYZÈÏÈSˆJJKˆNÂˆÛÛœÝ\Ù\ˆH]ØZ]Ý\œ™[\Ù\Š™\]Y\Ý[ŠNÂˆYˆ
J]ØZ]]šXÙPXØÙ\ÜÐ[ÝÙY
[‹›ÙK™]šXÙRY\Ù\ËšYÏÈ[
JJHÂˆ™]\›ˆœÛÛŠÈ\œ›ÜŽˆ»'m:®,:®,:éo:ìà:¬¯{eh:­£;eg;'m;%á»"­zââ:âéˆˆKÊNÂˆBˆÛÛœÝÝXœØÜš\[ÛˆH›ÙKœÝXœØÜš\[ÛˆÈ”ÓÓ‹œÝš[™ÚYžJ›ÙKœÝXœØÜš\[ÛŠHˆ[Âˆ]ØZ][‹‘‹œ™\\™JˆS”ÑT•S•È]šXÙ\È
YØÚY[WÚœÛÛ‹™[Z[™\—ÛZ[]\ËÝXœØÜš\[Û—ÚœÛÛ‹\]YØ]
BˆSQTÈ
ËËËËÕT”‘S•ÕSQTÕST
BˆÓˆÓÓ‘“PÕ
Y
HÈTUHÑUˆØÚY[WÚœÛÛˆH^ÛYYœØÚY[WÚœÛÛ‹ˆ™[Z[™\—ÛZ[]\ÈH^ÛYYœ™[Z[™\—ÛZ[]\ËˆÝXœØÜš\[Û—ÚœÛÛˆHÓÐSTÐÑJ^ÛYYœÝXœØÜš\[Û—ÚœÛÛ‹]šXÙ\ËœÝXœØÜš\[Û—ÚœÛÛŠKˆ\]YØ]HÕT”‘S•ÕSQTÕSTˆ
K˜š[™
›ÙK™]šXÙRY”ÓÓ‹œÝš[™ÚYžJØÚY[Q]JK™[Z[™\‹ÝXœØÜš\[ÛŠKœ[Š
NÂˆYˆ
\Ù\ŠHÂˆ]ØZ][‹‘‹˜˜]Ú
Âˆ[‹‘‹œ™\\™J•TUH]šXÙ\ÈÑU\Ù\—ÚYHÈÒT‘HYHÈŠK˜š[™
\Ù\‹šY›ÙK™]šXÙRY
Kˆ[‹‘‹œ™\\™JS”ÑT•S•È[Y]X›\È
\Ù\—ÚYØÚY[WÚœÛÛ‹™[Z[™\—ÛZ[]\Ë\]YØ]
BˆSQTÈ
ËËËÕT”‘S•ÕSQTÕST
BˆÓˆÓÓ‘“PÕ
\Ù\—ÚY
HÈTUHÑUØÚY[WÚœÛÛˆH^ÛYYœØÚY[WÚœÛÛ‹ˆ™[Z[™\—ÛZ[]\ÈH^ÛYYœ™[Z[™\—ÛZ[]\Ë\]YØ]HÕT”‘S•ÕSQTÕST
Bˆ˜š[™
\Ù\‹šY”ÓÓ‹œÝš[™ÚYžJØÚY[Q]JK™[Z[™\ŠKˆJNÂˆBˆ™]\›ˆœÛÛŠÈÚÎˆYHJNÂˆB‚ˆYˆ
\›œ]˜[YHOOH‹Ø\KÜ\ÚÙ\ØX›Hˆ	‰ˆ™\]Y\Ý›Y]ÙOOH”ÔÕŠHÂˆÛÛœÝ›ÙHH]ØZ]™\]Y\ÝšœÛÛÈ]šXÙRYÎˆ[šÛ›ÝÛˆOŠ
K˜Ø]Ú


HOˆ
ßH\ÈÈ]šXÙRYÎˆ[šÛ›ÝÛˆJJNÂˆYˆ
]˜[Y]šXÙRY
›ÙK™]šXÙRY
JH™]\›ˆœÛÛŠÈ\œ›ÜŽˆ»'¦:ê®úä':®,:®,Q;'¡zââ:âéˆˆK
NÂˆÛÛœÝ\Ù\ˆH]ØZ]Ý\œ™[\Ù\Š™\]Y\Ý[ŠNÂˆYˆ
J]ØZ]]šXÙPXØÙ\ÜÐ[ÝÙY
[‹›ÙK™]šXÙRY\Ù\ËšYÏÈ[
JJH™]\›ˆœÛÛŠÈ\œ›ÜŽˆº­£;eg;'m;%á»"­zââ:âéˆˆKÊNÂˆ]ØZ][‹‘‹œ™\\™J•TUH]šXÙ\ÈÑUÝXœØÜš\[Û—ÚœÛÛˆH•SÒT‘HYHÈŠK˜š[™
›ÙK™]šXÙRY
Kœ[Š
NÂˆ™]\›ˆœÛÛŠÈÚÎˆYHJNÂˆB‚ˆYˆ
\›œ]˜[YHOOH‹Ø\KÜ\ÚÝ\Ýˆ	‰ˆ™\]Y\Ý›Y]ÙOOH”ÔÕŠHÂˆÛÛœÝ›ÙHH]ØZ]™\]Y\ÝšœÛÛÈ]šXÙRYÎˆ[šÛ›ÝÛˆOŠ
K˜Ø]Ú


HOˆ
ßH\ÈÈ]šXÙRYÎˆ[šÛ›ÝÛˆJJNÂˆYˆ
]˜[Y]šXÙRY
›ÙK™]šXÙRY
JH™]\›ˆœÛÛŠÈ\œ›ÜŽˆ»'¦:ê®úä':®,:®,Q;'¡zââ:âéˆˆK
NÂˆÛÛœÝ\Ù\ˆH]ØZ]Ý\œ™[\Ù\Š™\]Y\Ý[ŠNÂˆYˆ
J]ØZ]]šXÙPXØÙ\ÜÐ[ÝÙY
[‹›ÙK™]šXÙRY\Ù\ËšYÏÈ[
JJH™]\›ˆœÛÛŠÈ\œ›ÜŽˆº­£;eg;'m;%á»"­zââ:âéˆˆKÊNÂˆÛÛœÝ›ÝÈH]ØZ][‹‘‹œ™\\™J”ÑSPÕÝXœØÜš\[Û—ÚœÛÛˆ”“ÓH]šXÙ\ÈÒT‘HYHÈŠBˆ˜š[™
›ÙK™]šXÙRY
K™š\œÝÈÝXœØÜš\[Û—ÚœÛÛŽˆÝš[™È[OŠ
NÂˆYˆ
\›ÝÏËœÝXœØÜš\[Û—ÚœÛÛŠH™]\›ˆœÛÛŠÈ\œ›ÜŽˆºê/;( ;%c:é¯;'a;/';(ï;!.;&¥ˆˆK
NÂˆÛÛœÝ™\ÜÛœÙHH]ØZ]Ù[™\Ú
[‹”ÓÓ‹œ\œÙJ›ÝËœÝXœØÜš\[Û—ÚœÛÛŠK»%c:é¯;) :îa;&a:èã‹ºâé;'c;"&;%áH;%c:é¯;'m;(%{ à{( {'/:èg;!);(%zä$;%­;&¥ˆŠNÂˆYˆ
™\ÜÛœÙKœÝ]\ÈOOH™\ÜÛœÙKœÝ]\ÈOOHL
HÂˆ]ØZ][‹‘‹œ™\\™J•TUH]šXÙ\ÈÑUÝXœØÜš\[Û—ÚœÛÛˆH•SÒT‘HYHÈŠK˜š[™
›ÙK™]šXÙRY
Kœ[Š
NÂˆBˆ™]\›ˆœÛÛŠÈÚÎˆ™\ÜÛœÙK›ÚÈK™\ÜÛœÙK›ÚÈÈŒˆLŠNÂˆB‚ˆ™]\›ˆœÛÛŠÈ\œ›ÜŽˆ“›Ý›Ý[™ˆK
NÂŸB‚™[˜Ý[ÛˆÙ[Ý[›ÝÊ]HH™]È]J
JHÂˆÛÛœÝ\ÈH™]È[‘]U[YQ›Ü›X]
™[‹PÐH‹Âˆ[YV›Û™Nˆ\ÚXKÔÙ[Ý[‹YX\Žˆ›[Y\šXÈ‹[ÛˆŒ‹YYÚ]‹^NˆŒ‹YYÚ]‹ˆÙYZÙ^NˆœÚÜ‹Ý\ŽˆŒ‹YYÚ]‹Z[]NˆŒ‹YYÚ]‹Ý\ÞXÛNˆšŒÈ‹ˆJK™›Ü›X]Ô\Ê]JNÂˆÛÛœÝÙ]H
\Nˆ[‘]U[YQ›Ü›X]\\\ÊHOˆ\Ë™š[™


HOˆ\HOOH\JOË˜[YHÏÈˆŽÂˆÛÛœÝÙYZÙ^SX\ˆ™XÛÜ™Ýš[™Ë[X™\ˆHÈ[ÛŽˆKYNˆ‹ÙYˆËNˆœšNˆKØ]ˆ‹Ý[ŽˆÈNÂˆ™]\›ˆÂˆ]Nˆ	ÙÙ]
žYX\ˆŠ_KIÙÙ]
›[ÛŠ_KIÙÙ]
™^HŠ_Xˆ^NˆÙYZÙ^SX\ÙÙ]
ÙYZÙ^HŠWKˆZ[]\Îˆ[X™\ŠÙ]
šÝ\ˆŠJH
ˆŒ
È[X™\ŠÙ]
›Z[]HŠJKˆNÂŸB‚™[˜Ý[ÛˆXÝ]™PÞXÛUÙYZÊ]NˆÝš[™Ë[˜ÚÜ‘]NˆÝš[™ÊNˆHˆˆˆÂˆÛÛœÝÝ\œ™[H]Kœ\œÙJ	Ù]_UŒŒ˜
NÂˆÛÛœÝ[˜ÚÜˆH]Kœ\œÙJ	Ø[˜ÚÜ‘]_UŒŒ˜
NÂˆÛÛœÝÙYZÜÈHX]™›ÛÜŠ
Ý\œ™[H[˜ÚÜŠHÈŒÎÌ
NÂˆ™]\›ˆ

ÙYZÜÈ	HŠH
ÈŠH	HˆOOHÈHˆˆˆŽÂŸB‚˜\Þ[˜È[˜Ý[Ûˆ[”ØÚY[Y
[Žˆ[ŠNˆ›ÛZ\ÙO›ÚYˆÂˆÛÛœÝ›ÝÈHÙ[Ý[›ÝÊ
NÂˆ]ØZ][‹‘‹œ™\\™J‘SUH”“ÓHÙ[Û›ÝYšXØ][ÛœÈÒT‘HÛ\Ü×Ù]H]J	Û›ÝÉË	ËLM^\ÉÊHŠKœ[Š
NÂˆ]ØZ][‹‘‹œ™\\™J‘SUH”“ÓHÙ\ÜÚ[ÛœÈÒT‘H^\™\×Ø]HÕT”‘S•ÕSQTÕSTŠKœ[Š
NÂˆ]ØZ][‹‘‹œ™\\™J‘SUH”“ÓH]]Ü˜]WÛ[Z]ÈÒT‘HÚ[™Ý×ÜÝ\[š^\ØÚ

HHŠKœ[Š
NÂˆYˆ
›ÝË™^HˆJH™]\›ŽÂ‚ˆÛÛœÝÈ™\Ý[ÈHH]ØZ][‹‘‹œ™\\™JÑSPÕ]šXÙ\ËšYˆÓÐSTÐÑJ[Y]X›\ËœØÚY[WÚœÛÛ‹]šXÙ\ËœØÚY[WÚœÛÛŠHTÈØÚY[WÚœÛÛ‹ˆÓÐSTÐÑJ[Y]X›\Ëœ™[Z[™\—ÛZ[]\Ë]šXÙ\Ëœ™[Z[™\—ÛZ[]\ÊHTÈ™[Z[™\—ÛZ[]\Ëˆ]šXÙ\ËœÝXœØÜš\[Û—ÚœÛÛ‚ˆ”“ÓH]šXÙ\ÈQ•“ÒSˆ[Y]X›\ÈÓˆ[Y]X›\Ë\Ù\—ÚYH]šXÙ\Ë\Ù\—ÚYˆÒT‘H]šXÙ\ËœÝXœØÜš\[Û—ÚœÛÛˆTÈ“Õ•S
K˜[]šXÙT›ÝÏŠ
NÂ‚ˆ›Üˆ
ÛÛœÝ]šXÙHÙˆ™\Ý[ÊHÂˆÛÛœÝØ]™YH›Ü›X[^™TØÚY[J”ÓÓ‹œ\œÙJ]šXÙKœØÚY[WÚœÛÛŠJNÂˆÛÛœÝXÝ]™UÙYZÈHØ]™Y˜ÞXÛHOOH˜š]ÙYZÛHˆÈXÝ]™PÞXÛUÙYZÊ›ÝË™]KØ]™Y˜[˜ÚÜ‘]JHˆSŽÂˆ›Üˆ
ÛÛœÝ][HÙˆØ]™Y˜Û\ÜÙ\Ë™š[\Š
[žJHO‚ˆ[žK™^HOOH›ÝË™^H	‰ˆ
XÝ]™UÙYZÈOOHSˆY[žKÙYZÈ[žKÙYZÈOOHSˆ[žKÙYZÈOOHXÝ]™UÙYZÊBˆ
JHÂˆÛÛœÝÚÝ\‹Z[]WHH][KœÝ\œÜ]
ŽˆŠK›X\
[X™\ŠNÂˆÛÛœÝ[\]HÝ\ˆ
ˆŒ
ÈZ[]HH]šXÙKœ™[Z[™\—ÛZ[]\ÎÂˆYˆ
›ÝË›Z[]\È[\]›ÝË›Z[]\ÈH[\]
ÈJHÛÛ[YNÂ‚ˆÛÛœÝ[œÙ\YH]ØZ][‹‘‹œ™\\™JˆS”ÑT•ÔˆQÓ“Ô‘HS•ÈÙ[Û›ÝYšXØ][ÛœÈ
]šXÙWÚYÛ\Ü×ÚYÛ\Ü×Ù]JHSQTÈ
ËËÊBˆ
K˜š[™
]šXÙKšY][KšY›ÝË™]JKœ[Š
NÂˆYˆ
Z[œÙ\Y›Y]K˜Ú[™Ù\ÊHÛÛ[YNÂ‚ˆžHÂˆÛÛœÝ›ÛÛHH][Kœ›ÛÛHÈ0­È	Ú][Kœ›ÛÛ_XˆˆŽÂˆÛÛœÝ™\ÜÛœÙHH]ØZ]Ù[™\Ú
ˆ[‹ˆ”ÓÓ‹œ\œÙJ]šXÙKœÝXœØÜš\[Û—ÚœÛÛˆJH\È\ÚÝXœØÜš\[Û‹ˆ	Ù]šXÙKœ™[Z[™\—ÛZ[]\ßzí¡;fá	Ú][K›˜[Y_Xˆ	Ú][KœÝ\IÜ›ÛÛ_Xˆ
NÂˆYˆ
™\ÜÛœÙKœÝ]\ÈOOH™\ÜÛœÙKœÝ]\ÈOOHL
HÂˆ]ØZ][‹‘‹œ™\\™J•TUH]šXÙ\ÈÑUÝXœØÜš\[Û—ÚœÛÛˆH•SÒT‘HYHÈŠK˜š[™
]šXÙKšY
Kœ[Š
NÂˆBˆYˆ
\™\ÜÛœÙK›ÚÊH›ÝÈ™]È\œ›ÜŠ\ÚÙ\šXÙH™]\›™Y	Ü™\ÜÛœÙKœÝ]\ßX
NÂˆHØ]Ú
\œ›ÜŠHÂˆÛÛœÛÛK™\œ›ÜŠœ\Ú˜Z[Y‹]šXÙKšY\œ›ÜŠNÂˆ]ØZ][‹‘‹œ™\\™Jˆ‘SUH”“ÓHÙ[Û›ÝYšXØ][ÛœÈÒT‘H]šXÙWÚYHÈS‘Û\Ü×ÚYHÈS‘Û\Ü×Ù]HHÈ‹ˆ
K˜š[™
]šXÙKšY][KšY›ÝË™]JKœ[Š
NÂˆBˆBˆBŸB‚™^ÜY˜][Âˆ\Þ[˜È™]Ú
™\]Y\Ýˆ™\]Y\Ý[Žˆ[ŠNˆ›ÛZ\ÙO™\ÜÛœÙOˆÂˆÛÛœÝ\›H™]ÈT“
™\]Y\Ý\›
NÂˆYˆ
\›œ]˜[YKœÝ\ÕÚ]
‹Ø\KÈŠJH™]\›ˆ\J™\]Y\Ý[ŠNÂˆ™]\›ˆ[‹TÔÑUË™™]Ú
™\]Y\Ý
NÂˆKˆ\Þ[˜ÈØÚY[Y
ØÛÛ›Û\ŽˆØÚY[YÛÛ›Û\‹[Žˆ[‹Ýˆ^XÝ][ÛÛÛ^
HÂˆÝØZ][[
[”ØÚY[Y
[ŠJNÂˆKŸHØ]\ÙšY\È^ÜY[™\[ŽÂ