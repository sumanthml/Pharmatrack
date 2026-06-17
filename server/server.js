import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import pool from './db.js';
import { calculatePredictions } from './ml.js';
import { generateInsights, chatWithPharmacist } from './gemini.js';
import { sendAlertEmail } from './email.js';

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // Allow frontend connection
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Log incoming requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Seed Mock Data Helper
async function seedMockData() {
  console.log('🌱 Predefined mock data seeding is disabled.');
}

// REST API Routes

// 1. User Sync
app.post('/api/users/sync', async (req, res) => {
  const { id, email, role, company_name } = req.body;
  if (!id || !email) {
    return res.status(400).json({ error: 'ID and Email are required.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO users (id, email, role, company_name) 
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET 
         email = EXCLUDED.email, 
         role = COALESCE(users.role, EXCLUDED.role),
         company_name = COALESCE(users.company_name, EXCLUDED.company_name)
       RETURNING *`,
      [id, email, role || 'pharmacist', company_name || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error syncing user:', err.message);
    res.status(500).json({ error: 'Server error syncing user' });
  }
});

// 1b. User Profile Management
app.get('/api/users/profile/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User profile not found.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching user profile:', err.message);
    res.status(500).json({ error: 'Server error fetching user profile' });
  }
});

app.put('/api/users/profile/:id', async (req, res) => {
  const { id } = req.params;
  const { alert_email, company_name, company_phone, company_address, license_number } = req.body;
  try {
    const result = await pool.query(
      `UPDATE users 
       SET alert_email = $1, 
           company_name = $2, 
           company_phone = $3, 
           company_address = $4, 
           license_number = $5 
       WHERE id = $6 
       RETURNING *`,
      [alert_email, company_name, company_phone, company_address, license_number, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User profile not found.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating user profile:', err.message);
    res.status(500).json({ error: 'Server error updating user profile' });
  }
});

app.post('/api/users/profile/:id/send-alerts-email', async (req, res) => {
  const { id } = req.params;
  try {
    const userRes = await pool.query('SELECT email, alert_email FROM users WHERE id = $1', [id]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    const user = userRes.rows[0];
    const recipient = user.alert_email || user.email;

    if (!recipient) {
      return res.status(400).json({ error: 'No alert email configured.' });
    }

    const medsRes = await pool.query('SELECT * FROM medicines WHERE user_id = $1', [id]);
    const meds = medsRes.rows;
    const now = new Date();
    
    const activeAlerts = [];
    let expiredCount = 0;
    let lowStockCount = 0;

    meds.forEach(med => {
      const expiry = new Date(med.expiry_date);
      const diffDays = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
      
      let isAlert = false;
      let alertMessage = '';
      let alertType = 'warning';

      if (med.quantity === 0) {
        isAlert = true;
        alertMessage = `Medicine "${med.name}" is completely out of stock!`;
        alertType = 'danger';
      } else if (med.quantity <= med.min_stock_level) {
        isAlert = true;
        alertMessage = `Medicine "${med.name}" is down to ${med.quantity} units (Threshold: ${med.min_stock_level})`;
        lowStockCount++;
      }

      if (diffDays <= 0) {
        isAlert = true;
        alertMessage = `Medicine "${med.name}" (Batch ${med.batch_number}) has expired on ${new Date(med.expiry_date).toISOString().split('T')[0]}!`;
        alertType = 'danger';
        expiredCount++;
      } else if (diffDays <= 60) {
        isAlert = true;
        alertMessage = `Medicine "${med.name}" (Batch ${med.batch_number}) expires in ${diffDays} days.`;
      }

      if (isAlert) {
        activeAlerts.push({
          name: med.name,
          batch: med.batch_number,
          qty: med.quantity,
          type: alertType,
          message: alertMessage
        });
      }
    });

    const statsSummary = {
      expired: expiredCount,
      lowStock: lowStockCount,
      totalMedicines: meds.length
    };

    const emailResult = await sendAlertEmail(recipient, statsSummary, activeAlerts);
    res.json(emailResult);

  } catch (err) {
    console.error('Error triggering alerts email:', err.message);
    res.status(500).json({ error: 'Server error triggering alert email: ' + err.message });
  }
});

// 2. Medicines CRUD
app.get('/api/medicines', async (req, res) => {
  const { userId } = req.query;
  try {
    const result = await pool.query(
      'SELECT * FROM medicines WHERE user_id = $1 ORDER BY expiry_date ASC',
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching medicines:', err.message);
    res.status(500).json({ error: 'Server error fetching medicines' });
  }
});

app.post('/api/medicines', async (req, res) => {
  const { 
    name, batch_number, manufacturing_date, expiry_date, quantity, 
    min_stock_level, price, supplier_name, supplier_email, supplier_phone, purchase_date, userId
  } = req.body;

  try {
    const result = await pool.query(`
      INSERT INTO medicines (
        name, batch_number, manufacturing_date, expiry_date, quantity, 
        min_stock_level, price, supplier_name, supplier_email, supplier_phone, purchase_date, user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [
      name, batch_number, manufacturing_date, expiry_date, quantity, 
      min_stock_level || 10, price || 0, supplier_name, supplier_email, supplier_phone, purchase_date, userId
    ]);

    const newMed = result.rows[0];

    // Emit real-time update to user's room
    if (userId) {
      io.to(userId).emit('medicine_change', { action: 'create', data: newMed });
    }
    
    // Check if added stock is already low or expired
    checkMedAlerts(newMed);

    res.status(201).json(newMed);
  } catch (err) {
    console.error('Error creating medicine:', err.message);
    res.status(500).json({ error: 'Server error creating medicine' });
  }
});

app.put('/api/medicines/:id', async (req, res) => {
  const { id } = req.params;
  const { 
    name, batch_number, manufacturing_date, expiry_date, quantity, 
    min_stock_level, price, supplier_name, supplier_email, supplier_phone, purchase_date, userId
  } = req.body;

  try {
    const result = await pool.query(`
      UPDATE medicines SET 
        name = $1, batch_number = $2, manufacturing_date = $3, expiry_date = $4, 
        quantity = $5, min_stock_level = $6, price = $7, supplier_name = $8, 
        supplier_email = $9, supplier_phone = $10, purchase_date = $11
      WHERE id = $12 AND user_id = $13 RETURNING *
    `, [
      name, batch_number, manufacturing_date, expiry_date, quantity, 
      min_stock_level, price, supplier_name, supplier_email, supplier_phone, purchase_date, id, userId
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Medicine not found' });
    }

    const updatedMed = result.rows[0];
    if (userId) {
      io.to(userId).emit('medicine_change', { action: 'update', data: updatedMed });
    }
    checkMedAlerts(updatedMed);

    res.json(updatedMed);
  } catch (err) {
    console.error('Error updating medicine:', err.message);
    res.status(500).json({ error: 'Server error updating medicine' });
  }
});

app.delete('/api/medicines/:id', async (req, res) => {
  const { id } = req.params;
  const { userId } = req.query;
  try {
    const result = await pool.query(
      'DELETE FROM medicines WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Medicine not found' });
    }
    if (userId) {
      io.to(userId).emit('medicine_change', { action: 'delete', data: { id: parseInt(id) } });
    }
    res.json({ message: 'Medicine deleted successfully', deleted: result.rows[0] });
  } catch (err) {
    console.error('Error deleting medicine:', err.message);
    res.status(500).json({ error: 'Server error deleting medicine' });
  }
});

// Helper for Alert Notification pushes
let lastEmailSentTime = 0;

// Helper for Alert Notification pushes
async function checkMedAlerts(med) {
  const userId = med.user_id;
  if (!userId) return;

  const now = new Date();
  const expiry = new Date(med.expiry_date);
  const diffDays = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
  let isAlertTriggered = false;

  if (med.quantity === 0) {
    io.to(userId).emit('alert', {
      type: 'danger',
      message: `🚨 Critical: Medicine "${med.name}" (Batch ${med.batch_number}) is completely out of stock!`
    });
    isAlertTriggered = true;
  } else if (med.quantity <= med.min_stock_level) {
    io.to(userId).emit('alert', {
      type: 'warning',
      message: `⚠️ Low Stock Warning: "${med.name}" is down to ${med.quantity} units (Threshold: ${med.min_stock_level})`
    });
    isAlertTriggered = true;
  }

  const formattedDate = new Date(med.expiry_date).toISOString().split('T')[0];

  if (diffDays <= 0) {
    io.to(userId).emit('alert', {
      type: 'danger',
      message: `🚨 Discard Alert: Medicine "${med.name}" (Batch ${med.batch_number}) has expired on ${formattedDate}!`
    });
    isAlertTriggered = true;
  } else if (diffDays <= 60) {
    io.to(userId).emit('alert', {
      type: 'warning',
      message: `⏳ Expiry Alert: "${med.name}" (Batch ${med.batch_number}) expires in ${diffDays} days!`
    });
    isAlertTriggered = true;
  }

  // Automated visual email dispatch (throttled to 5 minutes to prevent email spam)
  if (isAlertTriggered) {
    const timeSinceLastEmail = Date.now() - lastEmailSentTime;
    if (timeSinceLastEmail > 5 * 60 * 1000) {
      lastEmailSentTime = Date.now();
      console.log(`✉️ Automated stock/expiry alert triggered for user ${userId}. Dispatching visual email report...`);
      
      try {
        const userRes = await pool.query("SELECT email, alert_email FROM users WHERE id = $1", [userId]);
        if (userRes.rows.length > 0) {
          const user = userRes.rows[0];
          const recipient = user.alert_email || user.email;
          
          if (recipient) {
            const medsRes = await pool.query('SELECT * FROM medicines WHERE user_id = $1', [userId]);
            const meds = medsRes.rows;
            
            const activeAlerts = [];
            let expiredCount = 0;
            let lowStockCount = 0;

            meds.forEach(m => {
              const exp = new Date(m.expiry_date);
              const diff = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
              let isMAlert = false;
              let mType = 'warning';
              let mMsg = '';

              if (m.quantity === 0) {
                isMAlert = true;
                mType = 'danger';
                mMsg = `Medicine "${m.name}" is out of stock!`;
              } else if (m.quantity <= m.min_stock_level) {
                isMAlert = true;
                lowStockCount++;
                mMsg = `Medicine "${m.name}" is down to ${m.quantity} units (Threshold: ${m.min_stock_level}).`;
              }

              if (diff <= 0) {
                isMAlert = true;
                mType = 'danger';
                mMsg = `Medicine "${m.name}" expired on ${new Date(m.expiry_date).toISOString().split('T')[0]}.`;
                expiredCount++;
              } else if (diff <= 60) {
                isMAlert = true;
                mMsg = `Medicine "${m.name}" expires in ${diff} days.`;
              }

              if (isMAlert) {
                activeAlerts.push({
                  name: m.name,
                  batch: m.batch_number,
                  qty: m.quantity,
                  type: mType,
                  message: mMsg
                });
              }
            });

            const statsSummary = {
              expired: expiredCount,
              lowStock: lowStockCount,
              totalMedicines: meds.length
            };

            console.log(`✉️ Dispatching automated report to ${recipient}`);
            await sendAlertEmail(recipient, statsSummary, activeAlerts);
          }
        }
      } catch (err) {
        console.error('Error sending automated alert email:', err.message);
      }
    } else {
      console.log(`✉️ Automated email notification throttled (sent recently).`);
    }
  }
}

// 3. Sales Management
app.post('/api/sales', async (req, res) => {
  const { medicine_id, quantity, userId } = req.body;
  if (!medicine_id || !quantity) {
    return res.status(400).json({ error: 'Medicine ID and quantity are required.' });
  }

  try {
    // Check medicine stock and price (ownership verified via user_id)
    const medRes = await pool.query('SELECT * FROM medicines WHERE id = $1 AND user_id = $2', [medicine_id, userId]);
    if (medRes.rows.length === 0) {
      return res.status(404).json({ error: 'Medicine not found' });
    }

    const med = medRes.rows[0];
    if (med.quantity < quantity) {
      return res.status(400).json({ error: `Insufficient stock. Current quantity: ${med.quantity}` });
    }

    const totalPrice = Number((med.price * quantity).toFixed(2));

    // Start database transaction
    await pool.query('BEGIN');

    // Decrement stock
    const updatedMedRes = await pool.query(
      'UPDATE medicines SET quantity = quantity - $1 WHERE id = $2 AND user_id = $3 RETURNING *',
      [quantity, medicine_id, userId]
    );

    // Insert sale record with user_id
    const saleRes = await pool.query(
      'INSERT INTO sales (medicine_id, quantity, total_price, user_id) VALUES ($1, $2, $3, $4) RETURNING *',
      [medicine_id, quantity, totalPrice, userId]
    );

    await pool.query('COMMIT');

    const updatedMed = updatedMedRes.rows[0];
    const sale = saleRes.rows[0];

    // Emit changes to user's room
    if (userId) {
      io.to(userId).emit('medicine_change', { action: 'update', data: updatedMed });
      io.to(userId).emit('sale_created', { sale, medicine_name: med.name });
    }
    
    // Check if new stock levels require alerts
    checkMedAlerts(updatedMed);

    res.status(201).json({ sale, updatedMedicine: updatedMed });
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('Error recording sale:', err.message);
    res.status(500).json({ error: 'Server error processing transaction' });
  }
});

app.get('/api/sales', async (req, res) => {
  const { userId } = req.query;
  try {
    const result = await pool.query(`
      SELECT s.*, m.name as medicine_name, m.batch_number 
      FROM sales s
      JOIN medicines m ON s.medicine_id = m.id
      WHERE s.user_id = $1
      ORDER BY s.sale_date DESC
    `, [userId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching sales history:', err.message);
    res.status(500).json({ error: 'Server error fetching sales history' });
  }
});

// 4. Supplier Management
app.get('/api/suppliers', async (req, res) => {
  const { userId } = req.query;
  try {
    const result = await pool.query(`
      SELECT s.id, s.name, s.email, s.phone, s.address, s.created_at, 
             COALESCE(json_agg(DISTINCT m.name) FILTER (WHERE m.name IS NOT NULL), '[]') as medicines
      FROM suppliers s
      LEFT JOIN medicines m ON LOWER(s.name) = LOWER(m.supplier_name) AND m.user_id = s.user_id
      WHERE s.user_id = $1
      GROUP BY s.id
      ORDER BY s.name ASC
    `, [userId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching suppliers:', err.message);
    res.status(500).json({ error: 'Server error fetching suppliers' });
  }
});

app.post('/api/suppliers', async (req, res) => {
  const { name, email, phone, address, userId } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Supplier name is required.' });
  }
  try {
    // Check if supplier name already exists for this specific company
    const dupRes = await pool.query('SELECT * FROM suppliers WHERE LOWER(name) = LOWER($1) AND user_id = $2', [name, userId]);
    if (dupRes.rows.length > 0) {
      return res.status(400).json({ error: 'A supplier with this name already exists for your company.' });
    }

    const result = await pool.query(
      `INSERT INTO suppliers (name, email, phone, address, user_id) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING *`,
      [name, email || '', phone || '', address || '', userId]
    );
    const supplier = result.rows[0];
    supplier.medicines = [];
    if (userId) {
      io.to(userId).emit('supplier_change', { action: 'create', data: supplier });
    }
    res.status(201).json(supplier);
  } catch (err) {
    console.error('Error creating supplier:', err.message);
    res.status(500).json({ error: 'Server error creating supplier' });
  }
});

app.put('/api/suppliers/:id', async (req, res) => {
  const { id } = req.params;
  const { name, email, phone, address, userId } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Supplier name is required.' });
  }
  try {
    // Check duplicate name for this user (excluding current supplier id)
    const dupRes = await pool.query('SELECT * FROM suppliers WHERE LOWER(name) = LOWER($1) AND user_id = $2 AND id != $3', [name, userId, id]);
    if (dupRes.rows.length > 0) {
      return res.status(400).json({ error: 'A supplier with this name already exists for your company.' });
    }

    const result = await pool.query(
      `UPDATE suppliers 
       SET name = $1, email = $2, phone = $3, address = $4 
       WHERE id = $5 AND user_id = $6
       RETURNING *`,
      [name, email || '', phone || '', address || '', id, userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Supplier not found.' });
    }
    
    const medsRes = await pool.query(
      `SELECT name FROM medicines WHERE LOWER(supplier_name) = LOWER($1) AND user_id = $2`,
      [name, userId]
    );
    const supplier = result.rows[0];
    supplier.medicines = medsRes.rows.map(m => m.name);
    
    if (userId) {
      io.to(userId).emit('supplier_change', { action: 'update', data: supplier });
    }
    res.json(supplier);
  } catch (err) {
    console.error('Error updating supplier:', err.message);
    res.status(500).json({ error: 'Server error updating supplier' });
  }
});

app.delete('/api/suppliers/:id', async (req, res) => {
  const { id } = req.params;
  const { userId } = req.query;
  try {
    const result = await pool.query('DELETE FROM suppliers WHERE id = $1 AND user_id = $2 RETURNING *', [id, userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Supplier not found.' });
    }
    if (userId) {
      io.to(userId).emit('supplier_change', { action: 'delete', data: { id: parseInt(id) } });
    }
    res.json({ message: 'Supplier deleted successfully', deleted: result.rows[0] });
  } catch (err) {
    console.error('Error deleting supplier:', err.message);
    res.status(500).json({ error: 'Server error deleting supplier' });
  }
});

// Analytics Dashboard metrics
app.get('/api/sales/analytics', async (req, res) => {
  const { userId } = req.query;
  try {
    const stats = {};

    // Total sales revenue
    const revenueRes = await pool.query('SELECT SUM(total_price) as total FROM sales WHERE user_id = $1', [userId]);
    stats.totalRevenue = parseFloat(revenueRes.rows[0].total) || 0;

    // Total sales count
    const countRes = await pool.query('SELECT SUM(quantity) as count FROM sales WHERE user_id = $1', [userId]);
    stats.totalUnitsSold = parseInt(countRes.rows[0].count) || 0;

    // Total medicine lines
    const medCountRes = await pool.query('SELECT COUNT(*) as count FROM medicines WHERE user_id = $1', [userId]);
    stats.totalMedicines = parseInt(medCountRes.rows[0].count) || 0;

    // Stock alerts summary counts
    const alertsRes = await pool.query(`
      SELECT 
        SUM(CASE WHEN quantity = 0 THEN 1 ELSE 0 END) as out_of_stock,
        SUM(CASE WHEN quantity > 0 AND quantity <= min_stock_level THEN 1 ELSE 0 END) as low_stock,
        SUM(CASE WHEN expiry_date <= CURRENT_DATE THEN 1 ELSE 0 END) as expired
      FROM medicines
      WHERE user_id = $1
    `, [userId]);
    stats.outOfStock = parseInt(alertsRes.rows[0].out_of_stock) || 0;
    stats.lowStock = parseInt(alertsRes.rows[0].low_stock) || 0;
    stats.expired = parseInt(alertsRes.rows[0].expired) || 0;

    // Sales by medicine for chart
    const topSalesRes = await pool.query(`
      SELECT m.name, SUM(s.quantity) as sold, SUM(s.total_price) as revenue
      FROM sales s
      JOIN medicines m ON s.medicine_id = m.id
      WHERE s.user_id = $1
      GROUP BY m.name
      ORDER BY sold DESC
      LIMIT 5
    `, [userId]);
    stats.topSelling = topSalesRes.rows;

    // Sales by day/month for timeline chart
    const timelineRes = await pool.query(`
      SELECT DATE_TRUNC('day', sale_date) as date, SUM(total_price) as revenue, SUM(quantity) as units
      FROM sales
      WHERE user_id = $1
      GROUP BY DATE_TRUNC('day', sale_date)
      ORDER BY date ASC
      LIMIT 30
    `, [userId]);
    stats.timeline = timelineRes.rows;

    res.json(stats);
  } catch (err) {
    console.error('Error loading analytics:', err.message);
    res.status(500).json({ error: 'Server error loading analytics data' });
  }
});

// 4. ML Predictions
app.get('/api/predictions', async (req, res) => {
  const { userId } = req.query;
  try {
    const predictions = await calculatePredictions(userId);
    res.json(predictions);
  } catch (err) {
    console.error('Error fetching inventory predictions:', err.message);
    res.status(500).json({ error: 'Server error calculating predictions' });
  }
});

// 5. Gemini AI Recommendations Insights
app.get('/api/insights', async (req, res) => {
  const { userId } = req.query;
  try {
    const inventoryRes = await pool.query('SELECT * FROM medicines WHERE user_id = $1', [userId]);
    const predictions = await calculatePredictions(userId);
    
    const insights = await generateInsights(inventoryRes.rows, predictions);
    res.json({ insights });
  } catch (err) {
    console.error('Error generating AI insights:', err.message);
    // Return friendly local heuristic backup if API key is invalid or fails
    res.json({
      insights: [
        "Immediate attention required: Expiring batches are approaching their date limit.",
        "Restock Recommended: Check medicine quantities currently below safety thresholds.",
        "Cost optimization: Discard expired medicine batches immediately to maintain safe levels."
      ]
    });
  }
});

// 6. Gemini Interactive Chatbot
app.post('/api/chat', async (req, res) => {
  const { history, message, userId } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Message is required.' });
  }

  try {
    // 1. Gather real-time context to pass into prompt
    const totalMedsRes = await pool.query('SELECT COUNT(*) as count FROM medicines WHERE user_id = $1', [userId]);
    const lowStockMedsRes = await pool.query('SELECT name, quantity, min_stock_level FROM medicines WHERE quantity <= min_stock_level AND user_id = $1', [userId]);
    
    const predictions = await calculatePredictions(userId);
    const expiringSoon = predictions
      .filter(p => p.daysToExpiry <= 90 && p.quantity > 0)
      .map(p => ({ name: p.name, batch: p.batchNumber, days: p.daysToExpiry }));

    const topSellersRes = await pool.query(`
      SELECT m.name, SUM(s.quantity) as sold
      FROM sales s
      JOIN medicines m ON s.medicine_id = m.id
      WHERE s.user_id = $1
      GROUP BY m.name
      ORDER BY sold DESC
      LIMIT 3
    `, [userId]);

    // Fetch recent sales (last 5 transactions)
    const recentSalesRes = await pool.query(`
      SELECT s.quantity, s.total_price, s.sale_date, m.name 
      FROM sales s 
      JOIN medicines m ON s.medicine_id = m.id 
      WHERE s.user_id = $1
      ORDER BY s.sale_date DESC 
      LIMIT 5
    `, [userId]);
    const recentSales = recentSalesRes.rows.map(s => `${s.quantity}x ${s.name} ($${s.total_price}) on ${new Date(s.sale_date).toISOString().split('T')[0]}`);

    // Fetch active supplier directory from suppliers table
    const suppliersRes = await pool.query(`
      SELECT name, email, phone 
      FROM suppliers 
      WHERE user_id = $1
    `, [userId]);
    const suppliers = suppliersRes.rows.map(s => `${s.name} (Email: ${s.email || 'N/A'}, Phone: ${s.phone || 'N/A'})`);

    // Fetch alert destination email
    const usersRes = await pool.query("SELECT alert_email, email FROM users WHERE id = $1", [userId]);
    const alertEmail = usersRes.rows[0]?.alert_email || usersRes.rows[0]?.email || 'Not Configured';

    const inventorySummary = {
      totalMedicines: totalMedsRes.rows[0].count,
      lowStockItems: lowStockMedsRes.rows.map(m => `${m.name} (${m.quantity} left)`),
      topSellers: topSellersRes.rows.map(m => `${m.name} (${m.sold} units sold)`),
      recentSales: recentSales,
      activeSuppliers: suppliers,
      alertEmail: alertEmail
    };

    const predictionsSummary = {
      expiringSoonItems: expiringSoon.map(m => `${m.name} [${m.batch}] (expires in ${m.days} days)`)
    };

    const botResponse = await chatWithPharmacist(
      history || [], 
      message, 
      inventorySummary, 
      predictionsSummary
    );

    res.json({ response: botResponse });
  } catch (err) {
    console.error('Error in AI Chat routing:', err.message);
    res.status(500).json({ error: 'Server error processing AI message' });
  }
});

// Socket.io Connect handlers
io.on('connection', (socket) => {
  console.log(`🔌 New client connected: ${socket.id}`);
  
  socket.on('join_room', async (userId) => {
    socket.join(userId);
    console.log(`👤 User joined socket room: ${userId}`);
    await sendInitialAlerts(socket, userId);
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});

async function sendInitialAlerts(socket, userId) {
  if (!userId) return;
  try {
    const medsRes = await pool.query('SELECT * FROM medicines WHERE user_id = $1', [userId]);
    const meds = medsRes.rows;
    const now = new Date();

    meds.forEach(med => {
      const expiry = new Date(med.expiry_date);
      const diffDays = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
      const formattedDate = new Date(med.expiry_date).toISOString().split('T')[0];

      if (med.quantity === 0) {
        socket.emit('alert', {
          type: 'danger',
          message: `🚨 Critical: "${med.name}" (Batch ${med.batch_number}) is out of stock!`
        });
      } else if (med.quantity <= med.min_stock_level) {
        socket.emit('alert', {
          type: 'warning',
          message: `⚠️ Low Stock: "${med.name}" is down to ${med.quantity} units.`
        });
      }

      if (diffDays <= 0) {
        socket.emit('alert', {
          type: 'danger',
          message: `🚨 Expired: "${med.name}" (Batch ${med.batch_number}) expired on ${formattedDate}!`
        });
      } else if (diffDays <= 60) {
        socket.emit('alert', {
          type: 'warning',
          message: `⏳ Expiry Alert: "${med.name}" expires in ${diffDays} days.`
        });
      }
    });
  } catch (err) {
    console.error('Error pushing initial alerts:', err.message);
  }
}

// Database Migration Setup
async function migrateDatabase() {
  try {
    console.log('🔄 Running database migrations for company profile and suppliers...');
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS company_name VARCHAR(255);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS company_phone VARCHAR(50);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS company_address TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS license_number VARCHAR(100);

      CREATE TABLE IF NOT EXISTS suppliers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(50),
        address TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE suppliers DROP CONSTRAINT IF EXISTS suppliers_name_key;

      ALTER TABLE medicines ADD COLUMN IF NOT EXISTS user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE;
      ALTER TABLE sales ADD COLUMN IF NOT EXISTS user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE;
      ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE;
    `);
    console.log('✅ Database migrations applied successfully.');
  } catch (err) {
    console.error('❌ Database migration error:', err.message);
  }
}

// Start Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, async () => {
  console.log(`🚀 PharmaTrack Backend running on http://localhost:${PORT}`);
  await migrateDatabase();
  await seedMockData();
});
