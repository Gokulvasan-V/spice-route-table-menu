/* ============ CONFIG ============ */
const SB_URL = "https://ppfiakcnmzuycgmdoxhv.supabase.co";
const SB_KEY = "sb_publishable_qG8j4ELTx0Xudbb5DxnbMQ_vvgx5QGA"; // public, read/insert-only via RLS
const TABLES = 20;
const AGE_GROUPS = [
  {k:"toddler", label:"Toddler · 1–4",  maxSpice:0},
  {k:"child",   label:"Child · 5–9",    maxSpice:1},
  {k:"preteen", label:"Pre-teen · 10–13",maxSpice:1},
  {k:"teen",    label:"Teen · 14–17",   maxSpice:2},
];
const SENIOR_AGE = 60;
/* Offline fallback menu: [id,name,cuisine(S/N),category,diet(v/n),price,kid,protein,spice,desc] */

/* ============ STATE ============ */
const S = { dishes:[], cart:{}, user:null, pref:"all", age:null, cuisine:"all", cat:"all", q:"", online:true, history:[] };
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rupee = n => "₹" + Number(n).toLocaleString("en-IN");

/* ============ API (fetch only; no SDK, no build) ============ */
async function api(path, opts={}){
  const ctl = new AbortController(); const t = setTimeout(()=>ctl.abort(), 12000);
  try{
    const r = await fetch(SB_URL + "/rest/v1/" + path, {
      ...opts, signal: ctl.signal,
      headers: { apikey:SB_KEY, Authorization:"Bearer "+SB_KEY, "Content-Type":"application/json", ...(opts.headers||{}) }
    });
    if(!r.ok) throw new Error("HTTP " + r.status);
    const txt = await r.text(); return txt ? JSON.parse(txt) : null;
  } finally { clearTimeout(t); }
}

/* ============ UI helpers ============ */
let toastT;
function toast(msg, err){ const t=$("toast"); t.textContent=msg; t.className="toast show"+(err?" err":""); clearTimeout(toastT); toastT=setTimeout(()=>t.className="toast",3200); }
function show(id){
  document.querySelectorAll(".screen").forEach(s=>s.classList.toggle("active", s.id===id));
  window.scrollTo({top:0});
  $("cartbar").classList.toggle("show", id==="s-menu" && cartCount()>0);
}
const cartCount = () => Object.values(S.cart).reduce((a,b)=>a+b,0);
const cartTotal = () => Object.entries(S.cart).reduce((a,[id,q])=>a+(S.dishes.find(d=>d.id==id)?.price||0)*q,0);

/* Deterministic colour + emoji for the no-photo fallback */
const PALETTE = [["#b8301f","#e9731b"],["#8a4b12","#e9a21b"],["#2f7a45","#8cbf4a"],["#7a2a4a","#d9644a"],["#1f5f7a","#4aa3a0"],["#6b3a1d","#c9822b"]];
function emojiFor(d){
  const n=d.name.toLowerCase();
  if(/biryani|rice|pulao|pongal|bath/.test(n)) return "🍛";
  if(/dosa|uttapam|pesarattu|paratha|naan|roti|kulcha|poori|bhature|appam|idiyappam|parotta/.test(n)) return "🫓";
  if(/idli|vada|paniyaram|samosa|puri|chaat|tikki/.test(n)) return "🥟";
  if(/soup|rasam/.test(n)) return "🍲";
  if(/lassi|milk|coffee|chai|kahwa|soda|water|buttermilk|jigarthanda|falooda/.test(n)) return "🥤";
  if(/halwa|jamun|payasam|kheer|pak|rasmalai|kesari|jalebi|kulfi|mysore/.test(n)) return "🍮";
  if(/fish|prawn|crab|squid|anchovy/.test(n)) return "🐟";
  if(/chicken|tandoori|tikka|kebab|lollipop|65/.test(n) && d.diet==="nonveg") return "🍗";
  if(/mutton|lamb|keema|nihari|rogan|paya/.test(n)) return "🍖";
  if(/egg/.test(n)) return "🍳";
  if(/salad|raita/.test(n)) return "🥗";
  return d.diet==="veg" ? "🥘" : "🍽️";
}
function hash(s){ let h=0; for(const c of s) h=(h*31+c.charCodeAt(0))|0; return Math.abs(h); }
function photoHTML(d){
  const [a,b]=PALETTE[hash(d.name)%PALETTE.length];
  const fb = `<div class="fallback" style="background:linear-gradient(135deg,${a},${b})"><div><span>${emojiFor(d)}</span>${esc(d.name)}</div></div>`;
  if(!d.image_url) return fb;
  return `<div class="fallback" style="background:linear-gradient(135deg,${a},${b})"><div><span>${emojiFor(d)}</span>${esc(d.name)}</div></div>`+
         `<img src="${esc(d.image_url)}" alt="${esc(d.name)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">`;
}

