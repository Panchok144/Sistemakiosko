-- ==========================================================
-- MIGRACIÓN 2: Tablas de Devoluciones
-- Ejecutar en la consola SQL de Neon / PostgreSQL
-- ==========================================================

CREATE TABLE IF NOT EXISTS devoluciones (
  id             SERIAL PRIMARY KEY,
  venta_id       INTEGER REFERENCES ventas(id) ON DELETE SET NULL,
  usuario_id     INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  comercio_id    INTEGER NOT NULL,
  motivo         TEXT,
  total_devuelto NUMERIC(10,2) NOT NULL DEFAULT 0,
  devuelto_caja  BOOLEAN DEFAULT FALSE,
  estado         VARCHAR(20) DEFAULT 'procesada',
  fecha          TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS devolucion_items (
  id              SERIAL PRIMARY KEY,
  devolucion_id   INTEGER NOT NULL REFERENCES devoluciones(id) ON DELETE CASCADE,
  producto_id     INTEGER REFERENCES productos(id) ON DELETE SET NULL,
  nombre_producto VARCHAR(200) NOT NULL,
  cantidad        INTEGER NOT NULL,
  precio_unitario NUMERIC(10,2) NOT NULL,
  subtotal        NUMERIC(10,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_devoluciones_comercio ON devoluciones(comercio_id);
CREATE INDEX IF NOT EXISTS idx_devoluciones_venta ON devoluciones(venta_id);
