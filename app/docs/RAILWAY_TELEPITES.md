# Railway-telepítés – besttech-app

> Csak jóváhagyás után! A **besttech-web** szolgáltatáshoz NEM kell hozzányúlni.

## 1. PostgreSQL
Besttech projekt → **+ New → Database → PostgreSQL**. (Ha még nincs.)

## 2. A besttech-app szolgáltatás beállításai (Settings)
| Beállítás | Érték |
|---|---|
| Source repo | `nonstopvillany-ui/besttech` |
| Branch | a jóváhagyott ág (első próbához a fejlesztési ág, élesben `main`) |
| **Root Directory** | `/app` |
| **Config file path** | `/app/railway.json` (a Railway ezt nem a Root Directoryhoz képest keresi) |
| Build | `npm run build` (railway.json) |
| Pre-deploy | `npm run migrate` (railway.json) |
| Start | `npm start` (railway.json) |
| Healthcheck | `/api/health` (railway.json) |

## 3. Változók (Variables)
| Név | Érték |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (hivatkozás, nem másolt érték) |
| `NODE_ENV` | `production` |
| `APP_URL` | `https://app.besttech.hu` |
| `INITIAL_ADMIN_EMAIL` | `info@besttech.hu` (csak az első indításig) |
| `INITIAL_ADMIN_PASSWORD` | erős ideiglenes jelszó (csak az első indításig, utána TÖRÖLNI) |

A `PORT`-ot a Railway adja meg.

## 4. Domain és DNS
Settings → Networking → Custom Domain: `app.besttech.hu` (már felvéve).
A Railway által mutatott **CNAME** (és ha kéri, TXT ellenőrző) rekordot a besttech.hu
DNS-szolgáltatójánál **csak az `app` aldomainre** kell felvenni. A gyökérdomain és a levelezés
(A, MX, TXT) rekordjaihoz nem szabad nyúlni. A HTTPS-tanúsítványt a Railway automatikusan adja.

## 5. Ellenőrzés telepítés után
1. `https://app.besttech.hu/api/health` → `{"status":"ok"}`
2. Belépés `info@besttech.hu` + ideiglenes jelszó → kötelező jelszócsere
3. Az `INITIAL_ADMIN_*` változók törlése
4. Railway → Postgres → Backups bekapcsolása
