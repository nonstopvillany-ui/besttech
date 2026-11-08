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
