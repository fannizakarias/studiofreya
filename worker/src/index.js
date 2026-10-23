/* ═══════════════════════════════════════════════════════════════════
   Studio Freya — foglalási Worker

   Ez az a darab, ami emlékszik. A honlap statikus (GitHub Pages), ezért
   önmagában nem tud arról tudni, hogy két közzététel között valaki
   lefoglalt egy időpontot. Ez a Worker jegyzi fel, és mondja meg a
   következő látogatónak, hogy az az óra már foglalt.

   Végpontok:
     GET  /api/ping                     — életjel (teszthez)
     GET  /api/foglalt                  — nyilvános: mely órák foglaltak
     POST /api/foglalas                 — nyilvános: új foglalás rögzítése
     POST /api/utalvany                 — nyilvános: ajándékutalvány-rendelés (időpont nélkül)
     GET  /api/foglalasok               — admin: az összes foglalás
     POST /api/foglalas/<id>/megerosit  — admin: véglegesítés (nem jár le)
     POST /api/foglalas/<id>/torol      — admin: időpont felszabadítása
     POST /api/foglalas/<id>/visszaallit — admin: lemondás visszavonása
     GET  /api/instagram                — nyilvános: a stúdió legutóbbi Instagram-posztjai
     GET  /api/instagram/kep/<id>       — nyilvános: egy poszt képe (a Worker hozza át)

   Tárolás (Cloudflare KV):
     slot:<ÉÉÉÉ-HH-NN>:<ÓÓ>  → a foglalás azonosítója
                               (visszaigazolásig lejárati idővel)
     fog:<id>                → a foglalás teljes adatlapja
     rl:<ip>                 → percenkénti darabszám (spam ellen)
     ig:token                → az Instagram-token, megújítva (lásd lent)
     ig:posztok              → a legutóbb lekért posztok listája
   ═══════════════════════════════════════════════════════════════════ */

const MIN_HOUR = 8;    // a honlap naptárával egyezik (js/main.js)
const MAX_HOUR = 18;

const REC_TTL = 60 * 60 * 24 * 730;   // a foglalás adatlapja 2 évig marad meg
const RL_WINDOW = 60 * 60;            // spamszűrés ablaka: 1 óra
const RL_MAX = 5;                     // óránként legfeljebb ennyi foglalás egy IP-ről

/* ─── Válasz-segédek ─────────────────────────────────────────────── */

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || 'https://www.studiofreya.hu,https://studiofreya.hu')
    .split(',').map(s => s.trim()).filter(Boolean);
  // A helyi admin (localhost) is hívhatja — ott fut az admin felület.
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  const ok = allowed.includes(origin) || isLocal;
  const fejek = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  // Ismeretlen origin esetén nem küldünk engedélyt — a böngésző így elzárja
  // a választ. (A CORS csak a böngészőt köti; a végpont védelmét a
  // darabszám-korlát és az admin jelszó adja, nem ez.)
  if (ok) fejek['Access-Control-Allow-Origin'] = origin;
  return fejek;
}

function json(obj, status, request, env) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(request, env) },
  });
}

/* ─── Ellenőrzések ───────────────────────────────────────────────── */

function ma() {
  // A stúdió magyar időben működik; a dátumhatárt is eszerint húzzuk meg.
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Budapest' });
}

/* Szövegmező tisztítása: hossz-korlát, vezérlőkarakterek kiszűrése, és a
   táblázatkezelő-képlet kezdőkarakterek eltávolítása a szöveg elejéről.
   Ez utóbbi azért kell, mert az adat a foglalasok.csv-be kerül, amit Excel
   is megnyithat — egy "=..." kezdetű névből ott képlet lenne. A "+" és a "-"
   szándékosan maradhat, mert a telefonszámok azzal kezdődnek. */
function tisztit(v, max) {
  return String(v == null ? '' : v)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/^[=@\t]+/, '')
    .trim()
    .slice(0, max || 300);
}

/* A beérkező foglalás átvizsgálása. Visszaad egy hibaüzenetet, vagy null-t,
   ha minden rendben. A honlap már validál, de ide bármi érkezhet. */
