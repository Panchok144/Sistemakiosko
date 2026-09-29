/**
 * demo.js — Rutas para carga y limpieza de datos de demostración
 * Solo accesible para roles: administrador, dueno
 *
 * POST /api/demo/seed   → Carga datos demo (productos, clientes, ventas 30d, caja, gastos)
 * POST /api/demo/limpiar → Borra datos de negocio sin tocar usuarios ni configuracion del comercio
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { pool } = require('../db/pgConexion');
const { autorizarRoles } = require('../middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET || 'kiosko_super_secret_jwt_key_2026';

// ── Helper utilidades ────────────────────────────────────────────────────────
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randF(min, max) { return parseFloat((Math.random() * (max - min) + min).toFixed(2)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function pickWeighted(items) {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = Math.random() * total;
  for (const i of items) { r -= i.weight; if (r <= 0) return i.value; }
  return items[items.length - 1].value;
}
function randomTimeInDay(date) {
  const d = new Date(date);
  const horaBase = pickWeighted([
    { value: rand(7, 9),   weight: 15 },
    { value: rand(10, 12), weight: 20 },
    { value: rand(12, 14), weight: 25 },
    { value: rand(15, 18), weight: 20 },
    { value: rand(18, 21), weight: 15 },
    { value: rand(21, 23), weight: 5  },
  ]);
  d.setHours(horaBase, rand(0, 59), rand(0, 59), 0);
  return d;
}

// ── Helper: Limpiar tablas con Savepoints seguros ───────────────────────────
async function limpiarTablasComercio(comercioId, client) {
  const safeDeleteQueries = [
    `DELETE FROM ventas_pagos WHERE comercio_id = $1`,
    `DELETE FROM movimientos_stock WHERE comercio_id = $1`,
    `DELETE FROM detalle_ventas WHERE comercio_id = $1`,
    `DELETE FROM devoluciones WHERE comercio_id = $1`,
    `DELETE FROM ventas WHERE comercio_id = $1`,
    `DELETE FROM movimientos_cuenta_corriente WHERE comercio_id = $1`,
    `DELETE FROM movimientos_caja WHERE comercio_id = $1`,
    `DELETE FROM cajas WHERE comercio_id = $1`,
    `DELETE FROM gastos WHERE comercio_id = $1`,
    `DELETE FROM categorias_gasto WHERE comercio_id = $1`,
    `DELETE FROM productos WHERE comercio_id = $1`,
    `DELETE FROM proveedores WHERE comercio_id = $1`,
    `DELETE FROM clientes WHERE comercio_id = $1`,
    `DELETE FROM rubros WHERE comercio_id = $1`,
  ];

  for (const q of safeDeleteQueries) {
    await client.query(`SAVEPOINT sp_del`);
    try {
      await client.query(q, [comercioId]);
      await client.query(`RELEASE SAVEPOINT sp_del`);
    } catch {
      await client.query(`ROLLBACK TO SAVEPOINT sp_del`);
    }
  }
}

// ── POST /api/demo/limpiar — Borrar datos de negocio ────────────────────────
router.post('/limpiar', autorizarRoles('administrador', 'dueno'), async (req, res) => {
  const comercioId = req.usuario?.comercio_id || 1;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await limpiarTablasComercio(comercioId, client);
    await client.query('COMMIT');
    res.json({ ok: true, mensaje: 'Datos de demostración eliminados correctamente.' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[DEMO] Error al limpiar datos:', err);
    res.status(500).json({ error: 'Error al limpiar datos demo', detalle: err.message });
  } finally {
    client.release();
  }
});

// ── Helper: Carga interna de datos demo ──────────────────────────────────────
async function seedDatosDemo(comercioId, client) {
    // 1. Limpiar datos existentes
    await limpiarTablasComercio(comercioId, client);

    // 2. Datos del comercio demo
    await client.query(`
      UPDATE comercios SET
        nombre = 'Maxikiosco Central 24hs',
        razon_social = 'Maxikiosco Central S.R.L.',
        cuit = '30-71458923-8',
        domicilio = 'Av. Corrientes 3450, CABA',
        condicion_fiscal = 'responsable_inscripto',
        punto_venta = 1,
        telefono = '011 4862-9010',
        email = 'contacto@maxikioscocentral.com',
        leyenda_ticket = '¡Gracias por su compra en Maxikiosco Central 24hs! Guarde su ticket.'
      WHERE id = $1`, [comercioId]);

    await client.query(`
      INSERT INTO configuracion (comercio_id, clave, valor) VALUES
        ($1, 'monto_minimo_identificar', '500000'),
        ($1, 'limite_variacion_precio_pct', '30'),
        ($1, 'moneda_simbolo', '$'),
        ($1, 'permitir_stock_negativo', 'false'),
        ($1, 'imprimir_ticket_auto', 'true')
      ON CONFLICT (comercio_id, clave) DO UPDATE SET valor = EXCLUDED.valor`,
      [comercioId]);

    // 3. Rubros
    const rubrosNombres = [
      'Golosinas & Chocolates', 'Bebidas & Gaseosas', 'Cervezas & Vinos',
      'Cigarrillos & Tabacos', 'Snacks & Salados', 'Galletitas & Panificados',
      'Alfajores & Masas', 'Helados & Fríos', 'Almacén & Despensa', 'Librería & Perfumería',
    ];
    for (const r of rubrosNombres) {
      await client.query('INSERT INTO rubros (nombre, comercio_id) VALUES ($1, $2)', [r, comercioId]);
    }

    // 4. Proveedores
    const proveedoresData = [
      { nombre: 'Arcor S.A.I.C.',            cuit: '30-50279317-5', telefono: '0800-333-2726', email: 'pedidos@arcor.com.ar',          domicilio: 'Av. Fulvio S. Pagani 487, Córdoba',   descripcion: 'Golosinas, chocolates y conservas' },
      { nombre: 'Coca-Cola FEMSA Argentina',  cuit: '30-65825211-1', telefono: '0800-888-2652', email: 'ventas@cocacola-femsa.com.ar',   domicilio: 'Av. Amancio Alcorta 3570, CABA',      descripcion: 'Gaseosas, aguas y jugos' },
      { nombre: 'Cervecería Quilmes',         cuit: '30-50346039-0', telefono: '0800-222-2378', email: 'pedidos@quilmes.com.ar',         domicilio: '12 de Octubre, Quilmes',              descripcion: 'Cervezas Quilmes, Stella, Corona' },
      { nombre: 'Massalin Particulares S.A.', cuit: '30-50016480-4', telefono: '011-4735-8000', email: 'distribucion@pmi.com',           domicilio: 'Av. de Mayo 650, CABA',               descripcion: 'Cigarrillos Marlboro, Chesterfield' },
      { nombre: 'Mondelēz Argentina',         cuit: '30-50109720-5', telefono: '0800-333-3333', email: 'atencion@mondelez.com',          domicilio: 'Uruguay 4075, San Fernando',          descripcion: 'Milka, Oreo, Beldent, Halls' },
      { nombre: 'Distribuidora Los Amigos',   cuit: '30-71204859-6', telefono: '011-4581-2244', email: 'mayoristalosamigos@gmail.com',   domicilio: 'Av. Juan B. Justo 4520, CABA',       descripcion: "Snacks Lay's, Doritos, Pehuamar" },
      { nombre: 'Molinos Río de la Plata',    cuit: '30-50085862-8', telefono: '0800-444-6654', email: 'ventas@molinos.com.ar',          domicilio: 'Av. Alicia Moreau de Justo 1930',     descripcion: 'Don Satur, Lucchetti, Granja del Sol' },
    ];
    const provIds = [];
    for (const p of proveedoresData) {
      const r = await client.query(
        `INSERT INTO proveedores (nombre, cuit, telefono, email, domicilio, descripcion, condicion_fiscal, comercio_id)
         VALUES ($1,$2,$3,$4,$5,$6,'responsable_inscripto',$7) RETURNING id`,
        [p.nombre, p.cuit, p.telefono, p.email, p.domicilio, p.descripcion, comercioId]
      );
      provIds.push(r.rows[0].id);
    }

    // 5. Clientes
    const clientesData = [
      { nombre: 'Consumidor Final',       documento: null,         condicion_fiscal: 'consumidor_final', limite_credito: 0 },
      { nombre: 'María González',         documento: '28456789',   condicion_fiscal: 'consumidor_final', limite_credito: 50000 },
      { nombre: 'Carlos Rodríguez',       documento: '31987654',   condicion_fiscal: 'consumidor_final', limite_credito: 80000 },
      { nombre: 'Panadería La Espiga',    documento: '20-33445566-7', condicion_fiscal: 'responsable_inscripto', limite_credito: 200000 },
      { nombre: 'Kiosco El Rincón',       documento: '27-44556677-8', condicion_fiscal: 'monotributo',          limite_credito: 150000 },
      { nombre: 'Sandra Pérez',           documento: '35112233',   condicion_fiscal: 'consumidor_final', limite_credito: 30000 },
      { nombre: 'Buffet Escuela N°45',    documento: '30-55667788-9', condicion_fiscal: 'exento',               limite_credito: 100000 },
    ];
    const clienteIds = [];
    for (const c of clientesData) {
      const r = await client.query(
        `INSERT INTO clientes (nombre, documento, condicion_fiscal, credito_limite, saldo_deuda, tiene_cuenta_corriente, comercio_id)
         VALUES ($1,$2,$3,$4,0,true,$5) RETURNING id`,
        [c.nombre, c.documento, c.condicion_fiscal, c.limite_credito, comercioId]
      );
      clienteIds.push(r.rows[0].id);
    }

    // 6. Productos (catálogo típico de kiosco — 50 SKUs)
    const productosData = [
      // Golosinas & Chocolates
      { nombre: 'Alfajor Oreo doble', rubro: 'Alfajores & Masas',       marca: 'Oreo',    costo: 650, precio_venta: 1100, stock: 45, stock_minimo: 10, codigo_barras: '7790580076905', proveedor_idx: 4 },
      { nombre: 'Chocolate Milka 55g', rubro: 'Golosinas & Chocolates',  marca: 'Milka',   costo: 880, precio_venta: 1450, stock: 30, stock_minimo: 8,  codigo_barras: '7622300961329', proveedor_idx: 4 },
      { nombre: 'Bon o Bon x12',       rubro: 'Golosinas & Chocolates',  marca: 'Arcor',   costo: 1200, precio_venta: 1900, stock: 20, stock_minimo: 5,  codigo_barras: '7790040010010', proveedor_idx: 0 },
      { nombre: 'Chupetín Arcor',      rubro: 'Golosinas & Chocolates',  marca: 'Arcor',   costo: 120, precio_venta: 200,  stock: 100, stock_minimo: 20, codigo_barras: '7790040001001', proveedor_idx: 0 },
      { nombre: 'Rocklets 35g',        rubro: 'Golosinas & Chocolates',  marca: 'Arcor',   costo: 450, precio_venta: 750,  stock: 40, stock_minimo: 10, codigo_barras: '7790040005321', proveedor_idx: 0 },
      { nombre: 'Sugus x5',            rubro: 'Golosinas & Chocolates',  marca: 'Sugus',   costo: 350, precio_venta: 580,  stock: 60, stock_minimo: 15, codigo_barras: '7790040008765', proveedor_idx: 0 },
      // Bebidas
      { nombre: 'Coca-Cola 2.25L',     rubro: 'Bebidas & Gaseosas',      marca: 'Coca-Cola', costo: 1350, precio_venta: 2100, stock: 24, stock_minimo: 6, codigo_barras: '7790895000047', proveedor_idx: 1 },
      { nombre: 'Coca-Cola 500ml',     rubro: 'Bebidas & Gaseosas',      marca: 'Coca-Cola', costo: 680, precio_venta: 1100, stock: 36, stock_minimo: 12, codigo_barras: '7790895000023', proveedor_idx: 1 },
      { nombre: 'Sprite 1.5L',         rubro: 'Bebidas & Gaseosas',      marca: 'Sprite',  costo: 1100, precio_venta: 1700, stock: 18, stock_minimo: 6, codigo_barras: '7790895000128', proveedor_idx: 1 },
      { nombre: 'Fanta Naranja 500ml', rubro: 'Bebidas & Gaseosas',      marca: 'Fanta',   costo: 650, precio_venta: 1050, stock: 24, stock_minimo: 8, codigo_barras: '7790895000215', proveedor_idx: 1 },
      { nombre: 'Agua Mineral 500ml',  rubro: 'Bebidas & Gaseosas',      marca: 'Villavicencio', costo: 420, precio_venta: 750, stock: 48, stock_minimo: 12, codigo_barras: '7790630001002', proveedor_idx: 1 },
      { nombre: 'Gatorade Limón 500ml',rubro: 'Bebidas & Gaseosas',      marca: 'Gatorade',costo: 900, precio_venta: 1450, stock: 20, stock_minimo: 6, codigo_barras: '0052000049439', proveedor_idx: 1 },
      // Cervezas
      { nombre: 'Quilmes Lata 473ml',  rubro: 'Cervezas & Vinos',        marca: 'Quilmes', costo: 850, precio_venta: 1400, stock: 48, stock_minimo: 12, codigo_barras: '7790196052034', proveedor_idx: 2 },
      { nombre: 'Stella Artois 470ml', rubro: 'Cervezas & Vinos',        marca: 'Stella',  costo: 980, precio_venta: 1650, stock: 36, stock_minimo: 8, codigo_barras: '7790196060077', proveedor_idx: 2 },
      { nombre: 'Corona Extra 355ml',  rubro: 'Cervezas & Vinos',        marca: 'Corona',  costo: 1100, precio_venta: 1900, stock: 24, stock_minimo: 6, codigo_barras: '7501064282066', proveedor_idx: 2 },
      // Cigarrillos
      { nombre: 'Marlboro Rojo x20',   rubro: 'Cigarrillos & Tabacos',   marca: 'Marlboro',costo: 2100, precio_venta: 3200, stock: 30, stock_minimo: 5, codigo_barras: '7790897010023', proveedor_idx: 3 },
      { nombre: 'Philip Morris x20',   rubro: 'Cigarrillos & Tabacos',   marca: 'PM',      costo: 1900, precio_venta: 2900, stock: 25, stock_minimo: 5, codigo_barras: '7790897020041', proveedor_idx: 3 },
      { nombre: 'Chesterfield x10',    rubro: 'Cigarrillos & Tabacos',   marca: 'Chester', costo: 1100, precio_venta: 1700, stock: 20, stock_minimo: 5, codigo_barras: '7790897030065', proveedor_idx: 3 },
      // Snacks
      { nombre: "Lay's 38g",           rubro: 'Snacks & Salados',        marca: "Lay's",   costo: 520, precio_venta: 850,  stock: 35, stock_minimo: 10, codigo_barras: '0028400057417', proveedor_idx: 5 },
      { nombre: 'Doritos 35g',         rubro: 'Snacks & Salados',        marca: 'Doritos', costo: 490, precio_venta: 800,  stock: 30, stock_minimo: 10, codigo_barras: '0028400457873', proveedor_idx: 5 },
      { nombre: 'Pehuamar Maníes 100g',rubro: 'Snacks & Salados',        marca: 'Pehuamar',costo: 380, precio_venta: 620,  stock: 40, stock_minimo: 10, codigo_barras: '7790337002001', proveedor_idx: 5 },
      { nombre: 'Palitos La Virginia',  rubro: 'Snacks & Salados',       marca: 'La Virginia', costo: 320, precio_venta: 530, stock: 25, stock_minimo: 8, codigo_barras: '7796040000012', proveedor_idx: 5 },
      // Galletitas
      { nombre: 'Oreo 198g',           rubro: 'Galletitas & Panificados',marca: 'Oreo',    costo: 850, precio_venta: 1380, stock: 28, stock_minimo: 8, codigo_barras: '7622300141035', proveedor_idx: 4 },
      { nombre: 'Pepitos Arcor x6',    rubro: 'Galletitas & Panificados',marca: 'Arcor',   costo: 420, precio_venta: 680,  stock: 40, stock_minimo: 10, codigo_barras: '7790040042012', proveedor_idx: 0 },
      { nombre: 'Traviata x12',        rubro: 'Galletitas & Panificados',marca: 'Bagley',  costo: 750, precio_venta: 1200, stock: 35, stock_minimo: 8, codigo_barras: '7790040022113', proveedor_idx: 0 },
      { nombre: 'Express Chocolate',   rubro: 'Galletitas & Panificados',marca: 'Arcor',   costo: 380, precio_venta: 620,  stock: 30, stock_minimo: 10, codigo_barras: '7790040019201', proveedor_idx: 0 },
      // Alfajores
      { nombre: 'Alfajor Havanna MDQ', rubro: 'Alfajores & Masas',       marca: 'Havanna', costo: 950, precio_venta: 1550, stock: 20, stock_minimo: 6, codigo_barras: '7791060000012', proveedor_idx: 0 },
      { nombre: 'Alfajor Mantecol',    rubro: 'Alfajores & Masas',       marca: 'Georgalos', costo: 580, precio_venta: 950, stock: 30, stock_minimo: 8, codigo_barras: '7792370000007', proveedor_idx: 0 },
      { nombre: 'Alfajor Triple Milka',rubro: 'Alfajores & Masas',       marca: 'Milka',   costo: 820, precio_venta: 1350, stock: 25, stock_minimo: 6, codigo_barras: '7622300869602', proveedor_idx: 4 },
      // Helados & Fríos (stock bajo para generar alertas de demo)
      { nombre: 'Palito Pelotazo Arcor',rubro: 'Helados & Fríos',        marca: 'Arcor',   costo: 280, precio_venta: 480,  stock: 3,  stock_minimo: 10, codigo_barras: '7790040051023', proveedor_idx: 0 },
      { nombre: 'Cucurucho Balcarce',  rubro: 'Helados & Fríos',         marca: 'Balcarce',costo: 650, precio_venta: 1100, stock: 2,  stock_minimo: 8,  codigo_barras: '7791100001004', proveedor_idx: 0 },
      { nombre: 'Tarrina Batik Chocolate',rubro: 'Helados & Fríos',      marca: 'Batik',   costo: 1800, precio_venta: 2900, stock: 4, stock_minimo: 6, codigo_barras: '7793600001019', proveedor_idx: 0 },
      // Almacén
      { nombre: 'Yerba Mate Taragüi 500g',rubro: 'Almacén & Despensa',   marca: 'Taragüi', costo: 1200, precio_venta: 1900, stock: 20, stock_minimo: 5, codigo_barras: '7790435000101', proveedor_idx: 6 },
      { nombre: 'Azúcar Ledesma 1kg',  rubro: 'Almacén & Despensa',      marca: 'Ledesma', costo: 750, precio_venta: 1200, stock: 15, stock_minimo: 5, codigo_barras: '7790590010023', proveedor_idx: 6 },
      { nombre: 'Aceite Natura 900ml', rubro: 'Almacén & Despensa',      marca: 'Natura',  costo: 1800, precio_venta: 2900, stock: 12, stock_minimo: 4, codigo_barras: '7791010083027', proveedor_idx: 6 },
      { nombre: 'Fideos Lucchetti 500g',rubro: 'Almacén & Despensa',     marca: 'Lucchetti',costo: 580, precio_venta: 950, stock: 18, stock_minimo: 5, codigo_barras: '7792580001006', proveedor_idx: 6 },
      // Librería & Perfumería
      { nombre: 'Jabón Dove 90g',      rubro: 'Librería & Perfumería',   marca: 'Dove',    costo: 650, precio_venta: 1050, stock: 20, stock_minimo: 5, codigo_barras: '0011111001611', proveedor_idx: 5 },
      { nombre: 'Shampoo Pantene 200ml',rubro: 'Librería & Perfumería',  marca: 'Pantene', costo: 1200, precio_venta: 1950, stock: 12, stock_minimo: 4, codigo_barras: '0037000755098', proveedor_idx: 5 },
      { nombre: 'Bolígrafo Bic Azul',  rubro: 'Librería & Perfumería',   marca: 'Bic',     costo: 180, precio_venta: 320,  stock: 30, stock_minimo: 10, codigo_barras: '0070330407500', proveedor_idx: 5 },
      { nombre: 'Cuaderno Rivadavia A4',rubro: 'Librería & Perfumería',  marca: 'Rivadavia',costo: 950, precio_venta: 1600, stock: 15, stock_minimo: 5, codigo_barras: '7793400000231', proveedor_idx: 5 },
      // Más golosinas para dar volumen
      { nombre: 'Mentitas Arcor x10',  rubro: 'Golosinas & Chocolates',  marca: 'Arcor',   costo: 280, precio_venta: 450,  stock: 50, stock_minimo: 15, codigo_barras: '7790040030001', proveedor_idx: 0 },
      { nombre: 'Globo de goma x5',    rubro: 'Golosinas & Chocolates',  marca: 'Arcor',   costo: 150, precio_venta: 250,  stock: 80, stock_minimo: 20, codigo_barras: '7790040031002', proveedor_idx: 0 },
      { nombre: 'Caramelos Halls 9u',  rubro: 'Golosinas & Chocolates',  marca: 'Halls',   costo: 380, precio_venta: 620,  stock: 45, stock_minimo: 12, codigo_barras: '7622300090320', proveedor_idx: 4 },
      { nombre: 'Cheetos Onda 75g',    rubro: 'Snacks & Salados',        marca: 'Cheetos', costo: 600, precio_venta: 980,  stock: 28, stock_minimo: 8, codigo_barras: '0028400598088', proveedor_idx: 5 },
      { nombre: 'Twistos Trigo 75g',   rubro: 'Snacks & Salados',        marca: 'Twistos', costo: 550, precio_venta: 900,  stock: 32, stock_minimo: 8, codigo_barras: '7790040059022', proveedor_idx: 5 },
      { nombre: 'Budín Bimbo Vainilla',rubro: 'Galletitas & Panificados',marca: 'Bimbo',   costo: 480, precio_venta: 780,  stock: 22, stock_minimo: 6, codigo_barras: '7593491001009', proveedor_idx: 5 },
      { nombre: 'Red Bull 250ml',      rubro: 'Bebidas & Gaseosas',      marca: 'Red Bull',costo: 1500, precio_venta: 2400, stock: 18, stock_minimo: 6, codigo_barras: '9002490100070', proveedor_idx: 1 },
      { nombre: 'Monster Energy 473ml',rubro: 'Bebidas & Gaseosas',      marca: 'Monster', costo: 1350, precio_venta: 2100, stock: 15, stock_minimo: 5, codigo_barras: '0070847013701', proveedor_idx: 1 },
      { nombre: 'Pepsi 1.5L',          rubro: 'Bebidas & Gaseosas',      marca: 'Pepsi',   costo: 1050, precio_venta: 1650, stock: 20, stock_minimo: 6, codigo_barras: '7790040141001', proveedor_idx: 1 },
    ];

    const prodValues = [];
    const prodParams = [];
    productosData.forEach((p, idx) => {
      const base = idx * 10;
      prodValues.push(`($${base+1}, $${base+2}, $${base+3}, $${base+4}, $${base+5}, $${base+6}, $${base+7}, $${base+8}, $${base+9}, $${base+10})`);
      prodParams.push(
        p.nombre, p.codigo_barras, p.rubro, p.marca, p.costo, p.precio_venta,
        p.stock, p.stock_minimo, provIds[p.proveedor_idx] || null, comercioId
      );
    });

    const prodsRes = await client.query(
      `INSERT INTO productos
         (nombre, codigo_barras, rubro, marca, costo, precio_venta, stock, stock_minimo, proveedor_id, comercio_id)
       VALUES ${prodValues.join(', ')}
       RETURNING id, nombre, precio_venta, costo`,
      prodParams
    );
    const productoIds = prodsRes.rows;

    // 7. Obtener usuario admin para las ventas
    const adminRes = await client.query(
      `SELECT id FROM usuarios WHERE comercio_id = $1 ORDER BY id ASC LIMIT 1`, [comercioId]
    );
    const adminId = adminRes.rows[0]?.id || 1;

    // 8. Caja abierta demo (apertura de hoy)
    const hoy = new Date();
    const cajaRes = await client.query(
      `INSERT INTO cajas (comercio_id, id_usuario, monto_inicial, estado, fecha_apertura)
       VALUES ($1, $2, 15000, 'abierta', $3) RETURNING id`,
      [comercioId, adminId, new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 8, 0, 0)]
    );
    const cajaId = cajaRes.rows[0].id;

    // 9. Generar ventas de los últimos 30 días
    const METODOS = ['efectivo', 'efectivo', 'efectivo', 'tarjeta', 'transferencia', 'qr'];
    const TIPOS_COMP = ['interno', 'interno', 'interno', 'interno', 'factura_b'];

    const ventasPorDia = [];
    for (let i = 29; i >= 0; i--) {
      const fecha = new Date();
      fecha.setDate(fecha.getDate() - i);
      const esFinDeSemana = fecha.getDay() === 0 || fecha.getDay() === 6;
      let cantVentas = esFinDeSemana ? 2 : 1;
      if (i === 0) cantVentas = 2;
      ventasPorDia.push({ fecha, cantVentas });
    }

    for (const { fecha, cantVentas } of ventasPorDia) {
      for (let v = 0; v < cantVentas; v++) {
        const fechaVenta = randomTimeInDay(fecha);
        const metodo = pick(METODOS);
        const tipo = pick(TIPOS_COMP);
        // Carrito: entre 1 y 4 items por venta
        const nItems = rand(1, 4);
        const items = [];
        let total = 0;
        const usados = new Set();
        for (let ii = 0; ii < nItems; ii++) {
          const prod = pick(productoIds.filter(p => !usados.has(p.id)));
          if (!prod) break;
          usados.add(prod.id);
          const cantidad = rand(1, 3);
          const precio = prod.precio_venta * (1 + randF(-0.05, 0.05)); // pequeña variación histórica
          items.push({ prod, cantidad, precio });
          total += cantidad * precio;
        }
        if (items.length === 0) continue;
        const descuento = Math.random() < 0.08 ? randF(0.05, 0.15) * total : 0;
        const totalFinal = Math.max(total - descuento, 0);
        // Identificar cliente en ~15% de las ventas
        const clienteId = Math.random() < 0.15 ? pick(clienteIds.slice(1)) : clienteIds[0];

        const ventaRes = await client.query(
          `INSERT INTO ventas (comercio_id, id_usuario, cliente_id, tipo_comprobante, metodo_pago,
             total, descuento, estado, fecha)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'aprobada',$8) RETURNING id`,
          [comercioId, adminId, clienteId, tipo, metodo,
           Math.round(totalFinal * 100) / 100,
           Math.round(descuento * 100) / 100,
           fechaVenta]
        );
        const ventaId = ventaRes.rows[0].id;
        if (items.length > 0) {
          const valuesClause = items
            .map((_, idx) => `($${idx * 5 + 1}, $${idx * 5 + 2}, $${idx * 5 + 3}, $${idx * 5 + 4}, $${idx * 5 + 5})`)
            .join(', ');
          const params = [];
          for (const item of items) {
            params.push(ventaId, item.prod.id, item.cantidad, Math.round(item.precio * 100) / 100, comercioId);
          }
          await client.query(
            `INSERT INTO detalle_ventas (id_venta, id_producto, cantidad, precio_unitario, comercio_id) VALUES ${valuesClause}`,
            params
          );
        }
      }
    }

    // 10. Gastos operativos demo
    await client.query(
      `INSERT INTO categorias_gasto (comercio_id, nombre) VALUES
       ($1,'Alquiler'),($1,'Servicios'),($1,'Personal'),($1,'Mantenimiento'),($1,'Publicidad')
       ON CONFLICT DO NOTHING`, [comercioId]
    );
    const catGastoRes = await client.query(
      `SELECT id FROM categorias_gasto WHERE comercio_id = $1 LIMIT 5`, [comercioId]
    );
    const catIds = catGastoRes.rows.map(r => r.id);
    if (catIds.length > 0) {
      const gastosData = [
        { desc: 'Alquiler local septiembre', monto: 250000, idx: 0, dias: 28 },
        { desc: 'Electricidad agosto',        monto: 45000,  idx: 1, dias: 20 },
        { desc: 'Gas agosto',                 monto: 18000,  idx: 1, dias: 20 },
        { desc: 'Internet fibra óptica',      monto: 12000,  idx: 1, dias: 15 },
        { desc: 'Sueldo Martínez agosto',     monto: 180000, idx: 2, dias: 25 },
        { desc: 'Reparación heladera',        monto: 35000,  idx: 3, dias: 18 },
        { desc: 'Flyer publicidad WhatsApp',  monto: 8000,   idx: 4, dias: 10 },
        { desc: 'Bolsas y packaging',         monto: 15000,  idx: 3, dias: 5  },
      ];
      for (const g of gastosData) {
        const fechaGasto = new Date();
        fechaGasto.setDate(fechaGasto.getDate() - g.dias);
        await client.query(
          `INSERT INTO gastos (comercio_id, categoria_id, usuario_id, descripcion, monto, fecha)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [comercioId, catIds[Math.min(g.idx, catIds.length - 1)], adminId, g.desc, g.monto, fechaGasto]
        ).catch(() => {});
      }
    }

    // 11. Cuentas corrientes demo (algunos clientes con saldo)
    await client.query(
      `UPDATE clientes SET saldo_deuda = 85000 WHERE id = $1 AND comercio_id = $2`,
      [clienteIds[3], comercioId]
    ).catch(() => {});
    await client.query(
      `UPDATE clientes SET saldo_deuda = 42000 WHERE id = $1 AND comercio_id = $2`,
      [clienteIds[4], comercioId]
    ).catch(() => {});
    await client.query(
      `UPDATE clientes SET saldo_deuda = 15500 WHERE id = $1 AND comercio_id = $2`,
      [clienteIds[5] || clienteIds[1], comercioId]
    ).catch(() => {});

    return {
      productos: productoIds.length,
      proveedores: provIds.length,
      clientes: clienteIds.length,
      dias_ventas: 30,
    };
}

// ── POST /api/demo/seed — Cargar datos demo completos ───────────────────────
router.post('/seed', autorizarRoles('administrador', 'dueno'), async (req, res) => {
  const comercioId = req.usuario?.comercio_id || 1;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const stats = await seedDatosDemo(comercioId, client);
    await client.query('COMMIT');
    res.json({
      ok: true,
      mensaje: `Datos demo cargados: ${stats.productos} productos, 30 días de ventas, clientes y gastos.`,
      stats,
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('[DEMO] Error al cargar datos demo:', err);
    res.status(500).json({ error: 'Error al cargar datos demo', detalle: err.message });
  } finally {
    client.release();
  }
});

// ── POST /api/demo/login-demo — Acceso instantáneo en modo demo con datos reales
router.post('/login-demo', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query(`
      INSERT INTO comercios (id, nombre, suscripcion_activa, activo_hasta)
      VALUES (1, 'Maxikiosco Central 24hs', true, '2099-12-31')
      ON CONFLICT (id) DO UPDATE SET
        suscripcion_activa = true,
        activo_hasta = '2099-12-31'
    `);

    let adminUser = (await client.query(
      `SELECT id, nombre_usuario, rol, comercio_id, suscripcion_activa 
       FROM usuarios 
       WHERE (nombre_usuario = 'admin' OR rol IN ('dueno', 'administrador')) AND comercio_id = 1 
       LIMIT 1`
    )).rows[0];

    if (!adminUser) {
      const hash = await bcrypt.hash('admin123', 10);
      const nuevo = await client.query(
        `INSERT INTO usuarios (nombre_usuario, password, rol, comercio_id, suscripcion_activa)
         VALUES ('admin', $1, 'dueno', 1, true)
         RETURNING id, nombre_usuario, rol, comercio_id, suscripcion_activa`,
        [hash]
      );
      adminUser = nuevo.rows[0];
    }

    const prodsCountRes = await client.query('SELECT COUNT(*) AS total FROM productos WHERE comercio_id = 1');
    const prodsCount = parseInt(prodsCountRes.rows[0]?.total || 0);

    let seedStats = null;
    if (prodsCount === 0 || req.body?.forzar_seed === true) {
      await client.query('BEGIN');
      seedStats = await seedDatosDemo(1, client);
      await client.query('COMMIT');
    }

    const token = jwt.sign(
      { id: adminUser.id, rol: adminUser.rol, comercio_id: adminUser.comercio_id },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      ok: true,
      mensaje: 'Acceso demo exitoso',
      token,
      usuario: {
        id: adminUser.id,
        nombre_usuario: adminUser.nombre_usuario,
        rol: adminUser.rol,
        comercio_id: adminUser.comercio_id,
        suscripcion_activa: true,
      },
      stats: seedStats,
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('[DEMO LOGIN] Error:', err);
    res.status(500).json({ error: 'Error al iniciar sesión de demostración', detalle: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
