# BESTTECH – 8 oldalas műszaki leírás (szerkeszthető változat)

| Fájl | Tartalom |
|---|---|
| `BESTTECH_Muszaki_Leiras_8_oldal.pdf` | a kész, 8 oldalas, álló A4-es PDF |
| `VALTOZASJEGYZEK.md` | a szöveges módosítások és a jóváhagyásra váró pontok |
| `forras/index.html` | **a szerkeszthető forrás**: minden szöveg itt módosítható |
| `forras/style.css` | színek, betűméretek, elrendezés |
| `forras/img/` | a jóváhagyott PNG-ből kivágott képek és piktogramok, valamint a logó |
| `forras/fonts/` | Fira Sans és Fira Sans Condensed betűtípus (OFL) |
| `forras/eredeti/` | a jóváhagyott PNG (referencia) |
| `forras/pdf_keszites.js` | PDF-készítő szkript |

## Szöveg módosítása
1. Nyisd meg a `forras/index.html` fájlt egy szövegszerkesztőben.
2. Az oldalak `<!-- ===== N. OLDAL ===== -->` megjegyzésekkel vannak elválasztva. A felsorolások egy-egy `<li>…</li>` sorból állnak.
3. A böngészőben megnyitva azonnal ellenőrizhető az eredmény.

## PDF készítése
```bash
cd forras && node pdf_keszites.js
```
Ehhez Node.js és Playwright kell (`npm i playwright`). Ha nincs kéznél, a böngészőben a Nyomtatás → Mentés PDF-ként (A4, margó nélkül, háttérgrafika bekapcsolva) is működik.
