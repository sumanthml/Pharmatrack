import React, { useEffect, useState } from 'react';
import { Bell, Mail, ShieldAlert, Send, Eye, CheckCircle2, RefreshCw, MessageSquare, ShoppingCart, FileText, X, Phone, User } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { API_BASE_URL } from '../config';

export default function Alerts({ socket, user }) {
  const [medicines, setMedicines] = useState([]);
  const [profile, setProfile] = useState({ alert_email: '' });

  // Email Send State
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [emailError, setEmailError] = useState('');

  const [dbAlerts, setDbAlerts] = useState([]);
  const [loadingDbAlerts, setLoadingDbAlerts] = useState(true);

  // Supplier Reorder PO States
  const [isReorderModalOpen, setIsReorderModalOpen] = useState(false);
  const [reorderMed, setReorderMed] = useState(null);
  const [reorderQty, setReorderQty] = useState(50);
  const [reorderError, setReorderError] = useState('');
  const [reorderSuccess, setReorderSuccess] = useState('');
  const [companySettings, setCompanySettings] = useState(null);

  // Fetch medicines, user profile, and DB alerts
  const fetchData = async () => {
    try {
      if (!user?.uid) return;
      // 1. Medicines
      const medRes = await fetch(`${API_BASE_URL}/api/medicines?userId=${user.uid}`);
      const medData = await medRes.json();
      setMedicines(medData);

      // 2. Profile
      const profileRes = await fetch(`${API_BASE_URL}/api/users/profile/${user.uid}`);
      if (profileRes.ok) {
        const profileData = await profileRes.json();
        setProfile(profileData);
      }

      // 3. Database Alerts Feed
      const alertsRes = await fetch(`${API_BASE_URL}/api/alerts?userId=${user.uid}`);
      if (alertsRes.ok) {
        const alertsData = await alertsRes.json();
        setDbAlerts(alertsData);
      }
    } catch (e) {
      console.error('Error loading alerts tab data:', e.message);
    } finally {
      setLoadingDbAlerts(false);
    }
  };

  const handleMarkAsRead = async (id) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/alerts/${id}/read`, {
        method: 'PUT'
      });
      if (res.ok) {
        setDbAlerts(prev => prev.map(a => a.id === id ? { ...a, status: 'read' } : a));
      }
    } catch (err) {
      console.error('Failed to mark alert as read:', err.message);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/alerts/read-all`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.uid })
      });
      if (res.ok) {
        setDbAlerts(prev => prev.map(a => ({ ...a, status: 'read' })));
      }
    } catch (err) {
      console.error('Failed to mark all alerts as read:', err.message);
    }
  };

  const fetchCompanySettings = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/companies/settings`);
      if (res.ok) {
        const data = await res.json();
        setCompanySettings(data);
      }
    } catch (err) {
      console.error('Error fetching company settings in Alerts:', err.message);
    }
  };

  const handleReorderClick = (alert) => {
    // Construct a temporary medicine-like object from the alert metadata
    const tempMed = {
      id: alert.medicine_id,
      name: alert.medicine_name,
      batch_number: alert.batch_number,
      quantity: alert.medicine_quantity,
      price: alert.price || 10,
      min_stock_level: alert.min_stock_level || 10,
      supplier_name: alert.supplier_name,
      supplier_email: alert.supplier_email,
      supplier_phone: alert.supplier_phone
    };
    setReorderMed(tempMed);
    const suggested = Math.max(50, tempMed.min_stock_level * 2);
    setReorderQty(suggested);
    setIsReorderModalOpen(true);
    setReorderSuccess('');
    setReorderError('');
  };

  const handleSendEmailPO = () => {
    if (!reorderMed || !reorderMed.supplier_email) return;
    try {
      const companyName = companySettings?.name || user.email.split('@')[0] + ' Pharmacy';
      const subject = encodeURIComponent(`Purchase Order request: ${reorderMed.name} (Batch: ${reorderMed.batch_number})`);
      const body = encodeURIComponent(
        `Dear ${reorderMed.supplier_name || 'Supplier'},\n\n` +
        `This is a purchase order from ${companyName}.\n\n` +
        `Please arrange restock of the following medicine:\n` +
        `- Medicine Name: ${reorderMed.name}\n` +
        `- Batch Number: ${reorderMed.batch_number}\n` +
        `- Quantity Requested: ${reorderQty} units\n` +
        `- Unit Price agreed: $${parseFloat(reorderMed.price).toFixed(2)}\n` +
        `- Total Estimated Cost: $${(reorderQty * parseFloat(reorderMed.price)).toFixed(2)}\n\n` +
        `Please send us the delivery details and invoice at your earliest convenience.\n\n` +
        `Best regards,\n` +
        `${user.email}\n` +
        `${companyName}`
      );
      window.location.href = `mailto:${reorderMed.supplier_email}?subject=${subject}&body=${body}`;
      setReorderSuccess('Email client opened successfully!');
      
      // Log audit trail
      fetch(`${API_BASE_URL}/api/audit-logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType: 'PO_EMAIL_GENERATE',
          userId: user.uid
        })
      }).catch(e => console.error(e));
    } catch (err) {
      setReorderError('Failed to open email client: ' + err.message);
    }
  };

  const handleDownloadPDFPO = () => {
    if (!reorderMed) return;
    try {
      const companyName = companySettings?.name || 'PharmaTrack Workspace';
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const primaryColor = companySettings?.theme_color || '#0ea5e9';
      
      // Draw branded header strip
      doc.setFillColor(primaryColor);
      doc.rect(0, 0, 210, 15, 'F');

      // Title
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text('PURCHASE ORDER', 15, 10);

      // Workspace / Sender Details
      doc.setTextColor(51, 65, 85);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`From:\n${companyName}\nEmail: ${user.email}`, 15, 25);

      // Supplier Details
      doc.text(
        `To:\n${reorderMed.supplier_name || 'N/A'}\nEmail: ${reorderMed.supplier_email || 'N/A'}\nPhone: ${reorderMed.supplier_phone || 'N/A'}`,
        120, 25
      );

      // Divider Line
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.5);
      doc.line(15, 50, 195, 50);

      // PO Metadata
      doc.setFont('helvetica', 'bold');
      doc.text('Purchase Order Details', 15, 58);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`PO Number: PO-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`, 15, 64);
      doc.text(`Date Issued: ${new Date().toLocaleDateString()}`, 15, 69);
      doc.text(`Status: Pending Approval`, 15, 74);

      // Table Header
      doc.setFillColor(248, 250, 252);
      doc.rect(15, 83, 180, 8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.text('Item Description', 18, 88);
      doc.text('Batch', 90, 88);
      doc.text('Qty', 135, 88, { align: 'right' });
      doc.text('Unit Price', 165, 88, { align: 'right' });
      doc.text('Total', 190, 88, { align: 'right' });

      // Table Row
      doc.setFont('helvetica', 'normal');
      doc.text(reorderMed.name, 18, 98);
      doc.text(reorderMed.batch_number, 90, 98);
      doc.text(reorderQty.toString(), 135, 98, { align: 'right' });
      doc.text(`$${parseFloat(reorderMed.price).toFixed(2)}`, 165, 98, { align: 'right' });
      
      const totalPrice = (reorderQty * parseFloat(reorderMed.price)).toFixed(2);
      doc.text(`$${totalPrice}`, 190, 98, { align: 'right' });

      // Line
      doc.line(15, 104, 195, 104);

      // Summary
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Total PO Value:', 120, 114);
      doc.text(`$${totalPrice}`, 190, 114, { align: 'right' });

      // Footer
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text('PharmaTrack Automated White-Label Purchase Order.', 105, 275, { align: 'center' });

      doc.save(`po-${reorderMed.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}.pdf`);
      setReorderSuccess('PO PDF downloaded successfully!');

      // Log audit trail
      fetch(`${API_BASE_URL}/api/audit-logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType: 'PO_PDF_GENERATE',
          userId: user.uid
        })
      }).catch(e => console.error(e));
    } catch (err) {
      setReorderError('Failed to generate PO PDF: ' + err.message);
    }
  };

  useEffect(() => {
    fetchData();
    fetchCompanySettings();

    if (socket) {
      const handleSync = () => {
        fetchData();
        fetchCompanySettings();
      };
      socket.on('medicine_change', handleSync);
      socket.on('sale_created', handleSync);
      socket.on('alert', handleSync);
      return () => {
        socket.off('medicine_change', handleSync);
        socket.off('sale_created', handleSync);
        socket.off('alert', handleSync);
      };
    }
  }, [socket, user]);

  // Compute lists of alerts
  const now = new Date();
  
  const expired = medicines.filter(med => new Date(med.expiry_date) <= now);
  
  const outOfStock = medicines.filter(med => med.quantity === 0);
  
  const lowStock = medicines.filter(med => med.quantity > 0 && med.quantity <= med.min_stock_level);
  
  const nearExpiry = medicines.filter(med => {
    const expiry = new Date(med.expiry_date);
    const diffDays = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
    return diffDays > 0 && diffDays <= 60;
  });

  const totalActiveAlerts = expired.length + outOfStock.length + lowStock.length + nearExpiry.length;

  // Send Alerts Email Document
  const handleSendEmailReport = async () => {
    setEmailLoading(true);
    setEmailSent(false);
    setPreviewUrl('');
    setEmailError('');

    try {
      const res = await fetch(`${API_BASE_URL}/api/users/profile/${user.uid}/send-alerts-email`, {
        method: 'POST'
      });

      if (!res.ok) throw new Error('Failed to send alerts report.');
      const data = await res.json();

      if (data.success) {
        setEmailSent(true);
        if (data.previewUrl) {
          setPreviewUrl(data.previewUrl);
        }
      } else {
        throw new Error(data.message || 'Verification failed');
      }
    } catch (err) {
      setEmailError(err.message);
    } finally {
      setEmailLoading(false);
    }
  };

  // Send Alerts to WhatsApp
  const handleWhatsAppShare = () => {
    if (totalActiveAlerts === 0) {
      alert("No active warnings to share.");
      return;
    }

    let message = `🚨 *PharmaTrack System Alerts Report* 🚨\n\n`;

    if (expired.length > 0) {
      message += `🛑 *Expired Batches (${expired.length}):*\n`;
      expired.forEach(med => {
        message += `- ${med.name} (Batch: ${med.batch_number}) | Expired: ${new Date(med.expiry_date).toISOString().split('T')[0]}\n`;
      });
      message += `\n`;
    }

    if (outOfStock.length > 0) {
      message += `🚨 *Out of Stock (${outOfStock.length}):*\n`;
      outOfStock.forEach(med => {
        message += `- ${med.name} (Batch: ${med.batch_number})\n`;
      });
      message += `\n`;
    }

    if (lowStock.length > 0) {
      message += `⚠️ *Low Stock Warnings (${lowStock.length}):*\n`;
      lowStock.forEach(med => {
        message += `- ${med.name} (Batch: ${med.batch_number}) | Qty: ${med.quantity} (Threshold: ${med.min_stock_level})\n`;
      });
      message += `\n`;
    }

    if (nearExpiry.length > 0) {
      message += `⏳ *Near Expiry Warnings (${nearExpiry.length}):*\n`;
      nearExpiry.forEach(med => {
        const diff = Math.ceil((new Date(med.expiry_date) - now) / (1000 * 60 * 60 * 24));
        message += `- ${med.name} (Batch: ${med.batch_number}) | Expires in ${diff} days (${new Date(med.expiry_date).toISOString().split('T')[0]})\n`;
      });
      message += `\n`;
    }

    message += `Please review details on dashboard.`;

    const cleanPhone = profile.company_phone ? profile.company_phone.replace(/[^0-9]/g, '') : '';
    const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(waUrl, '_blank');
  };

  const alertEmailAddress = profile.alert_email || user.email || 'Not Configured';

  return (
    <div className="alerts-screen-container">
      <div className="page-header">
        <div className="page-title">
          <h1>Active System Alerts</h1>
          <p>Separate screen auditing stock warnings, expired batches, and email dispatches</p>
        </div>
        <button onClick={fetchData} className="btn btn-secondary" style={{ padding: '0.5rem' }}>
          <RefreshCw size={16} />
        </button>
      </div>

      <div className="dashboard-sections" style={{ gridTemplateColumns: '1.2fr 2fr' }}>
        {/* Left Column: Email Configuration & Send Report */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Email Status Info Card */}
          <div className="glass-card" style={{ border: '1px solid rgba(255,255,255,0.05)' }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Mail size={18} style={{ color: 'var(--primary)' }} />
              Configured Notifications
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem', lineHeight: '1.4' }}>
              All system alert reports are routed to the email specified in your Profile settings.
            </p>
            <div style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.05)',
              padding: '1rem',
              borderRadius: '8px',
              fontSize: '0.9rem',
              wordBreak: 'break-all'
            }}>
              <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem', fontWeight: 600, textTransform: 'uppercase' }}>
                Active Target Email
              </span>
              <strong style={{ color: 'var(--primary)', fontSize: '0.95rem' }}>{alertEmailAddress}</strong>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '1rem', fontStyle: 'italic' }}>
              💡 Need to change this? Head to the <strong>Profile</strong> tab to update your email.
            </p>
          </div>

          {/* Email dispatch trigger card */}
          <div className="glass-card" style={{ border: '1px solid rgba(14,165,233,0.25)', background: 'linear-gradient(135deg, rgba(14,165,233,0.08) 0%, transparent 100%)' }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Send size={18} style={{ color: 'var(--secondary)' }} />
              Visual Email Report
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem', lineHeight: '1.4' }}>
              Generate a clean, visually structured HTML alerts document and email it instantly to <strong>{alertEmailAddress}</strong>.
            </p>

            {emailError && (
              <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', padding: '0.75rem', color: '#fca5a5', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1rem' }}>
                {emailError}
              </div>
            )}

            {emailSent && (
              <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)', padding: '1rem', color: '#a7f3d0', borderRadius: '8px', fontSize: '0.875rem', marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
                  <CheckCircle2 size={16} /> Alert Document Sent!
                </div>
                {previewUrl && (
                  <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ color: 'var(--secondary)', textDecoration: 'none', width: '100%', padding: '0.4rem', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                    <Eye size={12} /> View Sent Document Preview
                  </a>
                )}
              </div>
            )}

            <button onClick={handleSendEmailReport} disabled={emailLoading || alertEmailAddress === 'Not Configured'} className="btn btn-primary" style={{ width: '100%', gap: '0.5rem' }}>
              {emailLoading ? 'Compiling Document...' : (
                <>
                  <Send size={16} />
                  Send Alert Report Now
                </>
              )}
            </button>
          </div>

          {/* WhatsApp dispatch trigger card */}
          <div className="glass-card" style={{ border: '1px solid rgba(37,211,102,0.25)', background: 'linear-gradient(135deg, rgba(37,211,102,0.08) 0%, transparent 100%)' }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <MessageSquare size={18} style={{ color: '#25D366' }} />
              WhatsApp Alert Report
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem', lineHeight: '1.4' }}>
              Share all current active system alerts in real-time via WhatsApp Click-to-Chat.
            </p>

            <div style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.05)',
              padding: '1rem',
              borderRadius: '8px',
              fontSize: '0.9rem',
              wordBreak: 'break-all',
              marginBottom: '1.25rem'
            }}>
              <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem', fontWeight: 600, textTransform: 'uppercase' }}>
                Recipient Phone Number
              </span>
              <strong style={{ color: '#25D366', fontSize: '0.95rem' }}>
                {profile.company_phone || 'Not Configured (Sends to General Share)'}
              </strong>
            </div>

            <button 
              onClick={handleWhatsAppShare} 
              className="btn btn-secondary" 
              style={{ width: '100%', gap: '0.5rem', borderColor: 'rgba(37,211,102,0.3)', color: '#25D366' }}
            >
              <MessageSquare size={16} />
              Share Alerts on WhatsApp
            </button>
          </div>
        </div>

        {/* Right Column: In-App Alerts Feed & Active Alerts summaries */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Workspace In-App Alerts Feed */}
          <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.75rem' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                <Bell size={20} style={{ color: 'var(--primary)' }} />
                Workspace In-App Alerts Feed
              </h2>
              {dbAlerts.some(a => a.status === 'unread') && (
                <button onClick={handleMarkAllAsRead} className="btn btn-secondary" style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', borderColor: 'rgba(14,165,233,0.3)', color: 'var(--primary)' }}>
                  Mark All Read
                </button>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '350px', overflowY: 'auto', paddingRight: '0.25rem' }}>
              {loadingDbAlerts ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  Loading alerts feed...
                </div>
              ) : dbAlerts.length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  No logged alerts in your workspace feed.
                </div>
              ) : (
                dbAlerts.map(alert => {
                  const isUnread = alert.status === 'unread';
                  return (
                    <div 
                      key={alert.id} 
                      style={{ 
                        background: isUnread ? 'rgba(14,165,233,0.06)' : 'rgba(255,255,255,0.01)', 
                        border: isUnread ? '1px solid rgba(14,165,233,0.25)' : '1px solid rgba(255,255,255,0.03)', 
                        padding: '1rem', 
                        borderRadius: '8px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: '1rem',
                        transition: 'all 0.2s',
                        boxShadow: isUnread ? '0 0 10px rgba(14,165,233,0.05)' : 'none'
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1, textAlign: 'left' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span className={`badge ${alert.level === 'danger' || alert.level === 'critical' ? 'danger' : 'warning'}`} style={{ fontSize: '0.7rem' }}>
                            {alert.level.toUpperCase()}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {new Date(alert.created_at).toLocaleString()}
                          </span>
                        </div>
                        <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.875rem', lineHeight: '1.4', fontWeight: isUnread ? 500 : 400, color: isUnread ? '#fff' : 'var(--text-muted)' }}>
                          {alert.message}
                        </p>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                          Medicine: <strong>{alert.medicine_name}</strong> (Batch: {alert.batch_number})
                        </div>
                      </div>
                      
                      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                        {alert.medicine_id && (
                          <button 
                            onClick={() => handleReorderClick(alert)}
                            className="btn btn-primary" 
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.25rem', background: 'rgba(14,165,233,0.15)', color: 'var(--primary)' }}
                            title="Generate PO"
                          >
                            <ShoppingCart size={12} /> Reorder
                          </button>
                        )}
                        {isUnread && (
                          <button 
                            onClick={() => handleMarkAsRead(alert.id)}
                            className="btn btn-secondary" 
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                            title="Mark as read"
                          >
                            <CheckCircle2 size={12} /> Read
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Calculated Active Alerts Summary */}
          <div className="glass-card">
            <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ShieldAlert size={20} style={{ color: totalActiveAlerts > 0 ? 'var(--danger)' : 'var(--secondary)' }} />
              Active Alerts Summary ({totalActiveAlerts})
            </h2>

            {totalActiveAlerts === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                🎉 Great job! No active expired, out of stock, or low stock warnings found.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                
                {/* 1. Expired Medicines */}
                {expired.length > 0 && (
                  <div style={{ textAlign: 'left' }}>
                    <h3 style={{ fontSize: '0.9rem', color: 'var(--danger)', fontWeight: 700, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      🛑 Expired Batches ({expired.length})
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {expired.map(med => (
                        <div key={med.id} style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)', padding: '0.75rem 1rem', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.875rem' }}>
                          <div>
                            <strong>{med.name}</strong> (Batch: {med.batch_number})
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Expired on: {new Date(med.expiry_date).toLocaleDateString()}</div>
                          </div>
                          <span className="badge danger">Discard</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 2. Out of Stock */}
                {outOfStock.length > 0 && (
                  <div style={{ textAlign: 'left' }}>
                    <h3 style={{ fontSize: '0.9rem', color: 'var(--danger)', fontWeight: 700, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      🚨 Out of Stock ({outOfStock.length})
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {outOfStock.map(med => (
                        <div key={med.id} style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)', padding: '0.75rem 1rem', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.875rem' }}>
                          <div>
                            <strong>{med.name}</strong> (Batch: {med.batch_number})
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Supplier: {med.supplier_name || 'N/A'}</div>
                          </div>
                          <span className="badge danger">Out</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. Low Stock */}
                {lowStock.length > 0 && (
                  <div style={{ textAlign: 'left' }}>
                    <h3 style={{ fontSize: '0.9rem', color: 'var(--warning)', fontWeight: 700, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      ⚠️ Low Stock Thresholds ({lowStock.length})
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {lowStock.map(med => (
                        <div key={med.id} style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.15)', padding: '0.75rem 1rem', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.875rem' }}>
                          <div>
                            <strong>{med.name}</strong> (Batch: {med.batch_number})
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Available: {med.quantity} left (Threshold: {med.min_stock_level})</div>
                          </div>
                          <span className="badge warning">Low stock</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 4. Near Expiry */}
                {nearExpiry.length > 0 && (
                  <div style={{ textAlign: 'left' }}>
                    <h3 style={{ fontSize: '0.9rem', color: 'var(--primary)', fontWeight: 700, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      ⏳ Near Expiry Warning ({nearExpiry.length})
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {nearExpiry.map(med => {
                        const diff = Math.ceil((new Date(med.expiry_date) - now) / (1000 * 60 * 60 * 24));
                        return (
                          <div key={med.id} style={{ background: 'rgba(14,165,233,0.05)', border: '1px solid rgba(14,165,233,0.15)', padding: '0.75rem 1rem', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.875rem' }}>
                            <div>
                              <strong>{med.name}</strong> (Batch: {med.batch_number})
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Expires in {diff} days ({new Date(med.expiry_date).toLocaleDateString()})</div>
                            </div>
                            <span className="badge warning" style={{ background: 'rgba(14,165,233,0.15)', color: '#7dd3fc' }}>{diff}d left</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Supplier Reorder Purchase Order Modal */}
      {isReorderModalOpen && reorderMed && (
        <div className="modal-overlay" style={{ zIndex: 1000 }}>
          <div className="glass-card modal-content" style={{ maxWidth: '500px', width: '100%', padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShoppingCart size={20} style={{ color: 'var(--primary)' }} />
                <h3 style={{ margin: 0, fontWeight: 700, fontSize: '1.2rem' }}>Generate Purchase Order</h3>
              </div>
              <button 
                onClick={() => { setIsReorderModalOpen(false); setReorderMed(null); setReorderSuccess(''); setReorderError(''); }} 
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {reorderSuccess && (
              <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '8px', padding: '0.6rem 0.8rem', color: '#a7f3d0', fontSize: '0.85rem', marginBottom: '1rem', textAlign: 'center' }}>
                {reorderSuccess}
              </div>
            )}
            {reorderError && (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', padding: '0.6rem 0.8rem', color: '#fca5a5', fontSize: '0.85rem', marginBottom: '1rem', textAlign: 'center' }}>
                {reorderError}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', gap: '1rem', background: 'rgba(2, 6, 23, 0.2)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '8px', padding: '0.75rem' }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Medicine Name</span>
                  <div style={{ fontWeight: 700, fontSize: '1rem' }}>{reorderMed.name}</div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Batch: {reorderMed.batch_number}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Current Stock</span>
                  <div style={{ fontWeight: 700, fontSize: '1rem', color: reorderMed.quantity === 0 ? 'var(--danger)' : 'var(--secondary)' }}>{reorderMed.quantity} units</div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'rgba(2, 6, 23, 0.2)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '8px', padding: '0.75rem' }}>
                <div style={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Supplier Information</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{reorderMed.supplier_name || 'No Supplier Linked'}</div>
                {reorderMed.supplier_email && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    <Mail size={12} /> {reorderMed.supplier_email}
                  </div>
                )}
                {reorderMed.supplier_phone && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    <Phone size={12} /> {reorderMed.supplier_phone}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label style={{ fontSize: '0.8rem', marginBottom: '0.3rem', display: 'block' }}>Order Quantity *</label>
                <input 
                  type="number" 
                  min="1" 
                  className="form-input" 
                  style={{ fontSize: '0.9rem' }} 
                  value={reorderQty} 
                  onChange={(e) => setReorderQty(Math.max(1, parseInt(e.target.value) || 1))} 
                />
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
                  Estimated Cost: <strong style={{ color: 'var(--secondary)' }}>${(reorderQty * parseFloat(reorderMed.price)).toFixed(2)}</strong> (${parseFloat(reorderMed.price).toFixed(2)} / unit)
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button 
                type="button" 
                onClick={() => { setIsReorderModalOpen(false); setReorderMed(null); setReorderSuccess(''); setReorderError(''); }} 
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button 
                type="button" 
                onClick={handleSendEmailPO} 
                disabled={!reorderMed.supplier_email}
                className="btn btn-primary"
                style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.2)' }}
              >
                <Mail size={14} style={{ marginRight: '0.25rem' }} /> Email PO
              </button>
              <button 
                type="button" 
                onClick={handleDownloadPDFPO} 
                className="btn btn-primary"
              >
                <FileText size={14} style={{ marginRight: '0.25rem' }} /> PDF PO
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
