import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import https from 'https';
import xlsx from 'xlsx';
import admin from 'firebase-admin';
import { readFile } from 'fs/promises';
import pool from './db.js';
import { calculatePredictions } from './ml.js';
import { generateInsights, chatWithPharmacist } from './gemini.js';
import { 
  sendAlertEmail, 
  sendCompanyPasskeyEmail, 
  sendEmployeeVerificationEmail, 
  sendAdminNewEmployeeNotificationEmail,
  sendOtpEmail
} from './email.js';

dotenv.config();

// Initialize Firebase Admin SDK
let firebaseAdminActive = false;
try {
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(
      await readFile(new URL('../serviceAccountKey.json', import.meta.url))
    );
  } catch (readErr) {
    serviceAccount = JSON.parse(
      await readFile(new URL('./serviceAccountKey.json', import.meta.url))
    );
  }
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  firebaseAdminActive = true;
  console.log('🛡️ Firebase Admin SDK initialized successfully.');
} catch (err) {
  console.error('❌ Failed to initialize Firebase Admin SDK:', err.message);
}

// Authentication Middleware
async function authenticateUser(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split('Bearer ')[1];
    try {
      if (firebaseAdminActive) {
        const decodedToken = await admin.auth().verifyIdToken(token);
        req.uid = decodedToken.uid;
        req.email = decodedToken.email;
        
        // Block unverified company employees (except for profile checks)
        const isProfileRequest = req.path.startsWith('/api/users/profile/') || req.path.startsWith('/api/companies/verify-passkey');
        if (!isProfileRequest) {
          const scope = await getUserScope(req.uid);
          if (scope.companyId && !scope.isVerified && scope.role !== 'admin') {
            return res.status(403).json({ error: 'Access Denied: Pending Administrator Verification.' });
          }
        }
        
        return next();
      }
    } catch (err) {
      console.error('Firebase Token Verify Error:', err.message);
      return res.status(401).json({ error: 'Unauthorized: Invalid Firebase credentials token.' });
    }
  }

  // Backwards-compatible fallback
  const userId = req.query.userId || req.body.userId || req.params.id;
  if (userId) {
    req.uid = userId;
    
    // Block unverified company employees (except for profile checks)
    const isProfileRequest = req.path.startsWith('/api/users/profile/') || req.path.startsWith('/api/companies/verify-passkey');
    if (!isProfileRequest) {
      try {
        const scope = await getUserScope(req.uid);
        if (scope.companyId && !scope.isVerified && scope.role !== 'admin') {
          return res.status(403).json({ error: 'Access Denied: Pending Administrator Verification.' });
        }
      } catch (err) {
        console.error('Scope verification check failed:', err.message);
      }
    }
    
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized: Authentication token or userId is required.' });
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // Allow frontend connection
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

// Server-side caching for predictions and AI insights
const predictionsCache = {}; // { [userId]: { data: [...], timestamp: 172658... } }
const insightsCache = {}; // { [userId]: { data: [...], timestamp: 172658... } }
const PREDICTIONS_CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
const INSIGHTS_CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

// Helper to clear user cache
function clearUserCache(userId) {
  if (userId) {
    delete predictionsCache[userId];
    delete insightsCache[userId];
    console.log(`🧹 Cleared cached predictions & insights for user: ${userId}`);
  }
}

// Wrapper to get predictions with cache
async function getPredictionsWithCache(userId) {
  const now = Date.now();
  const cached = predictionsCache[userId];
  if (cached && (now - cached.timestamp < PREDICTIONS_CACHE_DURATION)) {
    return cached.data;
  }
  const data = await calculatePredictions(userId);
  predictionsCache[userId] = {
    data,
    timestamp: now
  };
  return data;
}

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

// Database health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const dbRes = await pool.query('SELECT NOW()');
    res.json({ status: 'healthy', database: 'connected', time: dbRes.rows[0].now });
  } catch (err) {
    console.error('❌ Health check DB error:', err.message);
    res.status(503).json({ status: 'unhealthy', database: 'disconnected', error: err.message });
  }
});

// Helper for logging audit trails
async function logAudit(userId, companyId, actionType, ip, userAgent) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, company_id, action_type, ip_address, device_info) 
       VALUES ($1, $2, $3, $4, $5)`,
      [userId || null, companyId || null, actionType, ip || null, userAgent || null]
    );
  } catch (err) {
    console.error('Error logging audit trail:', err.message);
  }
}

// Slack & Telegram Notification dispatch helpers
async function sendSlackNotification(webhookUrl, message) {
  if (!webhookUrl) return;
  try {
    const data = JSON.stringify({ text: message });
    const url = new URL(webhookUrl);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
      },
    };
    const req = https.request(options, (res) => {
      res.on('data', () => {});
    });
    req.on('error', (e) => console.error('Slack notify error:', e.message));
    req.write(data);
    req.end();
  } catch (err) {
    console.error('Error triggering Slack notification:', err.message);
  }
}

async function sendTelegramNotification(chatId, message) {
  if (!chatId) return;
  const botToken = process.env.TELEGRAM_BOT_TOKEN || '7412345678:AAF-mock-token-for-testing';
  try {
    const data = JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML'
    });
    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${botToken}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
      },
    };
    const req = https.request(options, (res) => {
      res.on('data', () => {});
    });
    req.on('error', (e) => console.error('Telegram notify error:', e.message));
    req.write(data);
    req.end();
  } catch (err) {
    console.error('Error triggering Telegram notification:', err.message);
  }
}


// Helper to resolve company_id, role, and preferences
async function getUserScope(userId) {
  if (!userId) return { 
    companyId: null, role: 'employee', 
    prefEmail: true, prefInApp: true, prefSlackTelegram: false, prefWhatsApp: false,
    slackWebhookUrl: null, telegramChatId: null, whatsappNumber: null, email: null, alertEmail: null 
  };
  try {
    const res = await pool.query(
      `SELECT company_id, role, pref_email, pref_in_app, pref_slack_telegram, slack_webhook_url, telegram_chat_id, pref_whatsapp, whatsapp_number, email, alert_email, is_verified 
       FROM users WHERE id = $1`, 
      [userId]
    );
    if (res.rows.length === 0) {
      return { 
        companyId: null, role: 'employee', isVerified: false,
        prefEmail: true, prefInApp: true, prefSlackTelegram: false, prefWhatsApp: false,
        slackWebhookUrl: null, telegramChatId: null, whatsappNumber: null, email: null, alertEmail: null 
      };
    }
    const row = res.rows[0];
    return {
      companyId: row.company_id,
      role: row.role,
      isVerified: row.role === 'admin' ? true : (row.is_verified !== null ? !!row.is_verified : false),
      prefEmail: row.pref_email !== null ? row.pref_email : true,
      prefInApp: row.pref_in_app !== null ? row.pref_in_app : true,
      prefSlackTelegram: !!row.pref_slack_telegram,
      slackWebhookUrl: row.slack_webhook_url,
      telegramChatId: row.telegram_chat_id,
      prefWhatsApp: !!row.pref_whatsapp,
      whatsappNumber: row.whatsapp_number,
      email: row.email,
      alertEmail: row.alert_email
    };
  } catch (err) {
    console.error('Error resolving user scope:', err.message);
    return { 
      companyId: null, role: 'employee', 
      prefEmail: true, prefInApp: true, prefSlackTelegram: false, prefWhatsApp: false,
      slackWebhookUrl: null, telegramChatId: null, whatsappNumber: null, email: null, alertEmail: null 
    };
  }
}

// In-memory store for OTPs
const emailOtpMap = new Map();

// Endpoint to send Email OTP
app.post('/api/auth/send-otp', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email address is required.' });
  }

  try {
    const randomOtp = Math.floor(100000 + Math.random() * 900000).toString();
    emailOtpMap.set(email.toLowerCase().trim(), {
      code: randomOtp,
      expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes
    });

    const sendRes = await sendOtpEmail(email, randomOtp);
    if (!sendRes.success) {
      console.warn(`⚠️ SMTP sending failed (possibly blocked on Render). Falling back to sending OTP in response for demo purposes.`);
      return res.json({ 
        message: 'SMTP is blocked. For testing, your verification OTP is displayed.',
        warning: `Render Free Tier blocks SMTP. For testing, your code is: ${randomOtp}`,
        code: randomOtp
      });
    }

    res.json({ 
      message: 'Verification OTP sent to email successfully.'
    });
  } catch (err) {
    console.error('Error sending OTP:', err.message);
    res.status(500).json({ error: 'Server error sending verification OTP.' });
  }
});

// Endpoint to verify Email OTP
app.post('/api/auth/verify-otp', async (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) {
    return res.status(400).json({ error: 'Email and OTP code are required.' });
  }

  const record = emailOtpMap.get(email.toLowerCase().trim());
  if (!record) {
    return res.status(400).json({ error: 'No OTP requested for this email.' });
  }

  if (Date.now() > record.expiresAt) {
    emailOtpMap.delete(email.toLowerCase().trim());
    return res.status(400).json({ error: 'OTP code has expired. Please request a new one.' });
  }

  if (record.code !== code.trim()) {
    return res.status(400).json({ error: 'Invalid verification code.' });
  }

  // Success: Clear the OTP from memory
  emailOtpMap.delete(email.toLowerCase().trim());
  res.json({ message: 'OTP verified successfully.' });
});

// Company Registration Endpoint
app.post('/api/companies/register', async (req, res) => {
  const { id, email, company_name, company_phone, admin_mobile } = req.body;
  if (!id || !email || !company_name) {
    return res.status(400).json({ error: 'Firebase UID, email, and company name are required.' });
  }

  try {
    await pool.query('BEGIN');

    // Generate Company Passkey
    const prefix = company_name.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) || 'COMP';
    const randNum = Math.floor(1000 + Math.random() * 9000);
    const suffix = Math.random().toString(36).substring(2, 5).toUpperCase();
    const passkey = `${prefix}-${randNum}-${suffix}`;

    // Create Company
    const companyRes = await pool.query(
      `INSERT INTO companies (name, email, passkey, phone) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [company_name, email, passkey, company_phone || null]
    );
    const company = companyRes.rows[0];

    // Create User Profile linked to Company with role 'admin'
    const userRes = await pool.query(
      `INSERT INTO users (id, email, company_id, role, mobile_number, is_verified, company_name, company_phone) 
       VALUES ($1, $2, $3, 'admin', $4, true, $5, $6) 
       ON CONFLICT (id) DO UPDATE SET 
         company_id = EXCLUDED.company_id,
         role = 'admin',
         mobile_number = EXCLUDED.mobile_number,
         company_name = EXCLUDED.company_name,
         company_phone = EXCLUDED.company_phone
       RETURNING *`,
      [id, email, company.id, admin_mobile || null, company_name, company_phone || null]
    );
    const user = userRes.rows[0];

    await pool.query('COMMIT');

    // Log audit trail
    await logAudit(user.id, company.id, 'COMPANY_REGISTER', req.ip, req.headers['user-agent']);

    // Send passkey email asynchronously
    sendCompanyPasskeyEmail(email, company_name, passkey).catch(e => 
      console.error('Failed to send passkey email:', e.message)
    );

    res.status(201).json({ company, user });
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('Error registering company:', err.message);
    res.status(500).json({ error: 'Server error registering company' });
  }
});

