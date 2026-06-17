import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Required for Supabase
  }
});

pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Supabase DB connection error:', err.message);
  } else {
    console.log('✅ Supabase DB connected successfully at:', res.rows[0].now);
  }
});

export default pool;
