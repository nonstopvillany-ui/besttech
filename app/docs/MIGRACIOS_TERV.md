# Biztonságos adatbázis-migrációs terv (v26)

> Jóváhagyás nélkül semmi nem fut éles adatbázison. Ez a terv a lépések sorrendje.

## 1. Kiinduló helyzet

- A tulajdonos szerint van már egy PostgreSQL-adatbázis a Railway „Besttech” projektben.
  A fejlesztőnek (Claude Code) **nincs Railway-hozzáférése**, ezért a tartalmát nem ellenőrizte.
- Lehet, hogy más alkalmazás (pl. a raktárkezelő) is használja. Ezért:
  **az alkalmazás minden táblája egy saját sémában van: `besttech_app`** (a `DB_SCHEMA`
  változóval módosítható). A `public` sémához és más sémákhoz a migráció nem nyúl.

## 2. Ellenőrzés (csak olvasás)

```bash
cd app && npm run build && DATABASE_URL=... npm run db:inspect
```
Kiírja a sémákat, táblákat, becsült sorszámokat, és hogy a `besttech_app` séma létezik-e.
`BEGIN READ ONLY` tranzakcióban fut, semmit nem módosít. **Az eredményt egyeztetni kell, mielőtt
a migráció lefut.** Ha a `besttech_app` séma már létezik és nem ettől az alkalmazástól
származik, más `DB_SCHEMA` nevet kell választani.

## 3. Mentés

1. Railway → Postgres szolgáltatás → **Backups**: kézi mentés készítése (és az automatikus
   mentés bekapcsolása).
2. Ha van parancssori hozzáférés: `pg_dump --format=custom "$DATABASE_URL" > besttech-elotte.dump`

## 4. Migrációk (sorrendben, egyszer futnak, mind tranzakcióban)

| Fájl | Tartalom |
|---|---|
| `001_auth_and_dashboard.sql` | felhasználók, szerepkörök, munkamenetek, csempék, beállítások, eseménynapló |
| `002_scheduler_and_legacy_import.sql` | ütemező adatmodell (projektek, munkafázisok, napok, dolgozók…), régi adatok importnaplója |
| `003_customers_projects_scheduler.sql` | ügyfelek, projektkód és ügyfélkapcsolat, csapatok, projektköltségek, dokumentum-metaadat, szerepkör-jogosultságok, ütemező-verziók és előzmények, 23 alapsablon |

- Csak `CREATE` és `ALTER … ADD` utasítások, a saját sémán belül. Adatot nem törölnek.
- A futtatás a Railway `preDeployCommand`-jában (`npm run migrate`) történik; tanácsadó zár
  védi a párhuzamos futtatástól; a `schema_migrations` tábla tartja nyilván a lefutottakat.
- Visszaállítás: a Railway-mentésből. (A saját séma eldobása – `DROP SCHEMA besttech_app CASCADE` –
  csak akkor jöhet szóba, ha még nincs benne valódi adat, és kizárólag jóváhagyással.)

## 5. Régi (v25) adatok importja – külön jóváhagyással

1. Minden gépen, ahol a v25-öt használták: „💾 Mentés fájlba” → fájlok begyűjtése.
2. A hiteles példány kiválasztása: Admin → **Régi adatok** → előnézet (nem ír adatbázisba),
   vagy `npm run legacy:check -- fajl.json`. A figyelmeztetéseket át kell nézni.
3. **Mentés** (3. pont) + Admin → Régi adatok → „Adatbázis-mentés letöltése”.
4. Railway-változó: `LEGACY_IMPORT_ENABLED=true` → újraindulás.
5. Import: „IMPORTÁLÁS” beírása + a mentés megerősítése. Egyszer futtatható, egy tranzakcióban.
6. Ellenőrzés: az ütemezőben a projektek, munkák, pipák egyeznek a v25-tel; a Projektek
   modulban a projektekhez ügyfél rendelhető.
7. `LEGACY_IMPORT_ENABLED=false` visszaállítása.

A v25 (`index.html`) közben változatlanul működik; az átállás napjától csak a v26-ban rögzítsenek.