// Get Company Settings (Logo, Theme Color)
app.get('/api/companies/settings', authenticateUser, async (req, res) => {
  try {
    const { companyId } = await getUserScope(req.uid);
    if (!companyId) {
      return res.status(400).json({ error: 'User is not associated with any company.' });
    }
    const result = await pool.query('SELECT name, logo_url, theme_color, phone, email, pref_whatsapp, whatsapp_number, passkey FROM companies WHERE id = $1', [companyId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Company settings not found.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching company settings:', err.message);
    res.status(500).json({ error: 'Server error fetching company settings' });
  }
});

// Update Company Settings (Logo, Theme Color, WhatsApp Alert Config)
app.put('/api/companies/settings', authenticateUser, async (req, res) => {
  const { logo_url, theme_color, pref_whatsapp, whatsapp_number } = req.body;
  try {
    const { companyId, role } = await getUserScope(req.uid);
    if (!companyId) {
      return res.status(400).json({ error: 'User is not associated with any company.' });
    }
    if (role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Only Company Admins can edit organization settings.' });
    }

    const result = await pool.query(
      `UPDATE companies 
       SET logo_url = $1, theme_color = $2, pref_whatsapp = $3, whatsapp_number = $4
       WHERE id = $5 
       RETURNING name, logo_url, theme_color, pref_whatsapp, whatsapp_number`,
      [logo_url || null, theme_color || '#0ea5e9', pref_whatsapp === undefined ? false : !!pref_whatsapp, whatsapp_number || null, companyId]
    );

    await logAudit(req.uid, companyId, 'COMPANY_SETTINGS_UPDATE', req.ip, req.headers['user-agent']);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating company settings:', err.message);
    res.status(500).json({ error: 'Server error updating company settings' });
  }
});

// Manual Trigger for Daily Alerts Scan (Admin / Testing only)
app.post('/api/admin/trigger-daily-alerts', async (req, res) => {
  try {
    runDailyAlertScan();
    res.json({ message: 'Daily alert scan triggered successfully in the background.' });
  } catch (err) {
    console.error('Error triggering daily alerts manually:', err.message);
    res.status(500).json({ error: 'Server error triggering daily alerts scan.' });
  }
});


// Company Passkey Verification Endpoint
app.post('/api/companies/verify-passkey', async (req, res) => {
  const { passkey, company_email } = req.body;
  if (!passkey) {
    return res.status(400).json({ error: 'Company passkey is required.' });
  }

  try {
    let result;
    if (company_email) {
      // Check both passkey and company email case-insensitively
      result = await pool.query(
        'SELECT * FROM companies WHERE LOWER(passkey) = LOWER($1) AND LOWER(email) = LOWER($2)',
        [passkey.trim(), company_email.trim()]
      );
    } else {
      result = await pool.query(
        'SELECT * FROM companies WHERE LOWER(passkey) = LOWER($1)',
        [passkey.trim()]
      );
    }

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid Company Passkey or Company Email combination.' });
    }

    res.json({ company_id: result.rows[0].id, company_name: result.rows[0].name });
  } catch (err) {
    console.error('Error verifying company passkey:', err.message);
    res.status(500).json({ error: 'Server error verifying passkey' });
  }
});

// Employee Registration Endpoint
app.post('/api/users/register-employee', async (req, res) => {
  const { id, email, name, mobile_number, company_id, role } = req.body;
  if (!id || !email || !company_id) {
    return res.status(400).json({ error: 'Firebase UID, Email, and Company ID are required.' });
  }

  try {
    await pool.query('BEGIN');

    // Create employee profile
    const result = await pool.query(
      `INSERT INTO users (id, email, company_id, role, mobile_number, is_verified, name) 
       VALUES ($1, $2, $3, $4, $5, false, $6) 
       ON CONFLICT (id) DO UPDATE SET 
         company_id = EXCLUDED.company_id,
         role = COALESCE(users.role, EXCLUDED.role),
         mobile_number = EXCLUDED.mobile_number,
         name = EXCLUDED.name
       RETURNING *`,
      [id, email, company_id, role || 'employee', mobile_number || null, name || null]
    );
    const user = result.rows[0];

    // Find company admin email to notify them
    const adminRes = await pool.query(
      `SELECT email FROM users WHERE company_id = $1 AND role = 'admin' LIMIT 1`,
      [company_id]
    );
    const adminEmail = adminRes.rows[0]?.email;

    await pool.query('COMMIT');

    // Log audit trail
    await logAudit(user.id, company_id, 'EMPLOYEE_REGISTER', req.ip, req.headers['user-agent']);

    // Send emails asynchronously
    sendEmployeeVerificationEmail(email, name || 'Employee').catch(e => 
      console.error('Failed to send employee verification email:', e.message)
    );

    if (adminEmail) {
      sendAdminNewEmployeeNotificationEmail(adminEmail, name || 'Employee', email, role || 'employee').catch(e => 
        console.error('Failed to send admin notification email:', e.message)
      );
    }

    res.status(201).json(user);
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('Error registering employee:', err.message);
    res.status(500).json({ error: 'Server error registering employee' });
  }
});

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
    const syncedUser = result.rows[0];
    
    // Log audit trail for LOGIN
    await logAudit(syncedUser.id, syncedUser.company_id, 'LOGIN', req.ip, req.headers['user-agent']);
    
    res.json(syncedUser);
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
  const { 
    alert_email, 
    company_name, 
    company_phone, 
    company_address, 
    license_number,
    pref_email,
    pref_in_app,
    pref_slack_telegram,
    slack_webhook_url,
    telegram_chat_id,
    pref_whatsapp,
    whatsapp_number
  } = req.body;
  try {
    const result = await pool.query(
      `UPDATE users 
       SET alert_email = $1, 
           company_name = $2, 
           company_phone = $3, 
           company_address = $4, 
           license_number = $5,
           pref_email = $6,
           pref_in_app = $7,
           pref_slack_telegram = $8,
           slack_webhook_url = $9,
           telegram_chat_id = $10,
           pref_whatsapp = $11,
           whatsapp_number = $12
       WHERE id = $13 
       RETURNING *`,
      [
        alert_email, 
        company_name, 
        company_phone, 
        company_address, 
        license_number,
        pref_email === undefined ? true : !!pref_email,
        pref_in_app === undefined ? true : !!pref_in_app,
        pref_slack_telegram === undefined ? false : !!pref_slack_telegram,
        slack_webhook_url || null,
        telegram_chat_id || null,
        pref_whatsapp === undefined ? false : !!pref_whatsapp,
        whatsapp_number || null,
        id
      ]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User profile not found.' });
    }
    
    // Sync admin preferences to the company table
    const updatedUser = result.rows[0];
    if (updatedUser.role === 'admin' && updatedUser.company_id) {
      try {
        await pool.query(
          `UPDATE companies 
           SET email = $1,
               pref_email = $2,
               pref_slack_telegram = $3,
               slack_webhook_url = $4,
               telegram_chat_id = $5,
               pref_whatsapp = $6,
               whatsapp_number = $7
           WHERE id = $8`,
          [
            alert_email || updatedUser.email,
            pref_email === undefined ? true : !!pref_email,
            pref_slack_telegram === undefined ? false : !!pref_slack_telegram,
            slack_webhook_url || null,
            telegram_chat_id || null,
            pref_whatsapp === undefined ? false : !!pref_whatsapp,
            whatsapp_number || null,
            updatedUser.company_id
          ]
        );
      } catch (syncErr) {
        console.error('Error syncing admin settings to company:', syncErr.message);
      }
    }
    
    res.json(updatedUser);
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

    const scope = await getUserScope(id);
    let medsRes;
    if (scope.companyId) {
      medsRes = await pool.query('SELECT * FROM medicines WHERE company_id = $1', [scope.companyId]);
    } else {
      medsRes = await pool.query('SELECT * FROM medicines WHERE user_id = $1', [id]);
    }
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
    const { companyId } = await getUserScope(userId);
    let result;
    if (companyId) {
      result = await pool.query(
        'SELECT * FROM medicines WHERE company_id = $1 ORDER BY expiry_date ASC',
        [companyId]
      );
    } else {
      result = await pool.query(
        'SELECT * FROM medicines WHERE user_id = $1 ORDER BY expiry_date ASC',
        [userId]
      );
    }
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching medicines:', err.message);
    res.status(500).json({ error: 'Server error fetching medicines' });
  }
});