function ellenoriz(b) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.datum)) return 'Hibás dátum.';
  if (b.datum < ma()) return 'A megadott nap már elmúlt.';

  const ora = Number(b.ora);
  if (!Number.isInteger(ora) || ora < MIN_HOUR || ora >= MAX_HOUR) return 'Hibás időpont.';

  const orak = Number(b.orak);
  // A honlap stúdióbérlésnél 2 óránál hosszabb foglalást is enged (a
  // "+ bővítés" gombbal) — a felső határ itt csak a nyitvatartás.
  if (!Number.isInteger(orak) || orak < 1) return 'Hibás időtartam.';
  if (ora + orak > MAX_HOUR) return 'A foglalás túlnyúlik a nyitvatartáson.';

  if (!b.nev) return 'A név megadása kötelező.';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email || '')) return 'Hibás e-mail cím.';
  // A telefonszám a honlapon nem kötelező, ezért itt sem az.

  return null;
}

function orakListaja(ora, orak) {
  const out = [];
  for (let i = 0; i < orak; i++) out.push(ora + i);
  return out;
}

function slotKulcs(datum, ora) {
  return `slot:${datum}:${String(ora).padStart(2, '0')}`;
}

/* ─── Admin azonosítás ───────────────────────────────────────────── */

/* Állandó idejű összehasonlítás, hogy a token ne legyen kitalálható
   a válaszidőből. */
function egyezik(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let k = 0;
  for (let i = 0; i < a.length; i++) k |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return k === 0;
}

function adminE(request, env) {
  const fej = request.headers.get('Authorization') || '';
  const token = fej.startsWith('Bearer ') ? fej.slice(7) : '';
  return Boolean(env.ADMIN_TOKEN) && egyezik(token, env.ADMIN_TOKEN);
}

/* ─── Végpontok ──────────────────────────────────────────────────── */

/* Nyilvános: mely órák foglaltak. A kulcs neve önmagában elárulja a napot
   és az órát, ezért egyetlen listázás elég — az értékeket nem kell
   beolvasni, így gyors és kevés műveletet használ. */
async function foglaltLista(request, env) {
  const mai = ma();
  const foglalt = {};
  let cursor;
  do {
    const res = await env.FOGLALASOK.list({ prefix: 'slot:', cursor, limit: 1000 });
    for (const k of res.keys) {
      const [, datum, ora] = k.name.split(':');
      if (!datum || datum < mai) continue;      // a múlt nem érdekes
      (foglalt[datum] ||= []).push(Number(ora));
    }
    cursor = res.list_complete ? null : res.cursor;
  } while (cursor);

  for (const d of Object.keys(foglalt)) foglalt[d].sort((a, b) => a - b);

  return json(foglalt, 200, request, env);
}

/* Nyilvános: új foglalás. Ez az egyetlen írható végpont kívülről, ezért
   itt van óránkénti darabszám-korlát IP-címenként. */
