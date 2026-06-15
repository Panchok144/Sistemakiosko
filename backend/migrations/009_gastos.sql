-- ==========================================================
-- MIGRACIÓN 9: Gastos Operativos (NO suman stock)
-- Ejecutar en la consola SQL de Neon / PostgreSQL
-- ==========================================================

BEGIN;

CREATE TABLE IF NOT EXISTS categorias_gasto (
  id          SERIAL PRIMARY KEY,
  nombre      VARCHAR(80) NOT NULL,
  comercio_id INTEGER NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_cat_gasto_nombre_comercio UNIQUE (nombre, comercio_id)
);
CREATE INDEX IF NOT EXISTS idx_cat_gasto_comercio ON categorias_gasto(comercio_id);

-- Categorías iniciales para comercio 1
INSERT INTO categorias_gasto (nombre, comercio_id) VALUES
  ('Alquiler', 1),
  ('Servicios (Luz, Gas, Internet)', 1),
  ('Sueldos y Jornales', 1),
  ('Fletes y Transporte', 1),
  ('Mantenimiento', 1),
  ('Publicidad', 1),
  ('Gastos Bancarios', 1),
  ('Otros', 1)
ON CONFLICT (nombre, comercio_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS gastos (
  id                BIGSERIAL PRIMARY KEY,
  concepto          TEXT NOT NULL,
  monto             NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  categoria_gasto_id INTEGER REFERENCES categorias_gasto(id) ON DELETE SET NULL,
  proveedor_id      INTEGER REFERENCES proveedores(id) ON DELETE SET NULL,
  metodo_pago       VARCHAR(20) DEFAULT 'efectivo' 
                    CHECK (metodo_pago IN ('efectivo','tarjeta','transferencia','cheque')),
  caja_id           INTEGER REFERENCES cajas(id) ON DELETE SET NULL,
  -- Si se paga con caja, descuenta del efectivo de esa sesión
  afecta_caja       BOOLEAN DEFAULT TRUE,
  nro_comprobante   VARCHAR(60),  -- Número de factura del proveedor
  usuario_id        INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  comercio_id       INTEGER NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
  fecha             TIMESTAMPTZ DEFAULT NOW(),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gastos_comercio ON gastos(comercio_id);
CREATE INDEX IF NOT EXISTS idx_gastos_fecha    ON gastos(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_gastos_caja     ON gastos(caja_id);

COMMIT;
