-- Besttech app – 002: építési ütemező adatmodellje és a régi (v25) JSON-import előkészítése
-- Csak ÚJ táblákat hoz létre. Valódi adatot nem tölt be; a régi adatokat később,
-- jóváhagyás után az importáló tölti be (lásd server/legacy/).
--
-- Alapelvek (az elemzés C.7–C.11 pontjai alapján):
--  * minden hivatkozás azonosítóval történik, nem névvel;
--  * az elvégzett napok és a napi eltérések DÁTUMHOZ kötődnek (a v25 done[] sorszámhoz kötötte).

CREATE TABLE workers (
  id           bigserial PRIMARY KEY,
  name         text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  role         text NOT NULL DEFAULT 'helper' CHECK (role IN ('lead', 'helper', 'sub')), -- munkafelelős / segéd / alvállalkozó
  email        text NOT NULL DEFAULT '',
  hourly_wage  numeric(12, 2) CHECK (hourly_wage IS NULL OR hourly_wage >= 0),
  user_id      bigint REFERENCES users(id) ON DELETE SET NULL,
  is_active    boolean NOT NULL DEFAULT true,
  legacy_name  text,                                   -- a v25-ös név (importhoz, egyeztetéshez)
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE categories (
  id          bigserial PRIMARY KEY,
  name        text NOT NULL UNIQUE,
  color       text NOT NULL DEFAULT '#637c90' CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  sort_order  integer NOT NULL DEFAULT 0
);

-- Munkafázis-sablonok (a v25 29 alapmunkája + az egyéni "custom" sablonok)
CREATE TABLE task_templates (
  id               bigserial PRIMARY KEY,
  name             text NOT NULL,
  category_id      bigint NOT NULL REFERENCES categories(id),
  default_days     integer NOT NULL DEFAULT 1 CHECK (default_days >= 1),
  default_lead_id  bigint REFERENCES workers(id) ON DELETE SET NULL,
  sort_order       integer NOT NULL DEFAULT 0,
  is_active        boolean NOT NULL DEFAULT true,
  source           text NOT NULL DEFAULT 'custom' CHECK (source IN ('seed', 'custom'))
);
CREATE TABLE task_template_workers (
  template_id  bigint NOT NULL REFERENCES task_templates(id) ON DELETE CASCADE,
  worker_id    bigint NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  PRIMARY KEY (template_id, worker_id)
);

-- Építési projektek (a v25 "houses")
CREATE TABLE projects (
  id               bigserial PRIMARY KEY,
  name             text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  hrsz             text,                         -- helyrajzi szám (nem azonosító!)
  status           text NOT NULL DEFAULT 'active' CHECK (status IN ('lead', 'active', 'finished', 'archived')),
  drive_folder_id  text UNIQUE,                  -- Google Drive mappaazonosító (későbbi összekapcsolás)
  legacy_import_id bigint,                       -- melyik importból származik
  legacy_index     integer,                      -- a v25 houses[] tömbbeli sorszáma
  sort_order       integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Egy projekt munkafázisai
CREATE TABLE project_tasks (
  id              bigserial PRIMARY KEY,
  project_id      bigint NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  template_id     bigint REFERENCES task_templates(id) ON DELETE SET NULL,
  name            text NOT NULL,
  category_id     bigint NOT NULL REFERENCES categories(id),
  lead_worker_id  bigint REFERENCES workers(id) ON DELETE SET NULL,
  notes           text NOT NULL DEFAULT '',
  status          text NOT NULL DEFAULT 'unscheduled'
                  CHECK (status IN ('unscheduled', 'scheduled', 'done', 'past_done')),
  planned_days    integer NOT NULL DEFAULT 1 CHECK (planned_days >= 1),
  sort_order      integer NOT NULL DEFAULT 0,
  legacy_id       integer,                       -- a v25 task.id (projekten belül egyedi)
  version         integer NOT NULL DEFAULT 1,    -- optimista zároláshoz
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, legacy_id)
);
CREATE INDEX project_tasks_project_idx ON project_tasks (project_id);

-- Szakaszok: az első a v25 start/days, a többi az extra[] elemei
CREATE TABLE task_segments (
  id          bigserial PRIMARY KEY,
  task_id     bigint NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  seq         integer NOT NULL,
  start_date  date NOT NULL,
  workdays    integer NOT NULL CHECK (workdays >= 1),
  UNIQUE (task_id, seq)
);

-- Alap csapat
CREATE TABLE task_workers (
  task_id    bigint NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  worker_id  bigint NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, worker_id)
);

