#!/usr/bin/env python3
# Parsira CINDYLAND.xlsx (27 mjesečnih sheetova) u seed/seed.json:
# klijenti + ljubimci + boravci (sa cijenama gdje su upisane).
# Pokretanje: python3 scripts/parse_excel.py "/putanja/do/CINDYLAND.xlsx"
import sys, json, re, unicodedata
from collections import Counter
import pandas as pd

XLSX = sys.argv[1] if len(sys.argv) > 1 else '/Users/boskokankaras/Downloads/CINDYLAND.xlsx'

# ---------- pomoćne ----------
def strip_dia(s):
    s = s.replace('đ', 'dj').replace('Đ', 'Dj')
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')

STOP = {
    'preuzimanje','preuzeti','dnevno','dnevni','cuvanje','čuvanje','popodne','naveče','navece',
    'ujutro','ujutru','ide','dolazi','odlazi','transport','placeno','plaćeno','i','u','na','za',
    'do','od','sat','sati','h','veceras','večeras','sutra','pod','sto','stize','stiže','dan','dana',
}
PRICE_RE = re.compile(r'(\d+(?:[.,]\d{1,2})?)\s*€')
AGE_RE = re.compile(r'^\d+\s?mj?e?s?e?c?i?$|^\d+\s?m$|^\d+\s?g$|^\d+\s?mj$', re.I)

SUMPRICE_RE = re.compile(r'((?:\d+(?:[.,]\d{1,2})?\s*\+\s*)*\d+(?:[.,]\d{1,2})?)\s*€')
def cell_prices(t):
    out = []
    for m in SUMPRICE_RE.findall(t):
        out.append(sum(float(x.replace(',', '.')) for x in re.split(r'\s*\+\s*', m)))
    return out

def clean_tokens(t):
    """Tokeni imena: bez cijena, službenih riječi, samostalnih brojeva, starosti."""
    t = PRICE_RE.sub(' ', t)
    out = []
    for w in re.split(r'[\s,+/]+', t):
        w = w.strip(' .·-_()')
        if not w: continue
        wl = strip_dia(w.lower())
        if wl in STOP: continue
        if re.fullmatch(r'\d+(?:[.,]\d+)?', w): continue
        if AGE_RE.fullmatch(w): continue
        out.append(w)
    return out

def display_name(t):
    return ' '.join(clean_tokens(t))

def name_key(s):
    return re.sub(r'\s+', ' ', strip_dia(s.lower())).strip()

def is_pickup_only(t):
    toks = clean_tokens(t)
    return len(toks) == 0

DATE_RE = re.compile(r'^(\d{1,2})\.(\d{1,2})\.?')

def box_id_for(header, group):
    h = strip_dia(str(header).strip().lower()).replace('.', '')
    m = re.match(r'^(mb|vb|m)\s*(\d+)$', h)
    if m:
        return m.group(1) + m.group(2)
    if 'kotilica' in h or 'korilica' in h:
        return 'kot2' if '2' in h else 'kot1'
    # ad-hoc mjesta (špic): kavezi, kuća, pex — sve ostalo su zabilješke, ne boksovi
    if not re.search(r'kavez|kuca|pex', h): return None
    slug = re.sub(r'[^a-z0-9]+', '', h)
    return ('x_' + group + '_' + slug) if slug else None

def group_of_header(header):
    h = str(header).strip().upper()
    if h.startswith('MB') or 'KOTILICA' in h: return 'mb'
    if h.startswith('VB'): return 'vb'
    if re.match(r'^M\s?\d', h): return 'm'
    return None

# ---------- učitavanje ----------
xl = pd.read_excel(XLSX, sheet_name=None, header=None)
sheets = list(xl.keys())
# sheetovi su hronološki: prvi = jun 2024
def ym_for_index(i):
    y, m = 2024, 6 + i
    while m > 12: m -= 12; y += 1
    return y, m

runs = []          # {box, group, ym(y,m), from_day, to_day, texts[]}
month_sums = {}    # 'YYYY-MM' -> njena ručna suma (za kontrolu)
adhoc_boxes = {}   # id -> {name, group}

