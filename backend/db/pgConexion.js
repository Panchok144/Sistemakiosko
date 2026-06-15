const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL || process.env.PG_CONNECTION_STRING;

if (!connectionString) {
  console.error('❌ No se encontró DATABASE_URL o PG_CONNECTION_STRING en el entorno.');
  process.exit(1);
}

// Neon PostgreSQL es serverless: puede tardar varios segundos en "despertar".
// connectionTimeoutMillis aumentado a 10s y se agrega SSL explícito.
const pool = new Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  // Si una query no responde en 15s, PostgreSQL la mata y lanza un error
  // capturado por el try/catch de cada ruta. Previene deadlocks indefinidos.
  statement_timeout: 15000,
  ssl: {
    rejectUnauthorized: false,
  },
});

pool.on('connect', () => {
  console.log('✅ Conectado a PostgreSQL con pg Pool.');
});

pool.on('error', (err) => {
  console.error('❌ Error en la conexión PostgreSQL del pool:', err.message);
});

const query = (text, params) => pool.query(text, params);
const getClient = () => pool.connect();

module.exports = {
  query,
  getClient,
  pool,
};