-- Munkanapok dátum szerint: elvégzettség, napi megjegyzés, napi csapateltérés
CREATE TABLE task_days (
  id                    bigserial PRIMARY KEY,
  task_id               bigint NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  work_date             date NOT NULL,
  is_done               boolean NOT NULL DEFAULT false,
  done_by               bigint REFERENCES users(id) ON DELETE SET NULL,
  done_at               timestamptz,
  note                  text NOT NULL DEFAULT '',
  has_worker_override   boolean NOT NULL DEFAULT false,  -- true: a task_day_workers lista érvényes erre a napra
  UNIQUE (task_id, work_date)
);
CREATE INDEX task_days_date_idx ON task_days (work_date);
CREATE TABLE task_day_workers (
  task_day_id  bigint NOT NULL REFERENCES task_days(id) ON DELETE CASCADE,
  worker_id    bigint NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  PRIMARY KEY (task_day_id, worker_id)
);

-- Eltérő napi munkaidő (v25: hours["Név|dátum"])
CREATE TABLE worker_day_hours (
  worker_id  bigint NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  work_date  date NOT NULL,
  time_from  time NOT NULL,
  time_to    time NOT NULL,
  PRIMARY KEY (worker_id, work_date)
);

-- Tudomásul vett ütközések (v25: ignored["Név|dátum"])
CREATE TABLE conflict_acks (
  worker_id  bigint NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  work_date  date NOT NULL,
  acked_by   bigint REFERENCES users(id) ON DELETE SET NULL,
  acked_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (worker_id, work_date)
);

-- Bér plusz/mínusz tételek (v25: payItems)
CREATE TABLE pay_adjustments (
  id          bigserial PRIMARY KEY,
  worker_id   bigint NOT NULL REFERENCES workers(id),
  start_ym    char(7) NOT NULL CHECK (start_ym ~ '^\d{4}-\d{2}$'),
  end_ym      char(7) CHECK (end_ym IS NULL OR end_ym ~ '^\d{4}-\d{2}$'),  -- kizárólagos vége
  recurring   boolean NOT NULL DEFAULT false,
  amount      numeric(14, 2) NOT NULL,
  note        text NOT NULL DEFAULT '',
  legacy_id   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Alvállalkozói kifizetések (v25: subPays)
CREATE TABLE subcontractor_payments (
  id               bigserial PRIMARY KEY,
  worker_id        bigint NOT NULL REFERENCES workers(id),
  project_id       bigint REFERENCES projects(id) ON DELETE SET NULL,
  project_name     text NOT NULL DEFAULT '',   -- a v25 szövegesen tárolta; megőrizzük
  pay_date         date NOT NULL,
  work_desc        text NOT NULL DEFAULT '',
  amount           numeric(14, 2) NOT NULL,
  note             text NOT NULL DEFAULT '',
  legacy_id        text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Ütemező-beállítások (v25: mailTime stb.) – az app_settings táblában, 'scheduler' kulccsal

-- A régi mentésfájlok VÁLTOZATLAN megőrzése és az importok naplója
CREATE TABLE legacy_imports (
  id            bigserial PRIMARY KEY,
  file_name     text NOT NULL,
  sha256        text NOT NULL,
  status        text NOT NULL CHECK (status IN ('committed')),
  summary       jsonb NOT NULL,     -- darabszámok, figyelmeztetések, ellenőrző összegek
  raw           jsonb NOT NULL,     -- az eredeti JSON, módosítás nélkül
  imported_by   bigint REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX legacy_imports_sha_idx ON legacy_imports (sha256);

ALTER TABLE projects ADD CONSTRAINT projects_legacy_import_fk
  FOREIGN KEY (legacy_import_id) REFERENCES legacy_imports(id) ON DELETE SET NULL;