/* ============ DATA ============ */
async function loadDishes(){
  $("grid").innerHTML = Array.from({length:8},()=>'<div class="skeleton"></div>').join("");
  try{
    S.dishes = await api("dishes?select=*&order=id");
    if(!Array.isArray(S.dishes) || S.dishes.length===0) throw new Error("empty");
    S.online = true;
  }catch(e){
    console.warn("dishes load failed", e);
    S.online = false;
    S.dishes = FALLBACK.map(r=>({id:r[0],name:r[1],cuisine:r[2]==="S"?"South Indian":"North Indian",category:r[3],diet:r[4]==="v"?"veg":"nonveg",price:r[5],kid_friendly:!!r[6],high_protein:!!r[7],spice_level:r[8],description:r[9],image_url:null}));
  }
  const b=$("offline");
  b.style.display = S.online ? "none" : "block";
  b.textContent = "Showing the saved menu — live updates are unavailable right now. You can still browse; ordering needs a connection.";
}

async function loadHistory(mobile){
  try{
    S.history = await api(`order_history?select=dish_id,qty,ordered_on&mobile=eq.${encodeURIComponent(mobile)}&order=ordered_on.desc&limit=200`) || [];
  }catch(e){ S.history = []; }
}
async function lookupCustomer(mobile){
  try{ const r = await api(`customers?select=name,dob&mobile=eq.${encodeURIComponent(mobile)}&limit=1`); return r && r[0] || null; }
  catch(e){ return null; }
}

/* ============ WELCOME ============ */
(function initTable(){
  const sel=$("table"); sel.innerHTML='<option value="">Select table…</option>'+Array.from({length:TABLES},(_,i)=>`<option value="${i+1}">Table ${i+1}</option>`).join("");
  const t=new URLSearchParams(location.search).get("table"); if(t && +t>=1 && +t<=TABLES) sel.value=t;
  $("dob").max = new Date().toISOString().slice(0,10);
})();
$("mobile").addEventListener("input", async e=>{
  let digits = e.target.value.replace(/\D/g,"");
  if(digits.length>10 && digits.startsWith("91")) digits = digits.slice(2);   // pasted +91 number
  e.target.value = digits.slice(0,10);
  if(e.target.value.length===10){
    const c = await lookupCustomer(e.target.value);
    const box=$("returning");
    if(c){ box.style.display="block"; box.innerHTML=`Welcome back, <b>${esc(c.name)}</b>! We've filled in your details.`; if(!$("name").value) $("name").value=c.name; if(!$("dob").value) $("dob").value=c.dob; }
    else box.style.display="none";
  } else $("returning").style.display="none";
});
function flag(id,bad){ $(id).classList.toggle("bad",bad); return !bad; }
$("welcomeForm").addEventListener("submit", async e=>{
  e.preventDefault();
  const name=$("name").value.trim(), mobile=$("mobile").value.trim(), dob=$("dob").value, table=$("table").value;
  const okDob = dob && dob<=new Date().toISOString().slice(0,10) && dob>="1900-01-01";
  const v=[flag("f-name",name.length<2), flag("f-mobile",!/^[6-9]\d{9}$/.test(mobile)), flag("f-dob",!okDob), flag("f-table",!table)];
  if(v.includes(false)) return;
  const btn=$("goBtn"); btn.disabled=true; btn.textContent="One moment…";
  S.user={name,mobile,dob,table:+table};
  try{ await Promise.all([loadDishes(), loadHistory(mobile)]); }catch(_){}
  // register / refresh the customer (ignore failures)
  try{ await api("customers",{method:"POST",headers:{Prefer:"resolution=ignore-duplicates,return=minimal"},body:JSON.stringify({mobile,name,dob})}); }catch(_){}
  btn.disabled=false; btn.textContent="See the menu →";
  $("who").style.display="block"; $("who").innerHTML=`<b>${esc(name.split(" ")[0])}</b>${esc(mobile.slice(0,2))}••••••${esc(mobile.slice(-2))}`;
  $("tablePill").style.display="inline-block"; $("tablePill").textContent="Table "+table;
  show("s-menu"); renderMenu(); openPref();
});

