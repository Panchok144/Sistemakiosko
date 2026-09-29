-- ============================================================
-- Migración 014: Configuración de límites de descuento por rol
-- y tabla de alertas de seguridad
-- ============================================================

-- 1. Tabla de límites de descuento por rol y comercio
CREATE TABLE IF NOT EXISTS roles_descuento_config (
  id                    SERIAL PRIMARY KEY,
  comercio_id           INTEGER NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
  rol                   VARCHAR(40) NOT NULL,
  descuento_maximo_porc NUMERIC(5,2) NOT NULL DEFAULT 10,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_rol_comercio UNIQUE (comercio_id, rol)
);

CREATE INDEX IF NOT EXISTS idx_roles_desc_comercio ON roles_descuento_config(comercio_id);

-- 2. Sembrar límites por defecto para cada comercio existente
INSERT INTO roles_descuento_config (comercio_id, rol, descuento_maximo_porc)
SELECT c.id, r.rol, r.descuento_maximo_porc
FROM comercios c
CROSS JOIN (
  VALUES 
    ('empleado', 10.00),
    ('cajero', 10.00),
    ('encargado', 25.00),
    ('supervisor', 25.00),
    ('administrador', 100.00),
    ('dueno', 100.00),
    ('superadmin', 100.00)
) AS r(rol, descuento_maximo_porc)
ON CONFLICT (comercio_id, rol) DO NOTHING;

-- 3. PIN de supervisor en usuarios para autorizaciones en el POS
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS pin_supervisor VARCHAR(100);

-- 4. Tabla de alertas de seguridad
CREATE TABLE IF NOT EXISTS alertas_seguridad (
  id          SERIAL PRIMARY KEY,
  comercio_id INTEGER NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
  usuario_id  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  tipo        VARCHAR(50) NOT NULL,
  descripcion TEXT NOT NULL,
  detalles    JSONB,
  fecha       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alertas_seg_comercio ON alertas_seguridad(comercio_id);
