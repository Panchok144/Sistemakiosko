-- ==========================================================
-- MIGRACIÓN 4: Listas de Precios y Precios por Volumen
-- Ejecutar en la consola SQL de Neon / PostgreSQL
-- ==========================================================

CREATE TABLE IF NOT EXISTS listas_precios (
  id                SERIAL PRIMARY KEY,
  nombre            VARCHAR(100) NOT NULL,
  descripcion       TEXT,
  porcentaje_ajuste NUMERIC(5,2) DEFAULT 0,
  es_mayorista      BOOLEAN DEFAULT FALSE,
  activa            BOOLEAN DEFAULT TRUE,
  comercio_id       INTEGER NOT NULL,
  created_at        TIMESTAMP DEFAULT NOW()
);

-- Precios específicos por producto y lista (anula el % de ajuste)
CREATE TABLE IF NOT EXISTS productos_listas_precios (
  id               SERIAL PRIMARY KEY,
  producto_id      INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  lista_precios_id INTEGER NOT NULL REFERENCES listas_precios(id) ON DELETE CASCADE,
  precio_especial  NUMERIC(10,2),
  UNIQUE(producto_id, lista_precios_id)
);

-- Precios escalonados por cantidad (mayorista)
CREATE TABLE IF NOT EXISTS precios_volumen (
  id               SERIAL PRIMARY KEY,
  producto_id      INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  cantidad_minima  INTEGER NOT NULL,
  precio           NUMERIC(10,2) NOT NULL,
  comercio_id      INTEGER NOT NULL,
  UNIQUE(producto_id, cantidad_minima, comercio_id)
);

CREATE INDEX IF NOT EXISTS idx_listas_comercio ON listas_precios(comercio_id);
CREATE INDEX IF NOT EXISTS idx_precios_vol_prod ON precios_volumen(producto_id);
