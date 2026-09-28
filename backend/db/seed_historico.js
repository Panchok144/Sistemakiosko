/**
 * seed_historico.js
 * ─────────────────
 * Genera datos históricos de ventas (Julio → Septiembre 2026) para el dashboard.
 * IMPORTANTE: Este script NO borra datos. Solo AGREGA ventas históricas a los
 * productos y clientes ya existentes.
 *
 * Ejecución: node db/seed_historico.js
 */

require('dotenv').config({ path: __dirname + '/../.env' });
const { pool } = require('./pgConexion');

// ─── Utilidades ───────────────────────────────────────────────────────────────

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randF(min, max) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(2));
}
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function pickWeighted(items) {
  // items: [{value, weight}]
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = Math.random() * total;
  for (const i of items) {
    r -= i.weight;
    if (r <= 0) return i.value;
  }
  return items[items.length - 1].value;
}

// Genera una fecha aleatoria dentro de un día con horario de kiosko (7hs a 23hs)
function randomTimeInDay(date) {
  const d = new Date(date);
  // Franjas horarias con distintos pesos (mañana, mediodía, tarde, noche)
  const horaBase = pickWeighted([
    { value: rand(7, 9),   weight: 15 }, // Mañana temprano
    { value: rand(10, 12), weight: 20 }, // Mañana plena
    { value: rand(12, 14), weight: 25 }, // Mediodía (pico)
    { value: rand(15, 18), weight: 20 }, // Tarde
    { value: rand(18, 21), weight: 15 }, // Tarde-noche
    { value: rand(21, 23), weight: 5  }, // Noche
  ]);
  d.setHours(horaBase, rand(0, 59), rand(0, 59), 0);
  return d;
}

// Determina cuántas ventas hacer en un día (lunes-viernes vs fin de semana)
function ventasDelDia(fecha, esFinDeMes) {
  const diaSemana = fecha.getDay(); // 0=dom, 6=sab
  const esFinDeSemana = diaSemana === 0 || diaSemana === 6;
  const esQuincena = fecha.getDate() === 15 || fecha.getDate() === 14;

  let base = esFinDeSemana ? rand(55, 80) : rand(30, 55);
  if (esFinDeMes) base = Math.floor(base * 1.35);   // +35% fin de mes
  if (esQuincena) base = Math.floor(base * 1.20);   // +20% quincena
  // Julio tiene más frío → más bebidas calientes, pero menos gente → -10%
  return base;
}