for si, sname in enumerate(sheets):
    df = xl[sname]
    y, mo = ym_for_index(si)
    ym = f'{y}-{mo:02d}'
    nrows, ncols = df.shape

    # nađi header redove blokova
    headers = []  # (row, {col: (box_id, group)})
    for r in range(nrows):
        row = df.iloc[r]
        cols = {}
        grp_guess = None
        for c in range(1, ncols):
            v = row[c]
            if pd.isna(v): continue
            g = group_of_header(v)
            if g: grp_guess = grp_guess or g
        if not grp_guess: continue
        for c in range(1, ncols):
            v = row[c]
            if pd.isna(v): continue
            g = group_of_header(v) or grp_guess
            bid = box_id_for(v, g)
            if bid:
                cols[c] = (bid, g)
                if bid.startswith('x_'):
                    adhoc_boxes[bid] = {'name': str(v).strip(), 'group': g}
        if cols: headers.append((r, cols))

    # blok = od headera do sljedećeg headera
    for hi, (hrow, cols) in enumerate(headers):
        rend = headers[hi + 1][0] if hi + 1 < len(headers) else nrows
        # dnevni redovi
        day_rows = []  # (day, row_index)
        for r in range(hrow + 1, rend):
            v0 = df.iloc[r, 0]
            if pd.isna(v0):
                # možda mjesečna suma u nekoj koloni
                for c in range(1, ncols):
                    v = df.iloc[r, c]
                    if pd.notna(v) and re.fullmatch(r'\d{3,6}', str(v).strip().rstrip('.0') or ''):
                        n = int(float(str(v).strip()))
                        if 300 <= n <= 30000: month_sums[ym] = n
                continue
            m = DATE_RE.match(str(v0).strip())
            if not m: continue
            day = int(m.group(1))
            if 1 <= day <= 31: day_rows.append((day, r))

        # po koloni: run-ovi uzastopnih dana
        for c, (bid, grp) in cols.items():
            cur = None
            prev_day = None
            for day, r in day_rows:
                v = df.iloc[r, c]
                txt = str(v).strip() if pd.notna(v) else ''
                if txt and txt.lower() not in ('nan',):
                    contiguous = cur is not None and prev_day is not None and day == prev_day + 1 and not cur.get('closed')
                    if cur and contiguous:
                        # nastavak ili novi pas odmah sutradan?
                        if is_pickup_only(txt):
                            cur['texts'].append(txt); cur['dates'].append(f'{y}-{mo:02d}-{day:02d}'); cur['to'] = day
                            cur['closed'] = True  # poslije preuzimanja run je gotov
                        else:
                            new_toks = set(strip_dia(w.lower()) for w in clean_tokens(txt))
                            old_toks = set()
                            for t in cur['texts']:
                                old_toks |= set(strip_dia(w.lower()) for w in clean_tokens(t))
                            if old_toks and new_toks and not (old_toks & new_toks):
                                runs.append(cur)
                                cur = {'box': bid, 'group': grp, 'ym': (y, mo), 'from': day, 'to': day, 'texts': [txt], 'dates': [f'{y}-{mo:02d}-{day:02d}']}
                            else:
                                cur['texts'].append(txt); cur['dates'].append(f'{y}-{mo:02d}-{day:02d}'); cur['to'] = day
                    else:
                        if cur: runs.append(cur)
                        cur = {'box': bid, 'group': grp, 'ym': (y, mo), 'from': day, 'to': day, 'texts': [txt], 'dates': [f'{y}-{mo:02d}-{day:02d}']}
                    prev_day = day
                else:
                    if cur: runs.append(cur); cur = None
                    prev_day = day
            if cur: runs.append(cur)

# ---------- spajanje preko granice mjeseca ----------
import calendar
def iso(y, m, d): return f'{y}-{m:02d}-{d:02d}'

for r in runs:
    y, m = r['ym']
    r['from_iso'] = iso(y, m, r['from'])
    r['to_iso'] = iso(y, m, r['to'])
    r['last_dom'] = calendar.monthrange(y, m)[1]

runs.sort(key=lambda r: (r['box'], r['from_iso']))
merged = []
by_box = {}
for r in runs: by_box.setdefault(r['box'], []).append(r)
for box, lst in by_box.items():
    lst.sort(key=lambda r: r['from_iso'])
    acc = None
    for r in lst:
        if acc:
            y, m = acc['ym']
            next_first = iso(*( (y, m + 1) if m < 12 else (y + 1, 1) ), 1)
            a_toks = set(strip_dia(w.lower()) for t in acc['texts'] for w in clean_tokens(t))
            b_toks = set(strip_dia(w.lower()) for t in r['texts'] for w in clean_tokens(t))
            if acc['to'] == acc['last_dom'] and r['from_iso'] == next_first and (not a_toks or not b_toks or (a_toks & b_toks)):
                acc['texts'] += r['texts']; acc['dates'] += r['dates']; acc['to_iso'] = r['to_iso']
                acc['ym'] = r['ym']; acc['to'] = r['to']; acc['last_dom'] = r['last_dom']
                continue
            merged.append(acc)
        acc = r
    if acc: merged.append(acc)

# ---------- run -> boravak ----------
stays_raw = []
skipped = 0
def make_stay(r, name, frm, to, price):
    alltxt = strip_dia(' '.join(r['texts']).lower())
    typ = 'dnevni' if ('dnevno' in alltxt and frm == to) else 'pansion'
    stays_raw.append({
        'name': name, 'group': r['group'], 'box': r['box'],
        'from': frm, 'to': to, 'type': typ,
        'price': price, 'paid': price is not None,
    })

