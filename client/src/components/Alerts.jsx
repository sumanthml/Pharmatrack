import React, { useEffect, useState } from 'react';
import { Bell, Mail, ShieldAlert, Send, Eye, CheckCircle2, RefreshCw, MessageSquare } from 'lucide-react';
import { API_BASE_URL } from '../config';

export default function Alerts({ socket, user }) {
  const [medicines, setMedicines] = useState([]);
  const [profile, setProfile] = useState({ alert_email: '' });

  // Email Send State
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [emailError, setEmailError] = useState('');

  // Fetch medicines and user profile
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
    } catch (e) {
      console.error('Error loading alerts tab data:', e.message);
    }
  };

  useEffect(() => {
    fetchData();

    if (socket) {
      const handleSync = () => fetchData();
      socket.on('medicine_change', handleSync);
      socket.on('sale_created', handleSync);
      return () => {
        socket.off('medicine_change', handleSync);
        socket.off('sale_created', handleSync);
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

        {/* Right Column: Alerts auditing tables */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Main summary card */}
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
                  <div>
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
                  <div>
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
                  <div>
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
                  <div>
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
    </div>
  );
}
