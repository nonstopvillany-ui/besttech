-- Besttech app – 001: felhasználók, szerepkörök, munkamenetek, irányítópult-csempék
-- Ez a migráció csak ÚJ táblákat hoz létre, meglévő adatot nem érint.

CREATE TABLE roles (
  key          text PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_]{1,31}$'),
  name         text NOT NULL,
  description  text NOT NULL DEFAULT '',
  is_admin     boolean NOT NULL DEFAULT false,  -- teljes jogosultság
  is_system    boolean NOT NULL DEFAULT false,  -- beépített, nem törölhető
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id                    bigserial PRIMARY KEY,
  email                 text NOT NULL,
  name                  text NOT NULL DEFAULT '',
  password_hash         text NOT NULL,
  role_key              text NOT NULL REFERENCES roles(key) ON UPDATE CASCADE,
  is_active             boolean NOT NULL DEFAULT true,
  must_change_password  boolean NOT NULL DEFAULT false,
  failed_login_count    integer NOT NULL DEFAULT 0,
  locked_until          timestamptz,
  last_login_at         timestamptz,
  password_changed_at   timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
-- Az e-mail-cím kis- és nagybetűtől függetlenül egyedi
CREATE UNIQUE INDEX users_email_lower_idx ON users (lower(email));

-- A munkamenet-azonosítónak csak a SHA-256 lenyomata kerül az adatbázisba
CREATE TABLE sessions (
  id_hash       text PRIMARY KEY,
  user_id       bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  ip            text,
  user_agent    text
);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

-- Irányítópult-csempék
CREATE TABLE dashboard_tiles (
  id           bigserial PRIMARY KEY,
  module_key   text UNIQUE,                    -- beépített modul azonosítója (pl. 'utemezo')
  title        text NOT NULL CHECK (length(title) BETWEEN 1 AND 60),
  description  text NOT NULL DEFAULT '' CHECK (length(description) <= 200),
  icon         text NOT NULL DEFAULT 'layout-grid',
  color        text NOT NULL DEFAULT '#1761b4' CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  target_type  text NOT NULL DEFAULT 'none' CHECK (target_type IN ('internal', 'external', 'none')),
  target       text NOT NULL DEFAULT '',
  status       text NOT NULL DEFAULT 'development' CHECK (status IN ('active', 'development')),
  sort_order   integer NOT NULL DEFAULT 0,
  is_visible   boolean NOT NULL DEFAULT true,
  is_system    boolean NOT NULL DEFAULT false, -- beépített csempe: nem törölhető, csak elrejthető
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   bigint REFERENCES users(id) ON DELETE SET NULL
);

-- Csempebeállítás: mely szerepkörök látják a csempét
CREATE TABLE dashboard_tile_roles (
  tile_id   bigint NOT NULL REFERENCES dashboard_tiles(id) ON DELETE CASCADE,
  role_key  text NOT NULL REFERENCES roles(key) ON UPDATE CASCADE ON DELETE CASCADE,
  PRIMARY KEY (tile_id, role_key)
);

-- Általános alkalmazásbeállítások (kulcs–érték)
CREATE TABLE app_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  bigint REFERENCES users(id) ON DELETE SET NULL
);

-- Eseménynapló: ki, mikor, mit csinált
CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  user_id     bigint REFERENCES users(id) ON DELETE SET NULL,
  action      text NOT NULL,
  entity      text,
  entity_id   text,
  details     jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_created_idx ON audit_log (created_at DESC);

-- ---------------------------------------------------------------------------
-- Kezdőadatok
-- ---------------------------------------------------------------------------

INSERT INTO roles (key, name, description, is_admin, is_system, sort_order) VALUES
  ('admin',        'Adminisztrátor',     'Teljes jogosultság: felhasználók, csempék, beállítások.', true,  true, 1),
  ('iroda',        'Irodai munkatárs',   'Irodai ügyintézés, projektek és ügyfelek kezelése.',      false, true, 2),
  ('munkafelelos', 'Munkafelelős',       'Kivitelezés irányítása, ütemezés megtekintése.',          false, true, 3),
  ('felhasznalo',  'Felhasználó',        'Alapjogosultság: a számára engedélyezett modulok.',       false, true, 4);

INSERT INTO dashboard_tiles (module_key, title, description, icon, color, target_type, target, status, sort_order, is_system) VALUES
  ('utemezo',      'Építési ütemező',        'Építkezések ütemezése, beosztás, bérezés',    'calendar-range', '#1761b4', 'none',     '',       'development', 10, true),
  ('projektek',    'Projektek',              'Építési projektek nyilvántartása',            'building-2',     '#2b9658', 'none',     '',       'development', 20, true),
  ('ugyfelek',     'Ügyfelek',               'Ügyfelek és érdeklődők',                      'users',          '#8c56bd', 'none',     '',       'development', 30, true),
  ('dokumentumok', 'Dokumentumok',           'Szerződések, tervek, fotók',                  'folder-open',    '#b46c29', 'none',     '',       'development', 40, true),
  ('hirlevel',     'Hírlevél',               'Hírlevelek és feliratkozók',                  'mail',           '#1b8a8f', 'none',     '',       'development', 50, true),
  ('konfigurator', 'Állítsd össze a házad!', 'Házkonfigurátor',                             'house',          '#c49a25', 'none',     '',       'development', 60, true),
  ('raktar',       'Raktárkészlet',          'Hivatkozás a raktárkezelő rendszerre',        'warehouse',      '#609d35', 'external', '',       'development', 70, true),
  ('admin',        'Adminisztráció',         'Felhasználók, jogosultságok, csempék',        'settings',       '#173d67', 'internal', '/admin', 'active',      80, true);

-- Alapértelmezett láthatóság: az Adminisztráció csempét csak az admin látja,
-- a többit minden szerepkör.
INSERT INTO dashboard_tile_roles (tile_id, role_key)
SELECT t.id, r.key
FROM dashboard_tiles t CROSS JOIN roles r
WHERE t.module_key <> 'admin' OR r.key = 'admin';

INSERT INTO app_settings (key, value) VALUES
  ('dashboard', '{"title": "Besttech Kft. – Vállalatirányítás", "welcome": "Válassz modult a kezdéshez."}'::jsonb);