async function ujFoglalas(request, env) {
  // Méretkorlát: egy foglalás pár száz bájt, minden ezen felüli gyanús.
  const meret = Number(request.headers.get('Content-Length') || 0);
  if (meret > 16 * 1024) {
    return json({ error: 'Túl nagy kérés.' }, 413, request, env);
  }

  let b;
  try {
    b = await request.json();
  } catch {
    return json({ error: 'Hibás kérés.' }, 400, request, env);
  }

  const hiba = ellenoriz(b);
  if (hiba) return json({ error: hiba }, 400, request, env);

  // Spamszűrés
  const ip = request.headers.get('CF-Connecting-IP') || 'ismeretlen';
  const rlKulcs = `rl:${ip}`;
  const eddig = Number(await env.FOGLALASOK.get(rlKulcs)) || 0;
  if (eddig >= RL_MAX) {
    return json({ error: 'Túl sok foglalási kísérlet. Próbáld később, vagy hívj minket.' }, 429, request, env);
  }

  const ora = Number(b.ora);
  const orak = Number(b.orak);
  const orakLista = orakListaja(ora, orak);

  // Ütközés-vizsgálat: foglalt-e már bármelyik érintett óra
  for (const h of orakLista) {
    if (await env.FOGLALASOK.get(slotKulcs(b.datum, h))) {
      return json({
        error: 'Ezt az időpontot időközben lefoglalták. Kérlek válassz másikat.',
        utkozes: true,
      }, 409, request, env);
    }
  }

  const id = crypto.randomUUID();
  const submittedAt = new Date().toISOString();
  const holdNap = Number(env.HOLD_DAYS || 4);
  const holdTtl = Math.max(60, Math.round(holdNap * 24 * 60 * 60));

  const rekord = {
    id,
    submittedAt,
    allapot: 'fuggo',            // 'fuggo' → 'megerositve' | 'torolve'
    datum: b.datum,
    ora,
    orak,
    idopont: `${String(ora).padStart(2, '0')}:00 – ${String(ora + orak).padStart(2, '0')}:00`,
    idotartam: `${orak} óra`,
    tipus: tisztit(b.tipus, 60),
    csomag: tisztit(b.csomag, 120),
    ar: tisztit(b.ar, 40),
    nev: tisztit(b.nev, 120),
    email: tisztit(b.email, 160),
    telefon: tisztit(b.telefon, 40),
    szemelyek: tisztit(b.szemelyek, 10),
    megjegyzes: tisztit(b.megjegyzes, 2000),
    fizetesi_mod: tisztit(b.fizetesi_mod, 40),
    szamlazasi_nev: tisztit(b.szamlazasi_nev, 160),
    szamlazasi_cim: tisztit(b.szamlazasi_cim, 300),
    adoszam: tisztit(b.adoszam, 40),
    utalvany_kod: tisztit(b.utalvany_kod, 20).toUpperCase(),
  };

  // Előbb az órák foglalása, utána az adatlap — így ha félúton elszáll,
  // inkább legyen egy foglalt óra adatlap nélkül (látod és felszabadíthatod),
  // mint egy adatlap, amit közben más lefoglalt.
  for (const h of orakLista) {
    await env.FOGLALASOK.put(slotKulcs(b.datum, h), id, { expirationTtl: holdTtl });
  }
  await env.FOGLALASOK.put(`fog:${id}`, JSON.stringify(rekord), { expirationTtl: REC_TTL });
  await env.FOGLALASOK.put(rlKulcs, String(eddig + 1), { expirationTtl: RL_WINDOW });

  return json({ ok: true, id, lejar: holdNap }, 201, request, env);
}

/* Az utalvánnyal megvehető csomagok ára — szándékosan itt, nem a kérésből:
   az árat a vásárló böngészője nem írhatja át. A honlap foglalási
   felületével és a fotózási feltételekkel egyezik. */
const UTALVANY_CSOMAGOK = {
  'Kis csomag': '25 000 Ft',
  'Közepes csomag': '45 000 Ft',
  'Nagy csomag': '65 000 Ft',
};

/* Nyilvános: ajándékutalvány-rendelés. Időpontot nem foglal, csak az
   adatlapot rögzíti, hogy az admin letölthesse. A dátum a rendelés napja
   (a bevétel ehhez tartozik). Ugyanaz a darabszám-korlát vonatkozik rá, mint
   a foglalásra. */
