const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();
const { authMiddleware } = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');

const rutasProductos = require('./routes/productos');
const rutasUsuarios = require('./routes/usuarios');
const rutasVentas = require('./routes/ventas');
const rutasProveedores = require('./routes/proveedores');
const rutasCaja = require('./routes/caja');
const rutasClientes = require('./routes/clientes');
const rutasRemitos = require('./routes/remitos');
const rutasRecibos = require('./routes/recibos');
const rutasRubros = require('./routes/rubros');
const rutasAuditoria = require('./routes/auditoria');
const rutasDevoluciones = require('./routes/devoluciones');
const rutasCuentaCorriente = require('./routes/cuentaCorriente');
const rutasListasPrecios = require('./routes/listasPrecios');
const rutasPresupuestos = require('./routes/presupuestos');
const rutasOrdenesCompra = require('./routes/ordenesCompra');
const rutasReportes = require('./routes/reportes');
const rutasConfiguracion = require('./routes/configuracion');
const rutasGastos = require('./routes/gastos');
const rutasFacturasCompra = require('./routes/facturas_compra');
const rutasNotas = require('./routes/notas');
const rutasLicencias = require('./routes/licencias');
const rutasBackup = require('./routes/backup');
const rutasAlertas = require('./routes/alertas');
const rutasDemo = require('./routes/demo');
const rutasVencimientos = require('./routes/vencimientos');
const rutasConteos = require('./routes/conteos');
const rutasPromociones = require('./routes/promociones');
const rutasFidelidad = require('./routes/fidelidad');
const rutasCatalogo = require('./routes/catalogo');

const app = express();
const PORT = process.env.PORT || 4000;

app.disable('x-powered-by');

// 1. CORS DEBE IR PRIMERO QUE CUALQUIER OTRO MIDDLEWARE
const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map(s => s.trim())
  : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:5176'];

app.use(
  cors({
    origin: (origin, callback) => {
      // Permitir: sin origin (herramientas como Postman/curl), localhost o IPs listadas
      if (!origin || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) || allowedOrigins.includes(origin)) {
        return callback(null, origin || '*');
      }
      // SEGURIDAD: rechazar orígenes no reconocidos
      return callback(new Error(`Origen no permitido por CORS: ${origin}`));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'x-idempotency-key'],
    credentials: true,
  })
);


// 2. Helmet para seguridad de headers
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// 3. Rate limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { error: 'Demasiadas peticiones desde esta IP, por favor intente nuevamente en 15 minutos.' }
});
app.use('/api/', limiter);

// 4. Parser de JSON
app.use(express.json({ limit: '500kb' }));

// 5. Logger estructurado (sanitización de tokens/passwords y métricas de duración)
const logger = require('./utils/logger');
app.use(logger.httpLogger);

const usuarioAuthGuard = (req, res, next) => {
  if (req.path === '/login') {
    return next();
  }
  return authMiddleware(req, res, next);
};

app.use('/api/usuarios', usuarioAuthGuard, rutasUsuarios);
app.use('/api/productos', authMiddleware, rutasProductos);
app.use('/api/ventas', authMiddleware, rutasVentas);
app.use('/api/proveedores', authMiddleware, rutasProveedores);
app.use('/api/caja', authMiddleware, rutasCaja);
app.use('/api/clientes', authMiddleware, rutasClientes);
app.use('/api/remitos', authMiddleware, rutasRemitos);
app.use('/api/recibos', authMiddleware, rutasRecibos);
app.use('/api/rubros', authMiddleware, rutasRubros);
app.use('/api/auditoria', authMiddleware, rutasAuditoria);
app.use('/api/devoluciones', authMiddleware, rutasDevoluciones);
app.use('/api/cuenta-corriente', authMiddleware, rutasCuentaCorriente);
app.use('/api/listas-precios', authMiddleware, rutasListasPrecios);
app.use('/api/presupuestos', authMiddleware, rutasPresupuestos);
app.use('/api/ordenes-compra', authMiddleware, rutasOrdenesCompra);
app.use('/api/reportes', authMiddleware, rutasReportes);
app.use('/api/configuracion', authMiddleware, rutasConfiguracion);
app.use('/api/gastos', authMiddleware, rutasGastos);
app.use('/api/facturas-compra', authMiddleware, rutasFacturasCompra);
app.use('/api/notas', authMiddleware, rutasNotas);
app.use('/api/licencias', authMiddleware, rutasLicencias);
app.use('/api/backup', authMiddleware, rutasBackup);
app.use('/api/alertas', authMiddleware, rutasAlertas);
app.use('/api/vencimientos', authMiddleware, rutasVencimientos);
app.use('/api/conteos', authMiddleware, rutasConteos);
app.use('/api/promociones', authMiddleware, rutasPromociones);
app.use('/api/fidelidad', authMiddleware, rutasFidelidad);
// M15: Catálogo público — SIN autenticación, acceso libre
app.use('/api/catalogo', rutasCatalogo);

const demoAuthGuard = (req, res, next) => {
  if (req.path === '/login-demo' || req.path === '/acceso-demo') {
    return next();
  }
  return authMiddleware(req, res, next);
};

app.use('/api/demo', demoAuthGuard, rutasDemo);


app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.get('/api/saludo', authMiddleware, (req, res) => {
  res.json({ mensaje: '¡Servidor corriendo y listo para el kiosko!' });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

app.use(errorHandler);

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Backend listo en http://localhost:${PORT}`);
  });
}

module.exports = app;
