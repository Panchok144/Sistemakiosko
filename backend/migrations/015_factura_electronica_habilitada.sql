-- ============================================================
-- Migración 015: Flag factura_electronica_habilitada y campos de reintento CAE
-- ============================================================

-- 1. Flag en tabla de configuracion por comercio
INSERT INTO configuracion (comercio_id, clave, valor)
SELECT id, 'factura_electronica_habilitada', 'false'
FROM comercios
ON CONFLICT (comercio_id, clave) DO NOTHING;

-- 2. Columnas en ventas para seguimiento de reintentos y errores de AFIP
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS reintentos_cae INTEGER DEFAULT 0;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS error_afip_detalle TEXT;

-- 3. Índice para optimizar consultas de ventas pendientes de CAE o con error
CREATE INDEX IF NOT EXISTS idx_ventas_estado_comercio
  ON ventas (comercio_id, estado);
