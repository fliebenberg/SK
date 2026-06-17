const { Pool } = require('pg');
const pool = new Pool({ 
  host: 'localhost',
  database: 'sk',
  port: 5432,
  user: 'sk_admin',
  password: 'scorekeeper'
});
pool.query('SELECT id, name, default_settings FROM sports').then(res => {
  console.log(JSON.stringify(res.rows, null, 2));
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
