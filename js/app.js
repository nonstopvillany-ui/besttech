const APP_VERSION='v23';
const CATS={'Szerkezetépítés':'#2379bd','Gépészet':'#2b9658','Tető':'#8c56bd','Festés':'#b46c29','Homlokzat':'#609d35','Burkolás':'#c49a25','Szerelvényezés':'#1b8a8f','Egyéb':'#637c90'};
const PALETTE=['#c0392b','#16a085','#7f8c2d','#a0527a','#2c6e9b','#d35400','#5b6bc0','#8a6d3b'];
const ROLES={lead:'Munkafelelős',helper:'Segéd',sub:'Alvállalkozó'};
const KEY='besttech_v11b';
const PROJECTS=["Bajnai András HRSZ_9216", "Besttech Kft Hrsz_5016_1", "Blizman HRSZ_3234_86", "Bodó Linda HRSZ-9194", "Bohács Alexandra HRSZ_9191", "Hadar Gyula HRSZ_4913_2", "Juhász Balázs HRSZ_3243_36", "Kapás Gabriella Hrsz_9231", "Karkossiák Béla HRSZ 9198", "Kass Levente HRSZ_9208", "Kelemen László HRSZ_4913-2", "Kovács András HRSZ_2622_1", "Kovács István HRSZ_9215", "Kürti Mihály HRSZ_9214", "Miskó Nándor HRSZ_3279_25", "Németh Péter HRSZ_9210", "Pintér Péter HRSZ_9201", "Piránszki István HRSZ_358_17", "Rőfi János HRSZ_9201", "Schwendtner Barna Kristóf HRSZ_9207", "Simon Tamás HRSZ_9196", "Tálas Balázs HRSZ_3234_85", "Tarjányi Zoltán HRSZ_2622_2", "Tenglovits Zoltán HRSZ_9232", "Varga Szabolcs HRSZ_9232"];
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const G=['Hadar Gyula','Kis Gyula','Jani'],L=['Kelemen László','Orosz Tibor'];
const SEED=[['Humusz leszedés',1,'Szerkezetépítés',G],['Kitűzés, alapásás',1,'Szerkezetépítés',G],['Alapozás – vasalás, beton',2,'Szerkezetépítés',G],['Zsalukő, lábazat',1,'Szerkezetépítés',G],['Gépészet – alapvezetékek',1,'Gépészet',L],['Vízóraakna létesítése',1,'Gépészet',L],['Villanyóra-mérőszekrény létesítése',1,'Gépészet',L],['Szerelőbeton',1,'Szerkezetépítés',G],['Főfalazás',2,'Szerkezetépítés',G],['Koszorú – vasalás, zsaluzás',3,'Szerkezetépítés',G],['Koszorú betonozás',1,'Szerkezetépítés',G],['Tető (szerkezet, héjazat, bádog)',15,'Tető',['Antal Jani']],['Födém hőszigetelés + GK váz',2,'Szerkezetépítés',G],['Válaszfalazás',2,'Szerkezetépítés',G],['Nyílászárók beépítése',2,'Szerkezetépítés',G],['Gépészet – helyiségek',4,'Gépészet',L],['Festés 1. ütem',5,'Festés',['Kis Gábor']],['Homlokzat – EPS + háló',3,'Homlokzat',['Cseh Attila']],['Homlokzat – végső vakolat',2,'Homlokzat',['Cseh Attila']],['Burkolás',15,'Burkolás',['Tamási Gábor']],['Festés 2. ütem',5,'Festés',['Kis Gábor']],['Villanyszerelvényezés',2,'Szerelvényezés',L],['Vízszerelvényezés',2,'Szerelvényezés',L]];
const newTasks=(custom=[])=>[...SEED.map(([name,days,category,w])=>({name,days,category,lead:w[0],workers:[...w],notes:''})),...custom].map((x,i)=>({...structuredClone(x),id:i+1,start:'',extra:[],placed:false,order:0,done:[]}));
const ROSTER=[['Hadar Gyula','lead'],['Kelemen László','lead'],['Tamási Gábor','lead'],['Kis Gyula','helper'],['Jani','helper'],['Orosz Tibor','helper'],['Antal Jani','sub'],['Kis Gábor','sub'],['Cseh Attila','sub']].map(([name,role])=>({name,role,email:''}));
let S=JSON.parse(localStorage.getItem(KEY)||'null')||{houses:PROJECTS.map(name=>({name,tasks:newTasks()})),roster:ROSTER,ignored:{},mailTime:'19:00'};
S.custom??=[];S.payItems??=[];S.subPays??=[];S.hours??={};S.cats??={};Object.assign(CATS,S.cats);
if(!S.v14){const add=[['Vízóraakna létesítése','Gépészet – alapvezetékek'],['Villanyóra-mérőszekrény létesítése','Vízóraakna létesítése'],['Villanyszerelvényezés',null],['Vízszerelvényezés',null]];const base=newTasks();S.houses.forEach(h=>add.forEach(([n,after])=>{if(h.tasks.some(t=>t.name===n))return;const t={...base.find(x=>x.name===n),id:Math.max(0,...h.tasks.map(x=>x.id))+1};const i=after?h.tasks.findIndex(x=>x.name===after):-1;if(i>=0)h.tasks.splice(i+1,0,t);else h.tasks.push(t)}));S.v14=true}
S.houses.forEach(h=>h.tasks.forEach(t=>{t.extra??=[];if(t.name==='Aljzatbeton')t.name='Szerelőbeton'}));
let payYm=null,payWho=null,subYm=null,subWho='';
let cur=0,sel=null,view='tower',editId=null,mailWho=null,tmode='10',winStart=null,pendingNew=null,planDay=null;
const save=()=>localStorage.setItem(KEY,JSON.stringify(S));
const H=()=>S.houses[cur];
const T=id=>H().tasks.find(t=>t.id===id);
const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const D=s=>new Date(s+'T12:00:00');
const WD=['vasárnap','hétfő','kedd','szerda','csütörtök','péntek','szombat'];
const short=s=>s.slice(5).replace('-','.')+'.';
function workdays(start,n){let a=[];if(!start)return a;let d=D(start);if(isNaN(d))return a;while(a.length<n){if(d.getDay()!==0)a.push(iso(d));d.setDate(d.getDate()+1)}return a}
function nextWorkday(s){let d=D(s);do d.setDate(d.getDate()+1);while(d.getDay()===0);return iso(d)}
const MON=['jan.','febr.','márc.','ápr.','máj.','jún.','júl.','aug.','szept.','okt.','nov.','dec.'];
const isSummer=s=>{const d=D(s),y=d.getFullYear();return d.getTimezoneOffset()<Math.max(new Date(y,0,1).getTimezoneOffset(),new Date(y,6,1).getTimezoneOffset())};
const defHours=s=>({from:'07:00',to:isSummer(s)?'18:00':'17:00'});
const hoursOf=(w,s)=>S.hours[w+'|'+s]||defHours(s);
const hDiff=x=>{const [a,b]=x.from.split(':').map(Number),[c,d]=x.to.split(':').map(Number);return Math.max(0,(c*60+d-a*60-b)/60)};
const shortName=(n,all)=>{const f=n.split(' ').at(-1),nick=f==='László'?'Laci':f;return all.filter(r=>r.name.split(' ').at(-1)===f).length>1?n:nick};
const MONF=['január','február','március','április','május','június','július','augusztus','szeptember','október','november','december'];
const ft=x=>Math.round(x).toLocaleString('hu-HU')+' Ft';
const hrs=x=>(Math.round(x*10)/10).toString().replace('.',',')+' óra';
const longDate=s=>{const d=D(s);return MON[d.getMonth()]+' '+d.getDate()+'. '+WD[d.getDay()]};
const wOn=(t,d)=>t.dayWorkers?.[d]||t.workers;
const tot=t=>Math.max(1,+t.days||1)+(t.extra||[]).reduce((s,x)=>s+Math.max(1,+x.days||1),0);
const tDays=t=>{let a=workdays(t.start,Math.max(1,+t.days||1));(t.extra||[]).forEach(x=>{workdays(x.start,Math.max(1,+x.days||1)).forEach(d=>{if(!a.includes(d))a.push(d)})});return a.sort()};
function index(){let m={};S.houses.forEach((h,hi)=>h.tasks.filter(t=>t.placed&&t.start).forEach(t=>tDays(t).forEach(d=>wOn(t,d).forEach(w=>{((m[d]??={})[w]??=[]).push({hi,t})}))));return m}
function conflicts(t,m=index()){let out=[];if(!t.placed)return out;tDays(t).forEach(d=>wOn(t,d).forEach(w=>{let o=(m[d]?.[w]||[]).filter(x=>x.t!==t);if(o.length)out.push({d,w,o,ok:!!S.ignored[w+'|'+d]})}));return out}
const active=c=>c.filter(x=>!x.ok);

