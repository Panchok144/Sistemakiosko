/**
 * backend/utils/logger.js
 * Logger estructurado para KIOSKOPRO (Nivel, Ruta, Comercio, Duración, Sanitización)
 */

const SENSITIVE_KEYS = new Set([
  'password',
  'contrasena',
  'pin',
  'pin_supervisor',
  'token',
  'jwt',
  'authorization',
  'secret',
  'afip_crt',
  'afip_key',
]);

function redactSensitiveData(data) {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) {
    return data.map(redactSensitiveData);
  }

  const clean = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      clean[key] = '[REDACTADO]';
    } else if (typeof value === 'object' && value !== null) {
      clean[key] = redactSensitiveData(value);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

function formatLog(level, message, meta = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level: level.toUpperCase(),
    message,
    ...redactSensitiveData(meta),
  };
  return JSON.stringify(logEntry);
}

const logger = {
  info: (msg, meta) => console.log(formatLog('info', msg, meta)),
  warn: (msg, meta) => console.warn(formatLog('warn', msg, meta)),
  error: (msg, meta) => console.error(formatLog('error', msg, meta)),
  debug: (msg, meta) => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(formatLog('debug', msg, meta));
    }
  },

  // Express middleware para logging estructurado de peticiones HTTP
  httpLogger: (req, res, next) => {
    const start = Date.now();
    const { method, originalUrl } = req;

    res.on('finish', () => {
      const durationMs = Date.now() - start;
      const statusCode = res.statusCode;
      const comercioId = req.usuario?.comercio_id || null;
      const usuarioId = req.usuario?.id || null;

      const meta = {
        method,
        path: originalUrl,
        statusCode,
        durationMs,
        comercioId,
        usuarioId,
        ip: req.ip || req.headers['x-forwarded-for'] || null,
      };

      const logMsg = `${method} ${originalUrl} ${statusCode} (${durationMs}ms)`;

      if (statusCode >= 500) {
        logger.error(logMsg, meta);
      } else if (statusCode >= 400) {
        logger.warn(logMsg, meta);
      } else {
        logger.info(logMsg, meta);
      }
    });

    next();
  },
};

module.exports = logger;
