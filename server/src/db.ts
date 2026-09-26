import { Pool, types } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Ensure env vars are loaded
dotenv.config({ path: path.resolve(__dirname, '../.env') });

/*
  A `DATE` is a calendar date, and it leaves the database as the `YYYY-MM-DD` it is. By default `pg`
  builds a JS `Date` at the *server's* local midnight, which serialises as UTC: a birthdate of
  `2010-02-06` reached the app as `2010-02-05T22:00:00.000Z`, and every save wrote the day before
  back (DATE-1). 1082 is the `DATE` type OID. See the date-formatting skill.
*/
types.setTypeParser(1082, (value: string) => value);

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
});

pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

export const query = (text: string, params?: any[]) => pool.query(text, params);
export default pool;
