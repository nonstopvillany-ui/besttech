// Besttech ütemező v26 – adatréteg.
// A v25 a teljes állapotot a böngésző localStorage-ába mentette. A v26 ugyanazt az
// állapotot (S) a központi adatbázisból tölti be, és a módosításokat oda menti:
//  - csak a megváltozott projekteket / szakaszokat küldi, a kiinduló verzióval;
//  - ha közben más ugyanazt módosította (409), a friss állapotot betölti, és a
//    nem ütköző saját módosításokat újra elküldi;
//  - hálózati hiba esetén automatikusan újrapróbálja;
//  - időnként ellenőrzi, nem mentett-e más, és ha nincs függő saját módosítás, frissít.

const SECTIONS = ['roster', 'custom', 'cats', 'ignored', 'hours', 'payItems', 'subPays'];
const FINANCE = new Set(['payItems', 'subPays']);
const SAVE_DELAY = 700;
const POLL_MS = 15000;

const $ = (id) => document.getElementById(id);
const houseJson = (h) => JSON.stringify({ name: h.name, tasks: h.tasks });
const sectionJson = (S, k) => (k === 'settings' ? JSON.stringify({ mailTime: S.mailTime }) : JSON.stringify(S[k] ?? null));

async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || 'GET',
    credentials: 'same-origin',
    headers: { 'X-Requested-With': 'besttech', ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    location.href = '/belepes?vissza=' + encodeURIComponent(location.pathname + location.search);
    throw Object.assign(new Error('Bejelentkezés szükséges.'), { status: 401, silent: true });
  }
  if (data.code === 'PASSWORD_CHANGE_REQUIRED') {
    location.href = '/jelszo-csere';
    throw Object.assign(new Error(data.error), { status: 403, silent: true });
  }
  if (!res.ok) throw Object.assign(new Error(data.error || 'Hiba történt.'), { status: res.status, data });
  return data;
}

let app = null;          // a v25 kód horgai: get(), set(state)
let perms = { edit: false, finance: false };
let versions = { houses: {}, sections: {} };
let synced = null;       // az utoljára a szerverrel egyező állapot (szövegként)
let timer = null, inflight = false, again = false, retryMs = 2000, warnedReadonly = false;

function snapshot(S) {
  const s = { houses: new Map(), sections: {} };
  for (const h of S.houses) if (h.id) s.houses.set(h.id, houseJson(h));
  for (const k of [...SECTIONS, 'settings']) s.sections[k] = sectionJson(S, k);
  return s;
}

