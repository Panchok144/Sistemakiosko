/**
 * Seed Database Script para SistemaKiosko
 * Elimina todos los datos de negocio previos (manteniendo usuarios y comercios para login)
 * y genera un catálogo y transacciones completas y realistas para un Kiosko argentino.
 */

require('dotenv').config({ path: __dirname + '/../.env' });
const { pool } = require('./pgConexion');

async function seed() {
  const client = await pool.connect();

  try {
    console.log('🚀 Iniciando proceso de limpieza y generación de datos...');
    await client.query('BEGIN');

    // ─────────────────────────────────────────────────────────────
    // 1. LIMPIEZA DE TABLAS DE DATOS (MANTENIENDO USUARIOS Y COMERCIOS)
    // ─────────────────────────────────────────────────────────────
    console.log('🧹 Vaciando tablas anteriores...');

    const tablasParaLimpiar = [
      'auditoria',
      'notificaciones',
      'historial_precios',
      'recibos',
      'remito_items',
      'remitos',
      'devolucion_items',
      'devoluciones',
      'notas_credito_debito_items',
      'notas_credito_debito',
      'facturas_compra_items',
      'facturas_compra',
      'gastos',
      'categorias_gasto',
      'presupuesto_items',
      'presupuestos',
      'ordenes_compra_items',
      'ordenes_compra',
      'movimientos_cuenta_corriente',
      'detalle_ventas',
      'ventas',
      'movimientos_caja',
      'cajas',
      'precios_volumen',
      'productos_listas_precios',
      'listas_precios',
      'productos',
      'rubros',
      'proveedores',
      'clientes',
      'secuencias_facturacion',
      'configuracion'
    ];

    for (const tabla of tablasParaLimpiar) {
      try {
        await client.query(`TRUNCATE TABLE ${tabla} RESTART IDENTITY CASCADE`);
      } catch (err) {
        // Si no existe la tabla o truncate falla por permisos, intentar DELETE
        try {
          await client.query(`DELETE FROM ${tabla}`);
        } catch (e) {
          console.warn(`⚠️ Advertencia al limpiar tabla ${tabla}: ${e.message}`);
        }
      }
    }
    console.log('✅ Tablas limpiadas correctamente.');

    // ─────────────────────────────────────────────────────────────
    // 2. ACTUALIZAR COMERCIO PRINCIPAL CON BRANDING DE KIOSKO
    // ─────────────────────────────────────────────────────────────
    console.log('🏪 Configurando datos del kiosko...');
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
        leyenda_ticket = '¡Gracias por su compra en Maxikiosco Central 24hs! Guarde su ticket.',
        activo = TRUE,
        suscripcion_activa = TRUE,
        activo_hasta = '2032-12-31'
      WHERE id = 1
    `);

    // Asegurar suscripción activa para usuarios de comercio 1
    await client.query(`
      UPDATE usuarios SET
        suscripcion_activa = TRUE
      WHERE comercio_id = 1
    `);

    // Asegurar licencia activa
    await client.query(`
      INSERT INTO licencias (comercio_id, plan, activa, max_productos, max_usuarios, max_sucursales, fecha_fin, notas)
      VALUES (1, 'profesional', TRUE, 99999, 99, 10, NOW() + INTERVAL '3650 days', 'Licencia activa Maxikiosco Central')
      ON CONFLICT DO NOTHING
    `);

    // Configuraciones clave/valor
    await client.query(`
      INSERT INTO configuracion (comercio_id, clave, valor) VALUES
        (1, 'monto_minimo_identificar', '500000'),
        (1, 'limite_variacion_precio_pct', '30'),
        (1, 'moneda_simbolo', '$'),
        (1, 'permitir_stock_negativo', 'false'),
        (1, 'imprimir_ticket_auto', 'true')
      ON CONFLICT (comercio_id, clave) DO UPDATE SET valor = EXCLUDED.valor
    `);

    // ─────────────────────────────────────────────────────────────
    // 3. RUBROS / CATEGORÍAS TÍPICAS DE KIOSKO
    // ─────────────────────────────────────────────────────────────
    console.log('🏷️ Creando rubros...');
    const rubrosNombres = [
      'Golosinas & Chocolates',
      'Bebidas & Gaseosas',
      'Cervezas & Vinos',
      'Cigarrillos & Tabacos',
      'Snacks & Salados',
      'Galletitas & Panificados',
      'Alfajores & Masas',
      'Helados & Fríos',
      'Almacén & Despensa',
      'Librería & Perfumería'
    ];

    for (const r of rubrosNombres) {
      await client.query('INSERT INTO rubros (nombre, comercio_id) VALUES ($1, 1)', [r]);
    }

    // ─────────────────────────────────────────────────────────────
    // 4. PROVEEDORES REALES
    // ─────────────────────────────────────────────────────────────
    console.log('🚚 Creando proveedores...');
    const proveedoresData = [
      {
        nombre: 'Arcor S.A.I.C.',
        cuit: '30-50279317-5',
        telefono: '0800-333-2726',
        email: 'pedidos@arcor.com.ar',
        domicilio: 'Av. Fulvio Salvador Pagani 487, Córdoba',
        condicion_fiscal: 'responsable_inscripto',
        descripcion: 'Golosinas, chocolates, galletitas Bagley y conservas'
      },
      {
        nombre: 'Coca-Cola FEMSA Argentina',
        cuit: '30-65825211-1',
        telefono: '0800-888-2652',
        email: 'ventas@cocacola-femsa.com.ar',
        domicilio: 'Av. Amancio Alcorta 3570, CABA',
        condicion_fiscal: 'responsable_inscripto',
        descripcion: 'Gaseosas Coca-Cola, Sprite, Fanta, aguas y jugos'
      },
      {
        nombre: 'Cervecería y Maltería Quilmes',
        cuit: '30-50346039-0',
        telefono: '0800-222-2378',
        email: 'pedidos@quilmes.com.ar',
        domicilio: '12 de Octubre y Gran Canaria, Quilmes',
        condicion_fiscal: 'responsable_inscripto',
        descripcion: 'Cervezas Quilmes, Stella Artois, Corona, aguas saborizadas'
      },
      {
        nombre: 'Massalin Particulares S.A.',
        cuit: '30-50016480-4',
        telefono: '011-4735-8000',
        email: 'distribucion@pmi.com',
        domicilio: 'Av. de Mayo 650, CABA',
        condicion_fiscal: 'responsable_inscripto',
        descripcion: 'Cigarrillos Marlboro, Philip Morris, Chesterfield'
      },
      {
        nombre: 'Mondelēz International Argentina',
        cuit: '30-50109720-5',
        telefono: '0800-333-3333',
        email: 'atencion@mondelezinternational.com',
        domicilio: 'Uruguay 4075, San Fernando, Bs. As.',
        condicion_fiscal: 'responsable_inscripto',
        descripcion: 'Milka, Oreo, Beldent, Halls, Pepitos, Tang'
      },
      {
        nombre: 'Distribuidora Mayorista Los Amigos',
        cuit: '30-71204859-6',
        telefono: '011-4581-2244',
        email: 'mayoristalosamigos@gmail.com',
        domicilio: 'Av. Juan B. Justo 4520, CABA',
        condicion_fiscal: 'responsable_inscripto',
        descripcion: 'Snacks Lay’s, Doritos, Pehuamar y surtido general'
      },
      {
        nombre: 'Molinos Río de la Plata',
        cuit: '30-50085862-8',
        telefono: '0800-444-6654',
        email: 'pedidos@molinos.com.ar',
        domicilio: 'Av. 25 de Mayo 501, San Fernando, Bs. As.',
        condicion_fiscal: 'responsable_inscripto',
        descripcion: 'Yerbas, fideos, aceites, arroz y azúcar'
      }
    ];

    const proveedoresMap = {};
    for (const prov of proveedoresData) {
      const res = await client.query(
        `INSERT INTO proveedores (nombre, cuit, telefono, email, domicilio, condicion_fiscal, descripcion, comercio_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 1) RETURNING id, nombre`,
        [prov.nombre, prov.cuit, prov.telefono, prov.email, prov.domicilio, prov.condicion_fiscal, prov.descripcion]
      );
      proveedoresMap[prov.nombre] = res.rows[0].id;
    }

    // ─────────────────────────────────────────────────────────────
    // 5. CLIENTES HABITUALES (CUENTA CORRIENTE & CONSUMIDORES)
    // ─────────────────────────────────────────────────────────────
    console.log('👥 Creando clientes habituales...');
    const clientesData = [
      {
        nombre: 'Carlos Benítez',
        documento: '28456123',
        email: 'carlos.benitez@gmail.com',
        telefono: '11-4521-7890',
        direccion: 'Av. Corrientes 3420 3°B, CABA',
        credito_limite: 25000,
        saldo_deuda: 4500,
        tiene_cuenta_corriente: true,
        condicion_fiscal: 'consumidor_final',
        tipo_negocio: 'Cliente Frecuente'
      },
      {
        nombre: 'Mariela Fernández (Peluquería Estilo)',
        documento: '32987654',
        email: 'mariela.estilo@hotmail.com',
        telefono: '11-6389-1122',
        direccion: 'Gallo 450, CABA',
        credito_limite: 35000,
        saldo_deuda: 12800,
        tiene_cuenta_corriente: true,
        condicion_fiscal: 'monotributista',
        tipo_negocio: 'Comercio Vecino'
      },
      {
        nombre: 'Roberto Peralta (Remisería Avenida)',
        documento: '24512789',
        email: 'roberto.remis@yahoo.com.ar',
        telefono: '11-5412-9900',
        direccion: 'Av. Corrientes 3480, CABA',
        credito_limite: 20000,
        saldo_deuda: 7900,
        tiene_cuenta_corriente: true,
        condicion_fiscal: 'consumidor_final',
        tipo_negocio: 'Cliente Frecuente'
      },
      {
        nombre: 'Juan Pablo Gómez (Docente Esc. 14)',
        documento: '30123456',
        email: 'jpgomez.profe@gmail.com',
        telefono: '11-4876-5544',
        direccion: 'Billinghurst 620 1°A, CABA',
        credito_limite: 20000,
        saldo_deuda: 0,
        tiene_cuenta_corriente: true,
        condicion_fiscal: 'consumidor_final',
        tipo_negocio: 'Docente'
      },
      {
        nombre: 'Lucía Méndez (Estudiante UTN)',
        documento: '42118990',
        email: 'luciamendez.ing@gmail.com',
        telefono: '11-7822-3344',
        direccion: 'Medrano 951 5°C, CABA',
        credito_limite: 15000,
        saldo_deuda: 1850,
        tiene_cuenta_corriente: true,
        condicion_fiscal: 'consumidor_final',
        tipo_negocio: 'Estudiante'
      },
      {
        nombre: 'Kiosco Don Mateo (Distribución)',
        documento: '30-71889922-3',
        email: 'kioscodonmateo@gmail.com',
        telefono: '11-4299-8877',
        direccion: 'Sarmiento 2890, CABA',
        credito_limite: 120000,
        saldo_deuda: 0,
        tiene_cuenta_corriente: true,
        condicion_fiscal: 'responsable_inscripto',
        tipo_negocio: 'Mayorista'
      }
    ];

    const clientesMap = {};
    for (const c of clientesData) {
      const res = await client.query(
        `INSERT INTO clientes (
          nombre, documento, email, telefono, direccion, credito_limite, saldo_deuda,
          tiene_cuenta_corriente, condicion_fiscal, tipo_negocio, comercio_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 1) RETURNING id, nombre`,
        [c.nombre, c.documento, c.email, c.telefono, c.direccion, c.credito_limite, c.saldo_deuda,
         c.tiene_cuenta_corriente, c.condicion_fiscal, c.tipo_negocio]
      );
      clientesMap[c.nombre] = res.rows[0].id;
    }

    // ─────────────────────────────────────────────────────────────
    // 6. MOVIMIENTOS DE CUENTA CORRIENTE (HISTORIAL DE FIADOS)
    // ─────────────────────────────────────────────────────────────
    console.log('📒 Creando movimientos de cuenta corriente...');
    const idCarlos = clientesMap['Carlos Benítez'];
    const idMariela = clientesMap['Mariela Fernández (Peluquería Estilo)'];
    const idRoberto = clientesMap['Roberto Peralta (Remisería Avenida)'];
    const idLucia = clientesMap['Lucía Méndez (Estudiante UTN)'];

    await client.query(`
      INSERT INTO movimientos_cuenta_corriente (cliente_id, tipo, monto, descripcion, usuario_id, comercio_id, fecha)
      VALUES
        (${idCarlos}, 'venta_credito', 6000.00, 'Fiado: Cigarrillos Marlboro Box + Coca-Cola 500ml', 1, 1, NOW() - INTERVAL '3 days'),
        (${idCarlos}, 'pago', 1500.00, 'Pago parcial en efectivo', 1, 1, NOW() - INTERVAL '1 day'),
        (${idMariela}, 'venta_credito', 12800.00, 'Fiado: Paquete de gaseosas y golosinas para peluquería', 1, 1, NOW() - INTERVAL '2 days'),
        (${idRoberto}, 'venta_credito', 7900.00, 'Fiado: Café, alfajores y cigarrillos turno noche', 1, 1, NOW() - INTERVAL '1 day'),
        (${idLucia}, 'venta_credito', 3850.00, 'Fiado: Fotocopias, galletitas y energizante', 1, 1, NOW() - INTERVAL '4 days'),
        (${idLucia}, 'pago', 2000.00, 'Pago transferencia Mercado Pago', 1, 1, NOW() - INTERVAL '2 days')
    `);

    // ─────────────────────────────────────────────────────────────
    // 7. PRODUCTOS DEL KIOSKO (38 PRODUCTOS REALES CON PRECIOS Y STOCK)
    // ─────────────────────────────────────────────────────────────
    console.log('🍫 Creando catálogo de productos...');
    const pArcor = proveedoresMap['Arcor S.A.I.C.'];
    const pCoca = proveedoresMap['Coca-Cola FEMSA Argentina'];
    const pQuilmes = proveedoresMap['Cervecería y Maltería Quilmes'];
    const pMassalin = proveedoresMap['Massalin Particulares S.A.'];
    const pMondelez = proveedoresMap['Mondelēz International Argentina'];
    const pLosAmigos = proveedoresMap['Distribuidora Mayorista Los Amigos'];
    const pMolinos = proveedoresMap['Molinos Río de la Plata'];

    const productosCatalogo = [
      // Alfajores & Masas
      { barcode: '779000100101', nombre: 'Alfajor Havanna Mixto 90g', costo: 1200, precio: 2000, stock: 24, min: 10, max: 60, rep: 15, rubro: 'Alfajores & Masas', marca: 'Havanna', prov: pArcor },
      { barcode: '779000100102', nombre: 'Alfajor Jorgito Chocolate', costo: 550, precio: 950, stock: 48, min: 20, max: 100, rep: 30, rubro: 'Alfajores & Masas', marca: 'Jorgito', prov: pArcor },
      { barcode: '779000100103', nombre: 'Alfajor Guaymallén Blanco', costo: 300, precio: 550, stock: 65, min: 25, max: 120, rep: 40, rubro: 'Alfajores & Masas', marca: 'Guaymallén', prov: pArcor },
      { barcode: '779000100104', nombre: 'Alfajor Capitán del Espacio Triple', costo: 800, precio: 1400, stock: 18, min: 15, max: 50, rep: 20, rubro: 'Alfajores & Masas', marca: 'Capitán del Espacio', prov: pArcor },
      { barcode: '779000100105', nombre: 'Alfajor Bon o Bon Blanco', costo: 600, precio: 1100, stock: 35, min: 15, max: 60, rep: 20, rubro: 'Alfajores & Masas', marca: 'Arcor', prov: pArcor },
      { barcode: '779000100106', nombre: 'Alfajor Fantoche Triple Negro', costo: 650, precio: 1150, stock: 30, min: 15, max: 60, rep: 20, rubro: 'Alfajores & Masas', marca: 'Fantoche', prov: pArcor },

      // Golosinas & Chocolates
      { barcode: '762221012345', nombre: 'Chocolate Milka con Oreo 100g', costo: 2100, precio: 3400, stock: 16, min: 10, max: 40, rep: 12, rubro: 'Golosinas & Chocolates', marca: 'Milka', prov: pMondelez },
      { barcode: '779058012345', nombre: 'Chocolate Block Arcor 38g', costo: 700, precio: 1200, stock: 32, min: 15, max: 60, rep: 20, rubro: 'Golosinas & Chocolates', marca: 'Arcor', prov: pArcor },
      { barcode: '779123456780', nombre: 'Caramelos Flynn Paff Tutti Frutti x10u', costo: 450, precio: 800, stock: 40, min: 15, max: 80, rep: 25, rubro: 'Golosinas & Chocolates', marca: 'Georgalos', prov: pArcor },
      { barcode: '762220145678', nombre: 'Chicles Beldent Menta 10s', costo: 500, precio: 900, stock: 55, min: 20, max: 100, rep: 30, rubro: 'Golosinas & Chocolates', marca: 'Beldent', prov: pMondelez },
      { barcode: '762230012345', nombre: 'Pastillas Halls Mentol Extra', costo: 480, precio: 850, stock: 42, min: 15, max: 80, rep: 25, rubro: 'Golosinas & Chocolates', marca: 'Halls', prov: pMondelez },
      { barcode: '779058099881', nombre: 'Gomitas Mogul Ositos 50g', costo: 520, precio: 950, stock: 28, min: 12, max: 50, rep: 18, rubro: 'Golosinas & Chocolates', marca: 'Mogul', prov: pArcor },
      { barcode: '779058099882', nombre: 'Barrita Cereal Mix Manzana', costo: 400, precio: 750, stock: 35, min: 15, max: 60, rep: 20, rubro: 'Golosinas & Chocolates', marca: 'Arcor', prov: pArcor },

      // Bebidas & Gaseosas
      { barcode: '779089500044', nombre: 'Coca-Cola 500ml descartable', costo: 950, precio: 1600, stock: 38, min: 24, max: 120, rep: 36, rubro: 'Bebidas & Gaseosas', marca: 'Coca-Cola', prov: pCoca },
      { barcode: '779089500055', nombre: 'Coca-Cola 1.5L descartable', costo: 1700, precio: 2800, stock: 22, min: 12, max: 60, rep: 18, rubro: 'Bebidas & Gaseosas', marca: 'Coca-Cola', prov: pCoca },
      { barcode: '779089500066', nombre: 'Sprite 500ml descartable', costo: 950, precio: 1600, stock: 24, min: 12, max: 60, rep: 18, rubro: 'Bebidas & Gaseosas', marca: 'Sprite', prov: pCoca },
      { barcode: '779112233445', nombre: 'Agua Mineral Villavicencio 500ml s/gas', costo: 600, precio: 1100, stock: 30, min: 15, max: 60, rep: 20, rubro: 'Bebidas & Gaseosas', marca: 'Villavicencio', prov: pCoca },
      { barcode: '779112233446', nombre: 'Agua Saborizada Levité Pomelo 500ml', costo: 750, precio: 1300, stock: 25, min: 12, max: 50, rep: 18, rubro: 'Bebidas & Gaseosas', marca: 'Levité', prov: pCoca },
      { barcode: '708470123456', nombre: 'Monster Energy Original 473ml', costo: 1500, precio: 2500, stock: 28, min: 12, max: 60, rep: 18, rubro: 'Bebidas & Gaseosas', marca: 'Monster', prov: pCoca },
      { barcode: '900249010007', nombre: 'Red Bull Energy Drink 250ml', costo: 1600, precio: 2700, stock: 15, min: 8, max: 40, rep: 12, rubro: 'Bebidas & Gaseosas', marca: 'Red Bull', prov: pCoca },

      // Cervezas & Vinos
      { barcode: '779279800011', nombre: 'Cerveza Quilmes Clásica Lata 473ml', costo: 1100, precio: 1900, stock: 45, min: 24, max: 120, rep: 36, rubro: 'Cervezas & Vinos', marca: 'Quilmes', prov: pQuilmes },
      { barcode: '750105530007', nombre: 'Cerveza Corona Porrón 330ml', costo: 1600, precio: 2600, stock: 18, min: 10, max: 50, rep: 15, rubro: 'Cervezas & Vinos', marca: 'Corona', prov: pQuilmes },
      { barcode: '779279800022', nombre: 'Cerveza Heineken Lata 473ml', costo: 1400, precio: 2400, stock: 32, min: 15, max: 80, rep: 24, rubro: 'Cervezas & Vinos', marca: 'Heineken', prov: pQuilmes },
      { barcode: '779029000001', nombre: 'Fernet Branca 750ml', costo: 7800, precio: 12500, stock: 7, min: 4, max: 20, rep: 6, rubro: 'Cervezas & Vinos', marca: 'Branca', prov: pQuilmes },

      // Cigarrillos & Tabacos
      { barcode: '779123400001', nombre: 'Marlboro Box 20', costo: 2600, precio: 3300, stock: 35, min: 20, max: 100, rep: 30, rubro: 'Cigarrillos & Tabacos', marca: 'Marlboro', prov: pMassalin },
      { barcode: '779123400002', nombre: 'Philip Morris Box 20', costo: 2300, precio: 2900, stock: 40, min: 20, max: 100, rep: 30, rubro: 'Cigarrillos & Tabacos', marca: 'Philip Morris', prov: pMassalin },
      { barcode: '070330600018', nombre: 'Encendedor Bic Maxi', costo: 750, precio: 1300, stock: 26, min: 10, max: 50, rep: 15, rubro: 'Cigarrillos & Tabacos', marca: 'Bic', prov: pMassalin },

      // Snacks & Salados
      { barcode: '779031000101', nombre: 'Papas Fritas Lay’s Clásicas 85g', costo: 1300, precio: 2200, stock: 24, min: 12, max: 60, rep: 18, rubro: 'Snacks & Salados', marca: 'Lay’s', prov: pLosAmigos },
      { barcode: '779031000102', nombre: 'Doritos Mega Queso 85g', costo: 1400, precio: 2400, stock: 20, min: 10, max: 50, rep: 15, rubro: 'Snacks & Salados', marca: 'Doritos', prov: pLosAmigos },
      { barcode: '779031000103', nombre: 'Maní Salado Pehuamar 100g', costo: 700, precio: 1200, stock: 22, min: 10, max: 50, rep: 15, rubro: 'Snacks & Salados', marca: 'Pehuamar', prov: pLosAmigos },

      // Galletitas & Panificados
      { barcode: '762221060001', nombre: 'Galletitas Oreo 118g', costo: 950, precio: 1650, stock: 30, min: 15, max: 60, rep: 20, rubro: 'Galletitas & Panificados', marca: 'Oreo', prov: pMondelez },
      { barcode: '779004000011', nombre: 'Galletitas Chocolinas 170g', costo: 1100, precio: 1850, stock: 25, min: 12, max: 50, rep: 18, rubro: 'Galletitas & Panificados', marca: 'Bagley', prov: pArcor },
      { barcode: '779004000022', nombre: 'Galletitas Criollitas 300g', costo: 900, precio: 1500, stock: 20, min: 10, max: 50, rep: 15, rubro: 'Galletitas & Panificados', marca: 'Bagley', prov: pArcor },

      // Helados & Fríos
      { barcode: '779007000001', nombre: 'Helado Bombón Suizo Frigor', costo: 1500, precio: 2600, stock: 14, min: 8, max: 40, rep: 12, rubro: 'Helados & Fríos', marca: 'Frigor', prov: pArcor },
      { barcode: '779007000002', nombre: 'Helado Torpedo Frutilla Frigor', costo: 800, precio: 1400, stock: 18, min: 8, max: 40, rep: 12, rubro: 'Helados & Fríos', marca: 'Frigor', prov: pArcor },

      // Almacén & Despensa
      { barcode: '779052000001', nombre: 'Yerba Mate Playadito 500g', costo: 1900, precio: 3100, stock: 15, min: 8, max: 40, rep: 12, rubro: 'Almacén & Despensa', marca: 'Playadito', prov: pMolinos },
      { barcode: '779015000001', nombre: 'Azúcar Ledesma Clásica 1kg', costo: 850, precio: 1400, stock: 12, min: 8, max: 40, rep: 12, rubro: 'Almacén & Despensa', marca: 'Ledesma', prov: pMolinos },

      // Librería & Perfumería
      { barcode: '779801234001', nombre: 'Preservativos Prime Ultrafino 3u', costo: 2200, precio: 3800, stock: 16, min: 8, max: 30, rep: 12, rubro: 'Librería & Perfumería', marca: 'Prime', prov: pLosAmigos },
      { barcode: '779025000001', nombre: 'Pañuelos Descartables Elite Pocket 6u', costo: 400, precio: 750, stock: 25, min: 10, max: 50, rep: 15, rubro: 'Librería & Perfumería', marca: 'Elite', prov: pLosAmigos },

      // ── PRODUCTOS CON STOCK CRÍTICO (para probar las alertas) ──
      { barcode: '779018000001', nombre: 'Café La Virginia Molido 250g', costo: 2400, precio: 3900, stock: 2, min: 8, max: 30, rep: 10, rubro: 'Almacén & Despensa', marca: 'La Virginia', prov: pMolinos },
      { barcode: '779279800033', nombre: 'Cerveza Stella Artois Lata 473ml', costo: 1500, precio: 2500, stock: 3, min: 15, max: 60, rep: 20, rubro: 'Cervezas & Vinos', marca: 'Stella Artois', prov: pQuilmes }
    ];

    const productosMap = {};
    for (const prod of productosCatalogo) {
      const margen = prod.costo > 0 ? Number(((prod.precio - prod.costo) / prod.costo * 100).toFixed(2)) : 0;
      const res = await client.query(
        `INSERT INTO productos (
          codigo_barras, nombre, precio_venta, costo, stock, comercio_id,
          rubro, marca, proveedor_id, stock_minimo, stock_maximo, punto_reposicion,
          margen_ganancia, iva_porcentaje
        ) VALUES (
          $1, $2, $3, $4, $5, 1,
          $6, $7, $8, $9, $10, $11,
          $12, 21
        ) RETURNING id, nombre, precio_venta, costo, codigo_barras`,
        [prod.barcode, prod.nombre, prod.precio, prod.costo, prod.stock,
         prod.rubro, prod.marca, prod.prov, prod.min, prod.max, prod.rep, margen]
      );
      productosMap[prod.nombre] = res.rows[0];
    }

    // ─────────────────────────────────────────────────────────────
    // 8. LISTAS DE PRECIOS & PRECIOS POR VOLUMEN
    // ─────────────────────────────────────────────────────────────
    console.log('🏷️ Creando listas de precios y precios por volumen...');
    const lp1 = await client.query(
      `INSERT INTO listas_precios (nombre, descripcion, porcentaje_ajuste, es_mayorista, activa, comercio_id)
       VALUES ('Lista Mostrador', 'Precios estándar al público', 0, FALSE, TRUE, 1) RETURNING id`
    );
    const lp2 = await client.query(
      `INSERT INTO listas_precios (nombre, descripcion, porcentaje_ajuste, es_mayorista, activa, comercio_id)
       VALUES ('Lista Clientes Frecuentes / Mayorista', '10% de descuento en compras por pack', -10.00, TRUE, TRUE, 1) RETURNING id`
    );

    // Precios por volumen (llevando cantidad)
    const pJorgito = productosMap['Alfajor Jorgito Chocolate'];
    const pQuilmesLata = productosMap['Cerveza Quilmes Clásica Lata 473ml'];
    const pCoca500 = productosMap['Coca-Cola 500ml descartable'];

    await client.query(`
      INSERT INTO precios_volumen (producto_id, cantidad_minima, precio, comercio_id)
      VALUES
        (${pJorgito.id}, 6, 850.00, 1),
        (${pQuilmesLata.id}, 6, 1700.00, 1),
        (${pCoca500.id}, 4, 1450.00, 1)
    `);

    // ─────────────────────────────────────────────────────────────
    // 9. CATEGORÍAS DE GASTO Y GASTOS OPERATIVOS
    // ─────────────────────────────────────────────────────────────
    console.log('💸 Creando categorías de gasto y gastos operativos...');
    const catsGastoData = [
      'Alquiler',
      'Servicios (Luz, Gas, Internet)',
      'Sueldos y Jornales',
      'Fletes y Transporte',
      'Mantenimiento y Reparaciones',
      'Artículos de Limpieza',
      'Otros Gastos'
    ];

    const catsGastoMap = {};
    for (const cat of catsGastoData) {
      const res = await client.query(
        `INSERT INTO categorias_gasto (nombre, comercio_id) VALUES ($1, 1) RETURNING id, nombre`,
        [cat]
      );
      catsGastoMap[cat] = res.rows[0].id;
    }

    // ─────────────────────────────────────────────────────────────
    // 10. CAJAS (HISTORIAL Y CAJA ACTUAL ABIERTA)
    // ─────────────────────────────────────────────────────────────
    console.log('💵 Creando sesiones de caja...');

    // Caja de hace 2 días (cerrada)
    const cajaHace2Dias = await client.query(`
      INSERT INTO cajas (
        id_usuario, fecha_apertura, fecha_cierre, monto_inicial, monto_final,
        monto_teorico, diferencia, estado, comercio_id
      ) VALUES (
        1, NOW() - INTERVAL '2 days' - INTERVAL '12 hours', NOW() - INTERVAL '2 days',
        15000.00, 148500.00, 148500.00, 0.00, 'cerrada', 1
      ) RETURNING id
    `);

    // Caja de ayer (cerrada)
    const cajaAyer = await client.query(`
      INSERT INTO cajas (
        id_usuario, fecha_apertura, fecha_cierre, monto_inicial, monto_final,
        monto_teorico, diferencia, estado, comercio_id
      ) VALUES (
        1, NOW() - INTERVAL '1 day' - INTERVAL '12 hours', NOW() - INTERVAL '1 day',
        15000.00, 162200.00, 162000.00, 200.00, 'cerrada', 1
      ) RETURNING id
    `);

    // Caja de HOY (ABIERTA para fran - id 1)
    const cajaHoy = await client.query(`
      INSERT INTO cajas (
        id_usuario, fecha_apertura, fecha_cierre, monto_inicial, monto_final,
        monto_teorico, diferencia, estado, comercio_id
      ) VALUES (
        1, NOW() - INTERVAL '6 hours', NULL,
        20000.00, NULL, 20000.00, NULL, 'abierta', 1
      ) RETURNING id
    `);
    const idCajaHoy = cajaHoy.rows[0].id;

    // Movimientos de caja hoy
    await client.query(`
      INSERT INTO movimientos_caja (id_caja, tipo, monto, descripcion, fecha, comercio_id)
      VALUES
        (${idCajaHoy}, 'egreso', 3500.00, 'Pago de hielo y bolsas plásticas al repartidor', NOW() - INTERVAL '4 hours', 1),
        (${idCajaHoy}, 'ingreso', 5000.00, 'Cambio chico de billetes de $500 y $1000', NOW() - INTERVAL '3 hours', 1)
    `);

    // Gastos operativos registrados
    await client.query(`
      INSERT INTO gastos (concepto, monto, categoria_gasto_id, metodo_pago, afecta_caja, nro_comprobante, usuario_id, comercio_id, fecha)
      VALUES
        ('Factura Edesur Electricidad Kiosko Local', 42500.00, ${catsGastoMap['Servicios (Luz, Gas, Internet)']}, 'transferencia', false, 'FAC-ED-98812', 1, 1, NOW() - INTERVAL '5 days'),
        ('Internet Fibertel 300MB + Línea', 18900.00, ${catsGastoMap['Servicios (Luz, Gas, Internet)']}, 'transferencia', false, 'FAC-FB-10492', 1, 1, NOW() - INTERVAL '4 days'),
        ('Flete furgón mercadería mayorista', 8500.00, ${catsGastoMap['Fletes y Transporte']}, 'efectivo', true, 'REC-FL-3301', 1, 1, NOW() - INTERVAL '2 days'),
        ('Pack artículos de limpieza (lavandina, trapos, desodorante piso)', 6200.00, ${catsGastoMap['Artículos de Limpieza']}, 'efectivo', true, 'TKT-LP-5541', 1, 1, NOW() - INTERVAL '1 day')
    `);

    // ─────────────────────────────────────────────────────────────
    // 11. SECUENCIAS DE FACTURACIÓN
    // ─────────────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO secuencias_facturacion (comercio_id, punto_venta, tipo_comprobante_afip, ultimo_numero)
      VALUES
        (1, 1, 1, 142), -- Factura A
        (1, 1, 6, 420)  -- Factura B
      ON CONFLICT (comercio_id, punto_venta, tipo_comprobante_afip) DO UPDATE
      SET ultimo_numero = EXCLUDED.ultimo_numero
    `);

    // ─────────────────────────────────────────────────────────────
    // 12. VENTAS REALISTAS (HOY, AYER Y ÚLTIMOS 7 DÍAS)
    // ─────────────────────────────────────────────────────────────
    console.log('🛒 Generando ventas realistas (historial de 7 días y ventas de hoy)...');

    // Muestras de carritos de compra típicos de kiosko
    const combosVentas = [
      // Combos individuales
      [
        { prod: 'Alfajor Jorgito Chocolate', cant: 2 },
        { prod: 'Coca-Cola 500ml descartable', cant: 1 }
      ],
      [
        { prod: 'Marlboro Box 20', cant: 1 },
        { prod: 'Encendedor Bic Maxi', cant: 1 }
      ],
      [
        { prod: 'Papas Fritas Lay’s Clásicas 85g', cant: 1 },
        { prod: 'Cerveza Quilmes Clásica Lata 473ml', cant: 2 }
      ],
      [
        { prod: 'Alfajor Havanna Mixto 90g', cant: 2 },
        { prod: 'Chocolate Milka con Oreo 100g', cant: 1 }
      ],
      [
        { prod: 'Chicles Beldent Menta 10s', cant: 2 },
        { prod: 'Pastillas Halls Mentol Extra', cant: 1 },
        { prod: 'Caramelos Flynn Paff Tutti Frutti x10u', cant: 1 }
      ],
      [
        { prod: 'Monster Energy Original 473ml', cant: 1 },
        { prod: 'Alfajor Capitán del Espacio Triple', cant: 1 }
      ],
      [
        { prod: 'Galletitas Oreo 118g', cant: 1 },
        { prod: 'Coca-Cola 1.5L descartable', cant: 1 }
      ],
      [
        { prod: 'Yerba Mate Playadito 500g', cant: 1 },
        { prod: 'Azúcar Ledesma Clásica 1kg', cant: 1 },
        { prod: 'Galletitas Criollitas 300g', cant: 1 }
      ],
      [
        { prod: 'Philip Morris Box 20', cant: 1 },
        { prod: 'Alfajor Guaymallén Blanco', cant: 2 }
      ],
      [
        { prod: 'Cerveza Heineken Lata 473ml', cant: 3 },
        { prod: 'Doritos Mega Queso 85g', cant: 1 },
        { prod: 'Maní Salado Pehuamar 100g', cant: 1 }
      ],
      [
        { prod: 'Helado Bombón Suizo Frigor', cant: 2 },
        { prod: 'Helado Torpedo Frutilla Frigor', cant: 1 }
      ],
      [
        { prod: 'Fernet Branca 750ml', cant: 1 },
        { prod: 'Coca-Cola 1.5L descartable', cant: 2 }
      ],
      [
        { prod: 'Preservativos Prime Ultrafino 3u', cant: 1 },
        { prod: 'Chicles Beldent Menta 10s', cant: 1 }
      ],
      [
        { prod: 'Agua Mineral Villavicencio 500ml s/gas', cant: 2 },
        { prod: 'Barrita Cereal Mix Manzana', cant: 2 }
      ]
    ];

    const metodos = ['efectivo', 'tarjeta', 'transferencia'];
    const tiposComp = ['interno', 'interno', 'factura_b'];

    // Función auxiliar para insertar una venta con sus detalles
    let nroCompSeq = 421;
    async function insertarVenta(combo, horasAtras, idUsuario = 1, clienteInfo = null) {
      const fechaVenta = new Date(Date.now() - (horasAtras * 3600 * 1000));
      const metodo = metodos[Math.floor(Math.random() * metodos.length)];
      const tipoComp = tiposComp[Math.floor(Math.random() * tiposComp.length)];

      let total = 0;
      const itemsCalculados = combo.map(item => {
        const prodData = productosMap[item.prod];
        const sub = prodData.precio_venta * item.cant;
        total += sub;
        return {
          id_producto: prodData.id,
          cantidad: item.cant,
          precio_unitario: prodData.precio_venta,
          subtotal: sub
        };
      });

      const subtotalNeto = (total / 1.21);
      const iva = total - subtotalNeto;
      const nro = tipoComp === 'factura_b' ? nroCompSeq++ : null;

      const vRes = await client.query(
        `INSERT INTO ventas (
          id_usuario, fecha, total, metodo_pago, tipo_comprobante, estado,
          nro_comprobante, cae, cae_vencimiento, comercio_id, descuento,
          cliente_id, subtotal_neto, iva_discriminado, cliente_nombre, cliente_documento
        ) VALUES (
          $1, $2, $3, $4, $5, 'interna',
          $6, NULL, NULL, 1, 0,
          $7, $8, $9, $10, $11
        ) RETURNING id`,
        [
          idUsuario,
          fechaVenta.toISOString(),
          total,
          metodo,
          tipoComp,
          nro,
          clienteInfo ? clienteInfo.id : null,
          subtotalNeto.toFixed(2),
          iva.toFixed(2),
          clienteInfo ? clienteInfo.nombre : null,
          clienteInfo ? clienteInfo.documento : null
        ]
      );
      const idVenta = vRes.rows[0].id;

      for (const it of itemsCalculados) {
        await client.query(
          `INSERT INTO detalle_ventas (id_venta, id_producto, cantidad, precio_unitario, comercio_id)
           VALUES ($1, $2, $3, $4, 1)`,
          [idVenta, it.id_producto, it.cantidad, it.precio_unitario]
        );
      }
    }

    // ── Ventas de HOY (últimas 6 horas) ──
    console.log('   ☀️ Generando ventas de hoy...');
    await insertarVenta(combosVentas[0], 5.5, 1);
    await insertarVenta(combosVentas[1], 5.0, 1, { id: idCarlos, nombre: 'Carlos Benítez', documento: '28456123' });
    await insertarVenta(combosVentas[2], 4.2, 1);
    await insertarVenta(combosVentas[3], 3.8, 1);
    await insertarVenta(combosVentas[4], 3.2, 3); // Empleado pepe
    await insertarVenta(combosVentas[5], 2.7, 3);
    await insertarVenta(combosVentas[6], 2.1, 1);
    await insertarVenta(combosVentas[7], 1.8, 1);
    await insertarVenta(combosVentas[8], 1.2, 1);
    await insertarVenta(combosVentas[9], 0.8, 3);
    await insertarVenta(combosVentas[10], 0.5, 1);
    await insertarVenta(combosVentas[0], 0.2, 1);

    // ── Ventas de AYER (hace 24 a 32 horas) ──
    console.log('   📅 Generando ventas de ayer...');
    for (let i = 0; i < 14; i++) {
      const combo = combosVentas[i % combosVentas.length];
      const horas = 24 + (i * 0.7);
      const vendedor = i % 2 === 0 ? 1 : 3;
      await insertarVenta(combo, horas, vendedor);
    }

    // ── Ventas de DÍAS ANTERIORES (hace 2 a 6 días) ──
    console.log('   📊 Generando ventas de los últimos 6 días...');
    for (let dia = 2; dia <= 6; dia++) {
      for (let j = 0; j < 6; j++) {
        const combo = combosVentas[(dia + j) % combosVentas.length];
        const horas = (dia * 24) + (j * 2);
        const vendedor = (dia + j) % 2 === 0 ? 1 : 3;
        await insertarVenta(combo, horas, vendedor);
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 13. PRESUPUESTOS Y COTIZACIONES
    // ─────────────────────────────────────────────────────────────
    console.log('📋 Creando presupuestos comerciales...');
    const pres1 = await client.query(`
      INSERT INTO presupuestos (
        numero, cliente_id, cliente_nombre, cliente_documento, subtotal, descuento, total,
        estado, valido_hasta, notas, usuario_id, comercio_id, created_at
      ) VALUES (
        1001, ${idMariela}, 'Mariela Fernández (Peluquería Estilo)', '32987654',
        38500.00, 1500.00, 37000.00, 'aprobado', CURRENT_DATE + INTERVAL '15 days',
        'Presupuesto catering inauguración salón: 20 alfajores Havanna, 10 Coca-Cola 500ml y galletitas Chocolinas',
        1, 1, NOW() - INTERVAL '2 days'
      ) RETURNING id
    `);
    const idPres1 = pres1.rows[0].id;

    await client.query(`
      INSERT INTO presupuesto_items (presupuesto_id, producto_id, nombre_producto, cantidad, precio_unitario, subtotal)
      VALUES
        (${idPres1}, ${productosMap['Alfajor Havanna Mixto 90g'].id}, 'Alfajor Havanna Mixto 90g', 15, 2000.00, 30000.00),
        (${idPres1}, ${productosMap['Coca-Cola 500ml descartable'].id}, 'Coca-Cola 500ml descartable', 5, 1600.00, 8000.00),
        (${idPres1}, ${productosMap['Galletitas Chocolinas 170g'].id}, 'Galletitas Chocolinas 170g', 1, 1850.00, 1850.00)
    `);

    const pres2 = await client.query(`
      INSERT INTO presupuestos (
        numero, cliente_id, cliente_nombre, cliente_documento, subtotal, descuento, total,
        estado, valido_hasta, notas, usuario_id, comercio_id, created_at
      ) VALUES (
        1002, ${idCarlos}, 'Carlos Benítez', '28456123',
        22400.00, 0.00, 22400.00, 'pendiente', CURRENT_DATE + INTERVAL '10 days',
        'Presupuesto snacks y bebidas para asado del club',
        1, 1, NOW() - INTERVAL '1 day'
      ) RETURNING id
    `);
    const idPres2 = pres2.rows[0].id;

    await client.query(`
      INSERT INTO presupuesto_items (presupuesto_id, producto_id, nombre_producto, cantidad, precio_unitario, subtotal)
      VALUES
        (${idPres2}, ${productosMap['Cerveza Quilmes Clásica Lata 473ml'].id}, 'Cerveza Quilmes Clásica Lata 473ml', 8, 1900.00, 15200.00),
        (${idPres2}, ${productosMap['Papas Fritas Lay’s Clásicas 85g'].id}, 'Papas Fritas Lay’s Clásicas 85g', 2, 2200.00, 4400.00),
        (${idPres2}, ${productosMap['Maní Salado Pehuamar 100g'].id}, 'Maní Salado Pehuamar 100g', 2, 1200.00, 2400.00)
    `);

    // ─────────────────────────────────────────────────────────────
    // 14. ÓRDENES DE COMPRA A PROVEEDORES
    // ─────────────────────────────────────────────────────────────
    console.log('📦 Creando órdenes de compra a proveedores...');
    const oc1 = await client.query(`
      INSERT INTO ordenes_compra (
        numero, proveedor_id, proveedor_nombre, estado, total, notas, fecha_esperada,
        usuario_id, comercio_id, created_at, recibida_at
      ) VALUES (
        501, ${pArcor}, 'Arcor S.A.I.C.', 'recibida', 84500.00,
        'Pedido mensual de chocolates, alfajores y caramelos', CURRENT_DATE - INTERVAL '2 days',
        1, 1, NOW() - INTERVAL '5 days', NOW() - INTERVAL '2 days'
      ) RETURNING id
    `);
    const idOc1 = oc1.rows[0].id;

    await client.query(`
      INSERT INTO ordenes_compra_items (orden_compra_id, producto_id, nombre_producto, cantidad_pedida, cantidad_recibida, precio_unitario, subtotal)
      VALUES
        (${idOc1}, ${productosMap['Alfajor Bon o Bon Blanco'].id}, 'Alfajor Bon o Bon Blanco', 50, 50, 600.00, 30000.00),
        (${idOc1}, ${productosMap['Chocolate Block Arcor 38g'].id}, 'Chocolate Block Arcor 38g', 45, 45, 700.00, 31500.00),
        (${idOc1}, ${productosMap['Caramelos Flynn Paff Tutti Frutti x10u'].id}, 'Caramelos Flynn Paff Tutti Frutti x10u', 50, 50, 460.00, 23000.00)
    `);

    const oc2 = await client.query(`
      INSERT INTO ordenes_compra (
        numero, proveedor_id, proveedor_nombre, estado, total, notas, fecha_esperada,
        usuario_id, comercio_id, created_at, recibida_at
      ) VALUES (
        502, ${pCoca}, 'Coca-Cola FEMSA Argentina', 'enviada', 68400.00,
        'Reposición de gaseosas y aguas línea chica', CURRENT_DATE + INTERVAL '2 days',
        1, 1, NOW() - INTERVAL '1 day', NULL
      ) RETURNING id
    `);
    const idOc2 = oc2.rows[0].id;

    await client.query(`
      INSERT INTO ordenes_compra_items (orden_compra_id, producto_id, nombre_producto, cantidad_pedida, cantidad_recibida, precio_unitario, subtotal)
      VALUES
        (${idOc2}, ${productosMap['Coca-Cola 500ml descartable'].id}, 'Coca-Cola 500ml descartable', 48, 0, 950.00, 45600.00),
        (${idOc2}, ${productosMap['Sprite 500ml descartable'].id}, 'Sprite 500ml descartable', 24, 0, 950.00, 22800.00)
    `);

    // ─────────────────────────────────────────────────────────────
    // 15. FACTURAS DE COMPRA (INGRESO DE STOCK)
    // ─────────────────────────────────────────────────────────────
    console.log('🧾 Creando facturas de compra...');
    const fc1 = await client.query(`
      INSERT INTO facturas_compra (
        numero, proveedor_id, proveedor_nombre, fecha_emision, fecha_vencimiento,
        subtotal_neto, iva_monto, total, metodo_pago, estado, recibida, recibida_at,
        notas, usuario_id, comercio_id, created_at
      ) VALUES (
        'A-0004-00128912', ${pArcor}, 'Arcor S.A.I.C.', CURRENT_DATE - INTERVAL '3 days',
        CURRENT_DATE + INTERVAL '27 days', 69834.71, 14665.29, 84500.00,
        'transferencia', 'pagada', true, NOW() - INTERVAL '2 days',
        'Factura oficial Arcor entrega lunes', 1, 1, NOW() - INTERVAL '3 days'
      ) RETURNING id
    `);
    const idFc1 = fc1.rows[0].id;

    await client.query(`
      INSERT INTO facturas_compra_items (factura_compra_id, producto_id, nombre_producto, cantidad, precio_unitario, iva_porcentaje, subtotal)
      VALUES
        (${idFc1}, ${productosMap['Alfajor Bon o Bon Blanco'].id}, 'Alfajor Bon o Bon Blanco', 50, 600.00, 21, 30000.00),
        (${idFc1}, ${productosMap['Chocolate Block Arcor 38g'].id}, 'Chocolate Block Arcor 38g', 45, 700.00, 21, 31500.00),
        (${idFc1}, ${productosMap['Caramelos Flynn Paff Tutti Frutti x10u'].id}, 'Caramelos Flynn Paff Tutti Frutti x10u', 50, 460.00, 21, 23000.00)
    `);

    // ─────────────────────────────────────────────────────────────
    // 16. NOTIFICACIONES DEL SISTEMA (ALERTAS REALISTAS)
    // ─────────────────────────────────────────────────────────────
    console.log('🔔 Generando notificaciones y alertas...');
    await client.query(`
      INSERT INTO notificaciones (comercio_id, tipo, titulo, mensaje, leida, accion_url, fecha)
      VALUES
        (1, 'stock_critico', 'Stock Crítico: Café La Virginia', 'Quedan solo 2 unidades de Café La Virginia Molido 250g (Mínimo: 8). Se recomienda emitir orden de compra.', false, '/inventario', NOW() - INTERVAL '2 hours'),
        (1, 'stock_critico', 'Stock Crítico: Stella Artois', 'Quedan solo 3 latas de Cerveza Stella Artois Lata 473ml (Mínimo: 15). Se recomienda reponer.', false, '/inventario', NOW() - INTERVAL '1 hour'),
        (1, 'caja_abierta', 'Apertura de Caja Exitosa', 'Caja iniciada hoy a las 08:00 hs con un fondo de cambio de $20.000.', true, '/caja', NOW() - INTERVAL '6 hours')
    `);

    // ─────────────────────────────────────────────────────────────
    // 17. HISTORIAL DE CAMBIOS DE PRECIOS
    // ─────────────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO historial_precios (producto_id, comercio_id, precio_anterior, precio_nuevo, costo_anterior, costo_nuevo, usuario_id, motivo, fecha)
      VALUES
        (${productosMap['Coca-Cola 500ml descartable'].id}, 1, 1400.00, 1600.00, 850.00, 950.00, 1, 'Actualización lista de precios distribuidor oficial', NOW() - INTERVAL '4 days'),
        (${productosMap['Marlboro Box 20'].id}, 1, 3000.00, 3300.00, 2400.00, 2600.00, 1, 'Aumento oficial tabacalera Massalin', NOW() - INTERVAL '6 days')
    `);

    // Confirmar la transacción
    await client.query('COMMIT');
    console.log('\n🎉 ¡SEED EXITOSO! La base de datos ahora contiene datos 100% reales y completos de un Kiosko argentino.');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error fatal en el proceso de seed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
    process.exit(0);
  }
}

seed();
