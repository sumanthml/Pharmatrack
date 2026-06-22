import dotenv from 'dotenv';

dotenv.config();

const RESEND_API_KEY = process.env.RESEND_API_KEY || 're_7uCsugqK_BUSWKY7qZhdaccxKU9VSs3ED';

/**
 * Send an email via the Resend HTTP API.
 */
async function sendMailViaResend(recipientEmail, subject, html) {
  try {
    if (!RESEND_API_KEY) {
      console.error('❌ Resend API key is not configured.');
      return { success: false };
    }

    const payload = {
      from: 'PharmaTrack <onboarding@resend.dev>',
      to: recipientEmail,
      subject: subject,
      html: html
    };

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      // Handle sandbox validation error
      if (data.name === 'validation_error') {
        console.warn(`⚠️ Resend Sandbox Warning: redirecting email for ${recipientEmail} to verified sandbox address (studyflow820@gmail.com)`);
        const fallbackPayload = {
          from: 'PharmaTrack <onboarding@resend.dev>',
          to: 'studyflow820@gmail.com',
          subject: `[FORWARDED for ${recipientEmail}] - ${subject}`,
          html: `<div style="background: #fff8e1; border: 1px solid #ffe082; padding: 12px; border-radius: 6px; margin-bottom: 20px; font-family: sans-serif; font-size: 0.85rem; color: #b78103;">
            <strong>Resend Sandbox Notice:</strong> This email was originally sent to <strong>${recipientEmail}</strong> but has been forwarded to you because your Resend API Key is in Sandbox mode and only allows sending to your registered owner address.
          </div>${html}`
        };

        const fallbackResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(fallbackPayload)
        });

        const fallbackData = await fallbackResponse.json();
        if (fallbackResponse.ok) {
          console.log(`✅ Sandbox fallback email sent successfully. ID: ${fallbackData.id}`);
          return { success: true };
        } else {
          console.error('❌ Resend Sandbox fallback failed:', fallbackData);
          return { success: false };
        }
      }

      console.error('❌ Resend API request failed:', data);
      return { success: false };
    }

    console.log(`✅ Resend email sent successfully to ${recipientEmail}. ID: ${data.id}`);
    return { success: true };
  } catch (err) {
    console.error('❌ Error sending mail via Resend:', err.message);
    return { success: false };
  }
}

/**
 * Compile active database alerts into a beautiful visual HTML document and send to the user's alert email.
 */
