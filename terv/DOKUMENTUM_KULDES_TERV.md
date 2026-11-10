# Ügyfél adatlap – „Dokumentum küldése” (fejlesztési terv)

Állapot: **terv, még nincs megvalósítva.** A v26-os ERP kódja (Ügyfelek, Drive-szinkron, Google OAuth, Hírlevél) a VPS git-tárolójában van (`feature/v26-integracio`), ebben a GitHub-tárolóban csak a régi, v25-ös statikus ütemező található.
Ütemezés: a tulajdonos 2026-11-10-i szabálya szerint a futó feladatok (teszthírlevél, Dokumentumok csempe) **után** következik, ütköző migráció vagy telepítés nélkül. A Dokumentumok csempe fájlkezelőjével közös alapra épül.

## Alapelvek
- **Összerendelés csak azonosítóval:** `customers.id` ↔ `customers.drive_folder_id` (a meglévő Drive-szinkronban rögzített mappaazonosító). Név alapján soha nem keresünk mappát vagy fájlt.
- **Fájl csak az ügyfél saját mappájából választható:** a választó a szerveren a `'<drive_folder_id>' in parents` lekérdezéssel listáz (almappákkal együtt, rekurzívan). Küldés előtt a szerver **újra ellenőrzi**, hogy a fájl az adott ügyfél mappafájában van-e: a szülőláncot a Drive API-ból bejárja, a kliens által küldött adatban nem bízik.
- **Nincs újrafeltöltés:** a szerver a Drive-ból tölti le a fájlt, és közvetlenül a Gmail API-nak adja át mellékletként. A Google-dokumentumokat küldéskor PDF-be exportálja.
- **Feladó: info@besttech.hu**, Gmail API-val (`gmail.send`). Ehhez az info@ fiókra külön OAuth-engedély kell (a mostani engedélyek: drive, email, openid; a noreply@ külön kapcsolata a hírlevélé). Amíg ez nincs engedélyezve, a funkció LOG módban fut, valódi levél nem megy ki.

## Adatmodell (új migráció, a soron következő szám)
`document_sends`
| mező | tartalom |
|---|---|
| id | |
| customer_id | FK → customers.id |
| drive_folder_id | a küldéskor érvényes mappaazonosító (pillanatkép) |
| drive_file_id | |
| file_name, mime_type | |
| drive_revision_id | a küldött verzió (`headRevisionId`; Google-dokumentumnál `version`) |
| drive_modified_time, md5_checksum, size | a küldött verzió azonosítására |
| recipients (to/cc), subject | |
| gmail_message_id | sikeres küldés után |
| status | `log`, `elkuldve`, `hiba` + hibaüzenet |
| sent_by_user_id, sent_at | |

`document_versions_seen` (vagy mezők a meglévő Drive-szinkron fájltábláján)
| mező | tartalom |
|---|---|
| drive_file_id, customer_id | |
| last_sent_revision_id | |
| current_revision_id, current_modified_time | |
| new_version_flag | igaz, ha a Drive-ban újabb verzió van a legutóbb küldöttnél |

## Működés
1. **Ügyfél adatlap → „Dokumentum küldése” gomb.** Ha az ügyfélnek nincs `drive_folder_id`-ja, a gomb inaktív, és ezt jelzi.
2. **Fájlválasztó:** csak az ügyfél mappájának fájljai (név, módosítás ideje, verzió, „Új verzió” jelölés, legutóbbi küldés dátuma).
3. **Küldési ablak:** címzett (alapból az ügyfél e-mail-címe), másolat, tárgy, szöveg (sablonból). Előnézet a melléklet nevével és verziójával.
4. **Küldés:** szerveroldali jogosultság- és mappaellenőrzés → letöltés a Drive-ból → Gmail API (info@) → bejegyzés a `document_sends`-be a pontos verzióval.
5. **Új verzió jelölése:** a meglévő Drive-szinkron (changes API, lapozó tokennel) a fájl új `headRevisionId`-jánál `new_version_flag = true` értéket állít be, ha az eltér a legutóbb küldöttől. Az ERP-ben az ügyfél adatlapján és a fájllistában „Új verzió a Drive-ban – még nem küldted ki” jelölés jelenik meg.
6. **Napló az adatlapon:** „Küldött dokumentumok” fül (mit, melyik verziót, kinek, mikor, ki küldte), a verzió megnyitható a Drive-ban.

## Jogosultság és biztonság
- Küldeni csak „admin” és „iroda” szerepkör tud; a dolgozói nézetben nincs ilyen gomb.
- Nincs nyilvános link: a fájl mellékletként megy ki, a Drive-jogosultság nem változik.
- Mérethatár: a Gmail 25 MB-os mellékletkorlátja felett hibaüzenet jelenik meg (opcionálisan később: megosztás csak az adott címzettel, lejárattal).
- Minden küldés naplózott; a sikertelen küldés is.

## Tesztek
- Más ügyfél mappájában lévő fájlazonosítóval küldés → elutasítás (403).
- Azonos nevű ügyfelek vagy mappák → csak az azonosító számít.
- Új Drive-verzió → jelölés megjelenik, küldés után eltűnik.
- LOG módban nem megy ki levél, a napló mégis létrejön.
- Google-dokumentum → PDF-export mellékletként.
