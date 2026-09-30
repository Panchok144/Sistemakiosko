const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  const migDir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(migDir).filter(f => f.endsWith('.sql')).sort();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migraciones (
      nombre VARCHAR PRIMARY KEY,
      ejecutado_en TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  for (const f of files) {
    const { rows } = await pool.query('SELECT nombre FROM _migraciones WHERE nombre = $1', [f]);
    if (rows.length > 0) {
      console.log('Ya ejecutada:', f);
      continue;
    }
    try {
      const sql = fs.readFileSync(path.join(migDir, f), 'utf8');
      await pool.query(sql);
      await pool.query('INSERT INTO _migraciones(nombre) VALUES($1)', [f]);
      console.log('OK:', f);
    } catch (err) {
      console.error('ERROR en', f, ':', err.message);
    }
  }

  await pool.end();
  console.log('Migraciones completadas');
}
run().catch(e => { console.error(e); process.exit(1); });