/* ============ PREFERENCE POPUP ============ */
function ageOf(dob){ const d=new Date(dob),n=new Date(); let a=n.getFullYear()-d.getFullYear(); const m=n.getMonth()-d.getMonth(); if(m<0||(m===0&&n.getDate()<d.getDate())) a--; return a; }
function openPref(){
  $("agegrp").classList.remove("show");
  $("ageChips").innerHTML = AGE_GROUPS.map(g=>`<button class="chip" data-a="${g.k}">${g.label}</button>`).join("");
  $("prefModal").classList.add("open");
}
$("changePref").onclick = openPref;
$("prefModal").addEventListener("click", e=>{
  const p=e.target.closest(".pref"), a=e.target.closest(".chip");
  if(p){
    const v=p.dataset.p;
    if(v==="kids"){ S.pref="kids"; $("agegrp").classList.add("show"); S.age=null; $("ageChips").querySelectorAll(".chip").forEach(c=>c.classList.remove("on")); return; }
    S.pref=v; S.age=null; closePref();
  } else if(a){
    S.age=a.dataset.a; S.pref="kids"; closePref();
  } else if(e.target.id==="prefModal" && S.pref){ closePref(); }
});
document.addEventListener("keydown", e=>{ if(e.key==="Escape"){ closePref(); $("supPanel").classList.remove("open"); } });
function closePref(){
  $("prefModal").classList.remove("open");
  document.querySelectorAll("#segDiet button").forEach(b=>b.classList.toggle("on", b.dataset.v===S.pref));
  renderMenu();
}

/* ============ SUGGESTIONS (order history by mobile, age-aware) ============ */
function buildSuggestions(){
  const out=[];
  const byId=id=>S.dishes.find(d=>d.id===id);
  const age = S.user ? ageOf(S.user.dob) : null;
  // most ordered by this mobile number
  const tally={}; S.history.forEach(h=>tally[h.dish_id]=(tally[h.dish_id]||0)+h.qty);
  const top=Object.entries(tally).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([id,q])=>({d:byId(+id),q})).filter(x=>x.d);
  if(top.length) out.push({title:"Your most ordered", sub:"based on your order history", items:top.map(x=>({d:x.d,note:`ordered ${x.q}×`}))});
  // senior-adult friendly
  if(age!==null && age>=SENIOR_AGE){
    const items=S.dishes.filter(d=>d.diet==="veg"&&d.spice_level<=1&&/rice|pongal|idli|dal|khichdi|curd|kheer|soup|payasam|kesari|roti|halwa|kadhi|stew/i.test(d.name)).slice(0,6);
    if(items.length) out.push({title:"Gentle on the stomach", sub:"light & mildly spiced picks for seniors", items:items.map(d=>({d,note:"mild"}))});
  }
  // kids
  if((age!==null && age<=17) || S.pref==="kids"){
    const g = AGE_GROUPS.find(x=>x.k===S.age);
    const max = g ? g.maxSpice : (age!==null && age<=4 ? 0 : 1);
    const items=S.dishes.filter(d=>d.kid_friendly&&d.high_protein&&d.spice_level<=max).slice(0,6);
    if(items.length) out.push({title:"Protein-packed for kids", sub:"mild, tasty & nutritious", items:items.map(d=>({d,note:"high protein"}))});
  }
  // popular for new customers
  if(!top.length){
    const items=S.dishes.filter(d=>/masala dosa|butter chicken|paneer butter|biryani|idli sambar|dal makhani/i.test(d.name)).slice(0,6);
    if(items.length) out.push({title:"Guest favourites", sub:"loved by diners here", items:items.map(d=>({d,note:"popular"}))});
  }
  return out;
}
function renderSuggestions(){
  const secs=buildSuggestions();
  $("suggestions").innerHTML = secs.map(s=>`
    <div class="suggest"><h3>${esc(s.title)} <small>${esc(s.sub)}</small></h3>
    <div class="rail">${s.items.map(({d,note})=>`
      <div class="mini"><div class="ph" style="border-radius:12px;aspect-ratio:16/10">${photoHTML(d)}</div>
      <b>${esc(d.name)}</b><div class="meta">${rupee(d.price)} · ${esc(note)}</div>
      <div id="m-${d.id}">${ctrl(d.id,true)}</div></div>`).join("")}</div></div>`).join("");
}

