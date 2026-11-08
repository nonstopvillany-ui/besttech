# Besttech Kft. – vállalatirányítási alkalmazás (`app/`)

Az új, moduláris webalkalmazás. Tervezett éles cím: **https://app.besttech.hu**
(Railway: *Besttech* projekt, **besttech-app** szolgáltatás).

> A tároló gyökerében lévő régi v25-ös építési ütemezőhöz (`index.html`, `forras/`, `js/`, `css/`,
> `render.yaml`) ez az alkalmazás **nem nyúl**. Minden új kód ebben az `app/` mappában van.

## Mi működik (0.1–0.3 szakasz)

- Bejelentkezés e-mail-címmel és jelszóval, kijelentkezés
- Biztonságos, szerveroldali munkamenet (httpOnly süti, az adatbázisban csak a token lenyomata)
- Kötelező jelszócsere ideiglenes jelszó után, saját jelszócsere
- „Elfelejtett jelszó” oldal (előkészítve: a kérés az adminnál jelenik meg, e-mail-küldés később)
- Szerepkörök: Adminisztrátor (teljes jog), Irodai munkatárs, Munkafelelős, Felhasználó
- Mozaikos főoldal 8 beépített csempével, „Fejlesztés alatt” jelzéssel
- Adminisztráció: csempék sorrendje (húzással vagy nyilakkal), elrejtése, szerkesztése (név, leírás,
  ikon, szín, céloldal, állapot, láthatóság szerepkörönként), új csempe, saját csempe törlése;
  felhasználók létrehozása, szerkesztése, letiltása, ideiglenes jelszó; főoldal-beállítások; eseménynapló
- Mobil- és asztali nézet

## Építési ütemező v26 – `/utemezo`

- A v25 **megszokott felülete és minden funkciója** (toronynézet, 10/30 napos, havi és dolgozónkénti
  nézet, napi terv, összesítő naptár, ki hol dolgozik, bérezés, alvállalkozók, esti e-mail előnézet,
  dolgozók), Besttech-fejléccel – a localStorage helyett a **központi PostgreSQL-adatbázissal**.
- Forrás: `client/utemezo/app.js` (a `forras/app.js` másolata, célzott módosításokkal – a fájl
  elején felsorolva), `client/utemezo/sync.js` (adatréteg). A régi `index.html` érintetlen.
- A projektválasztó a központi **projects** táblából töltődik: a Projektek modulban felvett vagy
  átnevezett projekt az ütemezőben is megjelenik (nyitott ütemezőben is, kb. 15 mp-en belül).
- Mentés automatikusan, késleltetve, csak a megváltozott projekt/szakasz; ha közben más ugyanazt
  módosította, a friss állapot töltődik be, a többi módosítás megmarad (nincs csendes felülírás).
- „Projekt törlése” helyett **archiválás** – az adatok megmaradnak.
- Jogosultság: megtekintés / szerkesztés / pénzügy (bérek, bértételek, kifizetések) külön.
- API: `GET /api/scheduler/state`, `GET /api/scheduler/versions`, `PUT /api/scheduler/sync`

## Ügyfelek és projektek – `/ugyfelek`, `/projektek`

- Közös nyilvántartás: egy ügyfélhez több projekt; egyedi kódok (`U-00001`, `P-00001`).
- Kereshető listák, adatlapok, verzióellenőrzött módosítás, ügyfélből új projekt, projektből
  az ütemező megnyitása.
- API: `GET/POST /api/customers`, `GET/PUT /api/customers/:id`, `GET/POST /api/projects`, `GET/PUT /api/projects/:id`
- Az adatbázisban előkészítve (felület később): csapatok, projektköltségek, dokumentum-metaadat.

## Jogosultságok

Admin → **Szerepkörök**: pipálható táblázat (`scheduler.view/edit/finance`, `customers.view/edit`,
`projects.view/edit`). Az Adminisztrátor mindig teljes jogú. A főoldali csempék is csak a
jogosult modulokat mutatják.

## Régi ütemező (v25) adatainak importja – előkészítve