function render(){save();
 $('house').innerHTML=S.houses.map((h,i)=>`<option value="${i}" ${i===cur?'selected':''}>${esc(h.name)}</option>`).join('');
 document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.v===view));
 document.querySelectorAll('.view').forEach(v=>v.classList.toggle('on',v.id==='v-'+view));
 const pl=H().tasks.filter(t=>t.placed);$('summary').textContent=pl.length+' / '+H().tasks.length+' munkafázis · '+pl.reduce((s,t)=>s+tot(t),0)+' munkanap';
 ({tower:renderTower,subs:renderSubs,pay:renderPay,plan:renderPlan,cal:renderCal,people:renderPeople,mail:renderMail,workers:renderWorkers})[view]()}

function renderTower(){const m=index(),f=$('filter').value,ts=H().tasks;
 $('towerTitle').textContent=H().name+' – Építési torony';
 $('list').innerHTML=ts.filter(t=>!t.placed&&(f==='Összes'||t.category===f)).map(t=>`<div class="item ${sel===t.id?'sel':''}" draggable="true" data-id="${t.id}" style="border-color:${CATS[t.category]}"><div><b>${esc(t.name)}</b><small>${esc(t.lead||'nincs felelős')} · ${t.workers.length} fő</small></div><div style="text-align:right"><b title="javasolt időtartam" style="white-space:nowrap">~${tot(t)} nap</b><br><button class="pastBtn" data-past="${t.id}" title="Már elkészült korábban – dátum és dolgozó nélkül">✓ kész</button></div></div>`).join('')||'<p class="muted">Minden munka a toronyban van.</p>';
 const placed=ts.filter(t=>t.placed).sort((a,b)=>((b.past?1:0)-(a.past?1:0))||((a.start||'9')<(b.start||'9')?-1:(a.start||'9')>(b.start||'9')?1:a.order-b.order));
 $('tower').innerHTML=placed.length?placed.map(t=>{if(t.past)return `<div class="brick past ${sel===t.id?'sel':''}" data-id="${t.id}" title="Korábban elkészült – dátum és dolgozó nincs rögzítve"><span>✓ ${esc(t.name)}</span><small>korábban kész</small></div>`;const c=active(conflicts(t,m)),d=tDays(t);return `<div class="brick ${sel===t.id?'sel':''} ${c.length?'conf':''}" draggable="true" data-id="${t.id}" style="background:${CATS[t.category]};width:${Math.min(100,45+tot(t)*3.5)}%"><div><b>${esc(t.name)}</b><br><span style="font-size:14px;font-weight:700">📅 ${d.length?longDate(d[0])+' – '+longDate(d.at(-1)):'nincs dátum'}</span> ${c.length?'<span class="warn">⚠ ÜTKÖZÉS</span>':''}${t.notes?' 📝':''}</div><div>♟ ${esc(t.lead||'nincs felelős')} (${t.workers.length} fő)${t.extra?.length?' · '+(t.extra.length+1)+' szakasz':''}</div><b>${t.done.filter(Boolean).length}/${tot(t)} ✓</b></div>`}).join(''):'<p class="muted" style="margin:auto">Húzd ide az első munkafolyamatot!<br>Az első tégla alulra kerül.</p>';
 const total=ts.reduce((n,t)=>n+tot(t),0),done=ts.reduce((n,t)=>n+(t.past?tot(t):Math.min(tot(t),t.done.filter(Boolean).length)),0),pct=total?Math.round(done/total*100):0;
 $('progBar').style.width=pct+'%';$('progLabel').textContent=pct+'% · '+done+' / '+total+' munkanap';
 document.querySelectorAll('.item,.brick').forEach(el=>{el.ondragstart=e=>e.dataTransfer.setData('text/plain',el.dataset.id);el.onclick=()=>{sel=+el.dataset.id;renderTower()}});
 document.querySelectorAll('[data-past]').forEach(b=>b.onclick=e=>{e.stopPropagation();markPast(T(+b.dataset.past));render()});
 document.querySelectorAll('.item').forEach(el=>{el.ondragover=e=>{e.preventDefault();el.style.borderTop='3px solid #1761b4'};el.ondragleave=()=>el.style.borderTop='';el.ondrop=e=>{e.preventDefault();e.stopPropagation();el.style.borderTop='';const src=T(+e.dataTransfer.getData('text/plain')),dst=T(+el.dataset.id);if(!src||!dst||src===dst||src.placed)return;S.houses.forEach(h=>{const a=h.tasks.findIndex(x=>x.name===src.name),b=h.tasks.findIndex(x=>x.name===dst.name);if(a<0||b<0)return;const [m]=h.tasks.splice(a,1);h.tasks.splice(h.tasks.findIndex(x=>x.name===dst.name),0,m)});sel=src.id;render()}});
 renderDays(m);
 renderDetails(m)}

function renderDays(m){
 const staff=S.roster.filter(r=>r.role!=='sub').sort((a,b)=>(a.role==='lead'?0:1)-(b.role==='lead'?0:1));
 $('wModes').innerHTML=staff.map(r=>`<button data-m="w:${esc(r.name)}" title="${esc(r.name)} beosztása">${esc(shortName(r.name,staff))}</button>`).join('');
 $('wModes').querySelectorAll('button').forEach(b=>b.onclick=()=>{tmode=b.dataset.m;renderTower()});
 document.querySelectorAll('.modes button').forEach(b=>b.classList.toggle('on',b.dataset.m===tmode));
 if(tmode.startsWith('w:')&&!staff.some(r=>'w:'+r.name===tmode))tmode='10';
 $('dayView').style.display=tmode==='all'?'none':'block';$('fullView').style.display=tmode==='all'?'block':'none';
 const today0=iso(new Date()),allD=Object.keys(m).sort(),firstM=(allD[0]||today0).slice(0,7),lastM=[allD.at(-1)||today0,today0].sort().at(-1).slice(0,7),months=[];
 {let [y,mo]=firstM.split('-').map(Number);while(true){const k=y+'-'+String(mo).padStart(2,'0');months.push(k);if(k>=lastM)break;mo++;if(mo>12){mo=1;y++}}}
 $('mSel').innerHTML='<option value="">📅 Havi nézet…</option>'+months.map(k=>`<option value="${k}" ${tmode==='m:'+k?'selected':''}>${k.slice(0,4)}. ${MONF[+k.slice(5)-1]}</option>`).join('');
 $('mSel').classList.toggle('on',tmode.startsWith('m:'));$('mSel').style.background=tmode.startsWith('m:')?'#1761b4':'';$('mSel').style.color=tmode.startsWith('m:')?'#fff':'';
 $('mSel').onchange=e=>{if(e.target.value){tmode='m:'+e.target.value;renderTower()}};
 if(tmode==='all')return;
 if(tmode.startsWith('m:'))return renderMonth(m,tmode.slice(2));
 if(tmode.startsWith('w:'))return renderWorkerDays(m,tmode.slice(2));
 const n=tmode==='30'?30:10,today=iso(new Date());winStart??=today;
 const per={};H().tasks.filter(t=>t.placed&&t.start).forEach(t=>tDays(t).forEach((d,i)=>(per[d]??=[]).push({t,i})));
 let html='',d=D(winStart),last='';
 for(let k=0;k<n;k++){const s=iso(d);last=s;const sun=d.getDay()===0;
  html+=`<div class="dayrow ${sun?'sun':''} ${s===today?'today':''}" data-date="${s}"><div class="dlabel">${MON[d.getMonth()]} ${d.getDate()}.<span>${WD[d.getDay()]}</span></div><div class="dtasks">${(per[s]||[]).map(({t,i})=>{const bad=active(conflicts(t,m)).some(x=>x.d===s);return `<div class="dchip ${bad?'conf':''} ${sel===t.id?'sel':''}" draggable="true" data-id="${t.id}" style="background:${CATS[t.category]}"><b>${esc(t.name)}</b>${(t.notes||t.dayNotes?.[s])?' 📝':''}${bad?' ⚠':''}<small>${i+1}/${tot(t)}. nap · ${esc(wOn(t,s).join(', ')||'nincs beosztott')}</small></div>`}).join('')||(sun?'':'<span class="hint">húzd ide a munkát</span>')}</div></div>`;
  d.setDate(d.getDate()+1)}
 $('days').innerHTML=html;$('wLabel').textContent=longDate(winStart)+' – '+longDate(last);
 $('days').querySelectorAll('.dchip').forEach(el=>{el.ondragstart=e=>e.dataTransfer.setData('text/plain',el.dataset.id);el.onclick=()=>{sel=+el.dataset.id;renderTower()}});
 $('days').querySelectorAll('.dayrow').forEach(row=>{row.ondragover=e=>{e.preventDefault();row.classList.add('over')};row.ondragleave=()=>row.classList.remove('over');
  row.ondrop=e=>{e.preventDefault();row.classList.remove('over');const t=T(+e.dataTransfer.getData('text/plain'));if(!t)return;const s=row.dataset.date;
   if(t.placed){const shift=t.start;t.start=s;t.past=false;if(shift&&t.extra?.length){}sel=t.id;render();return}
   t.start=s;t.extra=[];t.done=[];t.placed=true;t.order=Math.max(0,...H().tasks.filter(x=>x.placed&&x!==t).map(x=>x.order))+1;sel=t.id;pendingNew=t.id;render();openEditor(t)}})}
