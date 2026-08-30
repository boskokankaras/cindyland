import vm from 'vm';
import { kod } from './okvir.mjs';
function rng(seed){ let x=seed; return ()=>{ x=(x*1103515245+12345)&0x7fffffff; return x/0x7fffffff; }; }
function napravi(seed, opts={}){
  const rnd = rng(seed);
  const t = { clients:new Map(), pets:new Map(), stays:new Map(), boxes:new Map(), settings:new Map() };
  const stanje = { pao: !!opts.pao };
  const kasni = () => new Promise(r=>setTimeout(r, 2+Math.floor(rnd()*12)));
  const srv = {
    t, stanje,
    async upsert(table,row){ await kasni();
      if (stanje.pao) return { error:{ message:'nema mreze' } };
      if ((table==='pets'||table==='stays') && !t.clients.has(row.client_id)) return { error:{ code:'23503' } };
      t[table].set(row.id||row.key,row); return { error:null }; },
    async del(table,id){ await kasni(); if (stanje.pao) return { error:{ message:'nema mreze' } }; t[table].delete(id); return { error:null }; },
  };
  const builder = fn => { const b={ abortSignal(){return b;}, eq(_k,v){b._id=v;return b;}, then(r,j){ return fn(b).then(r,j); } }; return b; };
  const sb = { from(table){ return {
    upsert(row){ return builder(()=>srv.upsert(table,row)); },
    delete(){ return builder(b=>srv.del(table,b._id)); },
    select(){ const b={ range(){return b;}, then(r){ return Promise.resolve(r({ data:[...srv.t[table].values()], error:null })); } }; return b; } }; } };
  const D = { clients:[], pets:[], stays:[], boxes:[], prices:{} };
  const poruke=[];
  const ctx = { D, sb, console, setTimeout, clearTimeout, Promise, Map, Set, Array, Object, Number, JSON, Date, Math,
    AbortController: class { constructor(){ this.signal={}; } abort(){} }, navigator: { onLine: true },
    save(){}, render(){}, toast(m){poruke.push(m);}, normalizePrices:p=>p, OFFLINE:false, CE:null, PD:null, sheetOpen:false,
    $:()=>({textContent:''}), cePopSync(){}, renderClientPop(){}, renderDatesCheck(){}, uid:()=>'x', esc:s=>s, I:{}, CFG:{}, defaultData:()=>D };
  ctx.window=ctx; ctx.globalThis=ctx; vm.createContext(ctx); vm.runInContext(kod, ctx);
  return { ctx, srv, D, poruke, ceka: () => vm.runInContext('DB_CEKA.size', ctx) };
}
const cekaj = ms => new Promise(r=>setTimeout(r,ms));
let pao = 0; const ok = (uslov, ime) => { console.log((uslov?'  OK  ':'  PAO ') + ime); if(!uslov) pao++; };

/* 1 - nema mreze: podatak ostaje na ekranu i poslije osvjezavanja, pa se upise kad se mreza vrati */
{
  const h = napravi(7, { pao:true });
  const c={id:'c1',name:'A',phone:'',note:'',blacklist:false}; h.D.clients.push(c); h.ctx.dbSave('clients',c);
  const p={id:'p1',clientId:'c1',name:'Reks',species:'pas',size:'mali',sex:null,breed:'',note:'',photo:null}; h.D.pets.push(p); h.ctx.dbSave('pets',p);
  await cekaj(4000);
  ok(h.ceka()===2, 'neuspjeli upisi cekaju u redu (2)');
  await h.ctx.loadAll();
  ok(h.D.pets.length===1 && h.D.clients.length===1, 'nema mreze: klijent i ljubimac OSTAJU na ekranu poslije osvjezavanja');
  h.srv.stanje.pao = false;
  h.ctx.ponoviNesacuvano(); await cekaj(600);
  ok(h.srv.t.clients.has('c1') && h.srv.t.pets.has('p1'), 'kad se mreza vrati - oboje legne u bazu');
  ok(h.ceka()===0, 'red je prazan poslije uspjeha');
  await h.ctx.loadAll();
  ok(h.D.pets.length===1, 'poslije osvjezavanja i dalje tu');
}
/* 2 - brisanje: obrisan red se NE vraca poslije osvjezavanja */
{
  const h = napravi(11);
  const c={id:'c1',name:'A',phone:'',note:'',blacklist:false}; h.D.clients.push(c); h.ctx.dbSave('clients',c);
  const p={id:'p1',clientId:'c1',name:'Reks',species:'pas',size:'mali',sex:null,breed:'',note:'',photo:null}; h.D.pets.push(p); h.ctx.dbSave('pets',p);
  await cekaj(300);
  h.D.pets = h.D.pets.filter(x=>x.id!=='p1'); h.ctx.dbKill('pets','p1');
  await cekaj(300); await h.ctx.loadAll();
  ok(h.D.pets.length===0 && !h.srv.t.pets.has('p1'), 'obrisan ljubimac ne vaskrsava');
}
/* 3 - brisanje bez mreze: ne smije se vratiti na ekran */
{
  const h = napravi(13);
  const c={id:'c1',name:'A',phone:'',note:'',blacklist:false}; h.D.clients.push(c); h.ctx.dbSave('clients',c);
  const p={id:'p1',clientId:'c1',name:'Reks',species:'pas',size:'mali',sex:null,breed:'',note:'',photo:null}; h.D.pets.push(p); h.ctx.dbSave('pets',p);
  await cekaj(300);
  h.srv.stanje.pao = true;
  h.D.pets = h.D.pets.filter(x=>x.id!=='p1'); h.ctx.dbKill('pets','p1');
  await cekaj(4000); await h.ctx.loadAll();
  ok(h.D.pets.length===0, 'brisanje bez mreze: ljubimac se NE vraca na ekran');
  h.srv.stanje.pao = false; h.ctx.ponoviNesacuvano(); await cekaj(600);
  ok(!h.srv.t.pets.has('p1'), 'brisanje legne kad se mreza vrati');
}
/* 4 - redoslijed: 40 upisa ide tacno redom */
{
  const h = napravi(17);
  const c={id:'c1',name:'A',phone:'',note:'',blacklist:false}; h.D.clients.push(c); h.ctx.dbSave('clients',c);
  for (let i=0;i<40;i++){ const p={id:'p'+i,clientId:'c1',name:'P'+i,species:'pas',size:'mali',sex:null,breed:'',note:'',photo:null}; h.D.pets.push(p); h.ctx.dbSave('pets',p); }
  await cekaj(1500);
  ok(h.srv.t.pets.size===40, '40 ljubimaca u bazi (bilo ih je '+h.srv.t.pets.size+')');
  ok([...h.srv.t.pets.keys()].join(',')===Array.from({length:40},(_,i)=>'p'+i).join(','), 'redoslijed upisa ocuvan');
}
/* 5 - boravak odmah poslije novog klijenta (FK i tu) */
{
  const h = napravi(23);
  const c={id:'c9',name:'A',phone:'',note:'',blacklist:false}; h.D.clients.push(c); h.ctx.dbSave('clients',c);
  const st={id:'s9',clientId:'c9',petIds:[],type:'pansion',from:'2026-09-01',to:'2026-09-03',price:null,paid:false,note:''};
  h.D.stays.push(st); h.ctx.dbSave('stays',st);
  await cekaj(400);
  ok(h.srv.t.stays.has('s9'), 'boravak upisan odmah poslije novog klijenta');
}
console.log(pao ? '\nPALO: '+pao : '\nSVE PROSLO');