- `migrations/002_scheduler_and_legacy_import.sql`: az ütemező adatmodellje (projektek, munkafázisok,
  szakaszok, dátum szerinti munkanapok, dolgozók, sablonok, bértételek, kifizetések, munkaidő,
  ütközés-tudomásulvétel) és a `legacy_imports` tábla az eredeti JSON változatlan megőrzésére.
- `server/legacy/`: a v25 dátumszámításának pontos átirata (`calc.ts`), a JSON ellenőrzése és
  átalakítása (`transform.ts`), az adatbázisba író, egy tranzakciós importáló (`importer.ts`).
- Admin → **Régi adatok** fül: mentésfájl feltöltése → **előnézet** (nem ír adatbázisba):
  darabszámok, ellenőrző összegek, adathibák listája.
- A **tényleges import alapból tiltva**; csak `LEGACY_IMPORT_ENABLED=true` mellett, „IMPORTÁLÁS”
  megerősítéssel és az adatbázis-mentés megerősítésével, egyszer futtatható.
- Adatbázis-mentés letöltése: Admin → Régi adatok (`GET /api/admin/backup`, jelszó-hash nélkül). **Valódi adatot eddig senki nem importált.**
- Parancssori ellenőrzés adatbázis nélkül: `npm run legacy:check -- mentes.json`

## Adatbázis

Saját séma: `besttech_app` (`DB_SCHEMA`). Csak olvasó ellenőrzés: `npm run db:inspect`.
Migrációs terv: [docs/MIGRACIOS_TERV.md](docs/MIGRACIOS_TERV.md)

## Technológia

Node.js 22 · TypeScript · Fastify · PostgreSQL (`pg`, saját SQL-migrációk) · React 19 + Vite · Vitest

```
app/
├─ server/            szerver (API, hitelesítés, migráció, parancssori eszközök)
│  ├─ routes/         auth.ts, dashboard.ts, admin.ts
│  ├─ security/       password.ts (scrypt), session.ts
│  ├─ lib/            migrate, bootstrap (első admin), audit, validate, http
│  └─ cli/            migrate.ts, create-admin.ts
├─ client/            React-felület (Vite)
├─ migrations/        SQL-migrációk (sorrendben, egyszer futnak le)
├─ tests/             egység- és integrációs tesztek (valódi PostgreSQL-lel)
├─ docs/              fejlesztési napló, technikai döntések
├─ railway.json       Railway-telepítési beállítás
└─ .env.example       környezeti változók mintája (titok nélkül)
```

## Helyi futtatás

Előfeltétel: Node.js 22+ és egy PostgreSQL 14+ adatbázis.

```bash
cd app
npm install
cp .env.example .env          # majd írd be a saját DATABASE_URL-t
npm run migrate:dev           # adatbázis-táblák létrehozása
npm run create-admin:dev -- --email info@besttech.hu   # jelszót rejtetten kér
npm run dev                   # http://localhost:5173 (API: 3000)
```

Éles módú próba helyben: `npm run build && npm start` → http://localhost:3000

## Tesztek

```bash
TEST_DATABASE_URL=postgres://postgres@localhost:5432/besttech_test npm test
```
**Figyelem:** a tesztek a megadott adatbázist teljesen törlik. A névnek tartalmaznia kell a „test” szót.

## Első adminisztrátor

A jelszó soha nem kerül a forráskódba. Két lehetőség:

1. **Parancssor (ajánlott):** `npm run create-admin -- --email info@besttech.hu` (Railway-en a
   szolgáltatás shelljében). A jelszót rejtett bevitellel kéri. Elfelejtett admin jelszónál `--reset`.
2. **Környezeti változó:** `INITIAL_ADMIN_EMAIL` + `INITIAL_ADMIN_PASSWORD` a Railway Variables
   fülön. Csak akkor hat, ha még nincs aktív admin. Az első belépés után **töröld mindkét változót**.

Mindkét esetben az első belépéskor kötelező a jelszócsere.

## Railway-telepítés

Lásd: [docs/RAILWAY_TELEPITES.md](docs/RAILWAY_TELEPITES.md)
