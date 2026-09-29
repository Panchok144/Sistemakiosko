-- ============================================================
-- Migración 016: Borrado lógico de productos (Soft Delete - A2)
-- ============================================================

-- 1. Columna activo para permitir desactivar sin romper FKs históricas
ALTER TABLE productos ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE;

-- 2. Índice optimizado para búsquedas activas por comercio
CREATE INDEX IF NOT EXISTS idx_productos_comercio_activo 
  ON productos (comercio_id, activo);
