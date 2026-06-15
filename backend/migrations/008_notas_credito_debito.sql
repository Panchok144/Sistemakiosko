-- ==========================================================
-- MIGRACIÓN 8: Notas de Crédito y Débito
-- Ejecutar en la consola SQL de Neon / PostgreSQL
-- ==========================================================

BEGIN;

CREATE TABLE IF NOT EXISTS notas_credito_debito (
  id              BIGSERIAL PRIMARY KEY,
  tipo            VARCHAR(7) NOT NULL CHECK (tipo IN ('credito', 'debito')),
  -- Para notas de crédito: reduce la deuda o revierte una venta
  -- Para notas de débito: aplica intereses u otros cargos adicionales
  numero          INTEGER,
  venta_id        BIGINT REFERENCES ventas(id) ON DELETE SET NULL,
  cliente_id      INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
  motivo          TEXT NOT NULL,
  subtotal_neto   NUMERIC(12,2) NOT NULL DEFAULT 0,
  iva_monto       NUMERIC(12,2) NOT NULL DEFAULT 0,
  total           NUMERIC(12,2) NOT NULL,
  afecta_stock    BOOLEAN DEFAULT FALSE,
  -- Datos del cliente al momento de emisión (snapshot)
  cliente_nombre  VARCHAR(200),
  cliente_cuit    VARCHAR(20),
  -- Estado y facturación electrónica
  estado          VARCHAR(20) DEFAULT 'emitida' CHECK (estado IN ('emitida', 'anulada')),
  cae             TEXT,
  cae_vencimiento TIMESTAMPTZ,
  usuario_id      INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  comercio_id     INTEGER NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ncd_comercio    ON notas_credito_debito(comercio_id);
CREATE INDEX IF NOT EXISTS idx_ncd_cliente     ON notas_credito_debito(cliente_id);
CREATE INDEX IF NOT EXISTS idx_ncd_venta       ON notas_credito_debito(venta_id);

-- Tabla de ítems de la nota (cuando afecta_stock = true)
CREATE TABLE IF NOT EXISTS notas_credito_debito_items (
  id          BIGSERIAL PRIMARY KEY,
  nota_id     BIGINT NOT NULL REFERENCES notas_credito_debito(id) ON DELETE CASCADE,
  producto_id INTEGER REFERENCES productos(id) ON DELETE SET NULL,
  nombre      VARCHAR(200) NOT NULL,
  cantidad    INTEGER NOT NULL DEFAULT 1,
  precio_unitario NUMERIC(12,2) NOT NULL,
  iva_porcentaje  NUMERIC(5,2) DEFAULT 21
);

COMMIT;
