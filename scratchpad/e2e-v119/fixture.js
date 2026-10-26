// Probni podaci za demo (lokalni režim): današnji odlasci/dolasci, avans, napomene, stari depozit.
(() => {
  const t = todayISO();
  const A = n => addDays(t, n);
  D.stays = D.stays.filter(s => !String(s.id).startsWith('fx'));
  const mali = D.pets.filter(p => p.species === 'pas' && p.size !== 'veliki');
  const veliki = D.pets.filter(p => p.species === 'pas' && p.size === 'veliki');
  const used = new Set();
  const pick = arr => { const p = arr.find(x => !used.has(x.clientId)); used.add(p.clientId); return p; };
  const p1 = pick(mali), p2 = pick(mali), p3 = pick(mali), p4 = pick(mali), p5 = pick(mali), p6 = pick(veliki), p7 = pick(mali), p8 = pick(mali);
  p3.note = 'Oće da ujede iz straha - prilaziti polako. Jede 2 mjerice ujutro i uveče.';
  p6.note = 'Kapi za oči ujutru i uveče.';
  [p1, p2, p4, p5, p7, p8].forEach(p => p.note = '');
  const mk = (id, p, from, to, box, extra) => Object.assign({ id, clientId: p.clientId, petIds: [p.id], type: 'pansion', from, to,
    boxes: [{ b: box, f: from, t: to }], boxId: box, price: null, deposit: null, payments: null, paid: false, paidAt: null,
    arrivedAt: from < t ? from : null, leftAt: null, note: '', createdAt: new Date(A(-12)).toISOString() }, extra || {});
  D.stays.push(
    // odlazi danas: ukupno 360, avans 300 -> za naplatu 60
    mk('fx1', p1, A(-12), t, 'mb1', { price: 360, payments: [{ a: 300, d: A(-14), av: 1 }] }),
    // odlazi danas: sve plaćeno avansom
    mk('fx2', p2, A(-5), t, 'mb2', { price: 100, payments: [{ a: 100, d: A(-8), av: 1 }] }),
    // u pansionu, ima napomenu
    mk('fx3', p3, A(-3), A(3), 'mb3'),
    // dolazi danas
    mk('fx4', p4, t, A(4), 'mb4'),
    // otišao danas, duguje (stari način: bez naplate)
    mk('fx5', p5, A(-6), t, 'mb5', { leftAt: t }),
    // veliki pas sa napomenom
    mk('fx6', p6, A(-2), A(6), 'vb1'),
    // stari zapis sa depozitom u koloni (mora postati avans)
    mk('fx7', p7, A(-4), t, 'mb6', { price: 120, deposit: 50 }),
    // rezervacija sa avansom
    mk('fx8', p8, A(10), A(14), 'mb7', { deposit: 40 })
  );
  D.stays.forEach(stayIzDepozita);
  save(); render();
  return D.stays.filter(s => String(s.id).startsWith('fx')).map(s => s.id + ' ' + stayLabel(s) + ' ' + JSON.stringify(stayNovac(s)));
})();