function renderMonth(m,ym){const [y,mo]=ym.split('-').map(Number),wage=n=>+(S.roster.find(r=>r.name===n)?.wage)||0;
 const rows=[],perW={},perP={};let d=new Date(y,mo-1,1,12);
 while(d.getMonth()===mo-1){const s=iso(d);Object.entries(m[s]||{}).forEach(([w,list])=>{const hr=hDiff(hoursOf(w,s)),share=hr/list.length;list.forEach(({hi,t})=>{const cost=share*wage(w),pn=S.houses[hi].name;rows.push({s,w,pn,hi,t,h:share,cost,split:list.length>1});
   (perW[w]??={h:0,c:0,days:new Set()});perW[w].h+=share;perW[w].c+=cost;perW[w].days.add(s);(perP[pn]??={h:0,c:0});perP[pn].h+=share;perP[pn].c+=cost})});d.setDate(d.getDate()+1)}
 const ord={lead:0,helper:1,sub:2},role=n=>ord[S.roster.find(r=>r.name===n)?.role]??3;
 rows.sort((a,b)=>a.s<b.s?-1:a.s>b.s?1:role(a.w)-role(b.w)||a.w.localeCompare(b.w));
 let body='',lastS='';rows.forEach(r=>{if(r.s!==lastS){body+=`<tr class="dsep"><td colspan="7">${longDate(r.s)}</td></tr>`;lastS=r.s}
  body+=`<tr><td>${esc(r.w)}</td><td><a href="#" data-h="${r.hi}" data-id="${r.t.id}">${esc(r.pn)}</a></td><td>${esc(r.t.name)}</td><td class="num">${esc(hoursOf(r.w,r.s).from)}–${esc(hoursOf(r.w,r.s).to)}</td><td class="num">${hrs(r.h)}${r.split?' <small class="muted">(megosztva)</small>':''}</td><td class="num">${wage(r.w)?ft(wage(r.w))+'/ó':'<span class="muted">nincs megadva</span>'}</td><td class="num"><b>${wage(r.w)?ft(r.cost):'–'}</b></td></tr>`});
 const tw=Object.values(perW).reduce((a,x)=>a+x.c,0),th=Object.values(perW).reduce((a,x)=>a+x.h,0);
 $('wLabel').innerHTML=`<b>${y}. ${MONF[mo-1]}</b> · összesen <b>${hrs(th)}</b> · <b>${ft(tw)}</b> tervezett bérköltség (beosztás szerint) · minden projekt <button class="small primary" id="toPay">💰 Bérezés ehhez a hónaphoz</button>`;$('toPay').onclick=()=>{payYm=ym;view='pay';render()};
 $('days').innerHTML=`<div class="month">${rows.length?`<h3>Dolgozónként</h3><table><thead><tr><th>Dolgozó</th><th class="num">Munkanap</th><th class="num">Óra</th><th class="num">Órabér</th><th class="num">Bér összesen</th></tr></thead><tbody>${Object.entries(perW).sort((a,b)=>role(a[0])-role(b[0])).map(([w,x])=>`<tr><td><b>${esc(w)}</b></td><td class="num">${x.days.size}</td><td class="num">${hrs(x.h)}</td><td class="num">${wage(w)?ft(wage(w)):'<span class="muted">nincs megadva</span>'}</td><td class="num"><b>${ft(x.c)}</b></td></tr>`).join('')}</tbody></table>
 <h3>Projektenként</h3><table><thead><tr><th>Projekt</th><th class="num">Óra</th><th class="num">Bérköltség</th></tr></thead><tbody>${Object.entries(perP).sort((a,b)=>b[1].c-a[1].c).map(([p,x])=>`<tr><td><b>${esc(p)}</b></td><td class="num">${hrs(x.h)}</td><td class="num"><b>${ft(x.c)}</b></td></tr>`).join('')}</tbody></table>
 <h3>Naponként</h3><table><thead><tr><th>Dolgozó</th><th>Projekt</th><th>Munka</th><th class="num">Munkaidő</th><th class="num">Óra</th><th class="num">Órabér</th><th class="num">Napi bér</th></tr></thead><tbody>${body}</tbody></table>
 <p class="muted" style="padding:8px 10px">Az óraszám kezdéstől befejezésig számít, szünet levonása nélkül. Ha valaki egy napon két projekten dolgozik, az órái egyenlően oszlanak meg köztük. A munkaidőt a dolgozó gombjára kattintva, naponként lehet átírni. Órabért a Dolgozók fülön adhatsz meg.</p>`:'<p class="hint" style="padding:14px">Ebben a hónapban még nincs beosztott munka.</p>'}</div>`;
 $('days').querySelectorAll('a[data-id]').forEach(a=>a.onclick=e=>{e.preventDefault();cur=+a.dataset.h;sel=+a.dataset.id;tmode='10';render()})}
