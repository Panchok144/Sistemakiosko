-- ============================================================
-- Migracion 022: Promociones, Fidelidad, Catalogo Publico (M13, M14, M15)
-- ============================================================

BEGIN;

-- ── M13: Motor de Promociones ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS promociones (
  id              SERIAL PRIMARY KEY,
  comercio_id     INTEGER NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
  nombre          VARCHAR(120) NOT NULL,
  tipo            VARCHAR(20) NOT NULL
                  CHECK (tipo IN ('2x1', 'nporx', 'pctrubro', 'pcthorario', 'pctproducto')),
  parametros      JSONB NOT NULL DEFAULT '{}',
  vigencia_desde  DATE,
  vigencia_hasta  DATE,
  dias_semana     INTEGER[] DEFAULT NULL,
  hora_desde      SMALLINT DEFAULT NULL CHECK (hora_desde IS NULL OR (hora_desde >= 0 AND hora_desde <= 23)),
  hora_hasta      SMALLINT DEFAULT NULL CHECK (hora_hasta IS NULL OR (hora_hasta >= 0 AND hora_hasta <= 23)),
  activa          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promociones_comercio
  ON promociones (comercio_id, activa);

-- ── M14: Fidelidad Simple ────────────────────────────────────────────────────
-- Columnas en clientes para puntos (solo si no existen)
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS puntos INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS puntos_canjeados INTEGER NOT NULL DEFAULT 0;

-- Tabla de movimientos de puntos (historial)
CREATE TABLE IF NOT EXISTS cliente_puntos_movimientos (
  id              SERIAL PRIMARY KEY,
  cliente_id      INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  comercio_id     INTEGER NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
  tipo            VARCHAR(20) NOT NULL CHECK (tipo IN ('acumulacion', 'canje', 'ajuste', 'vencimiento')),
  puntos          INTEGER NOT NULL,
  descripcion     TEXT,
  referencia_id   INTEGER,
  usuario_id      INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_puntos_mov_cliente
  ON cliente_puntos_movimientos (cliente_id, comercio_id);

-- Parámetros de fidelidad en configuracion:
-- 'fidelidad_habilitada' = 'true'/'false'
-- 'fidelidad_pesos_por_punto' = '100' (cada $100 = 1 punto)
-- 'fidelidad_valor_punto' = '1' (cada punto = $1 al canjear)
-- Se insertan valores por defecto si no existen
INSERT INTO configuracion (comercio_id, clave, valor)
  SELECT c.id, 'fidelidad_habilitada', 'false'
  FROM comercios c
  WHERE NOT EXISTS (
    SELECT 1 FROM configuracion
    WHERE comercio_id = c.id AND clave = 'fidelidad_habilitada'
  );

INSERT INTO configuracion (comercio_id, clave, valor)
  SELECT c.id, 'fidelidad_pesos_por_punto', '100'
  FROM comercios c
  WHERE NOT EXISTS (
    SELECT 1 FROM configuracion
    WHERE comercio_id = c.id AND clave = 'fidelidad_pesos_por_punto'
  );

INSERT INTO configuracion (comercio_id, clave, valor)
  SELECT c.id, 'fidelidad_valor_punto', '1'
  FROM comercios c
  WHERE NOT EXISTS (
    SELECT 1 FROM configuracion
    WHERE comercio_id = c.id AND clave = 'fidelidad_valor_punto'
  );

-- ── M15: Catalogo Publico ────────────────────────────────────────────────────
ALTER TABLE comercios
  ADD COLUMN IF NOT EXISTS slug_catalogo VARCHAR(80) UNIQUE,
  ADD COLUMN IF NOT EXISTS catalogo_publico_habilitado BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_comercios_slug
  ON comercios (slug_catalogo)
  WHERE slug_catalogo IS NOT NULL;

COMMIT;