app.post('/api/medicines', async (req, res) => {
  const { 
    name, batch_number, manufacturing_date, expiry_date, quantity, 
    min_stock_level, price, supplier_name, supplier_email, supplier_phone, purchase_date, userId, barcode
  } = req.body;

  try {
    const { companyId, role } = await getUserScope(userId);

    // RBAC: Employees cannot add medicines. Only Admin or Manager.
    if (companyId && role === 'employee') {
      return res.status(403).json({ error: 'Forbidden: Only Admins or Managers can register medicine batches.' });
    }

    const result = await pool.query(`
      INSERT INTO medicines (
        name, batch_number, manufacturing_date, expiry_date, quantity, 
        min_stock_level, price, supplier_name, supplier_email, supplier_phone, purchase_date, user_id, company_id, barcode
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `, [
      name, batch_number, manufacturing_date, expiry_date, quantity, 
      min_stock_level || 10, price || 0, supplier_name, supplier_email, supplier_phone, purchase_date, userId, companyId, barcode || null
    ]);

    const newMed = result.rows[0];

    const targetRoom = companyId || userId;
    if (targetRoom) {
      io.to(targetRoom).emit('medicine_change', { action: 'create', data: newMed });
    }
    
    checkMedAlerts(newMed);
    await logAudit(userId, companyId, 'STOCK_ADD', req.ip, req.headers['user-agent']);

    clearUserCache(userId);

    res.status(201).json(newMed);
  } catch (err) {
    console.error('Error creating medicine:', err.message);
    res.status(500).json({ error: 'Server error creating medicine' });
  }
});

// Bulk Batch Import route
app.post('/api/medicines/batch', async (req, res) => {
  const { medicines, userId } = req.body;
  if (!Array.isArray(medicines) || medicines.length === 0) {
    return res.status(400).json({ error: 'Medicines array is required.' });
  }

  try {
    const { companyId, role } = await getUserScope(userId);
    // RBAC: Employees cannot bulk upload reports
    if (companyId && role === 'employee') {
      return res.status(403).json({ error: 'Forbidden: Only Admins or Managers can upload batch reports.' });
    }

    await pool.query('BEGIN');
    const inserted = [];

    for (const med of medicines) {
      const {
        name, batch_number, manufacturing_date, expiry_date, quantity,
        min_stock_level, price, supplier_name, supplier_email, supplier_phone, purchase_date, barcode
      } = med;

      const result = await pool.query(`
        INSERT INTO medicines (
          name, batch_number, manufacturing_date, expiry_date, quantity, 
          min_stock_level, price, supplier_name, supplier_email, supplier_phone, purchase_date, user_id, company_id, barcode
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *
      `, [
        name, batch_number, manufacturing_date, expiry_date, quantity, 
        min_stock_level || 10, price || 0, supplier_name, supplier_email, supplier_phone, purchase_date, userId, companyId, barcode || null
      ]);
      inserted.push(result.rows[0]);
    }

    await pool.query('COMMIT');

    const targetRoom = companyId || userId;
    if (targetRoom) {
      inserted.forEach(med => {
        io.to(targetRoom).emit('medicine_change', { action: 'create', data: med });
        checkMedAlerts(med);
      });
    }

    await logAudit(userId, companyId, 'REPORT_UPLOAD', req.ip, req.headers['user-agent']);
    clearUserCache(userId);

    res.status(201).json({ message: 'Batch imported successfully', count: inserted.length, data: inserted });
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('Error inserting batch medicines:', err.message);
    res.status(500).json({ error: 'Server error creating batch medicines: ' + err.message });
  }
});

app.put('/api/medicines/:id', async (req, res) => {
  const { id } = req.params;
  const { 
    name, batch_number, manufacturing_date, expiry_date, quantity, 
    min_stock_level, price, supplier_name, supplier_email, supplier_phone, purchase_date, userId, barcode
  } = req.body;

  try {
    const { companyId, role } = await getUserScope(userId);
    // RBAC: Only Admin or Manager can modify details
    if (companyId && role === 'employee') {
      return res.status(403).json({ error: 'Forbidden: Only Admins or Managers can edit medicine details.' });
    }

    let result;
    if (companyId) {
      result = await pool.query(`
        UPDATE medicines SET 
          name = $1, batch_number = $2, manufacturing_date = $3, expiry_date = $4, 
          quantity = $5, min_stock_level = $6, price = $7, supplier_name = $8, 
          supplier_email = $9, supplier_phone = $10, purchase_date = $11, barcode = $12
        WHERE id = $13 AND company_id = $14 RETURNING *
      `, [
        name, batch_number, manufacturing_date, expiry_date, quantity, 
        min_stock_level, price, supplier_name, supplier_email, supplier_phone, purchase_date, barcode || null, id, companyId
      ]);
    } else {
      result = await pool.query(`
        UPDATE medicines SET 
          name = $1, batch_number = $2, manufacturing_date = $3, expiry_date = $4, 
          quantity = $5, min_stock_level = $6, price = $7, supplier_name = $8, 
          supplier_email = $9, supplier_phone = $10, purchase_date = $11, barcode = $12
        WHERE id = $13 AND user_id = $14 RETURNING *
      `, [
        name, batch_number, manufacturing_date, expiry_date, quantity, 
        min_stock_level, price, supplier_name, supplier_email, supplier_phone, purchase_date, barcode || null, id, userId
      ]);
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Medicine not found' });
    }

    const updatedMed = result.rows[0];
    const targetRoom = companyId || userId;
    if (targetRoom) {
      io.to(targetRoom).emit('medicine_change', { action: 'update', data: updatedMed });
    }
    checkMedAlerts(updatedMed);
    await logAudit(userId, companyId, 'STOCK_UPDATE', req.ip, req.headers['user-agent']);

    clearUserCache(userId);

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
    const { companyId, role } = await getUserScope(userId);
    // RBAC: Only Admin can delete medicines
    if (companyId && role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Only Company Admins can delete medicines.' });
    }

    let result;
    if (companyId) {
      result = await pool.query(
        'DELETE FROM medicines WHERE id = $1 AND company_id = $2 RETURNING *',
        [id, companyId]
      );
    } else {
      result = await pool.query(
        'DELETE FROM medicines WHERE id = $1 AND user_id = $2 RETURNING *',
        [id, userId]
      );
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Medicine not found' });
    }

    const targetRoom = companyId || userId;
    if (targetRoom) {
      io.to(targetRoom).emit('medicine_change', { action: 'delete', data: { id: parseInt(id) } });
    }

    await logAudit(userId, companyId, 'REPORT_DELETE', req.ip, req.headers['user-agent']);
    clearUserCache(userId);
    res.json({ message: 'Medicine deleted successfully', deleted: result.rows[0] });
  } catch (err) {
    console.error('Error deleting medicine:', err.message);
    res.status(500).json({ error: 'Server error deleting medicine' });
  }
});

// Helper for Alert Notification pushes
const lastEmailSentTimes = {};