function monthList(m){const t=iso(new Date()),all=Object.keys(m).sort(),f=(all[0]||t).slice(0,7),l=[all.at(-1)||t,t].sort().at(-1).slice(0,7),out=[];let [y,mo]=f.split('-').map(Number);while(true){const k=y+'-'+String(mo).padStart(2,'0');out.push(k);if(k>=l)break;mo++;if(mo>12){mo=1;y++}}return out}
const ymLabel=k=>k.slice(0,4)+'. '+MONF[+k.slice(5)-1];
const itemsFor=(w,ym)=>S.payItems.filter(x=>x.w===w&&(x.recurring?(x.ym<=ym&&(!x.end||ym<x.end)):x.ym===ym));
function renderPay(){const m=index(),months=monthList(m);payYm=months.includes(payYm)?payYm:(months.includes(iso(new Date()).slice(0,7))?iso(new Date()).slice(0,7):months.at(-1));
 const ord={lead:0,helper:1,sub:2},people=[...S.roster].sort((a,b)=>ord[a.role]-ord[b.role]);if(!people.some(r=>r.name===payWho))payWho=people[0]?.name;
 const r=S.roster.find(x=>x.name===payWho)||{},wage=+r.wage||0,[y,mo]=payYm.split('-').map(Number);
 const rows=[],today=iso(new Date());let skipped=0;let d=new Date(y,mo-1,1,12);while(d.getMonth()===mo-1){const s=iso(d),list=m[s]?.[payWho]||[];if(list.length){const hr=hoursOf(payWho,s),share=hDiff(hr)/list.length;list.forEach(({hi,t})=>{const done=!!t.done[tDays(t).indexOf(s)];if(s<today||done)rows.push({s,hr,share,pn:S.houses[hi].name,t,split:list.length>1,done});else skipped++})}d.setDate(d.getDate()+1)}
 const H_=rows.reduce((a,x)=>a+x.share,0),base=H_*wage,days=new Set(rows.map(x=>x.s)).size,items=itemsFor(payWho,payYm),adj=items.reduce((a,x)=>a+x.amount,0);
 $('v-pay').innerHTML=`<div class="sheet pay" style="max-width:1000px">
 <div class="noprint" style="display:flex;gap:8px;align-items:end;flex-wrap:wrap;margin-bottom:14px">
  <div class="field" style="margin:0"><label>Hónap</label><select id="pYm" style="padding:7px">${months.map(k=>`<option value="${k}" ${k===payYm?'selected':''}>${ymLabel(k)}</option>`).join('')}</select></div>
  <div class="field" style="margin:0"><label>Dolgozó</label><select id="pWho" style="padding:7px">${people.map(p=>`<option ${p.name===payWho?'selected':''}>${esc(p.name)}</option>`).join('')}</select></div>
  <button class="primary" onclick="print()">🖨 Nyomtatás / PDF</button>
 </div>
 <h2 style="margin:0;color:#173d67">Besttech Kft. · Bérelszámolás</h2>
 <p style="margin:6px 0 14px"><b>Dolgozó:</b> ${esc(payWho||'')} (${ROLES[r.role]||''}) &nbsp; <b>Időszak:</b> ${ymLabel(payYm)} &nbsp; <b>Órabér:</b> ${wage?ft(wage):'<span style="color:#c0392b">nincs megadva – a Dolgozók fülön add meg</span>'}</p>
 <table><thead><tr><th>Dátum</th><th>Projekt</th><th>Munka</th><th class="num">Mettől–meddig</th><th class="num">Óra</th><th class="num">Bér</th></tr></thead><tbody>
 ${rows.map(x=>`<tr><td>${longDate(x.s)}</td><td>${esc(x.pn)}</td><td>${esc(x.t.name)}</td><td class="num">${esc(x.hr.from)}–${esc(x.hr.to)}</td><td class="num">${hrs(x.share)}${x.split?' <small>(megosztva)</small>':''}</td><td class="num">${ft(x.share*wage)}</td></tr>`).join('')||'<tr><td colspan="6" class="muted">Ebben a hónapban nincs beosztott munkanapja.</td></tr>'}
 ${skipped?`<tr class="noprint"><td colspan="6" class="muted">${skipped} még el nem végzett, jövőbeli beosztás nem számít bele. Egy nap akkor kerül ide, ha eltelt, vagy a munka adatlapján az „Elvégzett napok” között kipipáltad.</td></tr>`:''}
 <tr class="tot"><td colspan="4">Ledolgozott: ${days} nap</td><td class="num">${hrs(H_)}</td><td class="num">${ft(base)}</td></tr></tbody></table>
 <h3 style="margin:10px 0 6px;color:#173d67">Egyéb tételek (juttatás, előleg, levonás)</h3>
 <table><thead><tr><th>Megjegyzés</th><th>Típus</th><th class="num">Összeg</th><th class="noprint"></th></tr></thead><tbody>
 ${items.map(x=>`<tr><td>${esc(x.note||'')}</td><td>${x.recurring?'havonta ismétlődő':'egyszeri'}</td><td class="num" style="color:${x.amount<0?'#c0392b':'#1e7b3a'}">${x.amount>0?'+':''}${ft(x.amount)}</td><td class="noprint"><button class="small danger" data-pdel="${x.id}">✕ ${x.recurring&&x.ym<payYm?'ettől a hónaptól megszüntet':'törlés'}</button></td></tr>`).join('')||'<tr><td colspan="4" class="muted">Nincs egyéb tétel.</td></tr>'}
 <tr class="tot"><td colspan="2">Tételek összesen</td><td class="num">${adj>0?'+':''}${ft(adj)}</td><td class="noprint"></td></tr></tbody></table>
 <div class="noprint" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;background:#f6f9fc;padding:10px;border-radius:8px">
  <select id="iSign" style="padding:7px"><option value="1">+ hozzáadás</option><option value="-1">− levonás</option></select>
  <input id="iAmt" type="number" min="0" step="1000" placeholder="Összeg (Ft)" style="padding:7px;width:130px">
  <input id="iNote" placeholder="Megjegyzés, pl. előleg, juttatás" style="padding:7px;flex:1;min-width:200px">
  <label class="chip"><input type="checkbox" id="iRec"> minden hónapban ismétlődjön</label>
  <button class="primary" id="iAdd">＋ Tétel</button></div>
 <div class="grand">Fizetendő: ${ft(base+adj)}</div>
 <p class="muted" style="font-size:12px">Számítás: az eltelt vagy elvégzettnek jelölt napok órái × órabér (szünet levonása nélkül) ± egyéb tételek. Megosztott napon az órák egyenlően oszlanak meg a projektek között.</p>
 <div class="sig"><div>Munkáltató</div><div>Dolgozó</div></div></div>`;
 $('pYm').onchange=e=>{payYm=e.target.value;renderPay()};$('pWho').onchange=e=>{payWho=e.target.value;renderPay()};
 $('iAdd').onclick=()=>{const a=Math.abs(+$('iAmt').value||0);if(!a)return alert('Adj meg összeget.');S.payItems.push({id:Date.now(),w:payWho,ym:payYm,amount:a*(+$('iSign').value),note:$('iNote').value.trim(),recurring:$('iRec').checked});save();renderPay()};
 $('v-pay').querySelectorAll('[data-pdel]').forEach(b=>b.onclick=()=>{const x=S.payItems.find(i=>i.id==b.dataset.pdel);if(!x)return;if(x.recurring&&x.ym<payYm){x.end=payYm}else S.payItems=S.payItems.filter(i=>i!==x);save();renderPay()})}
function renderSubs(){const subs=S.roster.filter(r=>r.role==='sub'),t0=iso(new Date()).slice(0,7);
 const ms=[...new Set([...S.subPays.map(x=>x.date.slice(0,7)),t0])].sort();subYm=ms.includes(subYm)?subYm:t0;
 if(subWho&&!subs.some(r=>r.name===subWho))subWho='';
 const list=S.subPays.filter(x=>x.date.slice(0,7)===subYm&&(!subWho||x.w===subWho)).sort((a,b)=>a.date<b.date?-1:1),sum=list.reduce((a,x)=>a+x.amount,0);
 const perP={};list.forEach(x=>perP[x.project]=(perP[x.project]||0)+x.amount);
 const taskNames=[...new Set(S.houses.flatMap(h=>h.tasks.map(t=>t.name)))];
 $('v-subs').innerHTML=`<div class="sheet pay" style="max-width:1000px">
 <div class="noprint" style="display:flex;gap:8px;align-items:end;flex-wrap:wrap;margin-bottom:14px">
  <div class="field" style="margin:0"><label>Hónap</label><select id="sYm" style="padding:7px">${ms.map(k=>`<option value="${k}" ${k===subYm?'selected':''}>${ymLabel(k)}</option>`).join('')}</select></div>
  <div class="field" style="margin:0"><label>Alvállalkozó</label><select id="sWho" style="padding:7px"><option value="">— mind —</option>${subs.map(r=>`<option ${r.name===subWho?'selected':''}>${esc(r.name)}</option>`).join('')}</select></div>
  <button class="primary" onclick="print()">🖨 Nyomtatás / PDF</button></div>
 <h2 style="margin:0;color:#173d67">Besttech Kft. · Alvállalkozói elszámolás</h2>
 <p style="margin:6px 0 14px"><b>Alvállalkozó:</b> ${subWho?esc(subWho):'mind'} &nbsp; <b>Időszak:</b> ${ymLabel(subYm)}</p>
 <table><thead><tr><th>Dátum</th>${subWho?'':'<th>Alvállalkozó</th>'}<th>Projekt</th><th>Munka</th><th>Megjegyzés</th><th class="num">Kifizetve</th><th class="noprint"></th></tr></thead><tbody>
 ${list.map(x=>`<tr><td>${longDate(x.date)}</td>${subWho?'':`<td>${esc(x.w)}</td>`}<td>${esc(x.project)}</td><td>${esc(x.work)}</td><td>${esc(x.note||'')}</td><td class="num"><b>${ft(x.amount)}</b></td><td class="noprint"><button class="small danger" data-sdel="${x.id}">✕</button></td></tr>`).join('')||`<tr><td colspan="${subWho?6:7}" class="muted">Ebben a hónapban nincs rögzített kifizetés.</td></tr>`}
 <tr class="tot"><td colspan="${subWho?4:5}">Összesen</td><td class="num">${ft(sum)}</td><td class="noprint"></td></tr></tbody></table>
 ${Object.keys(perP).length>1?`<h3 style="margin:10px 0 6px;color:#173d67">Projektenként</h3><table><tbody>${Object.entries(perP).sort((a,b)=>b[1]-a[1]).map(([p,v])=>`<tr><td>${esc(p)}</td><td class="num"><b>${ft(v)}</b></td></tr>`).join('')}</tbody></table>`:''}
 <div class="noprint" style="background:#f6f9fc;padding:10px;border-radius:8px"><b>＋ Új kifizetés rögzítése</b>
  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
  <select id="nW" style="padding:7px">${subs.map(r=>`<option ${r.name===subWho?'selected':''}>${esc(r.name)}</option>`).join('')}</select>
  <input type="date" id="nD" value="${iso(new Date())}" style="padding:7px">
  <select id="nP" style="padding:7px;max-width:240px">${S.houses.map(h=>`<option>${esc(h.name)}</option>`).join('')}</select>
  <input id="nWork" list="nWorkList" placeholder="Munka, pl. Tető (szerkezet, héjazat, bádog)" style="padding:7px;min-width:240px;flex:1"><datalist id="nWorkList">${taskNames.map(n=>`<option value="${esc(n)}">`).join('')}</datalist>
  <input id="nAmt" type="number" min="0" step="10000" placeholder="Összeg (Ft)" style="padding:7px;width:140px">
  <input id="nNote" placeholder="Megjegyzés (pl. számlaszám, részlet)" style="padding:7px;min-width:200px;flex:1">
  <button class="primary" id="nAdd">Rögzítés</button></div></div>
 <div class="sig"><div>Megrendelő (Besttech Kft.)</div><div>Alvállalkozó</div></div></div>`;
 $('sYm').onchange=e=>{subYm=e.target.value;renderSubs()};$('sWho').onchange=e=>{subWho=e.target.value;renderSubs()};
 $('nAdd').onclick=()=>{const a=+$('nAmt').value||0;if(!a)return alert('Adj meg összeget.');if(!$('nW').value)return alert('Előbb vegyél fel alvállalkozót a Dolgozók fülön.');const x={id:Date.now(),w:$('nW').value,date:$('nD').value||iso(new Date()),project:$('nP').value,work:$('nWork').value.trim(),amount:a,note:$('nNote').value.trim()};S.subPays.push(x);subYm=x.date.slice(0,7);save();renderSubs()};
 $('v-subs').querySelectorAll('[data-sdel]').forEach(b=>b.onclick=()=>{if(confirm('Törlöd ezt a kifizetést?')){S.subPays=S.subPays.filter(x=>x.id!=b.dataset.sdel);save();renderSubs()}})}
