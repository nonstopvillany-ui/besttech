-- Besttech app – 003: közös ügyfél- és projektnyilvántartás, csapatok, költségek,
-- dokumentumok, jogosultságok, az ütemező verziókövetése.
-- Csak új táblák/oszlopok; meglévő adatot nem töröl és nem ír felül.

-- ---------------------------------------------------------------- Ügyfelek
CREATE TABLE customers (
  id               bigserial PRIMARY KEY,
  code             text NOT NULL UNIQUE,
  name             text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  kind             text NOT NULL DEFAULT 'person' CHECK (kind IN ('person', 'company')),
  status           text NOT NULL DEFAULT 'customer' CHECK (status IN ('lead', 'customer', 'inactive')),
  email            text NOT NULL DEFAULT '',
  phone            text NOT NULL DEFAULT '',
  address          text NOT NULL DEFAULT '',
  tax_number       text NOT NULL DEFAULT '',
  notes            text NOT NULL DEFAULT '',
  drive_folder_id  text UNIQUE,              -- Google Drive mappaazonosító (később)
  version          integer NOT NULL DEFAULT 1,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  created_by       bigint REFERENCES users(id) ON DELETE SET NULL,
  updated_by       bigint REFERENCES users(id) ON DELETE SET NULL
);
CREATE SEQUENCE customer_code_seq;
ALTER TABLE customers ALTER COLUMN code SET DEFAULT ('U-' || lpad(nextval('customer_code_seq')::text, 5, '0'));
CREATE INDEX customers_name_idx ON customers (lower(name));

-- ---------------------------------------------------------------- Projektek bővítése
-- Egy ügyfélhez több projekt tartozhat; minden projektnek egyedi kódja van (P-00001).
CREATE SEQUENCE project_code_seq;
ALTER TABLE projects
  ADD COLUMN customer_id bigint REFERENCES customers(id) ON DELETE SET NULL,
  ADD COLUMN code text NOT NULL UNIQUE DEFAULT ('P-' || lpad(nextval('project_code_seq')::text, 5, '0')),
  ADD COLUMN address text NOT NULL DEFAULT '',
  ADD COLUMN notes text NOT NULL DEFAULT '',
  ADD COLUMN start_date date,
  ADD COLUMN due_date date,
  ADD COLUMN scheduler_initialized boolean NOT NULL DEFAULT false,  -- az ütemező már létrehozta a munkafázisait
  ADD COLUMN version integer NOT NULL DEFAULT 1,                    -- törzsadatok verziója
  ADD COLUMN sched_version integer NOT NULL DEFAULT 1,              -- ütemezési adatok verziója
  ADD COLUMN created_by bigint REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN updated_by bigint REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX projects_customer_idx ON projects (customer_id);
-- Importált projektek: ütemezési adataik már megvannak
UPDATE projects SET scheduler_initialized = true WHERE legacy_import_id IS NOT NULL;

-- ---------------------------------------------------------------- Munkafázisok: a v25 hű visszatöltéséhez
ALTER TABLE project_tasks
  ADD COLUMN position integer NOT NULL DEFAULT 0,   -- sorrend a bal oldali listában (v25 tömbindex)
  ADD COLUMN base_days integer NOT NULL DEFAULT 1 CHECK (base_days >= 1);  -- a fő szakasz napszáma (v25 task.days)
UPDATE project_tasks t SET base_days = COALESCE((SELECT s.workdays FROM task_segments s WHERE s.task_id = t.id AND s.seq = 1), t.planned_days);

-- ---------------------------------------------------------------- Sablonok, dolgozók
ALTER TABLE task_templates ADD COLUMN notes text NOT NULL DEFAULT '';
CREATE UNIQUE INDEX task_templates_name_idx ON task_templates (name);
CREATE UNIQUE INDEX workers_name_idx ON workers (lower(name));