// Helper for Alert Notification pushes
// Helper for Alert Notification pushes
async function checkMedAlerts(med) {
  const userId = med.user_id;
  const companyId = med.company_id;
  if (!userId) return;

  const scope = await getUserScope(userId);
  const targetRoom = companyId || userId;

  const now = new Date();
  const expiry = new Date(med.expiry_date);
  const diffDays = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
  let isAlertTriggered = false;
  let alertMessage = '';
  let alertLevel = 'warning';

  if (med.quantity === 0) {
    alertMessage = `🚨 Critical: Medicine "${med.name}" (Batch ${med.batch_number}) is completely out of stock!`;
    alertLevel = 'danger';
    isAlertTriggered = true;
  } else if (med.quantity <= med.min_stock_level) {
    alertMessage = `⚠️ Low Stock Warning: "${med.name}" is down to ${med.quantity} units (Threshold: ${med.min_stock_level})`;
    alertLevel = 'warning';
    isAlertTriggered = true;
  }

  const formattedDate = new Date(med.expiry_date).toISOString().split('T')[0];

  if (diffDays <= 0) {
    alertMessage = `🚨 Discard Alert: Medicine "${med.name}" (Batch ${med.batch_number}) has expired on ${formattedDate}!`;
    alertLevel = 'danger';
    isAlertTriggered = true;
  } else if (diffDays <= 60 && diffDays > 0) {
    alertMessage = `⏳ Expiry Alert: "${med.name}" (Batch ${med.batch_number}) expires in ${diffDays} days!`;
    alertLevel = 'warning';
    isAlertTriggered = true;
  }

  if (isAlertTriggered) {
    // 1. Log alert to DB table `alerts`
    try {
      await pool.query(
        `INSERT INTO alerts (company_id, user_id, medicine_id, message, level, status)
         VALUES ($1, $2, $3, $4, $5, 'unread')`,
        [companyId || null, userId, med.id, alertMessage, alertLevel]
      );
    } catch (dbErr) {
      console.error('Error saving alert to DB:', dbErr.message);
    }

    // 2. Dispatch real-time Socket.io alert
    if (targetRoom) {
      io.to(targetRoom).emit('alert', {
        type: alertLevel,
        message: alertMessage,
        medicine_id: med.id
      });
    }

    // 3. Automated visual email dispatch (throttled to 5 minutes)
    if (scope.prefEmail) {
      const lastEmailSentTime = lastEmailSentTimes[userId] || 0;
      const timeSinceLastEmail = Date.now() - lastEmailSentTime;
      if (timeSinceLastEmail > 5 * 60 * 1000) {
        lastEmailSentTimes[userId] = Date.now();
        console.log(`✉️ Automated stock/expiry alert triggered for user ${userId}. Dispatching visual email report...`);
        
        try {
          const recipient = scope.alertEmail || scope.email;
          if (recipient) {
            // Get all current alerts for report
            const medsRes = await pool.query(
              companyId 
                ? 'SELECT * FROM medicines WHERE company_id = $1' 
                : 'SELECT * FROM medicines WHERE user_id = $1',
              [companyId || userId]
            );
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
              } else if (diff <= 60 && diff > 0) {
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
        } catch (err) {
          console.error('Error sending automated alert email:', err.message);
        }
      } else {
        console.log(`✉️ Automated email notification throttled (sent recently).`);
      }
    }

    // 4. Slack/Telegram Notification Dispatch
    if (scope.prefSlackTelegram) {
      if (scope.slackWebhookUrl) {
        sendSlackNotification(scope.slackWebhookUrl, `*PharmaTrack Stock Alert*:\n${alertMessage}`);
      }
      if (scope.telegramChatId) {
        sendTelegramNotification(scope.telegramChatId, `<b>PharmaTrack Stock Alert</b>:\n${alertMessage}`);
      }
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
    const { companyId } = await getUserScope(userId);

    // Check medicine stock and price (ownership verified via company_id or user_id)
    let medRes;
    if (companyId) {
      medRes = await pool.query('SELECT * FROM medicines WHERE id = $1 AND company_id = $2', [medicine_id, companyId]);
    } else {
      medRes = await pool.query('SELECT * FROM medicines WHERE id = $1 AND user_id = $2', [medicine_id, userId]);
    }

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
    let updatedMedRes;
    if (companyId) {
      updatedMedRes = await pool.query(
        'UPDATE medicines SET quantity = quantity - $1 WHERE id = $2 AND company_id = $3 RETURNING *',
        [quantity, medicine_id, companyId]
      );
    } else {
      updatedMedRes = await pool.query(
        'UPDATE medicines SET quantity = quantity - $1 WHERE id = $2 AND user_id = $3 RETURNING *',
        [quantity, medicine_id, userId]
      );
    }

    // Insert sale record with user_id and company_id
    const saleRes = await pool.query(
      'INSERT INTO sales (medicine_id, quantity, total_price, user_id, company_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [medicine_id, quantity, totalPrice, userId, companyId]
    );

    await pool.query('COMMIT');

    const updatedMed = updatedMedRes.rows[0];
    const sale = saleRes.rows[0];

    const targetRoom = companyId || userId;
    if (targetRoom) {
      io.to(targetRoom).emit('medicine_change', { action: 'update', data: updatedMed });
      io.to(targetRoom).emit('sale_created', { sale, medicine_name: med.name });
    }
    
    checkMedAlerts(updatedMed);
    await logAudit(userId, companyId, 'SALE_LOG', req.ip, req.headers['user-agent']);
    clearUserCache(userId);

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
    const { companyId } = await getUserScope(userId);
    let result;
    if (companyId) {
      result = await pool.query(`
        SELECT s.*, m.name as medicine_name, m.batch_number 
        FROM sales s
        JOIN medicines m ON s.medicine_id = m.id
        WHERE s.company_id = $1
        ORDER BY s.sale_date DESC
        LIMIT 100
      `, [companyId]);
    } else {
      result = await pool.query(`
        SELECT s.*, m.name as medicine_name, m.batch_number 
        FROM sales s
        JOIN medicines m ON s.medicine_id = m.id
        WHERE s.user_id = $1
        ORDER BY s.sale_date DESC
        LIMIT 100
      `, [userId]);
    }
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
    const { companyId } = await getUserScope(userId);
    let result;
    if (companyId) {
      result = await pool.query(`
        SELECT s.id, s.name, s.email, s.phone, s.address, s.created_at, 
               COALESCE(json_agg(DISTINCT m.name) FILTER (WHERE m.name IS NOT NULL), '[]') as medicines
        FROM suppliers s
        LEFT JOIN medicines m ON LOWER(s.name) = LOWER(m.supplier_name) AND m.company_id = s.company_id
        WHERE s.company_id = $1
        GROUP BY s.id
        ORDER BY s.name ASC
      `, [companyId]);
    } else {
      result = await pool.query(`
        SELECT s.id, s.name, s.email, s.phone, s.address, s.created_at, 
               COALESCE(json_agg(DISTINCT m.name) FILTER (WHERE m.name IS NOT NULL), '[]') as medicines
        FROM suppliers s
        LEFT JOIN medicines m ON LOWER(s.name) = LOWER(m.supplier_name) AND m.user_id = s.user_id
        WHERE s.user_id = $1
        GROUP BY s.id
        ORDER BY s.name ASC
      `, [userId]);
    }
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
    const { companyId, role } = await getUserScope(userId);
    if (companyId && role === 'employee') {
      return res.status(403).json({ error: 'Forbidden: Only Admins or Managers can create suppliers.' });
    }

    let dupRes;
    if (companyId) {
      dupRes = await pool.query('SELECT * FROM suppliers WHERE LOWER(name) = LOWER($1) AND company_id = $2', [name, companyId]);
    } else {
      dupRes = await pool.query('SELECT * FROM suppliers WHERE LOWER(name) = LOWER($1) AND user_id = $2', [name, userId]);
    }

    if (dupRes.rows.length > 0) {
      return res.status(400).json({ error: 'A supplier with this name already exists for your company.' });
    }

    const result = await pool.query(
      `INSERT INTO suppliers (name, email, phone, address, user_id, company_id) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING *`,
      [name, email || '', phone || '', address || '', userId, companyId]
    );
    const supplier = result.rows[0];
    supplier.medicines = [];
    
    const targetRoom = companyId || userId;
    if (targetRoom) {
      io.to(targetRoom).emit('supplier_change', { action: 'create', data: supplier });
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
    const { companyId, role } = await getUserScope(userId);
    if (companyId && role === 'employee') {
      return res.status(403).json({ error: 'Forbidden: Only Admins or Managers can edit suppliers.' });
    }

    let dupRes;
    if (companyId) {
      dupRes = await pool.query('SELECT * FROM suppliers WHERE LOWER(name) = LOWER($1) AND company_id = $2 AND id != $3', [name, companyId, id]);
    } else {
      dupRes = await pool.query('SELECT * FROM suppliers WHERE LOWER(name) = LOWER($1) AND user_id = $2 AND id != $3', [name, userId, id]);
    }

    if (dupRes.rows.length > 0) {
      return res.status(400).json({ error: 'A supplier with this name already exists for your company.' });
    }

    let result;
    if (companyId) {
      result = await pool.query(
        `UPDATE suppliers 
         SET name = $1, email = $2, phone = $3, address = $4 
         WHERE id = $5 AND company_id = $6
         RETURNING *`,
        [name, email || '', phone || '', address || '', id, companyId]
      );
    } else {
      result = await pool.query(
        `UPDATE suppliers 
         SET name = $1, email = $2, phone = $3, address = $4 
         WHERE id = $5 AND user_id = $6
         RETURNING *`,
        [name, email || '', phone || '', address || '', id, userId]
      );
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Supplier not found.' });
    }
    
    let medsRes;
    if (companyId) {
      medsRes = await pool.query(
        `SELECT name FROM medicines WHERE LOWER(supplier_name) = LOWER($1) AND company_id = $2`,
        [name, companyId]
      );
    } else {
      medsRes = await pool.query(
        `SELECT name FROM medicines WHERE LOWER(supplier_name) = LOWER($1) AND user_id = $2`,
        [name, userId]
      );
    }

    const supplier = result.rows[0];
    supplier.medicines = medsRes.rows.map(m => m.name);
    
    const targetRoom = companyId || userId;
    if (targetRoom) {
      io.to(targetRoom).emit('supplier_change', { action: 'update', data: supplier });
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
    const { companyId, role } = await getUserScope(userId);
    if (companyId && role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Only Company Admins can delete suppliers.' });
    }

    let result;
    if (companyId) {
      result = await pool.query('DELETE FROM suppliers WHERE id = $1 AND company_id = $2 RETURNING *', [id, companyId]);
    } else {
      result = await pool.query('DELETE FROM suppliers WHERE id = $1 AND user_id = $2 RETURNING *', [id, userId]);
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Supplier not found.' });
    }
    const targetRoom = companyId || userId;
    if (targetRoom) {
      io.to(targetRoom).emit('supplier_change', { action: 'delete', data: { id: parseInt(id) } });
    }
    res.json({ message: 'Supplier deleted successfully', deleted: result.rows[0] });
  } catch (err) {
    console.error('Error deleting supplier:', err.message);
    res.status(500).json({ error: 'Server error deleting supplier' });
  }
});

// Audit Trail Logs Fetching
app.get('/api/audit-logs', authenticateUser, async (req, res) => {
  const userId = req.uid;
  try {
    const { companyId } = await getUserScope(userId);
    let result;
    if (companyId) {
      result = await pool.query(
        `SELECT a.*, u.email as user_email, u.name as user_name 
         FROM audit_logs a 
         LEFT JOIN users u ON a.user_id = u.id 
         WHERE a.company_id = $1 
         ORDER BY a.timestamp DESC 
         LIMIT 100`,
        [companyId]
      );
    } else {
      result = await pool.query(
        `SELECT a.*, u.email as user_email, u.name as user_name 
         FROM audit_logs a 
         LEFT JOIN users u ON a.user_id = u.id 
         WHERE a.user_id = $1 
         ORDER BY a.timestamp DESC 
         LIMIT 100`,
        [userId]
      );
    }
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching audit logs:', err.message);
    res.status(500).json({ error: 'Server error fetching audit logs' });
  }
});

// Post custom audit logs from client
app.post('/api/audit-logs', async (req, res) => {
  const { userId, actionType } = req.body;
  try {
    const scope = await getUserScope(userId);
    await logAudit(userId, scope.companyId, actionType, req.ip, req.headers['user-agent']);
    res.status(201).json({ success: true });
  } catch (err) {
    console.error('Error logging audit from client:', err.message);
    res.status(500).json({ error: 'Server error logging audit' });
  }
});

// Employee Control Panel - Get Employees
app.get('/api/companies/employees', authenticateUser, async (req, res) => {
  const userId = req.uid;
  try {
    const { companyId, role } = await getUserScope(userId);
    if (!companyId) {
      return res.status(400).json({ error: 'User does not belong to any company.' });
    }
    // Only Admin can fetch employee registries
    if (role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Only Company Admins can view the registry.' });
    }

    const result = await pool.query(
      `SELECT id, email, role, mobile_number, is_verified, name 
       FROM users 
       WHERE company_id = $1 
       ORDER BY name ASC`,
      [companyId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching employees:', err.message);
    res.status(500).json({ error: 'Server error fetching employees' });
  }
});

// Employee Control Panel - Toggle Verification / Role Update
app.put('/api/users/:id/verify-status', authenticateUser, async (req, res) => {
  const adminUid = req.uid;
  const targetUid = req.params.id;
  const { is_verified, role } = req.body;

  try {
    const adminScope = await getUserScope(adminUid);
    if (!adminScope.companyId || adminScope.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Only Company Admins can manage employees.' });
    }

    // Verify target employee belongs to the same company
    const targetRes = await pool.query('SELECT company_id FROM users WHERE id = $1', [targetUid]);
    if (targetRes.rows.length === 0 || targetRes.rows[0].company_id !== adminScope.companyId) {
      return res.status(400).json({ error: 'Invalid user or employee does not belong to your company.' });
    }

    const result = await pool.query(
      `UPDATE users 
       SET is_verified = $1, 
           role = COALESCE($2, role) 
       WHERE id = $3 
       RETURNING *`,
      [is_verified !== undefined ? is_verified : true, role || null, targetUid]
    );

    const updatedUser = result.rows[0];

    await logAudit(adminUid, adminScope.companyId, `EMPLOYEE_VERIFY_${(is_verified !== false ? 'TRUE' : 'FALSE')}`, req.ip, req.headers['user-agent']);

    if (updatedUser.is_verified) {
      sendEmployeeVerificationEmail(updatedUser.email, updatedUser.name || 'Employee').catch(e => 
        console.error('Failed to send employee approval email:', e.message)
      );
    }

    res.json(updatedUser);
  } catch (err) {
    console.error('Error verifying employee:', err.message);
    res.status(500).json({ error: 'Server error managing employee verification.' });
  }
});

// Employee Control Panel - Revoke Access
app.put('/api/users/:id/revoke-access', authenticateUser, async (req, res) => {
  const adminUid = req.uid;
  const targetUid = req.params.id;

  try {
    const adminScope = await getUserScope(adminUid);
    if (!adminScope.companyId || adminScope.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Only Company Admins can manage employees.' });
    }

    // Verify target employee belongs to same company
    const targetRes = await pool.query('SELECT company_id FROM users WHERE id = $1', [targetUid]);
    if (targetRes.rows.length === 0 || targetRes.rows[0].company_id !== adminScope.companyId) {
      return res.status(400).json({ error: 'Invalid user or employee does not belong to your company.' });
    }

    // Revoke access (dissociate company)
    const result = await pool.query(
      `UPDATE users 
       SET company_id = NULL, 
           role = 'employee', 
           is_verified = false 
       WHERE id = $1 
       RETURNING *`,
      [targetUid]
    );

    await logAudit(adminUid, adminScope.companyId, 'EMPLOYEE_REVOKE', req.ip, req.headers['user-agent']);

    res.json({ message: 'Employee access revoked successfully.', user: result.rows[0] });
  } catch (err) {
    console.error('Error revoking employee access:', err.message);
    res.status(500).json({ error: 'Server error revoking employee access.' });
  }
});

// Log audit trail for LOGOUT
app.post('/api/audit-logs/logout', async (req, res) => {
  const { userId } = req.body;
  try {
    const { companyId } = await getUserScope(userId);
    await logAudit(userId, companyId, 'LOGOUT', req.ip, req.headers['user-agent']);
    res.json({ success: true });
  } catch (err) {
    console.error('Error logging logout:', err.message);
    res.status(500).json({ error: 'Server error logging logout' });
  }
});

// Alerts DB Management Endpoints
app.get('/api/alerts', async (req, res) => {
  const { userId } = req.query;
  try {
    const { companyId } = await getUserScope(userId);
    let result;
    if (companyId) {
      result = await pool.query(
        `SELECT a.*, m.name as medicine_name, m.batch_number, m.supplier_name, m.supplier_email, m.supplier_phone, m.price, m.min_stock_level, m.quantity as medicine_quantity
         FROM alerts a 
         JOIN medicines m ON a.medicine_id = m.id 
         WHERE a.company_id = $1 
         ORDER BY a.created_at DESC`,
        [companyId]
      );
    } else {
      result = await pool.query(
        `SELECT a.*, m.name as medicine_name, m.batch_number, m.supplier_name, m.supplier_email, m.supplier_phone, m.price, m.min_stock_level, m.quantity as medicine_quantity
         FROM alerts a 
         JOIN medicines m ON a.medicine_id = m.id 
         WHERE a.user_id = $1 
         ORDER BY a.created_at DESC`,
        [userId]
      );
    }
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching alerts:', err.message);
    res.status(500).json({ error: 'Server error fetching alerts' });
  }
});

app.put('/api/alerts/:id/read', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `UPDATE alerts SET status = 'read' WHERE id = $1 RETURNING *`,
      [id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error marking alert as read:', err.message);
    res.status(500).json({ error: 'Server error marking alert as read' });
  }
});

app.put('/api/alerts/read-all', async (req, res) => {
  const { userId } = req.body;
  try {
    const { companyId } = await getUserScope(userId);
    let result;
    if (companyId) {
      result = await pool.query(
        `UPDATE alerts SET status = 'read' WHERE company_id = $1 RETURNING *`,
        [companyId]
      );
    } else {
      result = await pool.query(
        `UPDATE alerts SET status = 'read' WHERE user_id = $1 RETURNING *`,
        [userId]
      );
    }
    res.json({ success: true, count: result.rowCount });
  } catch (err) {
    console.error('Error marking all alerts as read:', err.message);
    res.status(500).json({ error: 'Server error marking all alerts as read' });
  }
});

// Excel Export Service for Company-wide Reporting
app.get('/api/reports/company/export', async (req, res) => {
  const { userId } = req.query;
  try {
    const { companyId, role } = await getUserScope(userId);
    if (!companyId) {
      return res.status(400).json({ error: 'User does not belong to any company.' });
    }
    // RBAC check: only admin and manager can download company excel reports
    if (role === 'employee') {
      return res.status(403).json({ error: 'Forbidden: Only Company Admins or Managers can export organization reports.' });
    }

    // 1. Fetch Company Info
    const companyRes = await pool.query('SELECT name, email, phone FROM companies WHERE id = $1', [companyId]);
    const company = companyRes.rows[0];

    // 2. Fetch Medicines (Inventory)
    const medsRes = await pool.query('SELECT name, batch_number, manufacturing_date, expiry_date, quantity, min_stock_level, price, supplier_name FROM medicines WHERE company_id = $1 ORDER BY expiry_date ASC', [companyId]);
    const medicines = medsRes.rows;

    // 3. Fetch Sales Ledger
    const salesRes = await pool.query(
      `SELECT s.id, m.name as medicine_name, m.batch_number, s.quantity, s.total_price, s.sale_date, u.email as employee_email 
       FROM sales s
       JOIN medicines m ON s.medicine_id = m.id
       LEFT JOIN users u ON s.user_id = u.id
       WHERE s.company_id = $1
       ORDER BY s.sale_date DESC`,
      [companyId]
    );
    const sales = salesRes.rows;

    // 4. Fetch Staff Summary
    const staffRes = await pool.query(
      `SELECT u.name, u.email, u.role, u.mobile_number, 
              COALESCE(SUM(s.total_price), 0) as total_revenue, 
              COUNT(s.id) as sales_count
       FROM users u
       LEFT JOIN sales s ON u.id = s.user_id
       WHERE u.company_id = $1
       GROUP BY u.id, u.name, u.email, u.role, u.mobile_number
       ORDER BY total_revenue DESC`,
      [companyId]
    );
    const staff = staffRes.rows;

    // Generate Excel using xlsx library
    const wb = xlsx.utils.book_new();

    // Sheet 1: Metadata & Company KPI Summary
    const summaryData = [
      ['PHARMATRACK ENTERPRISE REPORT SUMMARY'],
      [],
      ['Organization Name:', company.name],
      ['Email Contact:', company.email],
      ['Phone Number:', company.phone || 'N/A'],
      ['Report Generated At:', new Date().toLocaleString()],
      [],
      ['KPI METRIC', 'VALUE'],
      ['Total Catalog Medicines:', medicines.length],
      ['Total Sales Revenue:', sales.reduce((acc, curr) => acc + parseFloat(curr.total_price || 0), 0)],
      ['Total Units Sold:', sales.reduce((acc, curr) => acc + parseInt(curr.quantity || 0), 0)],
      ['Total Registered Staff:', staff.length]
    ];
    const wsSummary = xlsx.utils.aoa_to_sheet(summaryData);
    xlsx.utils.book_append_sheet(wb, wsSummary, 'Overview');

    // Sheet 2: Inventory Dashboard
    const inventoryData = [
      ['Medicine Name', 'Batch Number', 'Mfg Date', 'Expiry Date', 'Quantity Left', 'Min Stock Threshold', 'Unit Price ($)', 'Supplier']
    ];
    medicines.forEach(m => {
      inventoryData.push([
        m.name, m.batch_number, 
        m.manufacturing_date ? new Date(m.manufacturing_date).toISOString().split('T')[0] : '', 
        m.expiry_date ? new Date(m.expiry_date).toISOString().split('T')[0] : '',
        m.quantity, m.min_stock_level, parseFloat(m.price), m.supplier_name || 'N/A'
      ]);
    });
    const wsInventory = xlsx.utils.aoa_to_sheet(inventoryData);
    xlsx.utils.book_append_sheet(wb, wsInventory, 'Inventory');

    // Sheet 3: Sales Ledger
    const salesData = [
      ['Transaction ID', 'Medicine Name', 'Batch Number', 'Units Sold', 'Total Price ($)', 'Sale Date', 'Operator Email']
    ];
    sales.forEach(s => {
      salesData.push([
        s.id, s.medicine_name, s.batch_number, s.quantity, parseFloat(s.total_price),
        s.sale_date ? new Date(s.sale_date).toLocaleString() : '', s.employee_email || 'N/A'
      ]);
    });
    const wsSales = xlsx.utils.aoa_to_sheet(salesData);
    xlsx.utils.book_append_sheet(wb, wsSales, 'Sales Ledger');

    // Sheet 4: Staff Contributions
    const staffData = [
      ['Staff Name', 'Email Address', 'System Role', 'Phone Number', 'Sales Transactions', 'Total Revenue Logged ($)']
    ];
    staff.forEach(u => {
      staffData.push([
        u.name || 'N/A', u.email, u.role, u.mobile_number || 'N/A',
        parseInt(u.sales_count), parseFloat(u.total_revenue)
      ]);
    });
    const wsStaff = xlsx.utils.aoa_to_sheet(staffData);
    xlsx.utils.book_append_sheet(wb, wsStaff, 'Staff Sales Summary');

    // Write to buffer and send
    const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', `attachment; filename="PharmaTrack_Company_Report_${Date.now()}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);

    await logAudit(userId, companyId, 'REPORT_EXPORT', req.ip, req.headers['user-agent']);
  } catch (err) {
    console.error('Error generating company Excel report:', err.message);
    res.status(500).json({ error: 'Server error generating Excel report' });
  }
});

// Excel Export Service for Personal/Employee Performance
app.get('/api/reports/employee/export', async (req, res) => {
  const { userId } = req.query;
  try {
    const { companyId } = await getUserScope(userId);
    
    // 1. Fetch Employee Profile
    const userRes = await pool.query('SELECT name, email, role, mobile_number FROM users WHERE id = $1', [userId]);
    const employee = userRes.rows[0];
    if (!employee) {
      return res.status(404).json({ error: 'Employee profile not found' });
    }

    // 2. Fetch Employee's Sales
    const salesRes = await pool.query(
      `SELECT s.id, m.name as medicine_name, m.batch_number, s.quantity, s.total_price, s.sale_date 
       FROM sales s
       JOIN medicines m ON s.medicine_id = m.id
       WHERE s.user_id = $1
       ORDER BY s.sale_date DESC`,
      [userId]
    );
    const sales = salesRes.rows;

    const wb = xlsx.utils.book_new();

    // Sheet 1: Personal Profile & Metrics Overview
    const summaryData = [
      ['PHARMATRACK EMPLOYEE SALES SUMMARY'],
      [],
      ['Staff Name:', employee.name || 'N/A'],
      ['Email Address:', employee.email],
      ['System Role:', employee.role.toUpperCase()],
      ['Mobile Number:', employee.mobile_number || 'N/A'],
      ['Report Generated At:', new Date().toLocaleString()],
      [],
      ['PERSONAL PERFORMANCE KPI', 'VALUE'],
      ['Total Sales Logged:', sales.length],
      ['Total Revenue Generated:', sales.reduce((acc, curr) => acc + parseFloat(curr.total_price || 0), 0)],
      ['Total Units Sold:', sales.reduce((acc, curr) => acc + parseInt(curr.quantity || 0), 0)]
    ];
    const wsSummary = xlsx.utils.aoa_to_sheet(summaryData);
    xlsx.utils.book_append_sheet(wb, wsSummary, 'My Performance');

    // Sheet 2: Personal Sales Ledger
    const salesData = [
      ['Transaction ID', 'Medicine Name', 'Batch Number', 'Units Sold', 'Total Price ($)', 'Sale Date']
    ];
    sales.forEach(s => {
      salesData.push([
        s.id, s.medicine_name, s.batch_number, s.quantity, parseFloat(s.total_price),
        s.sale_date ? new Date(s.sale_date).toLocaleString() : ''
      ]);
    });
    const wsSales = xlsx.utils.aoa_to_sheet(salesData);
    xlsx.utils.book_append_sheet(wb, wsSales, 'My Sales Log');

    const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', `attachment; filename="PharmaTrack_Personal_Report_${Date.now()}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);

    await logAudit(userId, companyId, 'EMPLOYEE_REPORT_EXPORT', req.ip, req.headers['user-agent']);
  } catch (err) {
    console.error('Error generating employee Excel report:', err.message);
    res.status(500).json({ error: 'Server error generating Excel report' });
  }
});

// Analytics Dashboard metrics
app.get('/api/sales/analytics', async (req, res) => {
  const { userId } = req.query;
  try {
    const { companyId, role } = await getUserScope(userId);
    const stats = {
      isCompanyScoped: !!companyId,
      userRole: role,
      activePersonnel: 0,
      salesByEmployee: []
    };

    let queryScope = 'user_id = $1';
    let queryParam = userId;

    if (companyId) {
      queryScope = 'company_id = $1';
      queryParam = companyId;

      // 1. Count active personnel
      const personnelRes = await pool.query('SELECT COUNT(*) as count FROM users WHERE company_id = $1', [companyId]);
      stats.activePersonnel = parseInt(personnelRes.rows[0].count) || 0;

      // 2. Fetch sales by employee contribution
      const employeeSalesRes = await pool.query(
        `SELECT u.name, u.email, u.role, 
                COALESCE(SUM(s.total_price), 0) as revenue, 
                COUNT(s.id) as sales_count
         FROM users u
         LEFT JOIN sales s ON u.id = s.user_id
         WHERE u.company_id = $1
         GROUP BY u.id, u.name, u.email, u.role
         ORDER BY revenue DESC`,
        [companyId]
      );
      stats.salesByEmployee = employeeSalesRes.rows;
    }

    // Total sales revenue
    const revenueRes = await pool.query(`SELECT SUM(total_price) as total FROM sales WHERE ${queryScope}`, [queryParam]);
    stats.totalRevenue = parseFloat(revenueRes.rows[0].total) || 0;

    // Total sales count
    const countRes = await pool.query(`SELECT SUM(quantity) as count FROM sales WHERE ${queryScope}`, [queryParam]);
    stats.totalUnitsSold = parseInt(countRes.rows[0].count) || 0;

    // Total medicine lines
    const medCountRes = await pool.query(`SELECT COUNT(*) as count FROM medicines WHERE ${queryScope}`, [queryParam]);
    stats.totalMedicines = parseInt(medCountRes.rows[0].count) || 0;

    // Stock alerts summary counts
    const alertsRes = await pool.query(`
      SELECT 
        SUM(CASE WHEN quantity = 0 THEN 1 ELSE 0 END) as out_of_stock,
        SUM(CASE WHEN quantity > 0 AND quantity <= min_stock_level THEN 1 ELSE 0 END) as low_stock,
        SUM(CASE WHEN expiry_date <= CURRENT_DATE THEN 1 ELSE 0 END) as expired
      FROM medicines
      WHERE ${queryScope}
    `, [queryParam]);
    stats.outOfStock = parseInt(alertsRes.rows[0].out_of_stock) || 0;
    stats.lowStock = parseInt(alertsRes.rows[0].low_stock) || 0;
    stats.expired = parseInt(alertsRes.rows[0].expired) || 0;

    // Sales by medicine for chart
    const topSalesRes = await pool.query(`
      SELECT m.name, SUM(s.quantity) as sold, SUM(s.total_price) as revenue
      FROM sales s
      JOIN medicines m ON s.medicine_id = m.id
      WHERE s.${queryScope}
      GROUP BY m.name
      ORDER BY sold DESC
      LIMIT 5
    `, [queryParam]);
    stats.topSelling = topSalesRes.rows;

    // Sales by day/month for timeline chart
    const timelineRes = await pool.query(`
      SELECT DATE_TRUNC('day', sale_date) as date, SUM(total_price) as revenue, SUM(quantity) as units
      FROM sales
      WHERE ${queryScope}
      GROUP BY DATE_TRUNC('day', sale_date)
      ORDER BY date ASC
      LIMIT 30
    `, [queryParam]);
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
    const predictions = await getPredictionsWithCache(userId);
    res.json(predictions);
  } catch (err) {
    console.error('Error fetching inventory predictions:', err.message);
    res.status(500).json({ error: 'Server error calculating predictions' });
  }
});

// 5. Gemini AI Recommendations Insights
app.get('/api/insights', async (req, res) => {
  const { userId } = req.query;
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  const now = Date.now();
  const cached = insightsCache[userId];
  if (cached && (now - cached.timestamp < INSIGHTS_CACHE_DURATION)) {
    return res.json({ insights: cached.data });
  }

  try {
    const { companyId } = await getUserScope(userId);
    let inventoryRes;
    if (companyId) {
      inventoryRes = await pool.query('SELECT * FROM medicines WHERE company_id = $1', [companyId]);
    } else {
      inventoryRes = await pool.query('SELECT * FROM medicines WHERE user_id = $1', [userId]);
    }
    const predictions = await getPredictionsWithCache(userId);
    
    const insights = await generateInsights(inventoryRes.rows, predictions);
    
    insightsCache[userId] = {
      data: insights,
      timestamp: now
    };
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
    const { companyId } = await getUserScope(userId);
    let queryScope = 'user_id = $1';
    let queryParam = userId;

    if (companyId) {
      queryScope = 'company_id = $1';
      queryParam = companyId;
    }

    const totalMedsRes = await pool.query(`SELECT COUNT(*) as count FROM medicines WHERE ${queryScope}`, [queryParam]);
    const lowStockMedsRes = await pool.query(`SELECT name, quantity, min_stock_level FROM medicines WHERE quantity <= min_stock_level AND ${queryScope}`, [queryParam]);
    
    const predictions = await getPredictionsWithCache(userId);
    const expiringSoon = predictions
      .filter(p => p.daysToExpiry <= 90 && p.quantity > 0)
      .map(p => ({ name: p.name, batch: p.batchNumber, days: p.daysToExpiry }));

    const topSellersRes = await pool.query(`
      SELECT m.name, SUM(s.quantity) as sold
      FROM sales s
      JOIN medicines m ON s.medicine_id = m.id
      WHERE s.${queryScope}
      GROUP BY m.name
      ORDER BY sold DESC
      LIMIT 3
    `, [queryParam]);

    // Fetch recent sales (last 5 transactions)
    const recentSalesRes = await pool.query(`
      SELECT s.quantity, s.total_price, s.sale_date, m.name 
      FROM sales s 
      JOIN medicines m ON s.medicine_id = m.id 
      WHERE s.${queryScope}
      ORDER BY s.sale_date DESC 
      LIMIT 5
    `, [queryParam]);
    const recentSales = recentSalesRes.rows.map(s => `${s.quantity}x ${s.name} ($${s.total_price}) on ${new Date(s.sale_date).toISOString().split('T')[0]}`);

    // Fetch active supplier directory from suppliers table
    const suppliersRes = await pool.query(`
      SELECT name, email, phone 
      FROM suppliers 
      WHERE ${queryScope}
    `, [queryParam]);
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
    if (!userId) return;
    socket.join(userId);
    console.log(`👤 User joined user socket room: ${userId}`);
    
    try {
      const { companyId } = await getUserScope(userId);
      if (companyId) {
        socket.join(companyId.toString());
        console.log(`🏢 User joined company socket room: ${companyId}`);
      }
    } catch (err) {
      console.error('Error joining company socket room:', err.message);
    }
    
    await sendInitialAlerts(socket, userId);
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});

async function sendInitialAlerts(socket, userId) {
  if (!userId) return;
  try {
    const { companyId } = await getUserScope(userId);
    let medsRes;
    if (companyId) {
      medsRes = await pool.query('SELECT * FROM medicines WHERE company_id = $1', [companyId]);
    } else {
      medsRes = await pool.query('SELECT * FROM medicines WHERE user_id = $1', [userId]);
    }
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
async function migrateDatabase(retries = 3, delay = 3000) {
  for (let i = 1; i <= retries; i++) {
    try {
      console.log(`🔄 Running database migrations (Attempt ${i}/${retries})...`);
      await pool.query(`
        CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

        CREATE TABLE IF NOT EXISTS companies (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          passkey VARCHAR(100) UNIQUE NOT NULL,
          phone VARCHAR(50),
          logo_url TEXT,
          status VARCHAR(50) DEFAULT 'active',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        ALTER TABLE users ADD COLUMN IF NOT EXISTS company_name VARCHAR(255);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS company_phone VARCHAR(50);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS company_address TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS license_number VARCHAR(100);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(255);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS alert_email VARCHAR(255);

        -- Enterprise user columns
        ALTER TABLE users ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'employee';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile_number VARCHAR(50);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;

        -- Notification preference columns
        ALTER TABLE users ADD COLUMN IF NOT EXISTS pref_email BOOLEAN DEFAULT true;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS pref_in_app BOOLEAN DEFAULT true;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS pref_slack_telegram BOOLEAN DEFAULT false;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS slack_webhook_url TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(100);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS pref_whatsapp BOOLEAN DEFAULT false;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(50);

        ALTER TABLE companies ADD COLUMN IF NOT EXISTS pref_email BOOLEAN DEFAULT true;
        ALTER TABLE companies ADD COLUMN IF NOT EXISTS pref_in_app BOOLEAN DEFAULT true;
        ALTER TABLE companies ADD COLUMN IF NOT EXISTS pref_slack_telegram BOOLEAN DEFAULT false;
        ALTER TABLE companies ADD COLUMN IF NOT EXISTS slack_webhook_url TEXT;
        ALTER TABLE companies ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(100);
        ALTER TABLE companies ADD COLUMN IF NOT EXISTS theme_color VARCHAR(50) DEFAULT '#0ea5e9';
        ALTER TABLE companies ADD COLUMN IF NOT EXISTS pref_whatsapp BOOLEAN DEFAULT false;
        ALTER TABLE companies ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(50);

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
        ALTER TABLE medicines ADD COLUMN IF NOT EXISTS barcode VARCHAR(100);

        -- Enterprise scoping columns
        ALTER TABLE medicines ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
        ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

        -- Centralized Alert System
        CREATE TABLE IF NOT EXISTS alerts (
          id SERIAL PRIMARY KEY,
          company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
          user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
          medicine_id INT REFERENCES medicines(id) ON DELETE CASCADE,
          message TEXT NOT NULL,
          level VARCHAR(50) NOT NULL,
          status VARCHAR(50) DEFAULT 'unread',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        ALTER TABLE alerts ADD COLUMN IF NOT EXISTS user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE;

        -- Audit Trail Logs Table
        CREATE TABLE IF NOT EXISTS audit_logs (
          id SERIAL PRIMARY KEY,
          user_id VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
          company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
          action_type VARCHAR(100) NOT NULL,
          ip_address VARCHAR(50),
          device_info TEXT,
          timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        -- Performance optimization indexes
        CREATE INDEX IF NOT EXISTS idx_medicines_user_id ON medicines(user_id);
        CREATE INDEX IF NOT EXISTS idx_sales_user_id ON sales(user_id);
        CREATE INDEX IF NOT EXISTS idx_suppliers_user_id ON suppliers(user_id);
        CREATE INDEX IF NOT EXISTS idx_sales_medicine_id ON sales(medicine_id);

        -- Enterprise scopes indexes
        CREATE INDEX IF NOT EXISTS idx_users_company_id ON users(company_id);
        CREATE INDEX IF NOT EXISTS idx_medicines_company_id ON medicines(company_id);
        CREATE INDEX IF NOT EXISTS idx_sales_company_id ON sales(company_id);
        CREATE INDEX IF NOT EXISTS idx_suppliers_company_id ON suppliers(company_id);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_company_id ON audit_logs(company_id);
        CREATE INDEX IF NOT EXISTS idx_alerts_company_id ON alerts(company_id);
        CREATE INDEX IF NOT EXISTS idx_alerts_user_id ON alerts(user_id);
      `);
      console.log('✅ Database migrations applied successfully.');
      return;
    } catch (err) {
      console.error(`⚠️ Database migration attempt ${i}/${retries} failed:`, err.message);
      if (i === retries) {
        console.error('❌ All database migration attempts failed.');
      } else {
        console.log(`⏳ Waiting ${delay / 1000}s before next attempt...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
}

// Daily Alert Scan Checker
async function runDailyAlertScan() {
  console.log('⏰ Starting Daily Alert Scan...');
  const now = new Date();
  
  try {
    // 1. Fetch all companies
    const companiesRes = await pool.query('SELECT id, name, email, pref_email, pref_slack_telegram, slack_webhook_url, telegram_chat_id, pref_whatsapp, whatsapp_number FROM companies');
    const companies = companiesRes.rows;

    for (const comp of companies) {
      console.log(`Processing daily alerts for company: ${comp.name} (${comp.id})`);
      
      // Fetch all medicines under this company
      const medsRes = await pool.query('SELECT * FROM medicines WHERE company_id = $1', [comp.id]);
      const meds = medsRes.rows;
      
      const activeAlerts = [];
      let expiredCount = 0;
      let lowStockCount = 0;

      for (const med of meds) {
        const exp = new Date(med.expiry_date);
        const diff = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
        let isAlert = false;
        let alertLevel = 'warning';
        let alertMessage = '';

        if (med.quantity === 0) {
          isAlert = true;
          alertLevel = 'danger';
          alertMessage = `🚨 Critical: "${med.name}" (Batch ${med.batch_number}) is out of stock!`;
        } else if (med.quantity <= med.min_stock_level) {
          isAlert = true;
          lowStockCount++;
          alertMessage = `⚠️ Low Stock: "${med.name}" is down to ${med.quantity} units (Threshold: ${med.min_stock_level}).`;
        }

        if (diff <= 0) {
          isAlert = true;
          alertLevel = 'danger';
          alertMessage = `🚨 Expired: "${med.name}" (Batch ${med.batch_number}) expired on ${new Date(med.expiry_date).toISOString().split('T')[0]}!`;
          expiredCount++;
        } else if (diff <= 60) {
          isAlert = true;
          alertMessage = `⏳ Expiry Alert: "${med.name}" expires in ${diff} days.`;
        }

        if (isAlert) {
          activeAlerts.push({
            name: med.name,
            batch: med.batch_number,
            qty: med.quantity,
            type: alertLevel,
            message: alertMessage
          });

          try {
            await pool.query(
              `INSERT INTO alerts (company_id, user_id, medicine_id, message, level, status) 
               VALUES ($1, NULL, $2, $3, $4, 'unread')`,
              [comp.id, med.id, alertMessage, alertLevel]
            );
          } catch (dbErr) {
            console.error('Error saving daily alert to DB:', dbErr.message);
          }
        }
      }

      if (activeAlerts.length > 0) {
        const statsSummary = {
          expired: expiredCount,
          lowStock: lowStockCount,
          totalMedicines: meds.length
        };

        if (comp.pref_email) {
          console.log(`✉️ Dispatching automated daily report email to ${comp.email}`);
          sendAlertEmail(comp.email, statsSummary, activeAlerts).catch(e => 
            console.error('Failed to send automated daily email alert:', e.message)
          );
        }

        if (comp.pref_slack_telegram) {
          const alertSummaryText = `⚠️ *Daily Alerts Summary for ${comp.name}*:\n- Out of stock/Low stock: ${lowStockCount}\n- Expired: ${expiredCount}\nTotal active alert items: ${activeAlerts.length}`;
          if (comp.slack_webhook_url) {
            sendSlackNotification(comp.slack_webhook_url, alertSummaryText).catch(e => 
              console.error('Slack daily alert error:', e.message)
            );
          }
          if (comp.telegram_chat_id) {
            sendTelegramNotification(comp.telegram_chat_id, alertSummaryText).catch(e => 
              console.error('Telegram daily alert error:', e.message)
            );
          }
        }


      }
    }

    // 2. Fetch all independent users
    const independentUsersRes = await pool.query("SELECT id, email, alert_email, pref_email, pref_slack_telegram, slack_webhook_url, telegram_chat_id, pref_whatsapp, whatsapp_number FROM users WHERE company_id IS NULL");
    const indyUsers = independentUsersRes.rows;

    for (const user of indyUsers) {
      console.log(`Processing daily alerts for independent pharmacist: ${user.email}`);
      const medsRes = await pool.query('SELECT * FROM medicines WHERE user_id = $1', [user.id]);
      const meds = medsRes.rows;
      
      const activeAlerts = [];
      let expiredCount = 0;
      let lowStockCount = 0;

      for (const med of meds) {
        const exp = new Date(med.expiry_date);
        const diff = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
        let isAlert = false;
        let alertLevel = 'warning';
        let alertMessage = '';

        if (med.quantity === 0) {
          isAlert = true;
          alertLevel = 'danger';
          alertMessage = `🚨 Critical: "${med.name}" (Batch ${med.batch_number}) is out of stock!`;
        } else if (med.quantity <= med.min_stock_level) {
          isAlert = true;
          lowStockCount++;
          alertMessage = `⚠️ Low Stock: "${med.name}" is down to ${med.quantity} units (Threshold: ${med.min_stock_level}).`;
        }

        if (diff <= 0) {
          isAlert = true;
          alertLevel = 'danger';
          alertMessage = `🚨 Expired: "${med.name}" (Batch ${med.batch_number}) expired on ${new Date(med.expiry_date).toISOString().split('T')[0]}!`;
          expiredCount++;
        } else if (diff <= 60) {
          isAlert = true;
          alertMessage = `⏳ Expiry Alert: "${med.name}" expires in ${diff} days.`;
        }

        if (isAlert) {
          activeAlerts.push({
            name: med.name,
            batch: med.batch_number,
            qty: med.quantity,
            type: alertLevel,
            message: alertMessage
          });

          try {
            await pool.query(
              `INSERT INTO alerts (company_id, user_id, medicine_id, message, level, status) 
               VALUES (NULL, $1, $2, $3, $4, 'unread')`,
              [user.id, med.id, alertMessage, alertLevel]
            );
          } catch (dbErr) {
            console.error('Error saving independent daily alert to DB:', dbErr.message);
          }
        }
      }

      if (activeAlerts.length > 0) {
        const statsSummary = {
          expired: expiredCount,
          lowStock: lowStockCount,
          totalMedicines: meds.length
        };

        const recipient = user.alert_email || user.email;
        if (user.pref_email && recipient) {
          console.log(`✉️ Dispatching automated daily report email to independent user ${recipient}`);
          sendAlertEmail(recipient, statsSummary, activeAlerts).catch(e => 
            console.error('Failed to send automated independent daily email alert:', e.message)
          );
        }

        if (user.pref_slack_telegram) {
          const alertSummaryText = `⚠️ *Daily Alerts Summary for independent pharmacist*:\n- Out of stock/Low stock: ${lowStockCount}\n- Expired: ${expiredCount}`;
          if (user.slack_webhook_url) {
            sendSlackNotification(user.slack_webhook_url, alertSummaryText).catch(e => 
              console.error('Slack daily alert error:', e.message)
            );
          }
          if (user.telegram_chat_id) {
            sendTelegramNotification(user.telegram_chat_id, alertSummaryText).catch(e => 
              console.error('Telegram daily alert error:', e.message)
            );
          }
        }


      }
    }

    console.log('✅ Daily Alert Scan completed successfully.');
  } catch (err) {
    console.error('❌ Error executing daily alert cron scan:', err.message);
  }
}

// Hourly checker to trigger runDailyAlertScan at 8:00 AM once a day
let lastCronRunDate = '';
function startDailyAlertCron() {
  console.log('⏰ Starting Daily Alert Cron Scheduler loop (checking hourly)...');
  setInterval(async () => {
    try {
      const now = new Date();
      const currentDateStr = now.toISOString().split('T')[0];
      const currentHour = now.getHours();
      
      if (currentHour === 8 && lastCronRunDate !== currentDateStr) {
        lastCronRunDate = currentDateStr;
        await runDailyAlertScan();
      }
    } catch (e) {
      console.error('Error in daily alert cron interval checker:', e.message);
    }
  }, 60 * 60 * 1000); // Check once an hour
}

// Start Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, async () => {
  console.log(`🚀 PharmaTrack Backend running on http://localhost:${PORT}`);
  await migrateDatabase();
  await seedMockData();
  startDailyAlertCron();
});