async function ujUtalvany(request, env) {
  const meret = Number(request.headers.get('Content-Length') || 0);
  if (meret > 16 * 1024) {
    return json({ error: 'Túl nagy kérés.' }, 413, request, env);
  }

  let b;
  try {
    b = await request.json();
  } catch {
    return json({ error: 'Hibás kérés.' }, 400, request, env);
  }

  const csomag = tisztit(b.csomag, 120);
  if (!UTALVANY_CSOMAGOK[csomag]) return json({ error: 'Hibás csomag.' }, 400, request, env);
  if (!b.nev) return json({ error: 'A név megadása kötelező.' }, 400, request, env);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email || '')) return json({ error: 'Hibás e-mail cím.' }, 400, request, env);

  const ip = request.headers.get('CF-Connecting-IP') || 'ismeretlen';
  const rlKulcs = `rl:${ip}`;
  const eddig = Number(await env.FOGLALASOK.get(rlKulcs)) || 0;
  if (eddig >= RL_MAX) {
    return json({ error: 'Túl sok kísérlet. Próbáld később, vagy hívj minket.' }, 429, request, env);
  }

  const id = crypto.randomUUID();
  const rekord = {
    id,
    submittedAt: new Date().toISOString(),
    allapot: 'fuggo',
    datum: ma(),
    idopont: '',
    idotartam: '',
    tipus: 'Ajándékutalvány',
    csomag,
    ar: UTALVANY_CSOMAGOK[csomag],
    nev: tisztit(b.nev, 120),
    email: tisztit(b.email, 160),
    telefon: tisztit(b.telefon, 40),
    szemelyek: '',
    megjegyzes: tisztit(b.megjegyzes, 2000),
    fizetesi_mod: 'Átutalás',
    szamlazasi_nev: tisztit(b.szamlazasi_nev, 160),
    szamlazasi_cim: tisztit(b.szamlazasi_cim, 300),
    adoszam: tisztit(b.adoszam, 40),
    utalvany_nev: tisztit(b.utalvany_nev, 60),
    utalvany_minta: /^[2-4]$/.test(String(b.utalvany_minta)) ? String(b.utalvany_minta) : '2',
  };

  await env.FOGLALASOK.put(`fog:${id}`, JSON.stringify(rekord), { expirationTtl: REC_TTL });
  await env.FOGLALASOK.put(rlKulcs, String(eddig + 1), { expirationTtl: RL_WINDOW });

  return json({ ok: true, id }, 201, request, env);
}

/* Admin: az összes foglalás adatlapja, legújabb elöl. */
async function foglalasok(request, env) {
  const ki = [];
  let cursor;
  do {
    const res = await env.FOGLALASOK.list({ prefix: 'fog:', cursor, limit: 1000 });
    for (const k of res.keys) {
      const nyers = await env.FOGLALASOK.get(k.name);
      if (nyers) {
        try { ki.push(JSON.parse(nyers)); } catch { /* sérült sor — kihagyjuk */ }
      }
    }
    cursor = res.list_complete ? null : res.cursor;
  } while (cursor);

  ki.sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1));
  return json({ foglalasok: ki }, 200, request, env);
}

/* Admin: véglegesítés — leveszi a lejárati időt az érintett órákról,
   így a visszaigazolt foglalás nem szabadul fel magától. */
async function megerosit(request, env, id) {
  const nyers = await env.FOGLALASOK.get(`fog:${id}`);
  if (!nyers) return json({ error: 'Nincs ilyen foglalás.' }, 404, request, env);

  const rekord = JSON.parse(nyers);
  /* A véglegesített óra a foglalás napja után 90 nappal jár le. Nem TTL nélkül
     tesszük el, mert a lejárat nélküli kulcsok évek alatt felhalmozódnának, és
     a nyilvános /api/foglalt listázása egyre lassulna. A múltbeli foglaltság
     senkit nem érdekel — a naptár úgyis csak a mai naptól felfelé néz. */
  const most = Math.floor(Date.now() / 1000);
  const napVege = Math.floor(new Date(`${rekord.datum}T23:59:59Z`).getTime() / 1000);
  const lejarat = Math.max(most + 86400, napVege + 90 * 86400);
  for (const h of orakListaja(rekord.ora, rekord.orak)) {
    await env.FOGLALASOK.put(slotKulcs(rekord.datum, h), id, { expiration: lejarat });
  }
  rekord.allapot = 'megerositve';
  await env.FOGLALASOK.put(`fog:${id}`, JSON.stringify(rekord), { expirationTtl: REC_TTL });

  return json({ ok: true }, 200, request, env);
}

/* Admin: az időpont felszabadítása (lemondás, spam, elírás). Az adatlap
   megmarad, csak az órák szabadulnak fel. */