function renderWorkerDays(m,w){const n=10,today=iso(new Date());winStart??=today;
 let html='',d=D(winStart),last='',sum=0;
 for(let k=0;k<n;k++){const s=iso(d);last=s;const sun=d.getDay()===0,list=m[s]?.[w]||[],multi=list.length>1&&!S.ignored[w+'|'+s];
  const hr=hoursOf(w,s),mod=!!S.hours[w+'|'+s];if(list.length)sum+=hDiff(hr);
  html+=`<div class="dayrow w ${sun?'sun':''} ${s===today?'today':''}"><div class="dlabel">${MON[d.getMonth()]} ${d.getDate()}.<span>${WD[d.getDay()]}</span></div><div class="dtasks">${list.map(({hi,t})=>{const i=tDays(t).indexOf(s);return `<div class="dchip ${multi?'conf':''}" data-h="${hi}" data-id="${t.id}" style="background:${CATS[t.category]}"><b>${esc(S.houses[hi].name)}</b>${t.dayNotes?.[s]?' 📝':''}<small>${esc(t.name)} · ${i+1}/${tot(t)}. nap${t.lead===w?' · felelős':''}</small></div>`}).join('')||(sun?'':'<span class="hint" style="color:#c0392b;font-weight:700">szabad</span>')}</div>
  <div class="hrs ${mod?'mod':''}">${list.length?`<input type="time" data-hf="${s}" value="${hr.from}"> – <input type="time" data-ht="${s}" value="${hr.to}"> <b>${hDiff(hr).toFixed(1).replace('.0','')} óra</b>${mod?` <button class="small" data-hr="${s}" title="vissza az alapra">↺</button>`:''}`:''}</div></div>`;
  d.setDate(d.getDate()+1)}
 $('days').innerHTML=html;$('wLabel').innerHTML=`<b>${esc(w)}</b> · ${longDate(winStart)} – ${longDate(last)} · <b>${sum.toFixed(1).replace('.0','')} óra</b> ebben az időszakban · alap munkaidő: télen 7–17, nyáron 7–18`;
 $('days').querySelectorAll('.dchip').forEach(el=>el.onclick=()=>{cur=+el.dataset.h;sel=+el.dataset.id;tmode='10';render()});
 const setH=(s,k,v)=>{const x={...hoursOf(w,s),[k]:v};const def=defHours(s);if(x.from===def.from&&x.to===def.to)delete S.hours[w+'|'+s];else S.hours[w+'|'+s]=x;save();renderTower()};
 $('days').querySelectorAll('[data-hf]').forEach(el=>el.onchange=()=>setH(el.dataset.hf,'from',el.value));
 $('days').querySelectorAll('[data-ht]').forEach(el=>el.onchange=()=>setH(el.dataset.ht,'to',el.value));
 $('days').querySelectorAll('[data-hr]').forEach(el=>el.onclick=()=>{delete S.hours[w+'|'+el.dataset.hr];save();renderTower()})}
function place(t){const others=H().tasks.filter(x=>x.placed&&x!==t).sort((a,b)=>a.order-b.order);t.placed=true;t.order=others.length?others.at(-1).order+1:1;
 if(!t.start){const last=others.filter(x=>x.start).at(-1);t.start=last?nextWorkday(tDays(last).at(-1)):nextWorkday(iso(new Date()))}sel=t.id;render()}

