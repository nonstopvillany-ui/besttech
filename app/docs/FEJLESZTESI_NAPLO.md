# Fejlesztési napló – Besttech app

Formátum: dátum · feladat · fájlok · ág/commit · teszt · nyitott kérdések · következő lépés.
(A Drive „Fejlesztési dokumentáció” mappájába is másolandó, jóváhagyás után.)

---

## 2026-11-08 – 0.1–0.3: környezet, bejelentkezés, mozaikos főoldal

**Állapotfelmérés (indulás előtt)**
- GitHub: elérhető, csak `main` ág, `app/` nem létezett, a tároló **nyilvános**.
- Railway: a Claude Code-nak nincs hozzáférése; a tulajdonos szerint a `besttech-app` szolgáltatás
  létezik (üres), az `app.besttech.hu` domain fel van véve, DNS és telepítés hátravan.
- DNS/HTTPS: a fejlesztői környezet hálózata nem éri el a besttech.hu-t – nem ellenőrizhető.
- PostgreSQL a Railway-en: nem ellenőrizhető. Bejelentkezési rendszer: nem létezett.

**Elvégezve**
- Új alkalmazás az `app/` mappában (szerver, React-felület, migráció, tesztek, Railway-konfiguráció).
- Adatbázis (001-es migráció): `roles`, `users`, `sessions`, `dashboard_tiles`,
  `dashboard_tile_roles`, `app_settings`, `audit_log` + kezdőadatok (4 szerepkör, 8 csempe).
- Bejelentkezés, kijelentkezés, kötelező/önkéntes jelszócsere, elfelejtett jelszó (előkészítve).
- Mozaikos főoldal, „Fejlesztés alatt” oldal, adminisztrációs felület (csempék, felhasználók,
  szerepkörök, beállítások, eseménynapló).

**Módosított fájlok:** kizárólag új fájlok az `app/` alatt. A tároló gyökeréhez nem nyúltunk.

**Ág / commit:** `claude/blissful-edison-vg7gug` (a commitazonosító a GitHub-előzményben)

**Tesztelés**
- 40 automatikus teszt (Vitest, valódi PostgreSQL 16) – mind sikeres: jelszó-hash, jelszószabály,
  céloldal-ellenőrzés, belépés/kilépés, kötelező jelszócsere, CSRF (fejléc, Origin), SQL-befecskendezés,
  IP-korlát, fiókzárolás, jogosultság (nem admin → 403), utolsó admin védelme, letiltás → munkamenet
  megszűnik, csempe sorrend/elrejtés/létrehozás/törlés, veszélyes URL-ek, szerepkör szerinti láthatóság,
  eseménynapló, migráció idempotenciája.
- Böngészős végpontteszt (Playwright, asztali + iPhone nézet): teljes folyamat, JS-hiba nincs.
- A tesztek közben talált és javított hibák: (1) a fiókzárolás nem lépett életbe (SQL-feltétel);
  (2) 401-es válasznál végtelen újraellenőrzési ciklus a felületen.

**Nyitott kérdések**
- Railway: PostgreSQL létrehozása, Root Directory / config path beállítása, változók – jóváhagyásra vár.
- DNS: CNAME az `app` aldomainre – a besttech.hu DNS-kezelőjénél, jóváhagyás után.
- A tároló nyilvános (a régi `index.html` ügyfélneveket tartalmaz) – privátra állítás javasolt.
- Hivatalos logó hiányzik (Drive „Arculati elemek” üres).
- A raktárkezelő pontos címe (a Raktárkészlet csempe céljához).
- Az „Építési ütemező” csempe mutasson-e átmenetileg a v25-re? (cím szükséges)

**Következő lépés:** jóváhagyás után Railway-telepítés; utána 1.0 – Építési ütemező v26.

---

## 2026-11-08 – v26 alap: ütemező adatmodell és régi adatok importjának előkészítése

**Állapotfelmérés:** távoli `main` változatlan (`2f2fad4`). GitHub-írási jog mostantól van.
Új ág: `feature/besttech-v26` (a 0.3-as commitra épül: bejelentkezés, főoldal, admin).

**Elvégezve**
- `002_scheduler_and_legacy_import.sql`: workers, categories, task_templates(+workers), projects
  (HRSZ csak tájékoztató, `drive_folder_id` előkészítve), project_tasks, task_segments, task_workers,
  task_days (+task_day_workers), worker_day_hours, conflict_acks, pay_adjustments,
  subcontractor_payments, legacy_imports.