async function torol(request, env, id) {
  const nyers = await env.FOGLALASOK.get(`fog:${id}`);
  if (!nyers) return json({ error: 'Nincs ilyen foglalás.' }, 404, request, env);

  const rekord = JSON.parse(nyers);
  for (const h of orakListaja(rekord.ora, rekord.orak)) {
    const kulcs = slotKulcs(rekord.datum, h);
    // Csak akkor töröljük, ha tényleg ehhez a foglaláshoz tartozik
    if ((await env.FOGLALASOK.get(kulcs)) === id) await env.FOGLALASOK.delete(kulcs);
  }
  rekord.allapot = 'torolve';
  await env.FOGLALASOK.put(`fog:${id}`, JSON.stringify(rekord), { expirationTtl: REC_TTL });

  return json({ ok: true }, 200, request, env);
}

/* Admin: tévesen lemondott foglalás visszaállítása. Az időpontot újra
   lefoglalja, függő állapotban (mintha most érkezett volna) — de csak akkor,
   ha időközben más nem vitte el. */
async function visszaallit(request, env, id) {
  const nyers = await env.FOGLALASOK.get(`fog:${id}`);
  if (!nyers) return json({ error: 'Nincs ilyen foglalás.' }, 404, request, env);

  const rekord = JSON.parse(nyers);
  // Az utalványnál a dátum a rendelés napja, nem egy időpont — az nem "múlik el".
  if (rekord.datum < ma() && rekord.tipus !== 'Ajándékutalvány') {
    return json({ error: 'A foglalás napja már elmúlt, nincs mit visszaállítani.' }, 400, request, env);
  }

  const orak = orakListaja(rekord.ora, rekord.orak);
  for (const h of orak) {
    const foglalo = await env.FOGLALASOK.get(slotKulcs(rekord.datum, h));
    if (foglalo && foglalo !== id) {
      return json({
        error: 'Az időpontot időközben más lefoglalta, ezért nem állítható vissza.',
        utkozes: true,
      }, 409, request, env);
    }
  }

  const holdTtl = Math.max(60, Math.round(Number(env.HOLD_DAYS || 4) * 24 * 60 * 60));
  for (const h of orak) {
    await env.FOGLALASOK.put(slotKulcs(rekord.datum, h), id, { expirationTtl: holdTtl });
  }
  rekord.allapot = 'fuggo';
  await env.FOGLALASOK.put(`fog:${id}`, JSON.stringify(rekord), { expirationTtl: REC_TTL });

  return json({ ok: true }, 200, request, env);
}

/* ─── Instagram ──────────────────────────────────────────────────────
   A stúdió posztjait az Instagram hivatalos API-ja adja (Instagram API with
   Instagram Login). A honlap ezt a Workert kérdezi, nem az Instagramot: így
   a látogató böngészője nem kapcsolódik a Metához (se süti, se IP-cím), és a
   token sem kerül a honlapra.

   A token 60 napig érvényes, és megújítható, amíg le nem jár. Az elsőt
   titkosként kell megadni (npx wrangler secret put IG_TOKEN); a heti
   ütemezett futás (wrangler.toml [triggers]) ezt megújítja, és a frisset a
   KV-ba teszi. Ha később új tokent adsz meg titkosként, az felülírja a
   KV-ban tárolt régit. */

const IG_API = 'https://graph.instagram.com';
const IG_MEZOK = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp';
const IG_DB = 12;                 // ennyi posztot kérünk le
const IG_FRISS = 8 * 60 * 60;     // ennyi másodpercig használjuk a tárolt listát (napi ~3 frissítés)

/* A titkos token vége — ebből tudjuk, hogy a KV-ban tárolt megújított token
   még ugyanabból a titkosból származik-e. */
const tokenUjj = t => String(t || '').slice(-12);

async function igToken(env) {
  const alap = env.IG_TOKEN || '';
  const tarolt = await env.FOGLALASOK.get('ig:token', 'json');
  if (tarolt && tarolt.token && tarolt.alap === tokenUjj(alap)) return tarolt.token;
  return alap;
}

/* Ütemezett: a token megújítása. Az Instagram csak a legalább 24 órás
   tokent újítja meg — hetente futtatva ez mindig teljesül. */