/* ============ MENU ============ */
function matches(d){
  if(S.pref==="veg" && d.diet!=="veg") return false;
  if(S.pref==="nonveg" && d.diet!=="nonveg") return false;
  if(S.pref==="kids"){
    if(!d.kid_friendly) return false;
    const g=AGE_GROUPS.find(x=>x.k===S.age);
    if(g && d.spice_level>g.maxSpice) return false;
  }
  if(S.cuisine!=="all" && d.cuisine!==S.cuisine) return false;
  if(S.cat!=="all" && d.category!==S.cat) return false;
  if(S.q && !(d.name+" "+(d.description||"")+" "+d.category).toLowerCase().includes(S.q)) return false;
  return true;
}
function ctrl(id,mini){
  const q=S.cart[id]||0;
  return q ? `<div class="qty"><button data-a="dec" data-id="${id}" aria-label="Remove one">−</button><span>${q}</span><button data-a="inc" data-id="${id}" aria-label="Add one">+</button></div>`
           : `<button class="add" data-a="inc" data-id="${id}">Add</button>`;
}
function renderCats(){
  const base = S.dishes.filter(d=>(S.cuisine==="all"||d.cuisine===S.cuisine));
  const cats=["all",...Array.from(new Set(base.map(d=>d.category))).sort()];
  if(!cats.includes(S.cat)) S.cat="all";
  $("segCat").innerHTML = cats.map(c=>`<button data-v="${esc(c)}" class="${c===S.cat?"on":""}">${c==="all"?"All courses":esc(c)}</button>`).join("");
}
function renderMenu(){
  if(!S.user) return;
  const age=ageOf(S.user.dob);
  $("hello").innerHTML = `Hello, <span>${esc(S.user.name.split(" ")[0])}</span> 👋`;
  const t=new Date(), d=new Date(S.user.dob), bd = $("bday");
  if(t.getDate()===d.getDate() && t.getMonth()===d.getMonth()){ bd.style.display="block"; bd.textContent=`🎂 Happy birthday, ${S.user.name.split(" ")[0]}! Tell your waiter — dessert's on our minds.`; } else bd.style.display="none";
  renderCats(); renderSuggestions();
  const list=S.dishes.filter(matches);
  $("count").textContent = `${list.length} of ${S.dishes.length} dishes`;
  $("grid").innerHTML = list.length ? list.map((d,i)=>`
    <article class="dish" style="animation-delay:${Math.min(i,14)*35}ms">
      <div class="ph">${photoHTML(d)}
        <div class="badges"><span class="vn ${d.diet==="nonveg"?"nv":""}" title="${d.diet==="veg"?"Vegetarian":"Non-vegetarian"}"></span></div>
        <span class="tag">${esc(d.cuisine)}</span></div>
      <div class="body"><h3>${esc(d.name)}</h3><p>${esc(d.description||"")}</p>
        <div class="meta2"><span>${esc(d.category)}</span>${d.high_protein?"<span>💪 protein</span>":""}${d.spice_level?`<span class="spice">${"🌶".repeat(d.spice_level)}</span>`:""}</div>
        <div class="buy"><span class="price">${rupee(d.price)}</span><span id="c-${d.id}">${ctrl(d.id)}</span></div></div>
    </article>`).join("")
    : `<div class="empty" style="grid-column:1/-1"><div style="font-size:48px">🍽️</div><p>No dishes match these filters.<br>Try "All" or clear the search.</p></div>`;
  syncCartBar();
}
function refreshCtrls(id){
  const a=$("c-"+id), b=$("m-"+id);
  if(a) a.innerHTML=ctrl(id); if(b) b.innerHTML=ctrl(id,true);
  syncCartBar();
}
function syncCartBar(){
  const n=cartCount();
  $("cbCount").textContent = n+" item"+(n===1?"":"s");
  $("cbTotal").textContent = rupee(cartTotal());
  $("cartbar").classList.toggle("show", n>0 && $("s-menu").classList.contains("active"));
}
function change(id,delta){
  const q=(S.cart[id]||0)+delta;
  if(q<=0) delete S.cart[id]; else S.cart[id]=Math.min(q,20);
  refreshCtrls(id);
  if($("s-cart").classList.contains("active")) renderCart();
}
document.addEventListener("click", e=>{
  const b=e.target.closest("[data-a]");
  if(b && (b.dataset.a==="inc"||b.dataset.a==="dec")) change(+b.dataset.id, b.dataset.a==="inc"?1:-1);
});
$("segDiet").onclick = e=>{ const b=e.target.closest("button"); if(!b) return; S.pref=b.dataset.v; S.age=null; document.querySelectorAll("#segDiet button").forEach(x=>x.classList.toggle("on",x===b)); if(S.pref==="kids"){ openPref(); $("agegrp").classList.add("show"); } renderMenu(); };
$("segCuisine").onclick = e=>{ const b=e.target.closest("button"); if(!b) return; S.cuisine=b.dataset.v; S.cat="all"; document.querySelectorAll("#segCuisine button").forEach(x=>x.classList.toggle("on",x===b)); renderMenu(); };
$("segCat").onclick = e=>{ const b=e.target.closest("button"); if(!b) return; S.cat=b.dataset.v; renderMenu(); };
let st; $("search").addEventListener("input", e=>{ clearTimeout(st); st=setTimeout(()=>{ S.q=e.target.value.trim().toLowerCase(); renderMenu(); },180); });

