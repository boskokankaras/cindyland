import vm from 'vm';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
/* PRAVI kod iz app/index.html - blok sa Supabase slojem (dbSave/dbKill/loadAll...) */
const OVDJE = path.dirname(fileURLToPath(import.meta.url));
const REPO = process.env.CINDY_REPO || path.join(OVDJE, '..');
export const kod = (fs.readFileSync(path.join(REPO, 'app/index.html'), 'utf8')
  .match(/<script>([\s\S]*?)<\/script>/g) || [])
  .map(b => b.replace(/^<script>|<\/script>$/g, ''))
  .find(b => b.includes('SUPABASE sloj'));
if (!kod) throw new Error('nije nadjen Supabase blok u app/index.html');

export function rng(seed){ let x=seed; return ()=>{ x=(x*1103515245+12345)&0x7fffffff; return x/0x7fffffff; }; }
export function napravi(seed, opts={}){
  const rnd = rng(seed);
  const T = { clients:new Map(), pets:new Map(), stays:new Map(), boxes:new Map(), settings:new Map() };
  const stanje = { pao: !!opts.pao };
  const kasni = () => new Promise(r=>setTimeout(r, 2+Math.floor(rnd()*10)));
  const srv = { T, stanje, upisi: [],
    async upsert(table,row){ await kasni();
      if (stanje.pao) return { error:{ message:'nema mreze' } };
      if ((table==='pets'||table==='stays') && !T.clients.has(row.client_id)) return { error:{ code:'23503' } };
      T[table].set(row.id||row.key,row); srv.upisi.push(table+':'+(row.id||row.key)); return { error:null }; },
    async del(table,id){ await kasni(); if (stanje.pao) return { error:{ message:'nema mreze' } };
      T[table].delete(id); srv.upisi.push('DEL '+table+':'+id); return { error:null }; } };
  const builder = fn => { const b={ abortSignal(){return b;}, eq(_k,v){b._id=v;return b;}, then(r,j){ return fn(b).then(r,j); } }; return b; };
  const sb = { from(table){ return {
    upsert(row){ return builder(()=>srv.upsert(table,row)); },
    delete(){ return builder(b=>srv.del(table,b._id)); },
    select(){ const b={ range(){return b;}, then(r){ return Promise.resolve(r({ data:[...srv.T[table].values()], error:null })); } }; return b; } }; } };
  const D = opts.D || { clients:[], pets:[], stays:[], boxes:[], prices:{ dnevni: 10 } };
  const poruke=[];
  const store = opts.store || new Map();
  const localStorage = { getItem:k=>store.has(k)?store.get(k):null, setItem:(k,v)=>store.set(k,String(v)), removeItem:k=>store.delete(k) };
  const ctx = { D, sb, console, setTimeout, clearTimeout, Promise, Map, Set, Array, Object, Number, JSON, Date, Math, localStorage,
    AbortController: class { constructor(){ this.signal={}; } abort(){} }, navigator:{ onLine:true },
    save(){}, render(){}, toast(m){poruke.push(m);}, normalizePrices:p=>p, OFFLINE:false, CE:null, PD:null, sheetOpen:false,
    $:()=>({textContent:''}), cePopSync(){}, renderClientPop(){}, renderDatesCheck(){}, uid:()=>'x', esc:s=>s, I:{}, CFG:{}, defaultData:()=>D };
  ctx.window=ctx; ctx.globalThis=ctx; vm.createContext(ctx); vm.runInContext(kod, ctx);
  const g = izraz => vm.runInContext(izraz, ctx);
  return { ctx, srv, D, poruke, store, g, ceka:()=>g('DB_CEKA.size'), palo:()=>g('nesacuvanoBroj()') };
}
export const cekaj = ms => new Promise(r=>setTimeout(r,ms));