for r in merged:
    cands = [display_name(t) for t in r['texts']]
    cands = [c for c in cands if c]
    if not cands:
        skipped += 1; continue
    cnt = Counter(name_key(c) for c in cands)
    best_key = max(cnt.items(), key=lambda kv: (kv[1], len(kv[0])))[0]
    name = max((c for c in cands if name_key(c) == best_key), key=len)
    if not re.search(r'[a-zA-ZčćžšđČĆŽŠĐ]', name):
        skipped += 1; continue  # "ime" bez ijednog slova = zabilješka, ne gost

    # cjenovne ćelije: (iso_datum, iznos); "90 + 10 transport" bez € tretiraj kao cijenu
    pcells = []
    for i, t in enumerate(r['texts']):
        p = cell_prices(t)
        if not p and 'transport' in strip_dia(t.lower()):
            nums = [float(x) for x in re.findall(r'\b(\d{2,4})\b', t)]
            if nums: p = [sum(nums)]
        if p: pcells.append((r['dates'][i], round(sum(p), 2)))

    if len(pcells) <= 1:
        make_stay(r, name, r['from_iso'], r['to_iso'], pcells[0][1] if pcells else None)
        continue
    # najava na prvi dan (isti iznos se ponavlja kasnije) -> izbaci prvu
    if pcells[0][0] == r['from_iso'] and any(pc[1] == pcells[0][1] for pc in pcells[1:]):
        pcells = pcells[1:]
    # svaka cjenovna ćelija zatvara naplatni segment (mjesečne rate stalnih gostiju,
    # uzastopna dnevna čuvanja itd.)
    seg_from = r['from_iso']
    for d, price in pcells:
        if d < seg_from: continue
        make_stay(r, name, seg_from, d, price)
        seg_from = (pd.Timestamp(d) + pd.Timedelta(days=1)).strftime('%Y-%m-%d')
    if seg_from <= r['to_iso']:
        make_stay(r, name, seg_from, r['to_iso'], None)

# ---------- klijenti + ljubimci ----------
clients = {}
pets = {}
stays = []
cix = pix = six = 0
for st in sorted(stays_raw, key=lambda s: s['from']):
    key = name_key(st['name'])
    if key not in clients:
        cix += 1
        clients[key] = {'id': f'c{cix}', 'name': st['name'], 'phone': '', 'note': '', '_names': Counter()}
    cl = clients[key]
    cl['_names'][st['name']] += 1
    species = 'macka' if st['group'] == 'm' else 'pas'
    size = 'veliki' if st['group'] == 'vb' else 'mali'
    pkey = (key, species)
    if pkey not in pets:
        pix += 1
        pets[pkey] = {'id': f'p{pix}', 'clientId': cl['id'], 'name': st['name'], 'species': species,
                      'size': size, 'sex': None, 'breed': '', 'note': '', '_sizes': Counter()}
    pt = pets[pkey]
    pt['_sizes'][size] += 1
    six += 1
    stays.append({
        'id': f's{six}', 'clientId': cl['id'], 'petIds': [pt['id']], 'type': st['type'],
        'from': st['from'], 'to': st['to'], 'boxId': st['box'],
        'price': st['price'], 'paid': st['paid'],
        'paidAt': st['to'] if st['paid'] else None, 'note': '',
    })

for cl in clients.values():
    cl['name'] = cl['_names'].most_common(1)[0][0]; del cl['_names']
for pt in pets.values():
    pt['size'] = pt['_sizes'].most_common(1)[0][0]; del pt['_sizes']
    if pt['species'] == 'macka': pt['size'] = None

out = {
    'clients': list(clients.values()),
    'pets': list(pets.values()),
    'stays': stays,
    'adhocBoxes': [{'id': k, **v} for k, v in adhoc_boxes.items()],
}
with open('seed/seed.json', 'w') as f:
    json.dump(out, f, ensure_ascii=False, indent=1)

# ---------- kontrola ----------
print(f'Sheetova: {len(sheets)} | boravaka: {len(stays)} | klijenata: {len(clients)} | ljubimaca: {len(pets)} | preskočeno praznih: {skipped}')
print(f'Ad-hoc mjesta: {sorted(adhoc_boxes.keys())}')
by_month_paid = Counter()
for s in stays:
    if s['paid']: by_month_paid[s['paidAt'][:7]] += s['price']
print('\nMjesec | naplaćeno (parser) | njena suma')
for ym in sorted(set(list(by_month_paid.keys()) + list(month_sums.keys()))):
    ours = round(by_month_paid.get(ym, 0))
    hers = month_sums.get(ym, '—')
    mark = ''
    if isinstance(hers, int):
        mark = ' ✓' if abs(ours - hers) <= hers * 0.06 else f'  (razlika {ours - hers:+})'
    print(f'{ym} | {ours:>6} | {hers}{mark}')
top = Counter()
for s in stays: top[s['clientId']] += 1
id2name = {c['id']: c['name'] for c in clients.values()}
print('\nNajčešći klijenti:', ', '.join(f"{id2name[i]} ({n})" for i, n in top.most_common(8)))