function markPast(t){if(!t)return;t.past=true;t.placed=true;t.start='';t.extra=[];t.done=[];t.order=0;sel=t.id}
function renderDetails(m){const t=T(sel),box=$('details');if(!t){box.innerHTML='<p class="muted">Válassz egy téglát vagy munkát a listából.</p>';return}
 if(t.past){box.innerHTML=`<h3 style="margin-top:0">${esc(t.name)}</h3><p><span class="chip">${esc(t.category)}</span></p><div class="notice" style="background:#e3f3e8"><b>✓ Korábban elkészült</b><br>A munka már kész volt, amikor az ütemezőbe került. Dátum és dolgozó nincs rögzítve, ezért nem jelenik meg a naptárakban, a bérezésben és az e-mailben, de a projekt előrehaladásába beleszámít.</div><p style="display:flex;gap:6px;flex-wrap:wrap"><button id="pUndo">↩ Mégsem kész (vissza a listába)</button></p>`;$('pUndo').onclick=()=>{t.past=false;t.placed=false;render()};return}
 if(!t.placed){const list=H().tasks.filter(x=>!x.placed),i=list.indexOf(t);setTimeout(()=>{if($('dPastOne')){$('dPastOne').onclick=()=>{markPast(t);render()};$('dPastAll').onclick=()=>{if(confirm(`${i+1} munkát jelölsz késznek (a lista elejétől eddig: „${t.name}”). Mehet?`)){list.slice(0,i+1).forEach(markPast);sel=t.id;render()}}}})}
 const c=conflicts(t,m),d=tDays(t);
 box.innerHTML=`<h3 style="margin-top:0">${esc(t.name)}</h3><p><span class="chip">${esc(t.category)}</span> <b>${tot(t)} munkanap</b>${t.extra?.length?' · '+(t.extra.length+1)+' szakaszban':''}</p>
 <p><b>Kezdés:</b> ${t.start?short(t.start):'nincs megadva'} ${d.length?' → <b>Vége:</b> '+short(d.at(-1)):''}</p>
 <p><b>Felelős:</b> ${esc(t.lead||'nincs felelős')}<br><b>Beosztottak:</b> ${esc(t.workers.join(', '))}</p>
 ${t.notes?`<div class="notice"><b>📝 Megjegyzés a felelősnek:</b><br>${esc(t.notes).replace(/\n/g,'<br>')}</div>`:''}
 ${c.length?`<div class="notice conflictbox"><b>⚠ Csapatütközés</b><br><span class="muted">Pipáld be, ha az adott dolgozó aznap megosztva dolgozik (pl. fél-fél nap) – akkor nem számít ütközésnek.</span>${c.map(x=>`<label style="display:block;margin-top:6px"><input type="checkbox" data-ign="${esc(x.w+'|'+x.d)}" ${x.ok?'checked':''}> <b>${esc(x.w)}</b> · ${short(x.d)} – ${x.o.map(o=>esc(S.houses[o.hi].name+': '+o.t.name)).join('; ')}</label>`).join('')}</div>`:''}
 ${t.placed&&d.length?`<div class="field"><label>Napi beosztás (ki dolgozik melyik nap)</label>${d.map(day=>{const on=wOn(t,day),pool=[...new Set([...t.workers,...on])];return `<div style="margin:6px 0;padding:6px;background:#f6f9fc;border-radius:7px"><b>${longDate(day)}</b><div class="chips" style="margin-top:4px">${pool.map(w=>`<label class="chip"><input type="checkbox" data-dw="${esc(day)}" value="${esc(w)}" ${on.includes(w)?'checked':''}> ${esc(w)}</label>`).join('')}<select data-add="${esc(day)}" style="font-size:12px"><option value="">+ besegít…</option>${S.roster.filter(r=>!pool.includes(r.name)).map(r=>`<option>${esc(r.name)}</option>`).join('')}</select></div><input data-dn="${esc(day)}" value="${esc(t.dayNotes?.[day]||'')}" placeholder="📝 Napi megjegyzés erre a napra (bekerül az esti e-mailbe)" style="width:100%;margin-top:5px;padding:6px;border:1px solid #cad5e3;border-radius:6px;font-size:12px"></div>`}).join('')}</div>`:''}
 ${t.placed&&d.length?`<div class="field"><label>Elvégzett napok</label><div class="chips">${d.map((day,i)=>`<label class="chip"><input type="checkbox" data-day="${i}" ${t.done[i]?'checked':''}> ${short(day)}</label>`).join('')}</div></div>`:''}
 <p style="display:flex;gap:6px;flex-wrap:wrap"><button class="primary" id="dEdit">✎ Szerkesztés</button><button id="dPlace" class="${t.placed?'danger':''}">${t.placed?'↩ Levétel a toronyból':'＋ Toronyba'}</button>${t.placed?'':'<button id="dPastOne" title="Már elkészült korábban">✓ Már elkészült</button><button id="dPastAll" title="Ez és a listában fölötte lévő összes munka kész">✓ Eddig minden kész</button>'}${t.placed?'<button class="small" id="dUp" title="Feljebb">▲</button><button class="small" id="dDown" title="Lejjebb">▼</button>':'<button class="danger" id="dDel">Végleges törlés</button>'}</p>${t.placed?'<p class="muted">A levett munka visszakerül a bal oldali listába, nem törlődik.</p>':''}`;
 box.querySelectorAll('[data-ign]').forEach(el=>el.onchange=()=>{const k=el.dataset.ign;if(el.checked)S.ignored[k]=true;else delete S.ignored[k];render()});
 box.querySelectorAll('[data-dw]').forEach(el=>el.onchange=()=>{const day=el.dataset.dw;let a=[...wOn(t,day)];a=el.checked?[...a,el.value]:a.filter(w=>w!==el.value);(t.dayWorkers??={})[day]=a;render()});
 box.querySelectorAll('[data-add]').forEach(el=>el.onchange=()=>{if(!el.value)return;const day=el.dataset.add;(t.dayWorkers??={})[day]=[...wOn(t,day),el.value];render()});
 box.querySelectorAll('[data-dn]').forEach(el=>el.onchange=()=>{const v=el.value.trim();t.dayNotes??={};if(v)t.dayNotes[el.dataset.dn]=v;else delete t.dayNotes[el.dataset.dn];render()});
 box.querySelectorAll('[data-day]').forEach(el=>el.onchange=()=>{t.done[+el.dataset.day]=el.checked;render()});
 $('dEdit').onclick=()=>openEditor(t);
 $('dPlace').onclick=()=>{if(t.placed){t.placed=false;t.done=[];render()}else place(t)};
 const move=dir=>{const p=H().tasks.filter(x=>x.placed).sort((a,b)=>a.order-b.order),i=p.indexOf(t),j=i+dir;if(j<0||j>=p.length)return;[t.order,p[j].order]=[p[j].order,t.order];render()};
 if($('dUp')){$('dUp').onclick=()=>move(1);$('dDown').onclick=()=>move(-1)}
 if($('dDel'))$('dDel').onclick=()=>{if(confirm('Véglegesen törlöd ezt a munkafolyamatot ebből a projektből?')){H().tasks=H().tasks.filter(x=>x!==t);sel=null;render()}}}

