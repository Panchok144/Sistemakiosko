-- ==========================================================
-- MIGRACIÓN 10: Facturas de Compra (SÍ suman stock)
-- Ejecutar en la consola SQL de Neon / PostgreSQL
-- ==========================================================

BEGIN;

CREATE TABLE IF NOT EXISTS facturas_compra (
  id              BIGSERIAL PRIMARY KEY,
  numero          VARCHAR(30),         -- Número de factura del proveedor, ej: A-0001-00001234
  proveedor_id    INTEGER REFERENCES proveedores(id) ON DELETE SET NULL,
  proveedor_nombre VARCHAR(200),        -- Snapshot del proveedor
  fecha_emision   DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_vencimiento DATE,
  subtotal_neto   NUMERIC(12,2) NOT NULL DEFAULT 0,
  iva_monto       NUMERIC(12,2) NOT NULL DEFAULT 0,
  total           NUMERIC(12,2) NOT NULL DEFAULT 0,
  metodo_pago     VARCHAR(20) DEFAULT 'efectivo'
                  CHECK (metodo_pago IN ('efectivo','tarjeta','transferencia','cheque','cuenta_corriente')),
  estado          VARCHAR(20) DEFAULT 'pendiente'
                  CHECK (estado IN ('pendiente','pagada','vencida','anulada')),
  -- Cuando la factura se "recibe", el stock de todos sus ítems sube
  recibida        BOOLEAN DEFAULT FALSE,
  recibida_at     TIMESTAMPTZ,
  notas           TEXT,
  usuario_id      INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  comercio_id     INTEGER NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fc_comercio  ON facturas_compra(comercio_id);
CREATE INDEX IF NOT EXISTS idx_fc_proveedor ON facturas_compra(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_fc_fecha     ON facturas_compra(fecha_emision DESC);

CREATE TABLE IF NOT EXISTS facturas_compra_items (
  id                BIGSERIAL PRIMARY KEY,
  factura_compra_id BIGINT NOT NULL REFERENCES facturas_compra(id) ON DELETE CASCADE,
  producto_id       INTEGER REFERENCES productos(id) ON DELETE SET NULL,
  nombre_producto   VARCHAR(200) NOT NULL, -- Snapshot en caso de que el producto se elimine
  cantidad          INTEGER NOT NULL CHECK (cantidad > 0),
  precio_unitario   NUMERIC(12,2) NOT NULL CHECK (precio_unitario >= 0),
  iva_porcentaje    NUMERIC(5,2) DEFAULT 21,
  subtotal          NUMERIC(12,2) NOT NULL DEFAULT 0  -- cantidad * precio_unitario
);
CREATE INDEX IF NOT EXISTS idx_fci_factura ON facturas_compra_items(factura_compra_id);

COMMIT;
