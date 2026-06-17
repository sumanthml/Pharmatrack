import pg from 'pg';
import dotenv from 'dotenv';
import dns from 'dns';

dns.setDefaultResultOrder('ipv4first');
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

// Prevent unhandled error events from crashing the Node process
pool.on('error', (err, client) => {
  console.error('⚠️ Unexpected idle Supabase DB client error:', err.message);
});

export default pool;
