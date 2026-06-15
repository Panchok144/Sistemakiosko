-- ==========================================================
-- MIGRACIÓN 3: Cuenta Corriente de Clientes
-- Ejecutar en la consola SQL de Neon / PostgreSQL
-- ==========================================================

ALTER TABLE clientes ADD COLUMN IF NOT EXISTS credito_limite NUMERIC(10,2) DEFAULT 0;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS saldo_deuda    NUMERIC(10,2) DEFAULT 0;

CREATE TABLE IF NOT EXISTS movimientos_cuenta_corriente (
  id            SERIAL PRIMARY KEY,
  cliente_id    INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  tipo          VARCHAR(30) NOT NULL,  -- 'venta_credito' | 'pago' | 'ajuste'
  monto         NUMERIC(10,2) NOT NULL,
  descripcion   TEXT,
  referencia_id INTEGER,               -- venta_id u otro, nullable
  usuario_id    INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  comercio_id   INTEGER NOT NULL,
  fecha         TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cta_cte_cliente ON movimientos_cuenta_corriente(cliente_id);
CREATE INDEX IF NOT EXISTS idx_cta_cte_comercio ON movimientos_cuenta_corriente(comercio_id);
