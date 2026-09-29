-- ============================================================
-- Migración 018: Pagos divididos / mixtos (A4) y Ajustes de Stock (A1)
-- ============================================================

-- 1. Tabla de pagos detallados por venta para soportar pagos mixtos
CREATE TABLE IF NOT EXISTS ventas_pagos (
  id           SERIAL PRIMARY KEY,
  venta_id     INTEGER NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
  comercio_id  INTEGER NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
  metodo       VARCHAR(40) NOT NULL CHECK (metodo IN (
    'efectivo', 'tarjeta', 'tarjeta_debito', 'tarjeta_credito',
    'transferencia', 'qr', 'cuenta_corriente', 'otro'
  )),
  monto_cents  BIGINT NOT NULL CHECK (monto_cents > 0),
  monto        NUMERIC(12,2) NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ventas_pagos_venta 
  ON ventas_pagos (venta_id);

CREATE INDEX IF NOT EXISTS idx_ventas_pagos_comercio 
  ON ventas_pagos (comercio_id);

-- 2. Tabla de auditoría y movimientos manuales de inventario (A1)
CREATE TABLE IF NOT EXISTS movimientos_stock (
  id              SERIAL PRIMARY KEY,
  producto_id     INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  comercio_id     INTEGER NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
  usuario_id      INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  tipo            VARCHAR(30) NOT NULL, -- 'ajuste_manual', 'ingreso', 'egreso', 'rotura', 'vencimiento', 'conteo_fisico'
  cantidad        INTEGER NOT NULL,
  stock_anterior  INTEGER NOT NULL,
  stock_nuevo     INTEGER NOT NULL,
  motivo          TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mov_stock_prod 
  ON movimientos_stock (producto_id);

CREATE INDEX IF NOT EXISTS idx_mov_stock_comercio 
  ON movimientos_stock (comercio_id);
