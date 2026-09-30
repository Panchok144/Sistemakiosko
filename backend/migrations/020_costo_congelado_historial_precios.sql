-- ============================================================
-- Migracion 020: Costo Unitario Congelado en detalle_ventas (M1)
-- Registra el costo del producto en el momento exacto de la venta.
-- ============================================================

BEGIN;

-- 1. Columna costo_unitario en detalle_ventas (ya agregada por 019, pero idempotente)
ALTER TABLE detalle_ventas
  ADD COLUMN IF NOT EXISTS costo_unitario NUMERIC(12,2);

-- 2. Rellenar ventas historicas (antes de M1) con el costo actual del producto
--    Solo si costo_unitario es NULL (ventas pre-migracion)
UPDATE detalle_ventas dv
SET    costo_unitario = p.costo
FROM   productos p
WHERE  dv.id_producto = p.id
  AND  dv.costo_unitario IS NULL;

-- 3. Historial de precios (para M4)
CREATE TABLE IF NOT EXISTS historial_precios (
  id             SERIAL PRIMARY KEY,
  producto_id    INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  comercio_id    INTEGER NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
  campo          VARCHAR(30) NOT NULL DEFAULT 'precio_venta',  -- 'precio_venta' | 'costo'
  precio_anterior NUMERIC(12,2) NOT NULL,
  precio_nuevo    NUMERIC(12,2) NOT NULL,
  usuario_id     INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE historial_precios
  ADD COLUMN IF NOT EXISTS campo VARCHAR(30) DEFAULT 'precio_venta',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'historial_precios' AND column_name = 'fecha') THEN
    UPDATE historial_precios SET created_at = fecha WHERE created_at IS NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_historial_precios_prod
  ON historial_precios (producto_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_historial_precios_comercio
  ON historial_precios (comercio_id, created_at DESC);

-- 4. Columna activo_pos en productos (M3: pausas en POS)
ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS activo_pos BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS pausado_hasta TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_productos_activo_pos
  ON productos (comercio_id, activo_pos)
  WHERE activo_pos = false;

COMMIT;
