# Technikai döntések (ADR-napló)

Rövid, dátumozott döntések, hogy a ChatGPT és a Claude Code ugyanabból induljon ki.

| # | Dátum | Döntés | Indoklás |
|---|---|---|---|
| D1 | 2026-11-08 | Az új alkalmazás kizárólag az `app/` mappában, a régi v25 érintetlen | Tulajdonosi szabály, a működő ütemező védelme |
| D2 | 2026-11-08 | Node 22 + TypeScript + Fastify, React + Vite, egy szolgáltatásként (az API kiszolgálja a felületet is) | Egyszerű üzemeltetés egy Railway-szolgáltatással, közös nyelv a régi JS-logikával |
| D3 | 2026-11-08 | PostgreSQL `pg` driverrel, sima SQL-migrációk (`migrations/NNN_*.sql`), ORM nélkül | Átlátható séma, kevés függőség; a `schema_migrations` tábla tartja nyilván a lefutottakat |
| D4 | 2026-11-08 | Jelszó-hash: Node beépített `scrypt` (N=2^15) | Nincs natív függőség (Railway-build egyszerű), erős, sózott |
| D5 | 2026-11-08 | Munkamenet: véletlen token httpOnly+SameSite=Lax sütiben, DB-ben csak SHA-256 lenyomat, 7 nap | Szerveroldalon visszavonható (kijelentkezés, letiltás, jelszócsere); localStorage-ban nincs titok |
| D6 | 2026-11-08 | CSRF: kötelező `X-Requested-With: besttech` fejléc + Origin-ellenőrzés, CORS nincs | Idegen oldal nem tud ilyen kérést küldeni |
| D7 | 2026-11-08 | Brute force ellen: IP-korlát (10/15 perc) + fiókzárolás (5 hiba → 15 perc) | Kétszintű védelem |
| D8 | 2026-11-08 | Szerepkörök táblában, `is_admin` jelző; csempeláthatóság szerepkörönként (`dashboard_tile_roles`) | Első szakaszhoz elég; a modulonkénti részletes jogok a modulokkal jönnek |
| D9 | 2026-11-08 | Felhasználó nem törölhető, csak letiltható; utolsó aktív admin nem fokozható le | Adatmegőrzés, kizárás elleni védelem |
| D10 | 2026-11-08 | Csempe akkor kattintható, ha „Kész” állapotú ÉS van céloldala; külső cél csak `https://` | „Fejlesztés alatt” egységes kezelése; `javascript:` stb. tiltva |
| D11 | 2026-11-08 | Beépített (rendszer-) csempe nem törölhető, csak elrejthető | Véletlen törlés ellen |
| D12 | 2026-11-08 | Első admin: CLI (rejtett jelszóbevitel) vagy egyszeri `INITIAL_ADMIN_*` változó, kötelező jelszócserével | Jelszó nem kerül a kódba |
| D13 | 2026-11-08 | Szöveges Besttech-embléma, a v25 színeivel (#173d67, #1761b4) | A Drive „Arculati elemek” mappája üres; hivatalos logó esetén cserélendő (`client/src/components/Brand.tsx`) |
| D14 | 2026-11-08 | Fejlesztési ág: `feature/besttech-v26` (a tulajdonos kérésére); a `main` érintetlen | Jóváhagyás előtt semmi nem kerül az éles ágra |
| D15 | 2026-11-08 | Az elvégzett napok és napi eltérések dátumhoz kötve (`task_days`), a v25 `done[i]` sorszámát az import dátumra fordítja | Megszünteti a v25 elcsúszó pipáinak hibáját |
| D16 | 2026-11-08 | Az import a v25 dátumszámítását pontosan követi (csak vasárnap szabadnap), automatikus teszt veti össze a régi kóddal | Különben a régi pipák rossz napra kerülnének |
| D17 | 2026-11-08 | Import: előnézet szabadon, tényleges import csak `LEGACY_IMPORT_ENABLED=true` + megerősítés mellett, egyszer, egy tranzakcióban; az eredeti JSON a `legacy_imports.raw` mezőben | Adatvesztés és duplikáció elleni védelem |
| D18 | 2026-11-08 | A régi adathibák (árva napi megjegyzés, ismeretlen dolgozó, tartományon kívüli pipa stb.) nem állítják meg az importot, hanem figyelmeztetésként jelennek meg; ismeretlen dolgozó inaktívként kerül be | Semmi ne vesszen el csendben; a döntés látható |
| D19 | 2026-11-08 | A beépített sablonok (23 db) csak név/napszám/kategória; ügyfélneveket a kód nem tartalmaz | Személyes adat nem kerül a tárolóba |
| D20 | 2026-11-08 | Minden tábla saját sémában (`besttech_app`, `search_path`) | Közös adatbázisban (pl. raktárkezelő) sem ütközhet; a migráció más sémához nem nyúl |
| D21 | 2026-11-08 | A v26 ütemező a v25 felületét és logikáját változatlanul használja (`client/utemezo/app.js`), csak az adatréteg cserélődik | „Megszokott felület”, minimális regressziós kockázat; a React-alapú újraírás később, modulonként |
| D22 | 2026-11-08 | Az ütemező nem tart saját projektlistát: a v25 `houses` = központi `projects` (nem archivált) | Egy igazságforrás; a Projektek modul és az ütemező ugyanazt az adatot látja |
| D23 | 2026-11-08 | Mentés szakaszonként verziózva (projektenként + dolgozók, sablonok stb.); ütközés → 409, friss állapot + a nem ütköző saját módosítások újraküldése | Többfelhasználós munka csendes felülírás nélkül; különböző projektek nem zavarják egymást |
| D24 | 2026-11-08 | Ütemezőbeli projekttörlés = archiválás; minden módosítás előtti állapot a `scheduler_history`-ba (90 nap) | Adat nem vész el |
| D25 | 2026-11-08 | Jogosultságok szerepkörönként szerkeszthetők (`role_permissions`); pénzügyi adat (`scheduler.finance`) alapból csak adminnak | Bérek védelme; rugalmas beállítás |
| D26 | 2026-11-08 | Az ütemező a projektnév/állapot változását a projekt ütemezési verziójának növelésével jelzi; a nyitott ütemezők 15 mp-enként ellenőriznek | Automatikus adatkapcsolat a modulok között |
| D27 | 2026-11-08 | Import előtt kötelező mentés-megerősítés; admin JSON-mentés letöltés (jelszó-hash és munkamenetek nélkül) | „Valódi adatok importálása előtt adatbázis-mentés” követelmény |
| D28 | 2026-11-08 | A v25 kódjából eltávolítva: beégetett ügyfél-/projektlista, beégetett dolgozólista, Alaphelyzet és Betöltés gomb (a központi adatot felülírnák); inline `onclick` helyett eseménykezelő (CSP) | Adatvédelem és adatbiztonság |
