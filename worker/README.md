# Studio Freya — foglalási Worker

Ez a Cloudflare Worker az a darab, ami **emlékszik**. A honlap statikus
(GitHub Pages), ezért önmagában nem tud arról tudni, hogy két közzététel
között valaki lefoglalt egy időpontot. Ez a Worker jegyzi fel a foglalásokat,
és mondja meg a következő látogatónak, hogy melyik óra már foglalt.

Két dolgot old meg:

1. **Nincs többé dupla foglalás.** Ma egy lefoglalt óra csak akkor tűnik el a
   naptárból, amikor kézzel elfogadod és közzéteszed. Addig más is
   lefoglalhatja. A Workerrel ez másodperceken belül látszik mindenkinél.
2. **Megszűnik a kézi CSV-import.** Az admin közvetlenül innen kéri le az új
   foglalásokat, e-mail és fájlletöltés nélkül.

A Web3Forms **megmarad** — az küldi neked az értesítő e-mailt, amit a Worker
nem tud. A foglalás adata tehát két helyre megy: ha a Workerben hiba lenne,
az e-mail akkor is megérkezik, és nem veszik el foglalás.

## Telepítés

Mindent a `worker/` könyvtárból futtass.

```bash
cd worker
```

**1. Bejelentkezés** (böngészőben kell jóváhagyni):

```bash
npx wrangler login
```

**2. A tároló létrehozása:**

```bash
npx wrangler kv namespace create FOGLALASOK
```

A parancs kiír egy `id = "..."` sort — ezt másold be a `wrangler.toml`
`[[kv_namespaces]]` szakaszába az `IDE_JON_A_KV_ID` helyére.

**3. Az admin jelszó beállítása** (ez nem kerül a repóba):

```bash
npx wrangler secret put ADMIN_TOKEN
```

Illeszd be a generált jelszót, amikor kéri. Ugyanez a jelszó kerül az admin
felület Beállítások paneljébe.

**4. Közzététel:**

```bash
npx wrangler deploy
```

A végén kiírja a Worker címét, valami ilyesmit:

```
https://studiofreya-foglalas.<aldomain>.workers.dev
```

Ez a cím kerül a `js/main.js` tetején lévő `WORKER_URL` konstansba és az
admin Beállítások paneljébe.

**5. Ellenőrzés:**

```bash
curl https://studiofreya-foglalas.<aldomain>.workers.dev/api/ping
```

Ha `{"ok":true,...}` jön vissza, működik.

## Végpontok

| Végpont | Ki hívja | Mit csinál |
|---|---|---|
| `GET /api/ping` | teszt | életjel |
| `GET /api/foglalt` | honlap | mely órák foglaltak |
| `POST /api/foglalas` | honlap | új foglalás rögzítése |
| `GET /api/foglalasok` | admin | az összes foglalás |
| `POST /api/foglalas/<id>/megerosit` | admin | véglegesítés (nem jár le) |
| `POST /api/foglalas/<id>/torol` | admin | időpont felszabadítása |

Az admin végpontok `Authorization: Bearer <ADMIN_TOKEN>` fejlécet kérnek.

## Beállítások

A `wrangler.toml` `[vars]` szakaszában:

- **`ALLOWED_ORIGINS`** — mely honlapokról fogadunk kérést. A `localhost` mindig
  engedélyezett, hogy a helyi admin is működjön.
- **`HOLD_DAYS`** (alapból 7) — hány napig tartjuk fenn a még vissza nem
  igazolt foglalást. Ha ennyi idő alatt nem nyomsz „✓ Elfogadom"-ot, az időpont
  felszabadul. Ez a spam ellen véd: fizetés nélkül bárki beküldhet foglalást,
  és ne ragadjon be tőle a naptár. Amint elfogadod, a foglalás véglegessé válik.

Módosítás után `npx wrangler deploy` kell.

## Költség

A Cloudflare ingyenes szintjén fut: napi 100 000 kérés, 1 000 írás, 100 000
olvasás. Havi 1–2 foglalásnál ennek a töredékét használja. Bankkártya nem kell
hozzá, havidíj nincs.

## Amit tudni érdemes

**A KV globálisan „végül konzisztens".** Két *egyidejű* foglalás elméletileg
átcsúszhat ugyanarra az órára, ha másodperceken belül érkeznek. Havi 1–2
foglalásnál ez gyakorlatilag kizárt, és így is nagyságrendekkel jobb a mai
állapotnál, ahol a rés órákig-napokig nyitva van. Ha egyszer sokkal nagyobb
lesz a forgalom, a KV helyett D1 vagy Durable Object adna szigorú garanciát.

**Ha a Worker nem elérhető, a honlap a mai módon működik tovább** — a naptár
visszaesik a `data/schedule.json`-ra. Nem tud tőle elromlani az oldal.
