-- ============================================================
-- Contacta Floor Monitor — Schema Completo
-- Ejecutar en Supabase → SQL Editor
-- ============================================================

-- ── Extensiones ─────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Enum: Roles ──────────────────────────────────────────────
CREATE TYPE user_role AS ENUM ('admin', 'supervisor', 'editor', 'viewer');

-- ── Enum: Estados de puesto ──────────────────────────────────
CREATE TYPE desk_status AS ENUM ('online', 'busy', 'pause', 'offline', 'error');

-- ── Enum: Acciones de auditoría ──────────────────────────────
CREATE TYPE audit_action AS ENUM (
  'desk_create', 'desk_update', 'desk_move', 'desk_delete',
  'zone_create', 'zone_update', 'zone_move', 'zone_delete',
  'layout_create', 'layout_update', 'layout_delete',
  'user_login', 'user_logout', 'user_invite'
);

-- ============================================================
-- TABLA: companies (Multi-tenant base)
-- ============================================================
CREATE TABLE companies (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  logo_url    TEXT,
  plan        TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  settings    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Trigger updated_at ──────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- TABLA: profiles (extiende auth.users de Supabase)
-- ============================================================
CREATE TABLE profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id   UUID REFERENCES companies(id) ON DELETE SET NULL,
  full_name    TEXT,
  avatar_url   TEXT,
  role         user_role DEFAULT 'viewer',
  is_active    BOOLEAN DEFAULT TRUE,
  last_seen    TIMESTAMPTZ,
  preferences  JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-crear perfil al registrarse
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- TABLA: buildings
-- ============================================================
CREATE TABLE buildings (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  address      TEXT,
  floors_count INT DEFAULT 1,
  metadata     JSONB DEFAULT '{}',
  created_by   UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER buildings_updated_at
  BEFORE UPDATE ON buildings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- TABLA: floors
-- ============================================================
CREATE TABLE floors (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  building_id  UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  floor_number INT DEFAULT 1,
  svg_width    INT DEFAULT 1200,
  svg_height   INT DEFAULT 800,
  metadata     JSONB DEFAULT '{}',
  created_by   UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER floors_updated_at
  BEFORE UPDATE ON floors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- TABLA: layouts (versiones de un piso)
-- ============================================================
CREATE TABLE layouts (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  floor_id     UUID REFERENCES floors(id) ON DELETE SET NULL,
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_by   UUID NOT NULL REFERENCES auth.users(id),
  name         TEXT NOT NULL DEFAULT 'Layout sin nombre',
  description  TEXT,
  is_active    BOOLEAN DEFAULT TRUE,
  is_template  BOOLEAN DEFAULT FALSE,
  version      INT DEFAULT 1,
  thumbnail    TEXT,
  settings     JSONB DEFAULT '{"gridSize": 40, "snapEnabled": false, "guidesEnabled": true}',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER layouts_updated_at
  BEFORE UPDATE ON layouts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- TABLA: zones
-- ============================================================
CREATE TABLE zones (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  layout_id    UUID NOT NULL REFERENCES layouts(id) ON DELETE CASCADE,
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  color        TEXT DEFAULT '#3b82f6',
  x            FLOAT NOT NULL DEFAULT 0,
  y            FLOAT NOT NULL DEFAULT 0,
  width        FLOAT NOT NULL DEFAULT 200,
  height       FLOAT NOT NULL DEFAULT 150,
  capacity     INT DEFAULT 10,
  is_locked    BOOLEAN DEFAULT FALSE,
  metadata     JSONB DEFAULT '{}',
  created_by   UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER zones_updated_at
  BEFORE UPDATE ON zones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- TABLA: desks
-- ============================================================
CREATE TABLE desks (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  layout_id    UUID NOT NULL REFERENCES layouts(id) ON DELETE CASCADE,
  zone_id      UUID REFERENCES zones(id) ON DELETE SET NULL,
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  desk_number  INT NOT NULL,               -- Número visual (#1, #2…)
  x            FLOAT NOT NULL DEFAULT 0,
  y            FLOAT NOT NULL DEFAULT 0,
  rotation     FLOAT DEFAULT 0,
  status       desk_status DEFAULT 'offline',
  agent        TEXT,
  extension    TEXT,
  campaign     TEXT,
  is_locked    BOOLEAN DEFAULT FALSE,
  custom_color TEXT,
  metadata     JSONB DEFAULT '{}',
  created_by   UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (layout_id, desk_number)
);

CREATE TRIGGER desks_updated_at
  BEFORE UPDATE ON desks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Índices para performance
CREATE INDEX idx_desks_layout    ON desks(layout_id);
CREATE INDEX idx_desks_zone      ON desks(zone_id);
CREATE INDEX idx_desks_status    ON desks(status);
CREATE INDEX idx_desks_company   ON desks(company_id);
CREATE INDEX idx_zones_layout    ON zones(layout_id);
CREATE INDEX idx_layouts_company ON layouts(company_id);
CREATE INDEX idx_layouts_floor   ON layouts(floor_id);

-- ============================================================
-- TABLA: desk_history (historial de estados)
-- ============================================================
CREATE TABLE desk_history (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  desk_id      UUID NOT NULL REFERENCES desks(id) ON DELETE CASCADE,
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  status       desk_status,
  agent        TEXT,
  campaign     TEXT,
  extension    TEXT,
  changed_by   UUID REFERENCES auth.users(id),
  changed_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_desk_history_desk ON desk_history(desk_id);
CREATE INDEX idx_desk_history_at   ON desk_history(changed_at DESC);

-- Auto-guardar historial al cambiar estado
CREATE OR REPLACE FUNCTION record_desk_history()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status
  OR OLD.agent  IS DISTINCT FROM NEW.agent THEN
    INSERT INTO desk_history (desk_id, company_id, status, agent, campaign, extension)
    VALUES (NEW.id, NEW.company_id, NEW.status, NEW.agent, NEW.campaign, NEW.extension);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER desk_history_trigger
  AFTER UPDATE ON desks
  FOR EACH ROW EXECUTE FUNCTION record_desk_history();

-- ============================================================
-- TABLA: audit_logs
-- ============================================================
CREATE TABLE audit_logs (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id   UUID REFERENCES companies(id) ON DELETE SET NULL,
  user_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action       audit_action NOT NULL,
  entity_type  TEXT,                        -- 'desk', 'zone', 'layout'
  entity_id    UUID,
  before_data  JSONB,
  after_data   JSONB,
  ip_address   INET,
  user_agent   TEXT,
  metadata     JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_company ON audit_logs(company_id);
CREATE INDEX idx_audit_user    ON audit_logs(user_id);
CREATE INDEX idx_audit_action  ON audit_logs(action);
CREATE INDEX idx_audit_at      ON audit_logs(created_at DESC);

-- ============================================================
-- TABLA: layout_collaborators (quién puede editar cada layout)
-- ============================================================
CREATE TABLE layout_collaborators (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  layout_id   UUID NOT NULL REFERENCES layouts(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        user_role DEFAULT 'viewer',
  invited_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (layout_id, user_id)
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE companies            ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE buildings            ENABLE ROW LEVEL SECURITY;
ALTER TABLE floors               ENABLE ROW LEVEL SECURITY;
ALTER TABLE layouts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE zones                ENABLE ROW LEVEL SECURITY;
ALTER TABLE desks                ENABLE ROW LEVEL SECURITY;
ALTER TABLE desk_history         ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE layout_collaborators ENABLE ROW LEVEL SECURITY;

-- ── Helper: obtener company_id del usuario autenticado ──────
CREATE OR REPLACE FUNCTION my_company_id()
RETURNS UUID AS $$
  SELECT company_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ── Helper: obtener rol del usuario autenticado ─────────────
CREATE OR REPLACE FUNCTION my_role()
RETURNS user_role AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ── profiles ────────────────────────────────────────────────
CREATE POLICY "profiles: ver el propio" ON profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "profiles: ver misma empresa" ON profiles
  FOR SELECT USING (company_id = my_company_id());

CREATE POLICY "profiles: actualizar el propio" ON profiles
  FOR UPDATE USING (id = auth.uid());

-- ── companies ───────────────────────────────────────────────
CREATE POLICY "companies: ver la propia" ON companies
  FOR SELECT USING (id = my_company_id());

CREATE POLICY "companies: admin actualiza" ON companies
  FOR UPDATE USING (id = my_company_id() AND my_role() = 'admin');

-- ── buildings ───────────────────────────────────────────────
CREATE POLICY "buildings: ver de la empresa" ON buildings
  FOR SELECT USING (company_id = my_company_id());

CREATE POLICY "buildings: admin/supervisor gestiona" ON buildings
  FOR ALL USING (
    company_id = my_company_id()
    AND my_role() IN ('admin', 'supervisor')
  );

-- ── floors ──────────────────────────────────────────────────
CREATE POLICY "floors: ver de la empresa" ON floors
  FOR SELECT USING (company_id = my_company_id());

CREATE POLICY "floors: admin/supervisor gestiona" ON floors
  FOR ALL USING (
    company_id = my_company_id()
    AND my_role() IN ('admin', 'supervisor')
  );

-- ── layouts ─────────────────────────────────────────────────
CREATE POLICY "layouts: ver de la empresa" ON layouts
  FOR SELECT USING (company_id = my_company_id());

CREATE POLICY "layouts: colaborador puede ver" ON layouts
  FOR SELECT USING (
    id IN (
      SELECT layout_id FROM layout_collaborators WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "layouts: editor/admin/supervisor crea" ON layouts
  FOR INSERT WITH CHECK (
    company_id = my_company_id()
    AND my_role() IN ('admin', 'supervisor', 'editor')
  );

CREATE POLICY "layouts: propietario o admin edita" ON layouts
  FOR UPDATE USING (
    company_id = my_company_id()
    AND (created_by = auth.uid() OR my_role() IN ('admin', 'supervisor'))
  );

CREATE POLICY "layouts: admin elimina" ON layouts
  FOR DELETE USING (
    company_id = my_company_id()
    AND my_role() IN ('admin', 'supervisor')
  );

-- ── zones ───────────────────────────────────────────────────
CREATE POLICY "zones: ver de la empresa" ON zones
  FOR SELECT USING (company_id = my_company_id());

CREATE POLICY "zones: editor gestiona" ON zones
  FOR ALL USING (
    company_id = my_company_id()
    AND my_role() IN ('admin', 'supervisor', 'editor')
  );

-- ── desks ───────────────────────────────────────────────────
CREATE POLICY "desks: ver de la empresa" ON desks
  FOR SELECT USING (company_id = my_company_id());

CREATE POLICY "desks: editor gestiona" ON desks
  FOR ALL USING (
    company_id = my_company_id()
    AND my_role() IN ('admin', 'supervisor', 'editor')
  );

-- ── desk_history ────────────────────────────────────────────
CREATE POLICY "desk_history: ver de la empresa" ON desk_history
  FOR SELECT USING (company_id = my_company_id());

-- ── audit_logs ──────────────────────────────────────────────
CREATE POLICY "audit_logs: admin/supervisor ve" ON audit_logs
  FOR SELECT USING (
    company_id = my_company_id()
    AND my_role() IN ('admin', 'supervisor')
  );

-- ── layout_collaborators ────────────────────────────────────
CREATE POLICY "collaborators: ver los propios" ON layout_collaborators
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "collaborators: admin invita" ON layout_collaborators
  FOR INSERT WITH CHECK (
    my_role() IN ('admin', 'supervisor')
  );

-- ============================================================
-- FUNCIÓN: obtener estadísticas del layout
-- ============================================================
CREATE OR REPLACE FUNCTION get_layout_stats(p_layout_id UUID)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total',   COUNT(*),
    'online',  COUNT(*) FILTER (WHERE status = 'online'),
    'busy',    COUNT(*) FILTER (WHERE status = 'busy'),
    'pause',   COUNT(*) FILTER (WHERE status = 'pause'),
    'offline', COUNT(*) FILTER (WHERE status = 'offline'),
    'error',   COUNT(*) FILTER (WHERE status = 'error')
  ) INTO result
  FROM desks
  WHERE layout_id = p_layout_id;
  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================
-- REALTIME: habilitar tablas para suscripciones
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE desks;
ALTER PUBLICATION supabase_realtime ADD TABLE zones;
ALTER PUBLICATION supabase_realtime ADD TABLE layouts;
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;

-- ============================================================
-- FUNCIÓN: crear empresa para usuario recién registrado
-- SECURITY DEFINER para bypassar RLS al momento del registro
-- ============================================================
CREATE OR REPLACE FUNCTION create_company_for_user(
  p_user_id UUID,
  p_company_name TEXT,
  p_full_name TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_slug TEXT;
  v_company companies%ROWTYPE;
BEGIN
  v_slug := lower(regexp_replace(p_company_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);
  v_slug := v_slug || '-' || floor(extract(epoch from now()))::text;

  INSERT INTO companies (name, slug)
  VALUES (p_company_name, v_slug)
  RETURNING * INTO v_company;

  UPDATE profiles
  SET
    company_id = v_company.id,
    role = 'admin',
    full_name = COALESCE(p_full_name, full_name)
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'company_id', v_company.id,
    'company_name', v_company.name,
    'slug', v_company.slug
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
