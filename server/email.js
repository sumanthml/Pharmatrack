import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

let testAccount = null;

/**
 * Resolves the Nodemailer transporter (SMTP or Ethereal test account).
 */
async function getTransporter() {
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }

  // Fallback: Create dynamic ethereal account for instant developer testing
  if (!testAccount) {
    try {
      testAccount = await nodemailer.createTestAccount();
      console.log(`✉️ Dynamic Ethereal Email Account created: User=${testAccount.user}`);
    } catch (err) {
      console.error('Failed to create Ethereal test account, using fake logger.', err.message);
      return null;
    }
  }

  return nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass
    }
  });
}

/**
 * Compile active database alerts into a beautiful visual HTML document and send to the user's alert email.
 */
export async function sendAlertEmail(recipientEmail, stats, alertsList) {
  try {
    const transporter = await getTransporter();
    if (!transporter) {
      console.log('Email dispatcher: No transporter available. Email logged instead.');
      return { success: false, message: 'No email service configured.' };
    }

    const nowStr = new Date().toLocaleDateString(undefined, { 
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' 
    });

    // Generate HTML rows for alerts table
    let alertsRows = '';
    if (alertsList.length === 0) {
      alertsRows = `
        <tr>
          <td colspan="4" style="padding: 15px; text-align: center; color: #64748b; font-style: italic;">
            All systems nominal. No active stock or expiry alerts found!
          </td>
        </tr>
      `;
    } else {
      alertsList.forEach(alert => {
        let statusBadgeColor = '#f59e0b'; // warning
        let statusBg = 'rgba(245, 158, 11, 0.1)';
        
        if (alert.type === 'danger') {
          statusBadgeColor = '#ef4444'; // danger
          statusBg = 'rgba(239, 68, 68, 0.1)';
        }

        alertsRows += `
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 12px; font-weight: 600; color: #1e293b;">${alert.name || 'Stock Alert'}</td>
            <td style="padding: 12px; color: #475569;">${alert.batch || 'N/A'}</td>
            <td style="padding: 12px; color: #475569;">${alert.qty !== undefined ? alert.qty : 'N/A'}</td>
            <td style="padding: 12px; text-align: right;">
              <span style="display: inline-block; padding: 4px 10px; border-radius: 50px; font-size: 0.75rem; font-weight: 700; color: ${statusBadgeColor}; background: ${statusBg}; border: 1px solid ${statusBadgeColor}; text-transform: uppercase;">
                ${alert.message.includes('expired') ? 'Expired' : alert.message.includes('out of stock') ? 'Out of Stock' : 'Low Stock'}
              </span>
            </td>
          </tr>
        `;
      });
    }

    const mailOptions = {
      from: '"PharmaTrack Alerts" <alerts@pharmatrack.com>',
      to: recipientEmail,
      subject: `🚨 PharmaTrack System Alert Report - ${new Date().toLocaleDateString()}`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>PharmaTrack Alerts Report</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; overflow: hidden;">
    <!-- Header banner -->
    <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 30px; text-align: center;">
      <h1 style="color: #38bdf8; font-size: 1.75rem; font-weight: 800; margin: 0; letter-spacing: -0.5px;">PharmaTrack</h1>
      <p style="color: #94a3b8; font-size: 0.9rem; margin: 5px 0 0 0;">Intelligent Inventory Audit Report</p>
    </div>

    <!-- Alert statistics panel -->
    <div style="padding: 24px; border-bottom: 1px solid #f1f5f9;">
      <h2 style="font-size: 1.15rem; color: #0f172a; margin: 0 0 15px 0; font-weight: 700;">System Status Summary</h2>
      
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 20px;">
        <div style="background: #fdf2f2; border: 1px solid #fde2e2; border-radius: 8px; padding: 12px; text-align: center;">
          <div style="font-size: 0.75rem; color: #9b1c1c; font-weight: 600; text-transform: uppercase;">Expired</div>
          <div style="font-size: 1.5rem; color: #9b1c1c; font-weight: 700; margin-top: 2px;">${stats.expired || 0}</div>
        </div>
        <div style="background: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px; padding: 12px; text-align: center;">
          <div style="font-size: 0.75rem; color: #92400e; font-weight: 600; text-transform: uppercase;">Low Stock</div>
          <div style="font-size: 1.5rem; color: #92400e; font-weight: 700; margin-top: 2px;">${stats.lowStock || 0}</div>
        </div>
        <div style="background: #ecfdf5; border: 1px solid #d1fae5; border-radius: 8px; padding: 12px; text-align: center;">
          <div style="font-size: 0.75rem; color: #065f46; font-weight: 600; text-transform: uppercase;">Total Items</div>
          <div style="font-size: 1.5rem; color: #065f46; font-weight: 700; margin-top: 2px;">${stats.totalMedicines || 0}</div>
        </div>
      </div>
      
      <div style="font-size: 0.85rem; color: #64748b; font-style: italic; text-align: right;">
        Report Timestamp: ${nowStr}
      </div>
    </div>

    <!-- Alerts Table document -->
    <div style="padding: 24px;">
      <h3 style="font-size: 1rem; color: #0f172a; margin: 0 0 12px 0; font-weight: 700; border-bottom: 2px solid #38bdf8; padding-bottom: 4px; width: fit-content;">
        Active Shelf Warnings
      </h3>
      
      <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.9rem;">
        <thead>
          <tr style="border-bottom: 2px solid #cbd5e1; color: #64748b;">
            <th style="padding: 8px 12px; font-weight: 600;">Medicine</th>
            <th style="padding: 8px 12px; font-weight: 600;">Batch</th>
            <th style="padding: 8px 12px; font-weight: 600;">Qty</th>
            <th style="padding: 8px 12px; font-weight: 600; text-align: right;">Alert Level</th>
          </tr>
        </thead>
        <tbody>
          ${alertsRows}
        </tbody>
      </table>
    </div>

    <!-- Recommendations -->
    <div style="background: #f8fafc; padding: 24px; border-top: 1px solid #e2e8f0; font-size: 0.85rem; color: #475569; line-height: 1.5;">
      <strong style="color: #0f172a; display: block; margin-bottom: 8px;">Recommended Next Steps:</strong>
      <ul style="margin: 0; padding-left: 20px;">
        <li>Flag expired medicines immediately and move them to the biohazard isolation bins.</li>
        <li>Review purchase ordering sheets for low stock items and email supplier catalogs.</li>
        <li>For expiring medicines with high wastage projections, apply markdown discounts.</li>
      </ul>
    </div>

    <!-- Footer -->
    <div style="background: #0f172a; color: #64748b; padding: 15px; text-align: center; font-size: 0.75rem; border-bottom-left-radius: 12px; border-bottom-right-radius: 12px;">
      &copy; 2026 PharmaTrack. All rights reserved. Generated automatically for ${recipientEmail}.
    </div>
  </div>
</body>
</html>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✉️ Email alert document successfully sent to: ${recipientEmail}`);
    
    // If using Ethereal test account, print URL to console
    if (testAccount && testAccount.user === transporter.options.auth.user) {
      const previewUrl = nodemailer.getTestMessageUrl(info);
      console.log(`🔗 Preview Sent Email Document visually here: ${previewUrl}`);
      return { 
        success: true, 
        message: 'Alert report sent. Preview Ethereal URL generated.',
        previewUrl 
      };
    }

    return { success: true, message: 'Alert report sent to your inbox.' };
  } catch (err) {
    console.error('Error dispatching alert email:', err.message);
    return { success: false, error: err.message };
  }
}
