-- ==========================================================
-- MIGRACIÓN 5: Presupuestos / Cotizaciones
-- Ejecutar en la consola SQL de Neon / PostgreSQL
-- ==========================================================

CREATE TABLE IF NOT EXISTS presupuestos (
  id                 SERIAL PRIMARY KEY,
  numero             INTEGER NOT NULL,
  cliente_id         INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
  cliente_nombre     VARCHAR(200),
  cliente_documento  VARCHAR(20),
  subtotal           NUMERIC(10,2) NOT NULL DEFAULT 0,
  descuento          NUMERIC(10,2) DEFAULT 0,
  total              NUMERIC(10,2) NOT NULL DEFAULT 0,
  estado             VARCHAR(20) DEFAULT 'pendiente',  -- pendiente | aprobado | rechazado | vencido
  valido_hasta       DATE,
  notas              TEXT,
  usuario_id         INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  comercio_id        INTEGER NOT NULL,
  created_at         TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS presupuesto_items (
  id              SERIAL PRIMARY KEY,
  presupuesto_id  INTEGER NOT NULL REFERENCES presupuestos(id) ON DELETE CASCADE,
  producto_id     INTEGER REFERENCES productos(id) ON DELETE SET NULL,
  nombre_producto VARCHAR(200) NOT NULL,
  cantidad        INTEGER NOT NULL,
  precio_unitario NUMERIC(10,2) NOT NULL,
  subtotal        NUMERIC(10,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_presupuestos_comercio ON presupuestos(comercio_id);
CREATE INDEX IF NOT EXISTS idx_presupuestos_cliente ON presupuestos(cliente_id);
