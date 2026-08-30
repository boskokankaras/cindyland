import { napravi, cekaj } from './okvir.mjs';
let pao = 0; const ok = (u, ime) => { console.log((u?'  OK  ':'  PAO ') + ime); if(!u) pao++; };
const KL = (id) => ({ id, name:'K'+id, phone:'', note:'', blacklist:false });
const LJ = (id, cid, ime) => ({ id, clientId:cid, name:ime, species:'pas', size:'mali', sex:null, breed:'', note:'', photo:null });

/* 1 - nov klijent + 2 ljubimca: nista se ne gubi (osnovni kvar) */
{
  const h = napravi(3);
  const c = KL('c1'); h.D.clients.push(c); h.ctx.dbSave('clients', c);
  const p1 = LJ('p1','c1','Reks'), p2 = LJ('p2','c1','Mica');
  h.D.pets.push(p1, p2); h.ctx.dbSave('pets', p1); h.ctx.dbSave('pets', p2);
  await cekaj(400); await h.ctx.loadAll();
  ok(h.srv.T.pets.size === 2 && h.D.pets.length === 2, 'nov klijent + 2 ljubimca: oba u bazi i na ekranu');
}
/* 2 - DVA upisa istog reda: drugi NE smije da se preskoci */
{
  const h = napravi(5);
  const c = KL('c1'); h.D.clients.push(c); h.ctx.dbSave('clients', c);
  await cekaj(200);
  c.name = 'Prvo ime'; h.ctx.dbSave('clients', c);
  const c2 = { ...c, name:'Drugo ime' };
  const i = h.D.clients.findIndex(x=>x.id==='c1'); h.D.clients[i] = c2;
  h.ctx.dbSave('clients', c2);
  await cekaj(400);
  ok(h.srv.T.clients.get('c1').name === 'Drugo ime', 'drugi upis istog reda stigne na server (bilo: ' + h.srv.T.clients.get('c1').name + ')');
  ok(h.ceka() === 0, 'red prazan poslije dva upisa istog reda');
}
/* 3 - upis pa brisanje istog id-a: brisanje pobjeduje */
{
  const h = napravi(7);
  const c = KL('c1'); h.D.clients.push(c); h.ctx.dbSave('clients', c);
  const p = LJ('p1','c1','Reks'); h.D.pets.push(p); h.ctx.dbSave('pets', p);
  await cekaj(300);
  h.ctx.dbSave('pets', p);           // izmjena
  h.D.pets = h.D.pets.filter(x=>x.id!=='p1'); h.ctx.dbKill('pets','p1');   // pa brisanje
  await cekaj(400); await h.ctx.loadAll();
  ok(!h.srv.T.pets.has('p1'), 'brisanje pobjeduje upis istog id-a');
  ok(h.D.pets.length === 0, 'obrisan ljubimac se ne vraca na ekran');
  ok(h.ceka() === 0, 'nema zaostalih oznaka');
}
/* 4 - neuspjelo BRISANJE se broji u traci i ponavlja */
{
  const h = napravi(11);
  const c = KL('c1'); h.D.clients.push(c); h.ctx.dbSave('clients', c);
  const p = LJ('p1','c1','Reks'); h.D.pets.push(p); h.ctx.dbSave('pets', p);
  await cekaj(300);
  h.srv.stanje.pao = true;
  h.D.pets = h.D.pets.filter(x=>x.id!=='p1'); h.ctx.dbKill('pets','p1');
  await cekaj(4000);
  ok(h.palo() === 1, 'neuspjelo brisanje se broji u traci (palo=' + h.palo() + ')');
  h.srv.stanje.pao = false; h.ctx.ponoviNesacuvano(true); await cekaj(500);
  ok(!h.srv.T.pets.has('p1') && h.ceka() === 0, 'ponovni pokusaj obrise red na serveru');
}
/* 5 - nepotvrdjen upis PREZIVI gasenje app-a */
{
  const store = new Map();
  const h = napravi(13, { pao:true, store });
  const c = KL('c9'); h.D.clients.push(c); h.ctx.dbSave('clients', c);
  const p = LJ('p9','c9','Bela'); h.D.pets.push(p); h.ctx.dbSave('pets', p);
  await cekaj(9000);
  ok(h.palo() === 2, 'oba upisa pala (palo=' + h.palo() + ')');
  ok(store.has('cindyland-ceka'), 'nepotvrdjeni upisi zapisani na telefon');
  // "gasenje i paljenje": nov kontekst, isti localStorage, prazna D
  const h2 = napravi(17, { store });
  h2.ctx.cekaUcitaj(); h2.ctx.vratiNesacuvano();
  ok(h2.D.clients.length === 1 && h2.D.pets.length === 1, 'poslije paljenja app-a klijent i ljubimac su tu');
  h2.ctx.ponoviNesacuvano(true); await cekaj(500);
  ok(h2.srv.T.clients.has('c9') && h2.srv.T.pets.has('p9'), 'i sami odu na server poslije paljenja');
  ok(h2.ceka() === 0, 'red ociscen');
}
/* 6 - ponoviNesacuvano NE dira ono sto je jos u letu */
{
  const h = napravi(19);
  const c = KL('c1'); h.D.clients.push(c); h.ctx.dbSave('clients', c);
  for (let i=0;i<10;i++){ const p = LJ('p'+i,'c1','P'+i); h.D.pets.push(p); h.ctx.dbSave('pets', p); }
  h.ctx.ponoviNesacuvano(); h.ctx.ponoviNesacuvano(); h.ctx.ponoviNesacuvano();
  await cekaj(900);
  ok(h.srv.upisi.length === 11, 'nema umnozavanja upisa (poslato ' + h.srv.upisi.length + ', ocekivano 11)');
}
/* 7 - cjenovnik: ponovni pokusaj salje SNIMAK, ne ono sto je u medjuvremenu stiglo */
{
  const h = napravi(23, { pao:true });
  h.D.prices = { dnevni: 15 };
  h.ctx.dbSavePrices();
  await cekaj(4000);
  ok(h.palo() === 1, 'pali cjenovnik se broji');
  h.D.prices = { dnevni: 99 };            // "stiglo sa servera" u medjuvremenu
  h.ctx.vratiNesacuvano();
  ok(h.D.prices.dnevni === 15, 'nepotvrdjeni cjenovnik se vraca na ekran (' + h.D.prices.dnevni + ')');
  h.srv.stanje.pao = false; h.ctx.ponoviNesacuvano(true); await cekaj(500);
  ok(h.srv.T.settings.get('prices').value.dnevni === 15, 'na server ide SNIMAK (' + h.srv.T.settings.get('prices').value.dnevni + ')');
}
/* 8 - app sam odustane poslije 5 pokusaja, dugme "Posalji" i dalje radi */
{
  const h = napravi(29, { pao:true });
  const c = KL('c1'); h.D.clients.push(c); h.ctx.dbSave('clients', c);
  await cekaj(3000);
  for (let i=0;i<8;i++){ h.ctx.ponoviNesacuvano(); await cekaj(3000); }
  const pk = h.g("[...DB_CEKA.values()][0].pokusaja");
  ok(pk <= 6, 'app sam prestane da pokusava (pokusaja=' + pk + ')');
  h.srv.stanje.pao = false; h.ctx.ponoviNesacuvano(true); await cekaj(600);
  ok(h.srv.T.clients.has('c1'), 'dugme "Posalji" i dalje prolazi');
}
console.log(pao ? '\nPALO: ' + pao : '\nSVE PROSLO');
