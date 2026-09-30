-- ============================================================
-- Migracion 021: Vencimientos, Conteos, Permisos (M7, M8, M11)
-- ============================================================

BEGIN;

-- ── M7: Lotes / Vencimientos ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS producto_lotes (
  id             SERIAL PRIMARY KEY,
  producto_id    INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  comercio_id    INTEGER NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
  numero_lote    VARCHAR(80),
  cantidad       INTEGER NOT NULL DEFAULT 0 CHECK (cantidad >= 0),
  fecha_vencimiento DATE NOT NULL,
  alerta_dias    INTEGER NOT NULL DEFAULT 30,
  usuario_id     INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lotes_comercio_venc
  ON producto_lotes (comercio_id, fecha_vencimiento ASC);

CREATE INDEX IF NOT EXISTS idx_lotes_producto
  ON producto_lotes (producto_id);

-- ── M8: Conteos de inventario fisico ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conteos_inventario (
  id           SERIAL PRIMARY KEY,
  comercio_id  INTEGER NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
  usuario_id   INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  nombre       VARCHAR(120) NOT NULL DEFAULT 'Conteo sin nombre',
  estado       VARCHAR(20) NOT NULL DEFAULT 'en_progreso'
               CHECK (estado IN ('en_progreso', 'cerrado', 'cancelado')),
  notas        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cerrado_at   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS conteo_items (
  id              SERIAL PRIMARY KEY,
  conteo_id       INTEGER NOT NULL REFERENCES conteos_inventario(id) ON DELETE CASCADE,
  producto_id     INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  comercio_id     INTEGER NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
  cantidad_sistema INTEGER NOT NULL DEFAULT 0,
  cantidad_fisica  INTEGER,
  diferencia       INTEGER GENERATED ALWAYS AS
    (COALESCE(cantidad_fisica, 0) - cantidad_sistema) STORED,
  CONSTRAINT uq_conteo_producto UNIQUE (conteo_id, producto_id)
);

CREATE INDEX IF NOT EXISTS idx_conteo_items_conteo
  ON conteo_items (conteo_id);

-- ── M11: Permisos granulares por rol ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS permisos_rol (
  id          SERIAL PRIMARY KEY,
  comercio_id INTEGER NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
  rol         VARCHAR(40) NOT NULL,
  recurso     VARCHAR(80) NOT NULL,
  accion      VARCHAR(40) NOT NULL,
  activo      BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT uq_permiso_rol_recurso_accion UNIQUE (comercio_id, rol, recurso, accion)
);

CREATE INDEX IF NOT EXISTS idx_permisos_rol_comercio
  ON permisos_rol (comercio_id, rol);

-- Seed: permisos por defecto para administradores y dueños
INSERT INTO permisos_rol (comercio_id, rol, recurso, accion, activo)
SELECT 1, r, rec, acc, true
FROM (VALUES ('administrador'), ('dueno'), ('superadmin')) AS roles(r)
CROSS JOIN (VALUES ('ventas'), ('productos'), ('caja'), ('reportes'), ('clientes'), ('inventario'), ('ordenes_compra'), ('configuracion'), ('usuarios'), ('flag')) AS recursos(rec)
CROSS JOIN (VALUES ('leer'), ('crear'), ('editar'), ('eliminar'), ('exportar'), ('descuento'), ('devolucion'), ('ver_costos'), ('cerrar_caja'), ('cambiar_precios'), ('crear_usuarios')) AS acciones(acc)
ON CONFLICT (comercio_id, rol, recurso, accion) DO NOTHING;

-- Seed: permisos por defecto para empleados
INSERT INTO permisos_rol (comercio_id, rol, recurso, accion, activo)
SELECT 1, 'empleado', rec, acc, true
FROM (VALUES ('ventas'), ('productos'), ('caja'), ('clientes')) AS recursos(rec)
CROSS JOIN (VALUES ('leer'), ('crear')) AS acciones(acc)
ON CONFLICT (comercio_id, rol, recurso, accion) DO NOTHING;

-- Columna para timeout inactividad en configuracion (M12)
INSERT INTO configuracion (comercio_id, clave, valor)
VALUES (1, 'timeout_inactividad_minutos', '15')
ON CONFLICT (comercio_id, clave) DO NOTHING;

COMMIT;