export async function sendAlertEmail(recipientEmail, stats, alertsList) {
  try {
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

    const htmlContent = `
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
    `;

    return await sendMailViaResend(
      recipientEmail, 
      `🚨 PharmaTrack System Alert Report - ${new Date().toLocaleDateString()}`, 
      htmlContent
    );
  } catch (err) {
    console.error('Error dispatching alert email:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Send the generated Company Passkey to the newly registered Company Admin.
 */
export async function sendCompanyPasskeyEmail(recipientEmail, companyName, passkey) {
  try {
    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 30px; text-align: center; color: white;">
          <h1 style="color: #38bdf8; margin: 0; font-size: 1.75rem; font-weight: 800;">ScanTrace Enterprise</h1>
          <p style="color: #94a3b8; font-size: 0.9rem; margin: 5px 0 0 0;">Company Registration Confirmation</p>
        </div>
        <div style="padding: 24px; color: #334155; line-height: 1.6;">
          <h2 style="font-size: 1.25rem; color: #0f172a; margin-top: 0;">Welcome to ScanTrace Enterprise, ${companyName}!</h2>
          <p>Your company has been successfully onboarded. Here are your credentials:</p>
          <div style="background: #f1f5f9; padding: 15px; border-radius: 8px; border: 1px solid #cbd5e1; font-family: monospace; font-size: 1.2rem; display: block; margin: 15px 0; text-align: center;">
            <strong>Company Passkey:</strong> <span style="color: #0ea5e9; font-weight: 700; letter-spacing: 1px;">${passkey}</span>
          </div>
          <p style="color: #ef4444; font-weight: 600;">⚠️ Keep this passkey secure! Your employees will require it during registration to join your organization.</p>
          <p>You can now sign in using your admin email <strong>${recipientEmail}</strong> to access your administrative dashboard.</p>
        </div>
        <div style="background: #0f172a; color: #64748b; padding: 15px; text-align: center; font-size: 0.75rem;">
          &copy; 2026 ScanTrace Enterprise. All rights reserved.
        </div>
      </div>
    `;
    return await sendMailViaResend(
      recipientEmail,
      `🏢 Company Registered & Passkey Generated: ${companyName}`,
      htmlContent
    );
  } catch (err) {
    console.error('Error sending passkey email:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Send onboarding/verification confirmation email to newly registered employee.
 */
export async function sendEmployeeVerificationEmail(employeeEmail, employeeName) {
  try {
    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 30px; text-align: center; color: white;">
          <h1 style="color: #38bdf8; margin: 0; font-size: 1.75rem; font-weight: 800;">ScanTrace Enterprise</h1>
          <p style="color: #94a3b8; font-size: 0.9rem; margin: 5px 0 0 0;">Employee Onboarding</p>
        </div>
        <div style="padding: 24px; color: #334155; line-height: 1.6;">
          <h2 style="font-size: 1.25rem; color: #0f172a; margin-top: 0;">Welcome, ${employeeName}!</h2>
          <p>Your account has been successfully registered and linked to your company workspace.</p>
          <p>You can now sign in to view your reports, upload inventory sheets, and access your personal dashboard.</p>
        </div>
        <div style="background: #0f172a; color: #64748b; padding: 15px; text-align: center; font-size: 0.75rem;">
          &copy; 2026 ScanTrace Enterprise. All rights reserved.
        </div>
      </div>
    `;
    return await sendMailViaResend(
      employeeEmail,
      `✅ Welcome to ScanTrace, ${employeeName}!`,
      htmlContent
    );
  } catch (err) {
    console.error('Error sending employee verification email:', err.message);
    return { success: false };
  }
}

/**
 * Notify Company Admin that a new employee has joined the company workspace.
 */
export async function sendAdminNewEmployeeNotificationEmail(adminEmail, employeeName, employeeEmail, employeeRole) {
  try {
    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 30px; text-align: center; color: white;">
          <h1 style="color: #38bdf8; margin: 0; font-size: 1.75rem; font-weight: 800;">ScanTrace Enterprise</h1>
          <p style="color: #94a3b8; font-size: 0.9rem; margin: 5px 0 0 0;">New User Notification</p>
        </div>
        <div style="padding: 24px; color: #334155; line-height: 1.6;">
          <h2 style="font-size: 1.25rem; color: #0f172a; margin-top: 0;">New Employee Joined</h2>
          <p>A new user has registered and linked to your company workspace using your Company Passkey.</p>
          <ul style="padding-left: 20px;">
            <li><strong>Name:</strong> ${employeeName}</li>
            <li><strong>Email:</strong> ${employeeEmail}</li>
            <li><strong>Assigned Role:</strong> ${employeeRole}</li>
          </ul>
          <p>You can manage employee access, edit roles, or view audit trails from your admin console.</p>
        </div>
        <div style="background: #0f172a; color: #64748b; padding: 15px; text-align: center; font-size: 0.75rem;">
          &copy; 2026 ScanTrace Enterprise. All rights reserved.
        </div>
      </div>
    `;
    return await sendMailViaResend(
      adminEmail,
      `🔔 New Personnel Registered: ${employeeName}`,
      htmlContent
    );
  } catch (err) {
    console.error('Error sending admin employee notification email:', err.message);
    return { success: false };
  }
}

/**
 * Send a registration OTP verification code to the user's email.
 */
export async function sendOtpEmail(recipientEmail, otpCode) {
  try {
    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%); padding: 30px; text-align: center; color: white;">
          <h1 style="color: white; margin: 0; font-size: 1.75rem; font-weight: 800;">PharmaTrack</h1>
          <p style="color: rgba(255,255,255,0.8); font-size: 0.9rem; margin: 5px 0 0 0;">Email Verification</p>
        </div>
        <div style="padding: 24px; color: #334155; line-height: 1.6; text-align: center;">
          <h2 style="font-size: 1.25rem; color: #0f172a; margin-top: 0;">Confirm Your Identity</h2>
          <p>Please use the following 6-digit verification code to complete your registration:</p>
          <div style="display: inline-block; font-size: 2.2rem; font-weight: 800; color: #0ea5e9; letter-spacing: 6px; padding: 12px 30px; border-radius: 8px; background: #f0f9ff; border: 1px dashed #0ea5e9; margin: 15px 0; font-family: monospace;">
            ${otpCode}
          </div>
          <p style="font-size: 0.8rem; color: #64748b;">This code is valid for 10 minutes. If you did not request this code, please ignore this email.</p>
        </div>
        <div style="background: #0f172a; color: #64748b; padding: 15px; text-align: center; font-size: 0.75rem;">
          &copy; 2026 PharmaTrack. All rights reserved.
        </div>
      </div>
    `;
    return await sendMailViaResend(
      recipientEmail,
      `🔑 PharmaTrack Verification Code: ${otpCode}`,
      htmlContent
    );
  } catch (err) {
    console.error('Error sending OTP verification email:', err.message);
    return { success: false };
  }
}

