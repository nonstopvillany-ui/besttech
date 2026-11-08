# Besttech – Építési ütemező

**Verzió: v25** · © 2026 Besttech Kft. Az oldal a Besttech Kft. tulajdona.

A Besttech Kft. belső ütemező oldala komplett házépítéshez: a munkafolyamatok ütemezése projektenként, a dolgozók beosztása, az ütközések figyelése, az esti e-mail előnézete, a bérezés és az alvállalkozói elszámolás.

## Fájlok

| Fájl | Mi van benne |
|---|---|
| `index.html` | a teljes oldal egy fájlban (kinézet és működés is) – ezt kell feltölteni |
| `forras/style.css`, `forras/app.js` | ugyanez szétbontva, fejlesztéshez |
| `render.yaml` | beállítás a Render.com statikus oldalához |

## Nézetek

- **Korábban elkészült munkák:** a munkák listája fölötti gombbal bepipálható, mi volt már kész az ütemezés kezdete előtt. Ezeknél nem kell dátum és dolgozó.
- **Toronynézet:** van 10 napos, 30 napos, teljes torony és havi nézet, valamint dolgozónkénti nézet munkaidővel. A munkát a bal oldali listából a megfelelő napra kell húzni.
- **Napi terv:** egy napot mutat. Látszik, ki hol dolgozik, és ki szabad még.
- **Összesítő naptár:** projektenként egy oszlop.
- **Ki hol dolgozik?:** dolgozónként egy oszlop.
- **Bérezés:** havi bérlap dolgozónként. Csak az eltelt vagy elvégzettnek jelölt napok számítanak bele. Plusz és mínusz tételek adhatók hozzá, ezek ismétlődhetnek is. A lap kinyomtatható vagy PDF-be menthető.
- **Alvállalkozók:** kifizetések rögzítése projekt és munka szerint, havi összesítővel, nyomtatással.
- **Esti e-mail:** 6 napos munkaterv előnézete a munkafelelősöknek.
- **Dolgozók:** szerepkör, e-mail-cím és órabér megadása.

## Helyi futtatás

Nem kell semmit telepíteni. Az `index.html` dupla kattintással megnyílik a böngészőben.

## Közzététel a Renderen

1. Töltsd fel ezt a mappát egy GitHub-repóba, például `besttech-utemezo` néven.
2. A Renderen válaszd a **New → Static Site** lehetőséget, és add meg a repót.
3. A **Publish directory** mezőbe ezt írd: `.`. A build parancs maradjon üres.
4. Minden új feltöltés (push) után a Render magától frissíti az oldalt.

## Fontos: hol vannak az adatok?

Az adatokat most a **böngésző tárolja (localStorage)**, vagyis gépenként és böngészőnként külön vannak. Más gépre a **„Mentés fájlba” / „Betöltés”** gombokkal lehet átvinni őket.

## Következő lépések

- Közös adatbázis (például Supabase), hogy mindenki ugyanazt lássa.
- Bejelentkezés, és saját nézet a dolgozóknak.
- Az esti e-mailek automatikus kiküldése egy kis szerveroldali résszel.
- Projektlista a Google Drive „01 munkák” mappájából.
