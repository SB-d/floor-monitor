-- ============================================================
-- Migration 002: Super Admin, RBAC, Bootstrap, Registration Fix
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 001_initial_schema.sql
-- ============================================================

-- ── 1. Agregar super_admin al enum de roles ──────────────────
-- PostgreSQL no permite ALTER TYPE ADD VALUE dentro de una transacción
-- con DDL previo, así que lo hacemos directamente.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin' BEFORE 'admin';

-- ── 2. Tabla de bootstrap (primer super admin) ───────────────
-- Controla si ya existe un super_admin en el sistema.
-- La función de registro consulta esta tabla para decidir el rol inicial.
CREATE TABLE IF NOT EXISTS system_config (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO system_config (key, value)
VALUES ('bootstrap_completed', 'false')
ON CONFLICT (key) DO NOTHING;

-- ── 3. Actualizar helper my_role() para incluir super_admin ──
CREATE OR REPLACE FUNCTION my_role()
RETURNS user_role AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ── 4. Helper: verificar si el usuario es super_admin ────────
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ── 5. Helper: verificar si bootstrap está completo ──────────
CREATE OR REPLACE FUNCTION bootstrap_completed()
RETURNS BOOLEAN AS $$
  SELECT value = 'true' FROM system_config WHERE key = 'bootstrap_completed';
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ── 6. Función de registro mejorada ─────────────────────────
-- Si es el primer usuario → super_admin sin empresa
-- Si ya hay super_admin → requiere companyName
CREATE OR REPLACE FUNCTION create_company_for_user(
  p_user_id      UUID,
  p_company_name TEXT,
  p_full_name    TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_slug         TEXT;
  v_company      companies%ROWTYPE;
  v_is_bootstrap BOOLEAN;
  v_assigned_role user_role;
BEGIN
  -- Verificar si es bootstrap (primer super_admin)
  SELECT NOT bootstrap_completed() INTO v_is_bootstrap;

  IF v_is_bootstrap THEN
    -- Primer usuario del sistema: se convierte en super_admin
    UPDATE profiles
    SET
      role      = 'super_admin',
      full_name = COALESCE(p_full_name, full_name)
    WHERE id = p_user_id;

    -- Marcar bootstrap como completado
    UPDATE system_config SET value = 'true', updated_at = NOW()
    WHERE key = 'bootstrap_completed';

    RETURN jsonb_build_object(
      'role',    'super_admin',
      'message', 'Super Admin creado. Sistema inicializado.'
    );
  END IF;

  -- Usuario normal: crear empresa
  IF p_company_name IS NULL OR trim(p_company_name) = '' THEN
    RAISE EXCEPTION 'company_name es requerido';
  END IF;

  v_slug := lower(regexp_replace(p_company_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);
  v_slug := v_slug || '-' || floor(extract(epoch from now()))::text;

  INSERT INTO companies (name, slug)
  VALUES (p_company_name, v_slug)
  RETURNING * INTO v_company;

  UPDATE profiles
  SET
    company_id = v_company.id,
    role       = 'admin',
    full_name  = COALESCE(p_full_name, full_name)
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'company_id',   v_company.id,
    'company_name', v_company.name,
    'slug',         v_company.slug,
    'role',         'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 7. Función: crear usuario desde panel admin ──────────────
CREATE OR REPLACE FUNCTION admin_create_user_profile(
  p_user_id   UUID,
  p_full_name TEXT,
  p_role      user_role,
  p_company_id UUID
)
RETURNS VOID AS $$
BEGIN
  -- Solo super_admin o admin de la misma empresa puede hacer esto
  IF NOT (
    my_role() = 'super_admin'
    OR (my_role() = 'admin' AND my_company_id() = p_company_id)
  ) THEN
    RAISE EXCEPTION 'Sin permisos para crear usuarios';
  END IF;

  -- super_admin no puede ser asignado por admin normal
  IF p_role = 'super_admin' AND my_role() != 'super_admin' THEN
    RAISE EXCEPTION 'Solo super_admin puede crear otro super_admin';
  END IF;

  UPDATE profiles
  SET
    full_name  = p_full_name,
    role       = p_role,
    company_id = p_company_id
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 8. Función: cambiar rol de usuario ───────────────────────
CREATE OR REPLACE FUNCTION change_user_role(
  p_target_user_id UUID,
  p_new_role       user_role
)
RETURNS VOID AS $$
DECLARE
  v_target_role user_role;
BEGIN
  SELECT role INTO v_target_role FROM profiles WHERE id = p_target_user_id;

  -- Nadie puede tocar a otro super_admin excepto un super_admin
  IF v_target_role = 'super_admin' AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Sin permisos para modificar un super_admin';
  END IF;

  -- Solo super_admin puede asignar rol super_admin
  IF p_new_role = 'super_admin' AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Solo super_admin puede asignar ese rol';
  END IF;

  -- Admin solo puede cambiar roles en su empresa
  IF my_role() = 'admin' THEN
    IF NOT EXISTS (
      SELECT 1 FROM profiles
      WHERE id = p_target_user_id AND company_id = my_company_id()
    ) THEN
      RAISE EXCEPTION 'Usuario no pertenece a tu empresa';
    END IF;
  END IF;

  UPDATE profiles SET role = p_new_role WHERE id = p_target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 9. Función: desactivar usuario ───────────────────────────
CREATE OR REPLACE FUNCTION deactivate_user(p_target_user_id UUID)
RETURNS VOID AS $$
BEGIN
  IF NOT (my_role() IN ('super_admin', 'admin')) THEN
    RAISE EXCEPTION 'Sin permisos';
  END IF;

  IF my_role() = 'admin' THEN
    IF NOT EXISTS (
      SELECT 1 FROM profiles
      WHERE id = p_target_user_id AND company_id = my_company_id()
    ) THEN
      RAISE EXCEPTION 'Usuario no pertenece a tu empresa';
    END IF;
  END IF;

  UPDATE profiles SET is_active = FALSE WHERE id = p_target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 10. Función: listar usuarios (por empresa o todos para super_admin) ──
CREATE OR REPLACE FUNCTION list_users(p_company_id UUID DEFAULT NULL)
RETURNS TABLE (
  id          UUID,
  full_name   TEXT,
  avatar_url  TEXT,
  role        user_role,
  is_active   BOOLEAN,
  last_seen   TIMESTAMPTZ,
  company_id  UUID,
  company_name TEXT,
  email       TEXT,
  created_at  TIMESTAMPTZ
) AS $$
BEGIN
  IF my_role() = 'super_admin' THEN
    RETURN QUERY
      SELECT
        p.id, p.full_name, p.avatar_url, p.role, p.is_active, p.last_seen,
        p.company_id, c.name AS company_name,
        u.email, p.created_at
      FROM profiles p
      LEFT JOIN companies c ON c.id = p.company_id
      LEFT JOIN auth.users u ON u.id = p.id
      WHERE (p_company_id IS NULL OR p.company_id = p_company_id)
      ORDER BY p.created_at DESC;

  ELSIF my_role() = 'admin' THEN
    RETURN QUERY
      SELECT
        p.id, p.full_name, p.avatar_url, p.role, p.is_active, p.last_seen,
        p.company_id, c.name AS company_name,
        u.email, p.created_at
      FROM profiles p
      LEFT JOIN companies c ON c.id = p.company_id
      LEFT JOIN auth.users u ON u.id = p.id
      WHERE p.company_id = my_company_id()
      ORDER BY p.created_at DESC;

  ELSE
    RAISE EXCEPTION 'Sin permisos para listar usuarios';
  END IF;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ── 11. Actualizar RLS: policies para super_admin ────────────

-- system_config: solo super_admin puede ver/modificar
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "system_config: super_admin lee" ON system_config
  FOR SELECT USING (is_super_admin());

CREATE POLICY "system_config: super_admin modifica" ON system_config
  FOR ALL USING (is_super_admin());

-- La función bootstrap_completed es SECURITY DEFINER, no necesita policy

-- profiles: super_admin puede ver todos
CREATE POLICY "profiles: super_admin ve todos" ON profiles
  FOR SELECT USING (is_super_admin());

CREATE POLICY "profiles: super_admin modifica todos" ON profiles
  FOR UPDATE USING (is_super_admin());

-- companies: super_admin puede ver y gestionar todas
CREATE POLICY "companies: super_admin gestiona" ON companies
  FOR ALL USING (is_super_admin());

-- layouts: super_admin puede ver todos
CREATE POLICY "layouts: super_admin ve todos" ON layouts
  FOR ALL USING (is_super_admin());

-- desks: super_admin puede ver todos
CREATE POLICY "desks: super_admin gestiona" ON desks
  FOR ALL USING (is_super_admin());

-- zones: super_admin puede ver todas
CREATE POLICY "zones: super_admin gestiona" ON zones
  FOR ALL USING (is_super_admin());

-- audit_logs: super_admin ve todo
CREATE POLICY "audit_logs: super_admin ve todo" ON audit_logs
  FOR SELECT USING (is_super_admin());

-- ── 12. Trigger: registrar login/logout en audit_logs ────────
CREATE OR REPLACE FUNCTION log_auth_event()
RETURNS TRIGGER AS $$
BEGIN
  -- Esta función se llama desde el servidor via RPC, no como trigger de auth
  -- (auth.users no permite triggers en Supabase managed)
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- RPC para registrar login desde el cliente
CREATE OR REPLACE FUNCTION log_login()
RETURNS VOID AS $$
DECLARE
  v_company_id UUID;
BEGIN
  SELECT company_id INTO v_company_id FROM profiles WHERE id = auth.uid();

  INSERT INTO audit_logs (company_id, user_id, action, entity_type, entity_id)
  VALUES (v_company_id, auth.uid(), 'user_login', 'user', auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION log_logout()
RETURNS VOID AS $$
DECLARE
  v_company_id UUID;
BEGIN
  SELECT company_id INTO v_company_id FROM profiles WHERE id = auth.uid();

  INSERT INTO audit_logs (company_id, user_id, action, entity_type, entity_id)
  VALUES (v_company_id, auth.uid(), 'user_logout', 'user', auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 13. Actualizar last_seen al hacer login ──────────────────
CREATE OR REPLACE FUNCTION update_last_seen()
RETURNS VOID AS $$
BEGIN
  UPDATE profiles SET last_seen = NOW() WHERE id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── NOTA FINAL ───────────────────────────────────────────────
-- Después de ejecutar esta migración:
-- 1. El primer usuario que se registre se convierte en super_admin
-- 2. Los super_admin NO tienen empresa asignada por defecto
-- 3. Un admin puede gestionar usuarios de su empresa
-- 4. Solo super_admin puede gestionar todas las empresas
