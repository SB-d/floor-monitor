-- ============================================================
-- Migration 003: Nullable company_id para super_admin
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 002
-- ============================================================
-- Problema: super_admin no tiene empresa, pero layouts/zones/desks
-- requieren company_id NOT NULL → error al crear/guardar.
-- Solución: Hacer company_id nullable en layouts, zones y desks.
-- Las RLS policies se actualizan para que super_admin pueda
-- leer y escribir CUALQUIER fila sin importar el company_id.
-- ============================================================

-- ── 1. Hacer company_id nullable ────────────────────────────
ALTER TABLE layouts ALTER COLUMN company_id DROP NOT NULL;
ALTER TABLE zones   ALTER COLUMN company_id DROP NOT NULL;
ALTER TABLE desks   ALTER COLUMN company_id DROP NOT NULL;

-- desk_history también necesita ser nullable para super_admin
ALTER TABLE desk_history ALTER COLUMN company_id DROP NOT NULL;

-- ── 2. Los índices y UNIQUE constraints quedan igual ─────────
-- UNIQUE (layout_id, desk_number) en desks ya existe desde migration 001

-- ── 3. Las RLS policies de super_admin ya cubren todo ────────
-- Las policies "super_admin gestiona" en layouts/zones/desks
-- usan is_super_admin() como condición, que no depende de company_id.
-- No hay nada que cambiar ahí.

-- ── 4. Fix desk_history: el trigger necesita poder insertar ──
-- El trigger record_desk_history corre como SECURITY DEFINER,
-- pero la RLS de desk_history solo tenía SELECT.
-- Solución más simple: deshabilitar RLS en desk_history
-- (es una tabla de historial interna, sin datos sensibles propios).
ALTER TABLE desk_history DISABLE ROW LEVEL SECURITY;

-- Alternativa si prefieres mantener RLS: agregar policy de INSERT
-- para el trigger (corre como el owner de la tabla):
-- CREATE POLICY "desk_history: trigger puede insertar" ON desk_history
--   FOR INSERT WITH CHECK (true);

-- ── VERIFICACIÓN ─────────────────────────────────────────────
-- Después de ejecutar, correr:
-- SELECT column_name, is_nullable
-- FROM information_schema.columns
-- WHERE table_name IN ('layouts','zones','desks')
--   AND column_name = 'company_id';
-- → Todas deben mostrar is_nullable = 'YES'