async function seed() {
  const client = await pool.connect();
  try {
    console.log('📅 Iniciando generación de datos históricos (Jul → Sep 2026)...\n');

    // ── Obtener productos existentes ────────────────────────────────────────
    const { rows: productos } = await client.query(
      `SELECT id, nombre, precio_venta, costo, rubro, stock
       FROM productos
       WHERE comercio_id = 1
       ORDER BY id`
    );
    if (productos.length === 0) {
      console.error('❌ No hay productos. Ejecutá primero: node db/seed_kiosko.js');
      process.exit(1);
    }
    console.log(`✅ ${productos.length} productos encontrados.`);

    // ── Obtener usuario admin ──────────────────────────────────────────────
    const { rows: users } = await client.query(
      `SELECT id FROM usuarios WHERE comercio_id = 1 LIMIT 1`
    );
    const usuarioId = users[0]?.id ?? 1;

    // ── Agrupar productos por popularidad ──────────────────────────────────
    // Los más vendidos en un kiosko: cigarrillos, gaseosas, snacks, alfajores
    const productosPorPopularidad = productos.map(p => {
      let peso = 1;
      const n = p.nombre.toLowerCase();
      const r = (p.rubro || '').toLowerCase();
      if (r.includes('cigarro') || r.includes('tabaco')) peso = 12;
      else if (r.includes('bebida') || r.includes('gaseosa')) peso = 10;
      else if (r.includes('alfajor')) peso = 8;
      else if (r.includes('snack') || r.includes('salado')) peso = 7;
      else if (r.includes('golosina') || r.includes('chocolate')) peso = 6;
      else if (r.includes('galletita')) peso = 5;
      else if (r.includes('cerveza') || r.includes('vino')) peso = 6;
      else if (r.includes('helado')) peso = 4;
      else peso = 3;
      return { ...p, peso };
    });

    // Función para seleccionar productos para una venta (1-5 items distintos)
    function seleccionarProductosVenta(cantidad) {
      const seleccionados = new Set();
      const items = [];
      let intentos = 0;
      while (items.length < cantidad && intentos < 50) {
        intentos++;
        const p = pickWeighted(productosPorPopularidad.map(x => ({ value: x, weight: x.peso })));
        if (!seleccionados.has(p.id)) {
          seleccionados.add(p.id);
          const qty = pickWeighted([
            { value: 1, weight: 60 },
            { value: 2, weight: 25 },
            { value: 3, weight: 10 },
            { value: 4, weight: 5 },
          ]);
          items.push({ producto: p, cantidad: qty });
        }
      }
      return items;
    }

    // ── Definir métodos de pago con pesos realistas ────────────────────────
    const metodosPago = [
      { value: 'efectivo',      weight: 50 },
      { value: 'tarjeta',       weight: 30 },
      { value: 'transferencia', weight: 20 },
    ];

    // ── Definir tipos de comprobante ───────────────────────────────────────
    const tiposComprobante = [
      { value: 'interno',   weight: 85 },
      { value: 'factura_b', weight: 14 },
      { value: 'factura_a', weight: 1  },
    ];

    // ── Generar rango de fechas: 1 Jul → 21 Sep 2026 ──────────────────────
    const inicio = new Date('2026-07-01T00:00:00-03:00');
    const fin    = new Date('2026-09-21T23:59:59-03:00');

    let totalVentas = 0;
    let totalIngresos = 0;

    const fechaActual = new Date(inicio);

    while (fechaActual <= fin) {
      const diaStr = fechaActual.toISOString().split('T')[0];
      const esDomingoAburrido = fechaActual.getDay() === 0 && Math.random() < 0.05; // 5% chance de domingo casi vacío
      const esFinDeMes = fechaActual.getDate() >= 28;
      const cantidadVentas = esDomingoAburrido ? rand(10, 25) : ventasDelDia(fechaActual, esFinDeMes);

      // Crear caja para este día (simplificado, solo si no existe)
      await client.query(`
        INSERT INTO cajas (id_usuario, fecha_apertura, fecha_cierre, monto_inicial, monto_final, estado, comercio_id, created_at)
        VALUES ($1, $2::date + interval '8 hours', $2::date + interval '22 hours 30 minutes', 20000, NULL, 'cerrada', 1, $2::date + interval '8 hours')
        ON CONFLICT DO NOTHING
      `, [usuarioId, diaStr]).catch(() => {}); // ignorar error si ya existe

      await client.query('BEGIN');

      for (let v = 0; v < cantidadVentas; v++) {
        const fechaVenta = randomTimeInDay(fechaActual);

        // Número de productos distintos en esta venta
        const nItems = pickWeighted([
          { value: 1, weight: 45 },
          { value: 2, weight: 30 },
          { value: 3, weight: 15 },
          { value: 4, weight: 7  },
          { value: 5, weight: 3  },
        ]);

        const items = seleccionarProductosVenta(nItems);
        if (items.length === 0) continue;

        // Calcular total
        let total = 0;
        for (const it of items) {
          // Simular leve variación de precios entre meses (inflación ~8% mensual en Argentina)
          const mesOffset = (fechaVenta.getMonth() - 6); // 0=jul, 1=ago, 2=sep
          const factorInflacion = Math.pow(1.08, mesOffset);
          const precioAjustado = parseFloat((it.producto.precio_venta * factorInflacion).toFixed(2));
          it.precioFinal = precioAjustado;
          total += precioAjustado * it.cantidad;
        }
        total = parseFloat(total.toFixed(2));

        // Descuento ocasional (5% de ventas tienen descuento)
        const descuento = Math.random() < 0.05 ? parseFloat((total * randF(0.05, 0.15)).toFixed(2)) : 0;
        const totalFinal = parseFloat((total - descuento).toFixed(2));

        const metodo = pickWeighted(metodosPago);
        const tipoComp = pickWeighted(tiposComprobante);

        // Insertar venta
        const { rows: [venta] } = await client.query(
          `INSERT INTO ventas (id_usuario, fecha, total, metodo_pago, tipo_comprobante, estado, descuento, comercio_id, created_at)
           VALUES ($1, $2, $3, $4, $5, 'interna', $6, 1, $2)
           RETURNING id`,
          [usuarioId, fechaVenta.toISOString(), totalFinal, metodo, tipoComp, descuento]
        );
        const idVenta = venta.id;

        // Insertar detalle de venta
        for (const it of items) {
          await client.query(
            `INSERT INTO detalle_ventas (id_venta, id_producto, cantidad, precio_unitario, comercio_id)
             VALUES ($1, $2, $3, $4, 1)`,
            [idVenta, it.producto.id, it.cantidad, it.precioFinal]
          );
        }

        totalVentas++;
        totalIngresos += totalFinal;
      }

      await client.query('COMMIT');

      // Progress log cada 7 días
      if (fechaActual.getDate() === 1 || fechaActual.getDate() === 7 ||
          fechaActual.getDate() === 14 || fechaActual.getDate() === 21 ||
          fechaActual.getDate() === 28) {
        const mes = fechaActual.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
        console.log(`  📊 ${diaStr} — ${cantidadVentas} ventas ese día | Acum: ${totalVentas} ventas | $${totalIngresos.toLocaleString('es-AR')} ingresos`);
      }

      // Avanzar al próximo día
      fechaActual.setDate(fechaActual.getDate() + 1);
    }

    // ── Agregar gastos mensuales realistas ─────────────────────────────────
    console.log('\n💸 Agregando gastos operativos históricos...');

    // Verificar que exista tabla de categorías de gastos
    const gastosData = [
      // JULIO
      { fecha: '2026-07-01', cat: 'Alquiler', desc: 'Alquiler local julio 2026', monto: 280000, metodo: 'transferencia' },
      { fecha: '2026-07-05', cat: 'Servicios', desc: 'Factura eléctrica julio', monto: 18500, metodo: 'efectivo' },
      { fecha: '2026-07-10', cat: 'Reposición', desc: 'Compra mercadería Arcor - julio', monto: 145000, metodo: 'transferencia' },
      { fecha: '2026-07-12', cat: 'Reposición', desc: 'Compra gaseosas Coca-Cola - julio', monto: 98000, metodo: 'transferencia' },
      { fecha: '2026-07-15', cat: 'Servicios', desc: 'Internet + cable julio', monto: 9800, metodo: 'debito' },
      { fecha: '2026-07-20', cat: 'Personal', desc: 'Sueldo empleado media jornada - julio', monto: 220000, metodo: 'transferencia' },
      { fecha: '2026-07-22', cat: 'Reposición', desc: 'Compra cigarrillos Massalin - julio', monto: 190000, metodo: 'transferencia' },
      { fecha: '2026-07-28', cat: 'Impuestos', desc: 'Monotributo / Ingresos brutos julio', monto: 45000, metodo: 'transferencia' },
      // AGOSTO
      { fecha: '2026-08-01', cat: 'Alquiler', desc: 'Alquiler local agosto 2026', monto: 295000, metodo: 'transferencia' },
      { fecha: '2026-08-04', cat: 'Servicios', desc: 'Factura eléctrica agosto', monto: 20200, metodo: 'efectivo' },
      { fecha: '2026-08-08', cat: 'Reposición', desc: 'Compra mercadería Arcor - agosto', monto: 158000, metodo: 'transferencia' },
      { fecha: '2026-08-12', cat: 'Reposición', desc: 'Compra Quilmes cervezas - agosto', monto: 112000, metodo: 'transferencia' },
      { fecha: '2026-08-14', cat: 'Servicios', desc: 'Internet + cable agosto', monto: 10200, metodo: 'debito' },
      { fecha: '2026-08-20', cat: 'Personal', desc: 'Sueldo empleado media jornada - agosto', monto: 235000, metodo: 'transferencia' },
      { fecha: '2026-08-21', cat: 'Reposición', desc: 'Compra cigarrillos Massalin - agosto', monto: 205000, metodo: 'transferencia' },
      { fecha: '2026-08-28', cat: 'Impuestos', desc: 'Monotributo / Ingresos brutos agosto', monto: 48000, metodo: 'transferencia' },
      { fecha: '2026-08-30', cat: 'Mantenimiento', desc: 'Reparación heladera exhibidora', monto: 35000, metodo: 'efectivo' },
      // SEPTIEMBRE
      { fecha: '2026-09-01', cat: 'Alquiler', desc: 'Alquiler local septiembre 2026', monto: 310000, metodo: 'transferencia' },
      { fecha: '2026-09-03', cat: 'Servicios', desc: 'Factura eléctrica septiembre', monto: 21500, metodo: 'efectivo' },
      { fecha: '2026-09-07', cat: 'Reposición', desc: 'Compra mercadería Arcor - septiembre', monto: 172000, metodo: 'transferencia' },
      { fecha: '2026-09-10', cat: 'Reposición', desc: 'Compra gaseosas Coca-Cola - septiembre', monto: 125000, metodo: 'transferencia' },
      { fecha: '2026-09-14', cat: 'Servicios', desc: 'Internet + cable septiembre', monto: 10800, metodo: 'debito' },
      { fecha: '2026-09-18', cat: 'Personal', desc: 'Sueldo empleado media jornada - septiembre', monto: 248000, metodo: 'transferencia' },
      { fecha: '2026-09-19', cat: 'Reposición', desc: 'Compra cigarrillos Massalin - septiembre', monto: 218000, metodo: 'transferencia' },
    ];

    for (const g of gastosData) {
      // Obtener o crear categoría
      const catRes = await client.query(
        `INSERT INTO categorias_gasto (nombre, comercio_id) VALUES ($1, 1) ON CONFLICT (nombre, comercio_id) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id`,
        [g.cat]
      ).catch(async () => {
        const r = await client.query(`SELECT id FROM categorias_gasto WHERE nombre = $1 AND comercio_id = 1`, [g.cat]);
        return { rows: r.rows };
      });
      const catId = catRes.rows[0]?.id;

      await client.query(
        `INSERT INTO gastos (descripcion, monto, metodo_pago, categoria_id, comercio_id, usuario_id, fecha, created_at)
         VALUES ($1, $2, $3, $4, 1, $5, $6::date, $6::date)
         ON CONFLICT DO NOTHING`,
        [g.desc, g.monto, g.metodo, catId, usuarioId, g.fecha]
      ).catch(() => {
        // Si falla por constraint, intentar sin ON CONFLICT
        return client.query(
          `INSERT INTO gastos (descripcion, monto, metodo_pago, categoria_id, comercio_id, usuario_id, fecha, created_at)
           VALUES ($1, $2, $3, $4, 1, $5, $6::date, $6::date)`,
          [g.desc, g.monto, g.metodo, catId, usuarioId, g.fecha]
        ).catch(() => {});
      });
    }

    // ── Resumen final ──────────────────────────────────────────────────────
    const { rows: [resumen] } = await client.query(`
      SELECT
        COUNT(*) as total_ventas,
        SUM(total)::numeric(14,2) as total_ingresos,
        MIN(fecha) as desde,
        MAX(fecha) as hasta
      FROM ventas
      WHERE comercio_id = 1
        AND fecha >= '2026-07-01'
        AND fecha < '2026-09-22'
    `);

    console.log(`
╔═══════════════════════════════════════════════════════╗
║           SEED HISTÓRICO COMPLETADO ✅                 ║
╠═══════════════════════════════════════════════════════╣
║  Ventas generadas: ${String(resumen.total_ventas).padEnd(33)} ║
║  Ingresos totales: $${String(parseFloat(resumen.total_ingresos || 0).toLocaleString('es-AR')).padEnd(31)} ║
║  Período:          ${String(resumen.desde?.toISOString().split('T')[0] || '-').padEnd(33)} ║
║               al   ${String(resumen.hasta?.toISOString().split('T')[0] || '-').padEnd(33)} ║
╚═══════════════════════════════════════════════════════╝
    `);
    console.log('🎉 ¡Listo! Ahora podés ver los datos en el Dashboard cambiando de mes.');

  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
    process.exit(0);
  }
}

seed();