function renderCal(){const m=index(),today=iso(new Date()),all=Object.keys(m).sort();
 if(!all.length){$('v-cal').innerHTML='<div class="sheet">Még nincs dátummal ütemezett munka. Helyezz munkát a toronyba!</div>';return}
 const start=all[0]<today?all[0]:today,end=all.at(-1)>today?all.at(-1):today;
 const per=S.houses.map(h=>{let o={};h.tasks.filter(t=>t.placed&&t.start).forEach(t=>tDays(t).forEach((d,i)=>(o[d]??=[]).push({t,i})));return o});
 let rows='',d=D(start),n=0;
 while(iso(d)<=end&&n<500){const s=iso(d);rows+=`<tr id="${s===today?'todayRow':''}" class="${d.getDay()===0?'sun':''} ${s===today?'today':''}"><td>${short(s)}<br><span class="muted">${WD[d.getDay()]}</span></td>`+S.houses.map((h,hi)=>`<td>${(per[hi][s]||[]).map(({t,i})=>{const c=conflicts(t,m).filter(x=>x.d===s),bad=c.some(x=>!x.ok),ok=c.length&&!bad;return `<div class="ev ${bad?'conf':ok?'ok':''}" data-h="${hi}" data-id="${t.id}" style="background:${CATS[t.category]}"><b>${esc(t.name)}</b>${t.notes?' 📝':''}<small>${i+1}/${tot(t)}. nap · ${esc(wOn(t,s).join(', '))}${bad?' · ⚠ ütközés':ok?' · megosztott nap':''}</small></div>`}).join('')}</td>`).join('')+'</tr>';d.setDate(d.getDate()+1);n++}
 $('v-cal').innerHTML=`<div class="toolbar noprint" style="border:0;background:transparent"><b>Összes projekt</b><span class="muted">Piros keret = ütközés · sárga = engedélyezett megosztott nap · kattints egy munkára a megnyitáshoz</span><button class="small" id="goToday">Ugrás a mai napra</button></div><div class="cal"><table><thead><tr><th>Dátum</th>${S.houses.map(h=>`<th>${esc(h.name)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
 document.querySelectorAll('.ev').forEach(e=>e.onclick=()=>{cur=+e.dataset.h;sel=+e.dataset.id;view='tower';render()});
 $('goToday').onclick=()=>$('todayRow')?.scrollIntoView({block:'center'})}

function renderPeople(){const m=index(),today=iso(new Date()),all=Object.keys(m).sort();
 if(!all.length){$('v-people').innerHTML='<div class="sheet">Még nincs dátummal ütemezett munka. Helyezz munkát a toronyba!</div>';return}
 const start=all[0]<today?all[0]:today,end=all.at(-1)>today?all.at(-1):today;
 const ord={lead:0,helper:1,sub:2},people=[...S.roster].sort((a,b)=>ord[a.role]-ord[b.role]);
 let rows='',d=D(start),n=0;
 while(iso(d)<=end&&n<500){const s=iso(d);rows+=`<tr id="${s===today?'todayRowP':''}" class="${d.getDay()===0?'sun':''} ${s===today?'today':''}"><td>${short(s)}<br><span class="muted">${WD[d.getDay()]}</span></td>`+people.map(p=>{const list=m[s]?.[p.name]||[],ok=!!S.ignored[p.name+'|'+s],multi=list.length>1;return `<td>${list.map(({hi,t})=>{const i=tDays(t).indexOf(s);return `<div class="ev ${multi?(ok?'ok':'conf'):''}" data-h="${hi}" data-id="${t.id}" style="background:${CATS[t.category]}"><b>${esc(S.houses[hi].name)}</b><small>${esc(t.name)} · ${i+1}/${tot(t)}. nap${t.lead===p.name?' · felelős':''}${multi?(ok?' · megosztott nap':' · ⚠ ütközés'):''}</small></div>`}).join('')}</td>`}).join('')+'</tr>';d.setDate(d.getDate()+1);n++}
 $('v-people').innerHTML=`<div class="toolbar noprint" style="border:0;background:transparent"><b>Ki hol dolgozik?</b><span class="muted">Oszloponként egy dolgozó · a cellában a projekt és a munka · piros keret = egy napra két helyre beosztva · kattints a megnyitáshoz</span><button class="small" id="goTodayP">Ugrás a mai napra</button></div><div class="cal"><table><thead><tr><th>Dátum</th>${people.map(p=>`<th>${esc(p.name)}<br><span style="font-weight:400;opacity:.8">${ROLES[p.role]}</span></th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
 $('v-people').querySelectorAll('.ev').forEach(e=>e.onclick=()=>{cur=+e.dataset.h;sel=+e.dataset.id;view='tower';render()});
 $('goTodayP').onclick=()=>$('todayRowP')?.scrollIntoView({block:'center'})}

function renderPlan(){const m=index(),today=iso(new Date());if(!planDay){planDay=D(today).getDay()===0?nextWorkday(today):today}
 const s=planDay,ord={lead:0,helper:1,sub:2},people=[...S.roster].sort((a,b)=>ord[a.role]-ord[b.role]);
 const busy=people.filter(p=>(m[s]?.[p.name]||[]).length),free=people.filter(p=>!(m[s]?.[p.name]||[]).length);
 const row=p=>{const list=m[s][p.name],multi=list.length>1&&!S.ignored[p.name+'|'+s];return list.map(({hi,t},k)=>{const i=tDays(t).indexOf(s);return `<tr>${k===0?`<td rowspan="${list.length}"><b>${esc(p.name)}</b><br><span class="muted">${ROLES[p.role]}</span>${multi?'<br><span class="warn">⚠ két helyen</span>':''}</td>`:''}<td><a href="#" data-h="${hi}" data-id="${t.id}"><b>${esc(S.houses[hi].name)}</b></a></td><td><span class="chip" style="background:${CATS[t.category]};color:#fff">${esc(t.name)}</span><br><small class="muted">${i+1}. nap / ${tot(t)}${t.lead===p.name?' · felelős':''}</small></td><td>${t.dayNotes?.[s]?'<b>📌</b> '+esc(t.dayNotes[s])+'<br>':''}${t.notes?'<small>📝 '+esc(t.notes)+'</small>':''}</td></tr>`}).join('')};
 $('v-plan').innerHTML=`<div class="sheet plan" style="max-width:1100px"><div class="noprint" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px"><button id="pPrev">‹ Előző nap</button><button id="pToday">Ma</button><button id="pTom">Holnap</button><button id="pNext">Következő nap ›</button><input type="date" id="pDate" value="${s}" style="padding:7px"><button onclick="print()">🖨 Nyomtatás</button></div>
 <h2 style="margin:4px 0 12px;color:#173d67">📋 Napi terv · ${longDate(s)}${s===today?' (ma)':''}</h2>
 <table><thead><tr><th style="width:170px">Dolgozó</th><th>Projekt</th><th>Munka</th><th>Megjegyzés</th></tr></thead><tbody>${busy.map(row).join('')||'<tr><td colspan="4" class="muted">Erre a napra még senki nincs beosztva.</td></tr>'}
 ${free.map(p=>`<tr><td><b>${esc(p.name)}</b><br><span class="muted">${ROLES[p.role]}</span></td><td colspan="3" class="free">szabad – még nincs beosztva</td></tr>`).join('')}</tbody></table></div>`;
 const go=k=>{let d=D(planDay);do d.setDate(d.getDate()+k);while(d.getDay()===0);planDay=iso(d);renderPlan()};
 $('pPrev').onclick=()=>go(-1);$('pNext').onclick=()=>go(1);$('pToday').onclick=()=>{planDay=today;renderPlan()};$('pTom').onclick=()=>{planDay=nextWorkday(today);renderPlan()};$('pDate').onchange=e=>{if(e.target.value){planDay=e.target.value;renderPlan()}};
 $('v-plan').querySelectorAll('a[data-id]').forEach(a=>a.onclick=e=>{e.preventDefault();cur=+a.dataset.h;sel=+a.dataset.id;view='tower';render()})}

function mailDays(){let a=[],s=iso(new Date());while(a.length<6){s=nextWorkday(s);a.push(s)}return a}
function renderMail(){const leads=S.roster.filter(r=>r.role==='lead');if(!leads.some(l=>l.name===mailWho))mailWho=leads[0]?.name;const r=S.roster.find(x=>x.name===mailWho)||{},days=mailDays();
 const rows=days.map(d=>{let items=[];S.houses.forEach(h=>h.tasks.filter(t=>t.placed).forEach(t=>{const i=tDays(t).indexOf(d);if(i>=0&&(t.lead===mailWho||wOn(t,d).includes(mailWho)))items.push({h,t,i})}));return {d,items}});
 $('v-mail').innerHTML=`<div class="sheet"><div class="noprint row" style="align-items:end;margin-bottom:10px"><div class="field"><label>Munkafelelős</label><select id="mWho">${leads.map(l=>`<option ${l.name===mailWho?'selected':''}>${esc(l.name)}</option>`).join('')}</select></div><div class="field"><label>Küldés ideje minden este</label><input type="time" id="mTime" value="${esc(S.mailTime)}"></div><div class="field"><button onclick="print()">🖨 Nyomtatás / PDF</button></div></div>
 <h2 style="color:#173d67;margin-top:0">BESTTECH · 6 napos munkaterv</h2>
 <p><b>Címzett:</b> ${esc(mailWho||'nincs munkafelelős')} (${esc(r.email||'nincs e-mail megadva')})<br><b>Küldés:</b> minden nap ${esc(S.mailTime)}-kor<br><b>Időszak:</b> ${longDate(days[0])} – ${longDate(days[5])} (a következő 6 munkanap)</p>
 <p>Szia ${esc((mailWho||'').split(' ').at(-1))}! A következő napokra az alábbi munkák vannak beosztva:</p>
 <table><thead><tr><th>Nap</th><th>Projekt</th><th>Feladat</th><th>Csapat</th><th>Megjegyzés</th></tr></thead><tbody>${rows.map(({d,items})=>items.length?items.map((x,k)=>`<tr>${k===0?`<td rowspan="${items.length}"><b>${longDate(d)}</b></td>`:''}<td>${esc(x.h.name)}</td><td><b>${esc(x.t.name)}</b><br><small>${x.i+1}. nap / ${tot(x.t)}</small></td><td>${esc(wOn(x.t,d).join(', '))}</td><td>${x.t.dayNotes?.[d]?'<b>📌 Erre a napra:</b> '+esc(x.t.dayNotes[d])+'<br>':''}${x.t.notes?'📝 '+esc(x.t.notes).replace(/\n/g,'<br>'):''}</td></tr>`).join(''):`<tr><td><b>${longDate(d)}</b></td><td colspan="4" class="muted">Nincs beosztott munka.</td></tr>`).join('')}</tbody></table>
 <p class="muted">Ez előnézet, e-mail nem megy ki. Az automatikus esti küldéshez a weboldal mellé szerveroldali szolgáltatás kell.</p></div>`;
 $('mWho').onchange=e=>{mailWho=e.target.value;renderMail()};$('mTime').onchange=e=>{S.mailTime=e.target.value;save();renderMail()}}

function renderWorkers(){$('v-workers').innerHTML=`<div class="sheet"><h2 style="margin-top:0">Dolgozók</h2><p class="muted">Munkafelelős kapja az esti e-mailt. Felelős munkafolyamatnál munkafelelős vagy alvállalkozó lehet.</p><table><thead><tr><th>Név</th><th>Szerepkör</th><th>E-mail</th><th>Órabér (Ft)</th><th></th></tr></thead><tbody>${S.roster.map((r,i)=>`<tr class="role-${r.role}"><td><b>${esc(r.name)}</b></td><td><select data-role="${i}">${Object.entries(ROLES).map(([k,v])=>`<option value="${k}" ${r.role===k?'selected':''}>${v}</option>`).join('')}</select></td><td><input data-mail="${i}" value="${esc(r.email)}" placeholder="nev@besttech.hu" style="width:100%;padding:6px"></td><td><input type="number" min="0" step="100" data-wage="${i}" value="${r.wage||''}" placeholder="pl. 3500" style="width:110px;padding:6px"></td><td><button class="small danger" data-del="${i}">✕</button></td></tr>`).join('')}</tbody></table><p><button class="primary" id="wAdd">＋ Új dolgozó</button></p></div>`;
 document.querySelectorAll('[data-role]').forEach(e=>e.onchange=()=>{S.roster[+e.dataset.role].role=e.value;render()});
 document.querySelectorAll('[data-mail]').forEach(e=>e.onchange=()=>{const v=e.value.trim();if(v&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)){alert('Hibás e-mail-cím.');return}S.roster[+e.dataset.mail].email=v;save()});
 document.querySelectorAll('[data-wage]').forEach(e=>e.onchange=()=>{S.roster[+e.dataset.wage].wage=Math.max(0,+e.value||0);save()});
 document.querySelectorAll('[data-del]').forEach(e=>e.onclick=()=>{const r=S.roster[+e.dataset.del];if(confirm(r.name+' törlése a dolgozók közül?')){S.roster.splice(+e.dataset.del,1);render()}});
 $('wAdd').onclick=()=>{const n=prompt('Új dolgozó neve:')?.trim();if(n&&!S.roster.some(r=>r.name===n)){S.roster.push({name:n,role:'helper',email:''});render()}}}