/* ============ CART & ORDER ============ */
function renderCart(){
  const ids=Object.keys(S.cart);
  if(!ids.length){ show("s-menu"); renderMenu(); return; }
  $("cartLines").innerHTML = ids.map(id=>{ const d=S.dishes.find(x=>x.id==id); if(!d) return ""; const q=S.cart[id];
    return `<div class="line"><div><b>${esc(d.name)}</b><br><small>${rupee(d.price)} × ${q} = ${rupee(d.price*q)}</small></div>
    <div class="qty"><button data-a="dec" data-id="${id}" aria-label="Remove one">−</button><span>${q}</span><button data-a="inc" data-id="${id}" aria-label="Add one">+</button></div></div>`; }).join("");
  $("cartTotal").textContent = rupee(cartTotal());
}
$("viewCart").onclick = ()=>{ show("s-cart"); renderCart(); };
$("backMenu").onclick = ()=>{ show("s-menu"); renderMenu(); };

let sending=false;
$("orderBtn").onclick = async ()=>{
  if(sending || !cartCount()) return;
  if(!S.online){ toast("Can't send the order — no connection to the kitchen. Please call the waiter.", true); return; }
  sending=true; const btn=$("orderBtn"); btn.disabled=true; btn.textContent="Sending to your waiter…";
  try{
    // pick a waiter at random
    const ws = await api("waiters?select=id,name,gender");
    if(!ws || !ws.length) throw new Error("no waiters");
    const w = ws[Math.floor(Math.random()*ws.length)];
    const items = Object.entries(S.cart).map(([id,q])=>{ const d=S.dishes.find(x=>x.id==id); return {dish_id:+id,name:d.name,qty:q,price:d.price}; });
    await api("orders",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({table_no:S.user.table,customer_name:S.user.name,mobile:S.user.mobile,waiter_id:w.id,waiter_name:w.name,items})});
    // remember in order history (best effort)
    try{ const today=new Date().toISOString().slice(0,10);
      await api("order_history",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify(items.map(i=>({mobile:S.user.mobile,dish_id:i.dish_id,qty:i.qty,ordered_on:today})))});
    }catch(_){}
    const n=cartCount();
    $("doneMsg").textContent = `${n} item${n===1?"":"s"} · ${rupee(cartTotal())} for Table ${S.user.table}`;
    $("wcard").innerHTML = `<small style="color:var(--muted)">Your waiter</small><b>${esc(w.name)}</b><small>${esc(w.gender)} · English, <span class="ta">தமிழ்</span></small>`;
    S.cart={}; await loadHistory(S.user.mobile);
    show("s-done");
  }catch(e){
    console.error(e); toast("Couldn't send your order. Please try again or call the waiter.", true);
  }finally{ sending=false; btn.disabled=false; btn.textContent="Order to Waiter"; }
};
$("again").onclick = ()=>{ show("s-menu"); renderMenu(); };

/* ============ SUPPORT (every page) ============ */
$("supFab").onclick = ()=>{ const p=$("supPanel"); const o=!p.classList.contains("open"); p.classList.toggle("open",o); $("supFab").setAttribute("aria-expanded",o); };
$("supPanel").addEventListener("click", async e=>{
  const b=e.target.closest(".opt"); if(!b) return;
  const kind=b.dataset.k; b.disabled=true;
  try{
    await api("support_requests",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({kind,table_no:S.user?.table??null,customer_name:S.user?.name??null,mobile:S.user?.mobile??null})});
    toast(kind==="manager" ? "The manager has been notified and will be with you shortly." : "A waiter is on the way to your table.");
  }catch(err){ toast("Couldn't reach the restaurant just now. Please wave to a staff member.", true); }
  b.disabled=false; $("supPanel").classList.remove("open");
});
document.addEventListener("click", e=>{ if(!e.target.closest("#supPanel,#supFab")) $("supPanel").classList.remove("open"); });

loadDishes();
