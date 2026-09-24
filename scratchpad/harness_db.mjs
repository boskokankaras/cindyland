import vm from 'vm';
import { kod } from './okvir.mjs';

/* ---- lažni server: FK provjera + slučajno kašnjenje po zahtjevu ---- */
function napraviServer(rnd){
  const t = { clients:new Map(), pets:new Map(), stays:new Map(), boxes:new Map(), settings:new Map() };
  const kasni = () => new Promise(r => setTimeout(r, 4 + Math.floor(rnd()*24)));  // 4-28 ms puta
  return {
    t,
    async upsert(table, row){
      await kasni();                                   // put do servera
      if (table === 'pets'  && !t.clients.has(row.client_id)) return { error: { code:'23503', message:'pets_client_id_fkey' } };
      if (table === 'stays' && !t.clients.has(row.client_id)) return { error: { code:'23503', message:'stays_client_id_fkey' } };
      t[table].set(row.id || row.key, row);
      return { error: null };
    },
    async del(table, id){ await kasni(); t[table].delete(id); return { error: null }; },
  };
}
function napraviSb(srv){
  const builder = (fn) => { const b = { abortSignal(){ return b; }, eq(_k,v){ b._id = v; return b; },
    then(res, rej){ return fn(b).then(res, rej); } }; return b; };
  return {
    from(table){ return {
      upsert(row){ return builder(() => srv.upsert(table, row)); },
      delete(){ return builder(b => srv.del(table, b._id)); },
      select(){ const b = { order(){ return b; }, range(){ return b; }, then(r){ return Promise.resolve(r({ data:[...srv.t[table].values()], error:null })); } }; return b; },
    }; },
  };
}

/* deterministički random (da je test ponovljiv) */
function rng(seed){ let x = seed; return () => { x = (x*1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; }; }

function pokreni(seed, staraLogika){
  const rnd = rng(seed);
  const srv = napraviServer(rnd);
  const D = { clients:[], pets:[], stays:[], boxes:[], prices:{} };
  const porukе = [];
  const ctx = {
    D, sb: napraviSb(srv), console, setTimeout, clearTimeout, Promise, Map, Set, Array, Object, Number, JSON, Date, Math,
    AbortController: class { constructor(){ this.signal = {}; } abort(){} }, navigator: { onLine: true },
    save(){}, render(){}, toast(m){ porukе.push(m); }, normalizePrices: p => p,
    OFFLINE:false, CE:null, PD:null, sheetOpen:false, $:()=>({textContent:''}), cePopSync(){}, renderClientPop(){}, renderDatesCheck(){}, dopuniMaleSlikeUskoro(){}, ocistiKesSlika(){},
    uid:()=>'x', esc:s=>s, I:{}, CFG:{}, defaultData:()=>D,
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(kod, ctx);

  if (staraLogika){
    /* stara logika: svaki upis kreće ODMAH, paralelno, greška se guta */
    vm.runInContext("dbSave = async function(table, obj){ const row = DB_MAP[table] ? DB_MAP[table](obj) : obj; const r = await sb.from(table).upsert(row); if (r.error) toast('nije sacuvano'); };", ctx);
  }
  return { ctx, srv, D, porukе };
}

/* --- SCENARIO: nov klijent + 2 ljubimca (sfSaveClient), pa boravak --- */
async function scenario(seed, stara){
  const { ctx, srv, D, porukе } = pokreni(seed, stara);
  const c = { id:'c'+seed, name:'Test', phone:'', note:'', blacklist:false };
  D.clients.push(c); ctx.dbSave('clients', c);
  const pets = [];
  for (let i=0;i<2;i++){
    const p = { id:'p'+seed+'_'+i, clientId:c.id, name:'Pas'+i, species:'pas', size:'mali', sex:null, breed:'', note:'', photo:null };
    D.pets.push(p); pets.push(p); ctx.dbSave('pets', p);
  }
  await new Promise(r => setTimeout(r, 400));
  const naServeru = pets.filter(p => srv.t.pets.has(p.id)).length;
  /* pa stigne osvježavanje sa servera (realtime) */
  await ctx.loadAll();
  const naEkranu = pets.filter(p => D.pets.some(x => x.id === p.id)).length;
  return { naServeru, naEkranu, porukе };
}

for (const stara of [true, false]){
  let srv0=0, ekr0=0, ukupno=0;
  for (let s=1; s<=60; s++){
    const r = await scenario(s, stara);
    srv0 += r.naServeru; ekr0 += r.naEkranu; ukupno += 2;
  }
  console.log((stara ? 'STARA logika' : 'NOVA  logika').padEnd(14),
    'ljubimaca u bazi:', String(srv0).padStart(3), '/', ukupno,
    ' ostalo na ekranu poslije osvježavanja:', String(ekr0).padStart(3), '/', ukupno);
}