- `server/legacy/`: calc.ts (v25 dátumszámítás), seed.ts (23 alapmunka, 8 kategória),
  transform.ts (ellenőrzés + átalakítás + jelentés), importer.ts (egy tranzakciós írás).
- API: `GET /api/admin/legacy-import/status`, `POST .../preview` (nem ír), `POST .../commit` (alapból tiltva).
- Admin felület: „Régi adatok” fül. CLI: `npm run legacy:check`.

**Módosított fájlok:** csak `app/` alatt (új: migráció, server/legacy/*, routes/legacy.ts,
cli/legacy-check.ts, LegacyImport.tsx, tesztek + kitalált mintafájl; módosítva: app.ts, config.ts,
AdminPage.tsx, styles.css, package.json, .env.example, docs). A régi ütemező fájljai változatlanok.

**Tesztelés:** 61 automatikus teszt sikeres (ebből 21 új): a v25 eredeti dátumfüggvényeivel való
egyezés 300 véletlen esetre; átalakítás, figyelmeztetések, állapotok; előnézet nem ír adatbázisba;
import alapból tiltott (403); megerősítés kötelező; import után a DB egyezik az előnézet ellenőrző
összegeivel; az eredeti JSON változatlanul tárolódik; második import elutasítva.
Böngészős próba: Régi adatok fül, mintafájl előnézete, JS-hiba nincs. Valódi adat NEM került importálásra.

**Helyesbítés:** a korábbi elemzés „29 alapmunkát” írt; a v25-ben valójában **23** beépített alapmunka van.

**Nyitott kérdések:** valódi mentésfájlok begyűjtése (gépenként), a hiteles példány kijelölése;
Railway-telepítés jóváhagyása; DNS; logó; raktárkezelő címe.

**Következő lépés:** 1.0 – Ütemező v26 felülete (a v25 nézetek API-ból), az import élesítése jóváhagyás után.

---

## 2026-11-08 – v26: ütemező integrálása, közös ügyfél- és projektnyilvántartás

**Ág:** `feature/besttech-v26` (a `main` változatlan). Commitok: `c29a608` (háttér), és a záró commit.

**Elvégezve**
- Saját adatbázisséma (`besttech_app`), `npm run db:inspect` (csak olvasás), migrációs terv.
- 003-as migráció: ügyfelek, projektkód/ügyfélkapcsolat, csapatok, projektköltségek, dokumentumok,
  jogosultságok, ütemező-verziók, előzmények, 23 alapsablon; csempék: ütemező/projektek/ügyfelek aktív.
- API: ügyfelek, projektek, ütemező (state/versions/sync), szerepkör-jogosultságok, adatmentés.
- `/utemezo`: a v25 felülete a központi adatbázissal (adatréteg: mentés, ütközéskezelés, frissítés).
- `/ugyfelek`, `/projektek` React-oldalak; Admin → Szerepkörök jogosultsági táblázat.
- Import: mentés-megerősítés kötelező; dolgozók/sablonok név szerinti egyeztetése.

**Tesztelés**
- 81 automatikus teszt sikeres (20 új): ügyfél és projekt létrehozása, hozzárendelés, megjelenés
  az ütemezőben, munkafázis-módosítás mentése/visszatöltése (dátumok, szakaszok, pipák, napi
  eltérések), átnevezés a Projektek modulban → ütemező, elavult mentés 409, két projekt egyidejű
  mentése, új projekt az ütemezőből, archiválás, dolgozók szakasz, előzmények, jogosultságok
  (munkafelelős csak olvas, felhasználó nem lát ügyfelet, pénzügyi adatok rejtése és védelme,
  szerepkör-jogok módosítása), import után az ütemező a v25 adatait mutatja, mentés letöltése.
- Böngészős teszt (Playwright, 3 felhasználó + mobil): ügyfél és projekt a felületen, ütemező
  projektválasztó, két felhasználó egyidejű munkája, napszám-módosítás és visszatöltés,
  átnevezés és új projekt automatikus megjelenése a nyitott ütemezőben, csak olvasó mód,
  jogosultsági táblázat. JS- és szerverhiba nem volt.

**Nyitott kérdések / hátralévő**
- Railway: meglévő adatbázis ellenőrzése (`db:inspect`), mentés, telepítés – jóváhagyásra vár.
- Valódi v25 adatok importja – jóváhagyásra vár (előtte mentés).
- Csapatok, projektköltségek, dokumentumok felülete; automatikus e-mail; feladatok készre
  jelentése munkafelelősként (mobil); a v25 áthúzáskori napi-eltérés-hiba (C.8) javítása.

**Következő lépés:** jóváhagyás után staging-telepítés, majd az import próbája egy mentés másolatán.