function addSeg(x={}){const row=document.createElement('div');row.className='row seg';row.style.alignItems='center';row.innerHTML=`<input type="date" class="segStart" value="${esc(x.start||'')}" style="padding:7px"><input type="number" min="1" class="segDays" value="${+x.days||1}" style="padding:7px;max-width:90px"> <span class="muted" style="flex:0">nap</span><button type="button" class="small danger" style="flex:0">✕</button>`;row.querySelector('button').onclick=()=>row.remove();$('eSegs').appendChild(row)}
$('eAddSeg').onclick=()=>addSeg();
$('eAddCat').onclick=()=>{const n=prompt('Új kategória neve:')?.trim();if(!n)return;if(!CATS[n]){const c=PALETTE[Object.keys(S.cats).length%PALETTE.length];CATS[n]=c;S.cats[n]=c;save();fillFilter()}$('eCat').innerHTML=Object.keys(CATS).map(c=>`<option ${c===n?'selected':''}>${esc(c)}</option>`).join('')};
function openEditor(t){editId=t?.id??null;$('edTitle').textContent=t?'Munkafolyamat szerkesztése':'Új munkafolyamat';$('eName').value=t?.name||'';
 $('eCat').innerHTML=Object.keys(CATS).map(c=>`<option ${c===t?.category?'selected':''}>${c}</option>`).join('');$('eDays').value=t?.days||1;$('eStart').value=t?.start||'';$('eSegs').innerHTML='';(t?.extra||[]).forEach(x=>addSeg(x));$('eOnly').checked=false;$('eOnlyWrap').style.display=t?'none':'inline-flex';
 $('eLead').innerHTML='<option value="">— nincs felelős —</option>'+S.roster.filter(r=>r.role!=='helper').map(r=>`<option ${r.name===t?.lead?'selected':''}>${esc(r.name)}</option>`).join('');
 const ws=new Set(t?.workers||[]);$('eWorkers').innerHTML=S.roster.map(r=>`<label class="chip role-${r.role}"><input type="checkbox" value="${esc(r.name)}" ${ws.has(r.name)?'checked':''}> ${esc(r.name)} <small class="muted">${ROLES[r.role]}</small></label>`).join('');
 $('eNotes').value=t?.notes||'';$('editor').showModal()}
$('edSave').onclick=()=>{const name=$('eName').value.trim();if(!name)return alert('Adj meg megnevezést.');const lead=$('eLead').value;let workers=[...$('eWorkers').querySelectorAll('input:checked')].map(i=>i.value);
 const extra=[...$('eSegs').querySelectorAll('.seg')].map(r=>({start:r.querySelector('.segStart').value,days:Math.max(1,+r.querySelector('.segDays').value||1)})).filter(x=>x.start);
 const data={name,category:$('eCat').value,days:Math.max(1,+$('eDays').value||1),start:$('eStart').value,extra,lead,workers,notes:$('eNotes').value};
 let t=editId!=null?T(editId):null;if(t){const old=t.name;S.houses.forEach(h=>{if(h===H())return;h.tasks.filter(x=>x.name===old).forEach(x=>{x.name=name;x.category=data.category;x.days=data.days})});S.custom.filter(x=>x.name===old).forEach(x=>{x.name=name;x.category=data.category;x.days=data.days});Object.assign(t,data)}else{const mk=(h,base)=>({id:Math.max(0,...h.tasks.map(x=>x.id))+1,placed:false,order:0,done:[],...base});t=mk(H(),data);H().tasks.push(t);if(!$('eOnly').checked){const tpl={name,category:data.category,days:data.days,lead,workers:[...workers],notes:data.notes};S.custom.push(tpl);S.houses.forEach(h=>{if(h!==H())h.tasks.push(mk(h,{...structuredClone(tpl),start:'',extra:[]}))})}}pendingNew=null;sel=t.id;$('editor').close();render()};
$('edCancel').onclick=()=>{$('editor').close();const t=pendingNew!=null?T(pendingNew):null;pendingNew=null;if(t){t.placed=false;t.start='';render()}};

document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{view=b.dataset.v;render()});
function fillFilter(){const v=$('filter').value||'Összes';$('filter').innerHTML=['Összes',...Object.keys(CATS)].map(c=>`<option ${c===v?'selected':''}>${esc(c)}</option>`).join('')}fillFilter();$('filter').onchange=renderTower;
document.querySelectorAll('.modes button').forEach(b=>b.onclick=()=>{tmode=b.dataset.m;renderTower()});
const shiftWin=k=>{if(tmode.startsWith('m:')){let [y,mo]=tmode.slice(2).split('-').map(Number);mo+=k;if(mo<1){mo=12;y--}if(mo>12){mo=1;y++}tmode='m:'+y+'-'+String(mo).padStart(2,'0');return renderTower()}const n=tmode==='30'?30:10,d=D(winStart||iso(new Date()));d.setDate(d.getDate()+k*n);winStart=iso(d);renderTower()};
$('wPrev').onclick=()=>shiftWin(-1);$('wNext').onclick=()=>shiftWin(1);$('wToday').onclick=()=>{winStart=iso(new Date());if(tmode.startsWith('m:'))tmode='m:'+iso(new Date()).slice(0,7);renderTower()};
$('tower').ondragover=e=>e.preventDefault();$('tower').ondrop=e=>{e.preventDefault();const t=T(+e.dataTransfer.getData('text/plain'));if(t&&!t.placed)place(t)};
$('house').onchange=e=>{cur=+e.target.value;sel=null;render()};
$('addHouse').onclick=()=>{const n=prompt('Új projekt neve:')?.trim();if(n){S.houses.push({name:n,tasks:newTasks(S.custom)});cur=S.houses.length-1;sel=null;render()}};
$('renHouse').onclick=()=>{const n=prompt('Projekt új neve:',H().name)?.trim();if(n){H().name=n;render()}};
$('delHouse').onclick=()=>{if(S.houses.length<2)return alert('Legalább egy projektnek maradnia kell.');if(confirm(H().name+' törlése az összes munkájával együtt?')){S.houses.splice(cur,1);cur=0;sel=null;render()}};
$('addTask').onclick=()=>openEditor(null);
$('pastBulk').onclick=()=>{const list=H().tasks.filter(t=>!t.placed);if(!list.length)return alert('Nincs a listában munka, ami még nincs a toronyban.');
 $('pastList').innerHTML=list.map(t=>`<label class="chip" style="display:flex;margin:4px 0;padding:7px;border-left:5px solid ${CATS[t.category]}"><input type="checkbox" value="${t.id}"> ${esc(t.name)}</label>`).join('');$('pastDlg').showModal()};
$('pastAll').onclick=()=>$('pastList').querySelectorAll('input').forEach(i=>i.checked=true);
$('pastNone').onclick=()=>$('pastList').querySelectorAll('input').forEach(i=>i.checked=false);
$('pastCancel').onclick=()=>$('pastDlg').close();
$('pastOk').onclick=()=>{const ids=[...$('pastList').querySelectorAll('input:checked')].map(i=>+i.value);ids.forEach(id=>markPast(T(id)));$('pastDlg').close();tmode='all';render()};
$('resetAll').onclick=()=>{if(confirm('Minden projekt és beosztás törlődik, és az ütemező alaphelyzetből indul. Biztos?')){localStorage.removeItem(KEY);location.reload()}};
$('restore').onclick=()=>{const have=new Set(H().tasks.map(t=>t.name));const miss=newTasks(S.custom).filter(t=>!have.has(t.name));if(!miss.length)return alert('Egyik alapmunka sem hiányzik.');let id=Math.max(0,...H().tasks.map(x=>x.id));miss.forEach(t=>{t.id=++id;H().tasks.push(t)});alert(miss.length+' munka visszaállítva: '+miss.map(t=>t.name).join(', '));render()};
$('export').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(S,null,2)],{type:'application/json'}));a.download='besttech-utemezo-mentes.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000)};
$('importBtn').onclick=()=>$('import').click();
$('import').onchange=async e=>{try{const d=JSON.parse(await e.target.files[0].text());if(!Array.isArray(d.houses)||!Array.isArray(d.roster))throw 0;S=d;S.ignored??={};S.mailTime??='19:00';cur=0;sel=null;render()}catch{alert('Hibás mentési fájl.')}e.target.value=''};
render();