async function igTokenMegujit(env) {
  const token = await igToken(env);
  if (!token) return;
  const res = await fetch(`${IG_API}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`);
  const v = await res.json().catch(() => ({}));
  if (!res.ok || !v.access_token) {
    console.error('Instagram-token megújítása nem sikerült:', res.status, JSON.stringify(v.error || v));
    return;
  }
  await env.FOGLALASOK.put('ig:token', JSON.stringify({
    token: v.access_token,
    alap: tokenUjj(env.IG_TOKEN),
    megujitva: new Date().toISOString(),
  }));
}

/* A posztok listája: 8 óránként legfeljebb egyszer kérdezzük az Instagramot,
   közben a KV-ban tárolt listát adjuk. Ha az Instagram nem válaszol, a
   legutóbbi tárolt lista megy ki — inkább régi posztok, mint üres sáv. */
async function igPosztok(env) {
  const tarolt = await env.FOGLALASOK.get('ig:posztok', 'json');
  if (tarolt && Date.now() - tarolt.ido < IG_FRISS * 1000) return tarolt.posztok;

  const token = await igToken(env);
  if (!token) return tarolt ? tarolt.posztok : [];
  try {
    const res = await fetch(`${IG_API}/me/media?fields=${IG_MEZOK}&limit=${IG_DB}&access_token=${encodeURIComponent(token)}`);
    const v = await res.json();
    if (!res.ok || !Array.isArray(v.data)) throw new Error(`${res.status} ${JSON.stringify(v.error || v)}`);
    const posztok = v.data.map(m => ({
      id: m.id,
      tipus: m.media_type,                            // IMAGE | VIDEO | CAROUSEL_ALBUM
      kep: m.media_type === 'VIDEO' ? m.thumbnail_url : m.media_url,
      link: m.permalink,
      szoveg: String(m.caption || '').slice(0, 300),
      ido: m.timestamp,
    })).filter(m => m.kep && /^\d+$/.test(m.id));
    await env.FOGLALASOK.put('ig:posztok', JSON.stringify({ ido: Date.now(), posztok }));
    return posztok;
  } catch (err) {
    console.error('Instagram-posztok lekérése nem sikerült:', err.message || err);
    return tarolt ? tarolt.posztok : [];
  }
}

/* Nyilvános: a posztok, a képek helyén a Worker saját címével. */
async function instagram(request, env) {
  const posztok = await igPosztok(env);
  const ki = posztok.map(({ id, tipus, link, szoveg, ido }) => ({
    id, tipus, link, szoveg, ido, kep: `/api/instagram/kep/${id}?m=${IG_KEP_MERET}`,
  }));
  const res = json({ posztok: ki }, 200, request, env);
  res.headers.set('Cache-Control', 'public, max-age=600');
  return res;
}

/* Nyilvános: egy poszt képe. Az Instagram a teljes felbontást adja (egy
   képes poszt akár 4 MB), és a címe alá van írva, így kisebbet kérni sem
   lehet. Ezért a Worker egyszer lekicsinyíti (Cloudflare Images: álló 4:5,
   600×750 px, mint az Instagram profilrácsa; WebP), és a KV-ba teszi — utána onnan adja, az Instagramhoz és az
   átméretezőhöz többet nem fordul.
   Csak a tárolt listában szereplő posztot hozzuk át — így ez nem nyitott
   proxy, amivel bármit le lehetne tölteni. */
const IG_KEP_W = 600;
const IG_KEP_H = 750;
const IG_KEP_MERET = `${IG_KEP_W}x${IG_KEP_H}`;   // a kulcsban és a címben is: méretváltáskor nem a régi jön
const IG_KEP_TTL = 60 * 60 * 24 * 60;   // a lekicsinyített kép 60 napig marad meg

function kepValasz(body, tipus) {
  return new Response(body, {
    headers: { 'Content-Type': tipus || 'image/jpeg', 'Cache-Control': 'public, max-age=86400' },
  });
}

