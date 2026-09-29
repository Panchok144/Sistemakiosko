-- ============================================================
-- Migración 017: Tabla de idempotencia para ventas (A3)
-- ============================================================

CREATE TABLE IF NOT EXISTS ventas_idempotencia (
  id           SERIAL PRIMARY KEY,
  clave        TEXT NOT NULL,
  comercio_id  INTEGER NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
  id_venta     INTEGER NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
  response_body JSONB,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_idempotencia_clave_comercio UNIQUE (clave, comercio_id)
);

CREATE INDEX IF NOT EXISTS idx_idempotencia_clave 
  ON ventas_idempotencia (clave);

CREATE INDEX IF NOT EXISTS idx_idempotencia_created 
  ON ventas_idempotencia (created_at);