-- ---------------------------------------------------------------- Csapatok
CREATE TABLE teams (
  id              bigserial PRIMARY KEY,
  name            text NOT NULL UNIQUE,
  lead_worker_id  bigint REFERENCES workers(id) ON DELETE SET NULL,
  color           text NOT NULL DEFAULT '#1761b4' CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE team_members (
  team_id    bigint NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  worker_id  bigint NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  PRIMARY KEY (team_id, worker_id)
);

-- ---------------------------------------------------------------- Projektköltségek
CREATE TABLE project_costs (
  id           bigserial PRIMARY KEY,
  project_id   bigint NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  cost_date    date NOT NULL DEFAULT current_date,
  category     text NOT NULL DEFAULT 'egyéb' CHECK (category IN ('anyag', 'munkadíj', 'alvállalkozó', 'gép', 'szállítás', 'egyéb')),
  description  text NOT NULL DEFAULT '',
  supplier     text NOT NULL DEFAULT '',
  amount       numeric(14, 2) NOT NULL,
  created_by   bigint REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX project_costs_project_idx ON project_costs (project_id);

-- ---------------------------------------------------------------- Dokumentumok (metaadat)
CREATE TABLE documents (
  id            bigserial PRIMARY KEY,
  customer_id   bigint REFERENCES customers(id) ON DELETE SET NULL,
  project_id    bigint REFERENCES projects(id) ON DELETE SET NULL,
  title         text NOT NULL,
  category      text NOT NULL DEFAULT 'egyéb',
  storage       text NOT NULL DEFAULT 'drive' CHECK (storage IN ('drive', 'link', 'file')),
  external_id   text,             -- pl. Google Drive fájlazonosító
  url           text NOT NULL DEFAULT '',
  created_by    bigint REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- Jogosultságok
-- Az Adminisztrátor (roles.is_admin) mindenhez hozzáfér; a többi szerepkör jogai itt.
CREATE TABLE role_permissions (
  role_key    text NOT NULL REFERENCES roles(key) ON UPDATE CASCADE ON DELETE CASCADE,
  permission  text NOT NULL,
  PRIMARY KEY (role_key, permission)
);
INSERT INTO role_permissions (role_key, permission) VALUES
  ('iroda', 'scheduler.view'), ('iroda', 'scheduler.edit'),
  ('iroda', 'customers.view'), ('iroda', 'customers.edit'),
  ('iroda', 'projects.view'), ('iroda', 'projects.edit'),
  ('munkafelelos', 'scheduler.view'), ('munkafelelos', 'projects.view'), ('munkafelelos', 'customers.view'),
  ('felhasznalo', 'scheduler.view');

-- ---------------------------------------------------------------- Ütemező: verziók, előzmények
-- Közös (nem projekthez kötött) ütemezőadatok verziója az ütközésmentes többfelhasználós mentéshez
CREATE TABLE scheduler_sections (
  key         text PRIMARY KEY,
  version     integer NOT NULL DEFAULT 1,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  bigint REFERENCES users(id) ON DELETE SET NULL
);
INSERT INTO scheduler_sections (key) VALUES
  ('roster'), ('custom'), ('cats'), ('ignored'), ('hours'), ('payItems'), ('subPays'), ('settings');

-- Minden ütemező-módosítás előtti állapot megőrzése (visszaállításhoz)
CREATE TABLE scheduler_history (
  id          bigserial PRIMARY KEY,
  section     text NOT NULL,
  project_id  bigint REFERENCES projects(id) ON DELETE SET NULL,
  old_data    jsonb,
  user_id     bigint REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX scheduler_history_created_idx ON scheduler_history (created_at DESC);

-- ---------------------------------------------------------------- Alapadatok (ha még nincsenek)
INSERT INTO categories (name, color, sort_order) VALUES
  ('Szerkezetépítés', '#2379bd', 10),
  ('Gépészet', '#2b9658', 20),
  ('Tető', '#8c56bd', 30),
  ('Festés', '#b46c29', 40),
  ('Homlokzat', '#609d35', 50),
  ('Burkolás', '#c49a25', 60),
  ('Szerelvényezés', '#1b8a8f', 70),
  ('Egyéb', '#637c90', 80)
ON CONFLICT (name) DO NOTHING;

INSERT INTO task_templates (name, default_days, category_id, sort_order, source)
SELECT v.name, v.days, c.id, v.ord, 'seed'
  FROM (VALUES
  ('Humusz leszedés', 1, 'Szerkezetépítés', 10),
  ('Kitűzés, alapásás', 1, 'Szerkezetépítés', 20),
  ('Alapozás – vasalás, beton', 2, 'Szerkezetépítés', 30),
  ('Zsalukő, lábazat', 1, 'Szerkezetépítés', 40),
  ('Gépészet – alapvezetékek', 1, 'Gépészet', 50),
  ('Vízóraakna létesítése', 1, 'Gépészet', 60),
  ('Villanyóra-mérőszekrény létesítése', 1, 'Gépészet', 70),
  ('Szerelőbeton', 1, 'Szerkezetépítés', 80),
  ('Főfalazás', 2, 'Szerkezetépítés', 90),
  ('Koszorú – vasalás, zsaluzás', 3, 'Szerkezetépítés', 100),
  ('Koszorú betonozás', 1, 'Szerkezetépítés', 110),
  ('Tető (szerkezet, héjazat, bádog)', 15, 'Tető', 120),
  ('Födém hőszigetelés + GK váz', 2, 'Szerkezetépítés', 130),
  ('Válaszfalazás', 2, 'Szerkezetépítés', 140),
  ('Nyílászárók beépítése', 2, 'Szerkezetépítés', 150),
  ('Gépészet – helyiségek', 4, 'Gépészet', 160),
  ('Festés 1. ütem', 5, 'Festés', 170),
  ('Homlokzat – EPS + háló', 3, 'Homlokzat', 180),
  ('Homlokzat – végső vakolat', 2, 'Homlokzat', 190),
  ('Burkolás', 15, 'Burkolás', 200),
  ('Festés 2. ütem', 5, 'Festés', 210),
  ('Villanyszerelvényezés', 2, 'Szerelvényezés', 220),
  ('Vízszerelvényezés', 2, 'Szerelvényezés', 230)
  ) AS v(name, days, cat, ord)
  JOIN categories c ON c.name = v.cat
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------- Főoldali csempék
-- Csak akkor kapcsoljuk be, ha az admin még nem állított be saját célt.
UPDATE dashboard_tiles SET status = 'active', target_type = 'internal', target = '/utemezo', updated_at = now()
 WHERE module_key = 'utemezo' AND target = '';
UPDATE dashboard_tiles SET status = 'active', target_type = 'internal', target = '/projektek', updated_at = now()
 WHERE module_key = 'projektek' AND target = '';
UPDATE dashboard_tiles SET status = 'active', target_type = 'internal', target = '/ugyfelek', updated_at = now()
 WHERE module_key = 'ugyfelek' AND target = '';