async function instagramKep(request, env, id) {
  const kulcs = `ig:kep:${IG_KEP_MERET}:${id}`;
  const tarolt = await env.FOGLALASOK.getWithMetadata(kulcs, 'arrayBuffer');
  if (tarolt.value) return kepValasz(tarolt.value, tarolt.metadata && tarolt.metadata.tipus);

  const posztok = await igPosztok(env);
  const poszt = posztok.find(p => p.id === id);
  if (!poszt) return new Response('Nincs ilyen kép.', { status: 404 });

  const res = await fetch(poszt.kep);
  if (!res.ok) return new Response('A kép nem érhető el.', { status: 502 });

  // Átméretező nélkül (vagy ha hibázik) az eredeti megy ki, de nem tároljuk el.
  if (!env.IMAGES) return kepValasz(res.body, res.headers.get('Content-Type'));
  const eredeti = await res.arrayBuffer();
  try {
    const kesz = await env.IMAGES.input(new Blob([eredeti]).stream())
      .transform({ width: IG_KEP_W, height: IG_KEP_H, fit: 'cover' })
      .output({ format: 'image/webp', quality: 80 });
    const kep = await kesz.response().arrayBuffer();
    await env.FOGLALASOK.put(kulcs, kep, { expirationTtl: IG_KEP_TTL, metadata: { tipus: 'image/webp' } });
    return kepValasz(kep, 'image/webp');
  } catch (err) {
    console.error('Instagram-kép átméretezése nem sikerült:', err.message || err);
    return kepValasz(eredeti, res.headers.get('Content-Type'));
  }
}

/* ─── Útvonalválasztás ───────────────────────────────────────────── */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const ut = url.pathname.replace(/\/+$/, '');

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    if (!env.FOGLALASOK) {
      return json({ error: 'A KV tároló nincs bekötve (FOGLALASOK).' }, 500, request, env);
    }

    try {
      if (ut === '/api/ping' && request.method === 'GET') {
        return json({ ok: true, ido: new Date().toISOString() }, 200, request, env);
      }
      if (ut === '/api/foglalt' && request.method === 'GET') {
        return foglaltLista(request, env);
      }
      if (ut === '/api/foglalas' && request.method === 'POST') {
        return ujFoglalas(request, env);
      }
      if (ut === '/api/utalvany' && request.method === 'POST') {
        return ujUtalvany(request, env);
      }
      if (ut === '/api/instagram' && request.method === 'GET') {
        return instagram(request, env);
      }
      const ig = ut.match(/^\/api\/instagram\/kep\/(\d+)$/);
      if (ig && request.method === 'GET') {
        return instagramKep(request, env, ig[1]);
      }

      // Innentől admin jogosultság kell
      const adminUt = /^\/api\/(foglalasok$|foglalas\/[^/]+\/(megerosit|torol|visszaallit)$)/.test(ut);
      if (adminUt && !adminE(request, env)) {
        return json({ error: 'Nincs jogosultság.' }, 401, request, env);
      }

      if (ut === '/api/foglalasok' && request.method === 'GET') {
        return foglalasok(request, env);
      }
      const m = ut.match(/^\/api\/foglalas\/([^/]+)\/(megerosit|torol|visszaallit)$/);
      if (m && request.method === 'POST') {
        if (m[2] === 'megerosit')   return megerosit(request, env, m[1]);
        if (m[2] === 'visszaallit') return visszaallit(request, env, m[1]);
        return torol(request, env, m[1]);
      }

      return json({ error: 'Ismeretlen végpont.' }, 404, request, env);
    } catch (err) {
      // A részletek a Cloudflare naplójába mennek (npx wrangler tail), nem a
      // válaszba — a belső hibaüzenet ne szivárogjon ki a hívónak.
      console.error('Worker hiba:', err && err.stack ? err.stack : err);
      return json({ error: 'Szerverhiba.' }, 500, request, env);
    }
  },

  /* Heti ütemezett futás (wrangler.toml [triggers]): az Instagram-token
     megújítása, mielőtt a 60 napos érvényessége lejárna. */
  async scheduled(event, env, ctx) {
    if (env.FOGLALASOK) ctx.waitUntil(igTokenMegujit(env));
  },
};
