-- ==========================================================
-- MIGRACIÓN 6: Órdenes de Compra a Proveedores
-- Ejecutar en la consola SQL de Neon / PostgreSQL
-- ==========================================================

CREATE TABLE IF NOT EXISTS ordenes_compra (
  id               SERIAL PRIMARY KEY,
  numero           INTEGER NOT NULL,
  proveedor_id     INTEGER REFERENCES proveedores(id) ON DELETE SET NULL,
  proveedor_nombre VARCHAR(200),
  estado           VARCHAR(20) DEFAULT 'borrador',  -- borrador | enviada | recibida | cancelada
  total            NUMERIC(10,2) NOT NULL DEFAULT 0,
  notas            TEXT,
  fecha_esperada   DATE,
  usuario_id       INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  comercio_id      INTEGER NOT NULL,
  created_at       TIMESTAMP DEFAULT NOW(),
  recibida_at      TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ordenes_compra_items (
  id                SERIAL PRIMARY KEY,
  orden_compra_id   INTEGER NOT NULL REFERENCES ordenes_compra(id) ON DELETE CASCADE,
  producto_id       INTEGER REFERENCES productos(id) ON DELETE SET NULL,
  nombre_producto   VARCHAR(200) NOT NULL,
  cantidad_pedida   INTEGER NOT NULL,
  cantidad_recibida INTEGER DEFAULT 0,
  precio_unitario   NUMERIC(10,2) NOT NULL DEFAULT 0,
  subtotal          NUMERIC(10,2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_oc_comercio ON ordenes_compra(comercio_id);
CREATE INDEX IF NOT EXISTS idx_oc_proveedor ON ordenes_compra(proveedor_id);
