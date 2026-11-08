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