function status(text, cls) {
  const el = $('btSave');
  if (el) { el.textContent = text; el.className = 'bt-save ' + (cls || ''); }
}
function banner(text, err) {
  const el = $('btBanner');
  if (!el) return;
  el.hidden = !text;
  el.textContent = text || '';
  el.classList.toggle('err', !!err);
}
function toast(text, ms = 6000) {
  const el = document.createElement('div');
  el.className = 'bt-toast';
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

/** A helyi állapot és az utolsó szinkron állapot különbsége. */
function diff(S) {
  const out = { houses: [], archived: [], sections: {} };
  const present = new Set();
  for (const h of S.houses) {
    if (!h.id) {
      h._tmp ??= 'tmp-' + Math.random().toString(36).slice(2, 10);
      out.houses.push({ tmp: h._tmp, name: h.name, tasks: h.tasks });
      continue;
    }
    present.add(h.id);
    const j = houseJson(h);
    if (j !== synced.houses.get(h.id)) out.houses.push({ id: h.id, base: versions.houses[h.id], name: h.name, tasks: h.tasks, _json: j });
  }
  for (const id of synced.houses.keys()) if (!present.has(id)) out.archived.push({ id, base: versions.houses[id] });
  for (const k of [...SECTIONS, 'settings']) {
    if (FINANCE.has(k) && !perms.finance) continue;
    const j = sectionJson(S, k);
    if (j !== synced.sections[k]) out.sections[k] = { base: versions.sections[k], data: k === 'settings' ? { mailTime: S.mailTime } : S[k] ?? (k === 'roster' || k === 'custom' || FINANCE.has(k) ? [] : {}), _json: j };
  }
  return out;
}
const isEmpty = (d) => !d.houses.length && !d.archived.length && !Object.keys(d.sections).length;
const strip = (d) => ({
  houses: d.houses.map(({ _json, ...h }) => h),
  archived: d.archived,
  sections: Object.fromEntries(Object.entries(d.sections).map(([k, { _json, ...v }]) => [k, v])),
});

async function loadFresh() {
  return api('/api/scheduler/state');
}

function adopt(fresh) {
  perms = fresh.perms;
  versions = fresh.versions;
  synced = snapshot(fresh);
}

async function flush() {
  clearTimeout(timer);
  if (!app || !perms.edit) return;
  if (inflight) { again = true; return; }
  const S = app.get();
  const d = diff(S);
  if (isEmpty(d)) { status('✓ Mentve', 'ok'); return; }
  inflight = true;
  status('Mentés…', 'busy');
  try {
    const res = await api('/api/scheduler/sync', { method: 'PUT', body: strip(d) });
    // Csak az általunk küldött elemek verzióját és állapotát vesszük át: más
    // felhasználók közbeni módosításait a frissítés tölti be, így nem írjuk felül őket.
    for (const h of d.houses) {
      const id = h.id ?? res.idMap[h.tmp];
      if (!h.id) {
        const live = S.houses.find((x) => x._tmp === h.tmp);
        if (live) { live.id = id; delete live._tmp; }
      }
      versions.houses[id] = res.versions.houses[id];
      synced.houses.set(id, h._json ?? houseJson(h));
    }
    for (const a of d.archived) { synced.houses.delete(a.id); delete versions.houses[a.id]; }
    for (const [k, v] of Object.entries(d.sections)) { versions.sections[k] = res.versions.sections[k]; synced.sections[k] = v._json; }
    retryMs = 2000;
    banner('');
    status('✓ Mentve ' + new Date().toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' }), 'ok');
  } catch (e) {
    if (e.silent) return;
    if (e.status === 409) await resolveConflict(d, e.data?.conflicts ?? []);
    else if (e.status === 403) { perms.edit = false; readonlyMode('Nincs jogosultságod az ütemező szerkesztéséhez – a módosítások nem mentődnek.'); }
    else if (e.status === 400) { status('Mentési hiba', 'err'); banner('A módosítást a szerver elutasította: ' + e.message + ' Az oldal frissítése után a legutóbb mentett állapot töltődik be.', true); }
    else {
      status('Mentés sikertelen – újrapróbálás…', 'err');
      banner('A szerver nem érhető el. A módosításaid ebben az ablakban megvannak, a mentést automatikusan újrapróbáljuk. Ne zárd be az oldalt!', true);
      timer = setTimeout(flush, retryMs);
      retryMs = Math.min(retryMs * 2, 30000);
    }
  } finally {
    inflight = false;
    if (again) { again = false; schedule(); }
  }
}

/** Ütközés: friss állapot betöltése; a nem ütköző saját módosítások megtartása és újraküldése. */
async function resolveConflict(d, conflicts) {
  const fresh = await loadFresh();
  const S = app.get();
  const lost = new Set(conflicts);
  adopt(fresh);
  for (const h of d.houses) {
    if (!h.id) { fresh.houses.push(S.houses.find((x) => x._tmp === h.tmp) ?? { name: h.name, tasks: h.tasks, _tmp: h.tmp }); continue; }
    if (lost.has('house:' + h.id)) continue;
    const i = fresh.houses.findIndex((x) => x.id === h.id);
    const mine = S.houses.find((x) => x.id === h.id);
    if (i >= 0 && mine) fresh.houses[i] = { ...fresh.houses[i], name: mine.name, tasks: mine.tasks };
  }
  for (const a of d.archived) if (!lost.has('house:' + a.id)) fresh.houses = fresh.houses.filter((x) => x.id !== a.id);
  for (const k of Object.keys(d.sections)) if (!lost.has(k)) { if (k === 'settings') fresh.mailTime = S.mailTime; else fresh[k] = S[k]; }
  const names = conflicts.map((c) => {
    if (!c.startsWith('house:')) return { roster: 'dolgozók', custom: 'sablonok', cats: 'kategóriák', ignored: 'ütközések', hours: 'munkaidő', payItems: 'bértételek', subPays: 'kifizetések', settings: 'beállítások' }[c] || c;
    const h = fresh.houses.find((x) => 'house:' + x.id === c);
    return h ? '„' + h.name + '”' : 'egy projekt';
  });
  toast('Közben más is módosította: ' + names.join(', ') + '. Ezeknél a friss állapot töltődött be, a többi módosításod megmaradt.', 9000);
  app.set(fresh);
  schedule();
}

function readonlyMode(text) {
  document.body.classList.add('bt-readonly');
  banner(text);
  status('Csak megtekintés', '');
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(flush, SAVE_DELAY);
}

/** A v25 save() helyett hívódik minden módosítás (render) után. */
function scheduleSave() {
  if (!app || !synced) return;
  if (!perms.edit) {
    if (!isEmpty(diff(app.get()))) {
      if (!warnedReadonly) toast('Nincs jogosultságod az ütemező szerkesztéséhez – a módosítás nem mentődik.');
      warnedReadonly = true;
      // a helyi változás visszavonása a legutóbbi szerverállapotra
      loadFresh().then((f) => { adopt(f); app.set(f); }).catch(() => {});
    }
    return;
  }
  schedule();
}

/** Más felhasználók mentéseinek figyelése. */
async function poll() {
  if (!app || inflight || document.hidden) return;
  try {
    const v = await api('/api/scheduler/versions');
    const changed =
      Object.keys(v.houses).length !== Object.keys(versions.houses).length ||
      Object.entries(v.houses).some(([id, ver]) => versions.houses[id] !== ver) ||
      Object.entries(v.sections).some(([k, ver]) => (perms.finance || !FINANCE.has(k)) && versions.sections[k] !== ver);
    if (!changed) return;
    if (perms.edit && !isEmpty(diff(app.get()))) return; // függő saját mentés: azt intézi a flush
    const fresh = await loadFresh();
    adopt(fresh);
    app.set(fresh);
    toast('Az ütemező frissült (más felhasználó módosításai, vagy új projekt).', 4000);
  } catch { /* a következő körben újra */ }
}

function emptyState(me, canCreate) {
  document.body.innerHTML = `<div class="bt-empty"><h2>Még nincs projekt az ütemezőben</h2>
    <p>Az ütemező a központi projektnyilvántartásból dolgozik. Hozz létre egy projektet, és itt azonnal megjelenik.</p>
    <p>${canCreate ? '<a class="primary" href="/projektek" style="padding:10px 16px;border-radius:8px;background:#1761b4;color:#fff;text-decoration:none">Projektek megnyitása</a>' : 'Projekt létrehozásához kérj jogosultságot az adminisztrátortól.'}
    <a href="/" style="padding:10px 16px">Vissza a főoldalra</a></p><small>${me ? 'Bejelentkezve: ' + me.name.replace(/[<>&]/g, '') : ''}</small></div>`;
}

export const BT = {
  async load() {
    let fresh;
    try {
      fresh = await loadFresh();
    } catch (e) {
      if (!e.silent) document.body.innerHTML = `<div class="bt-empty"><h2>Az ütemező nem tölthető be</h2><p>${e.status === 403 ? 'Nincs jogosultságod az ütemezőhöz.' : 'A szerver nem érhető el. Próbáld újra később.'}</p><p><a href="/">Vissza a főoldalra</a></p></div>`;
      return new Promise(() => {}); // a v25 kód nem fut tovább
    }
    if (!fresh.houses.length) {
      const me = await api('/api/auth/me').catch(() => ({}));
      emptyState(fresh.me, !!me.user?.permissions?.includes('projects.edit'));
      return new Promise(() => {});
    }
    adopt(fresh);
    $('btLoading').hidden = true;
    $('btUser').textContent = fresh.me.name + ' · ' + fresh.me.roleName;
    $('btLogout').onclick = async () => { await api('/api/auth/logout', { method: 'POST' }).catch(() => {}); location.href = '/belepes'; };
    if (!perms.finance) {
      document.body.classList.add('bt-nofinance');
      document.querySelectorAll('nav button[data-v="pay"], nav button[data-v="subs"]').forEach((b) => b.remove());
    }
    if (!perms.edit) readonlyMode('Csak megtekintés: a szerepkörödhöz nem tartozik szerkesztési jog, a módosítások nem mentődnek.');
    else status('✓ Mentve', 'ok');
    // Nyomtatás gombok (a v25 inline onclick helyett – a biztonsági szabályok tiltják az inline szkriptet)
    document.addEventListener('click', (e) => { if (e.target.closest('[data-print]')) print(); });
    window.addEventListener('beforeunload', (e) => {
      if (inflight || (perms.edit && app && !isEmpty(diff(app.get())))) { flush(); e.preventDefault(); e.returnValue = ''; }
    });
    setInterval(poll, POLL_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
    return fresh;
  },
  attach(hooks) { app = hooks; },
  scheduleSave,
  flush,
  /** A kiválasztott projekt kódja és ügyfele az eszköztáron, link a Projektek modulba. */
  onRender(house) {
    const el = $('btProj');
    if (!el || !house) return;
    el.textContent = house.code ? house.code + (house.customer ? ' · ' + house.customer : '') : house.id ? '' : 'új projekt – mentés…';
    el.href = house.id ? '/projektek?id=' + house.id : '/projektek';
    el.title = 'Projekt adatai a Projektek modulban';
  },
};
