import React, { useEffect, useState } from 'react';
import { User, Mail, Phone, MapPin, FileText, Save, CheckCircle, Shield, Building, Bell, Palette, Image } from 'lucide-react';
import { API_BASE_URL } from '../config';

export default function Profile({ user, onBrandingUpdate }) {
  const [profile, setProfile] = useState({
    alert_email: '',
    company_name: '',
    company_phone: '',
    company_address: '',
    license_number: '',
    role: 'pharmacist',
    pref_email: true,
    pref_in_app: true,
    pref_slack_telegram: false,
    slack_webhook_url: '',
    telegram_chat_id: '',
    pref_whatsapp: false,
    whatsapp_number: ''
  });

  const [auditLogs, setAuditLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Employee Control Panel States
  const [employees, setEmployees] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);

  // Workspace Branding Settings
  const [logoUrl, setLogoUrl] = useState('');
  const [themeColor, setThemeColor] = useState('#0ea5e9');
  const [brandingLoading, setBrandingLoading] = useState(false);
  const [brandingSuccess, setBrandingSuccess] = useState(false);

  // Audit Logs Filtering & Search States
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');

  const fetchAuditLogs = async () => {
    setLoadingLogs(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/audit-logs`);
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data);
      }
    } catch (err) {
      console.error('Error fetching audit logs:', err.message);
    } finally {
      setLoadingLogs(false);
    }
  };

  const fetchEmployees = async () => {
    setLoadingEmployees(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/companies/employees`);
      if (res.ok) {
        const data = await res.json();
        setEmployees(data);
      }
    } catch (err) {
      console.error('Error fetching employees:', err.message);
    } finally {
      setLoadingEmployees(false);
    }
  };

  const handleApproveEmployee = async (id) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/users/${id}/verify-status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_verified: true })
      });
      if (res.ok) {
        setEmployees(prev => prev.map(e => e.id === id ? { ...e, is_verified: true } : e));
        fetchAuditLogs();
      }
    } catch (err) {
      console.error('Failed to verify employee:', err.message);
    }
  };

  const handleRevokeEmployee = async (id) => {
    if (!window.confirm('Are you sure you want to revoke this employee\'s workspace access?')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/users/${id}/revoke-access`, {
        method: 'PUT'
      });
      if (res.ok) {
        setEmployees(prev => prev.filter(e => e.id !== id));
        fetchAuditLogs();
      }
    } catch (err) {
      console.error('Failed to revoke access:', err.message);
    }
  };

  const handleUpdateRole = async (id, role) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/users/${id}/verify-status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role })
      });
      if (res.ok) {
        setEmployees(prev => prev.map(e => e.id === id ? { ...e, role } : e));
        fetchAuditLogs();
      }
    } catch (err) {
      console.error('Failed to update employee role:', err.message);
    }
  };

  const fetchBranding = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/companies/settings`);
      if (res.ok) {
        const data = await res.json();
        setLogoUrl(data.logo_url || '');
        setThemeColor(data.theme_color || '#0ea5e9');
      }
    } catch (err) {
      console.error('Error fetching company branding:', err.message);
    }
  };

  const handleSaveBranding = async (e) => {
    e.preventDefault();
    setBrandingLoading(true);
    setBrandingSuccess(false);

    try {
      const res = await fetch(`${API_BASE_URL}/api/companies/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logo_url: logoUrl, theme_color: themeColor })
      });

      if (!res.ok) throw new Error('Failed to update company branding.');
      const data = await res.json();
      
      setLogoUrl(data.logo_url || '');
      setThemeColor(data.theme_color || '#0ea5e9');
      setBrandingSuccess(true);
      setTimeout(() => setBrandingSuccess(false), 4000);
      
      if (onBrandingUpdate) {
        onBrandingUpdate();
      }
    } catch (err) {
      alert(`Error updating branding settings: ${err.message}`);
    } finally {
      setBrandingLoading(false);
    }
  };

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        if (!user?.uid) return;
        const res = await fetch(`${API_BASE_URL}/api/users/profile/${user.uid}`);
        if (res.ok) {
          const data = await res.json();
          setProfile({
            alert_email: data.alert_email || user.email || '',
            company_name: data.company_name || '',
            company_phone: data.company_phone || '',
            company_address: data.company_address || '',
            license_number: data.license_number || '',
            role: data.role || 'pharmacist',
            pref_email: data.pref_email !== undefined ? data.pref_email : true,
            pref_in_app: data.pref_in_app !== undefined ? data.pref_in_app : true,
            pref_slack_telegram: !!data.pref_slack_telegram,
            slack_webhook_url: data.slack_webhook_url || '',
            telegram_chat_id: data.telegram_chat_id || '',
            pref_whatsapp: !!data.pref_whatsapp,
            whatsapp_number: data.whatsapp_number || ''
          });

          if (data.role === 'admin' || data.role === 'pharmacist') {
            fetchAuditLogs();
          }
          if (data.role === 'admin') {
            fetchEmployees();
            fetchBranding();
          }
        } else {
          // Default values
          setProfile({
            alert_email: user.email || '',
            company_name: '',
            company_phone: '',
            company_address: '',
            license_number: '',
            role: 'pharmacist',
            pref_email: true,
            pref_in_app: true,
            pref_slack_telegram: false,
            slack_webhook_url: '',
            telegram_chat_id: '',
            pref_whatsapp: false,
            whatsapp_number: ''
          });
        }
      } catch (err) {
        console.error('Error fetching profile:', err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [user]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaveLoading(true);
    setSaveSuccess(false);

    try {
      const res = await fetch(`${API_BASE_URL}/api/users/profile/${user.uid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile)
      });

      if (!res.ok) throw new Error('Failed to update company profile settings.');
      const data = await res.json();
      
      setProfile({
        alert_email: data.alert_email || '',
        company_name: data.company_name || '',
        company_phone: data.company_phone || '',
        company_address: data.company_address || '',
        license_number: data.license_number || '',
        role: data.role || profile.role || 'pharmacist',
        pref_email: data.pref_email !== undefined ? data.pref_email : true,
        pref_in_app: data.pref_in_app !== undefined ? data.pref_in_app : true,
        pref_slack_telegram: !!data.pref_slack_telegram,
        slack_webhook_url: data.slack_webhook_url || '',
        telegram_chat_id: data.telegram_chat_id || '',
        pref_whatsapp: !!data.pref_whatsapp,
        whatsapp_number: data.whatsapp_number || ''
      });
      
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
      if (profile.role === 'admin' || profile.role === 'pharmacist') {
        fetchAuditLogs();
      }
      if (profile.role === 'admin') {
        fetchEmployees();
      }
    } catch (err) {
      alert(`Error updating profile: ${err.message}`);
    } finally {
      setSaveLoading(false);
    }
  };

  const handleInputChange = (field, val) => {
    setProfile(prev => ({
      ...prev,
      [field]: val
    }));
  };

  if (loading) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading Company Profile...
      </div>
    );
  }

  return (
    <div className="profile-screen-container">
      <div className="page-header">
        <div className="page-title">
          <h1>Company Credentials & Profile</h1>
          <p>Configure company details, operating licenses, and system email alert destinations</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem', marginTop: '1.5rem' }}>
        
        {/* User Card */}
        <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', padding: '1.5rem' }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 15px rgba(14,165,233,0.4)'
          }}>
            <Building size={32} style={{ color: 'white' }} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 700, margin: 0, color: 'var(--primary)' }}>
              {profile.company_name || 'My Pharmacy Company'}
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginTop: '0.4rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              <span><strong>Email:</strong> {user?.email}</span>
              <span>•</span>
              <span><strong>UID:</strong> {user?.uid?.substring(0, 8)}...</span>
              <span>•</span>
              <span><strong>Role:</strong> {profile.role ? profile.role.toUpperCase() : 'PHARMACIST'}</span>
            </div>
          </div>
        </div>

        {/* Profile Form */}
        <div className="glass-card" style={{ padding: '2rem' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.75rem' }}>
            <Building size={18} style={{ color: 'var(--primary)' }} />
            Pharmacy Profile Configuration
          </h2>

          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                  <Building size={14} style={{ color: 'var(--text-muted)' }} /> Company / Pharmacy Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. PharmaCare Solutions Ltd"
                  className="form-input"
                  value={profile.company_name}
                  onChange={(e) => handleInputChange('company_name', e.target.value)}
                />
              </div>

              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                  <FileText size={14} style={{ color: 'var(--text-muted)' }} /> Operating License Number
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. PH-2026-99182A"
                  className="form-input"
                  value={profile.license_number}
                  onChange={(e) => handleInputChange('license_number', e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
              <div className="form-group" style={{ position: 'relative' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem', color: '#ffb703' }}>
                  <Mail size={14} /> Alerts Destination Email *
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. manager@pharmacy.com"
                  className="form-input"
                  style={{ border: '1px solid rgba(255,183,3,0.3)', background: 'rgba(255,183,3,0.02)' }}
                  value={profile.alert_email}
                  onChange={(e) => handleInputChange('alert_email', e.target.value)}
                />
                <span style={{ fontSize: '0.75rem', color: 'rgba(255,183,3,0.7)', marginTop: '0.3rem', display: 'block' }}>
                  Critical low-stock and expiry alert documents are sent automatically to this address.
                </span>
              </div>

              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                  <Phone size={14} style={{ color: 'var(--text-muted)' }} /> Primary Contact Phone
                </label>
                <input
                  type="text"
                  placeholder="e.g. +1 (555) 987-6543"
                  className="form-input"
                  value={profile.company_phone}
                  onChange={(e) => handleInputChange('company_phone', e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                <MapPin size={14} style={{ color: 'var(--text-muted)' }} /> Business / Pharmacy Address
              </label>
              <textarea
                placeholder="e.g. 101 Medical Center Plaza, Suite B, New York, NY 10001"
                className="form-input"
                rows={3}
                style={{ resize: 'none', fontFamily: 'inherit' }}
                value={profile.company_address}
                onChange={(e) => handleInputChange('company_address', e.target.value)}
              />
            </div>

            {/* Notification Preferences */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1.25rem', marginTop: '0.5rem' }}>
              <h3 style={{ fontSize: '1.025rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Bell size={16} style={{ color: 'var(--primary)' }} /> Notification Preference Settings
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.25rem', marginBottom: '1.25rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                  <input
                    type="checkbox"
                    checked={profile.pref_email}
                    onChange={(e) => handleInputChange('pref_email', e.target.checked)}
                    style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }}
                  />
                  <span>Email Alerts</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                  <input
                    type="checkbox"
                    checked={profile.pref_in_app}
                    onChange={(e) => handleInputChange('pref_in_app', e.target.checked)}
                    style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }}
                  />
                  <span>In-App Dashboard Alerts</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                  <input
                    type="checkbox"
                    checked={profile.pref_slack_telegram}
                    onChange={(e) => handleInputChange('pref_slack_telegram', e.target.checked)}
                    style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }}
                  />
                  <span>Slack & Telegram Alerts</span>
                </label>
              </div>

              {profile.pref_slack_telegram && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '8px', animation: 'fadeIn 0.2s', marginBottom: '1.25rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                    <div className="form-group">
                      <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', display: 'block' }}>
                        Slack Webhook URL
                      </label>
                      <input
                        type="url"
                        placeholder="https://hooks.slack.com/services/..."
                        className="form-input"
                        value={profile.slack_webhook_url}
                        onChange={(e) => handleInputChange('slack_webhook_url', e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', display: 'block' }}>
                        Telegram Chat ID
                      </label>
                      <input
                        type="text"
                        placeholder="-10012345678"
                        className="form-input"
                        value={profile.telegram_chat_id}
                        onChange={(e) => handleInputChange('telegram_chat_id', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: saveSuccess ? 1 : 0, transition: 'opacity 0.3s' }}>
                <CheckCircle size={18} style={{ color: '#10b981' }} />
                <span style={{ fontSize: '0.9rem', color: '#a7f3d0', fontWeight: 500 }}>Profile saved successfully!</span>
              </div>

              <button
                type="submit"
                disabled={saveLoading}
                className="btn btn-primary"
                style={{ padding: '0.75rem 2rem', gap: '0.5rem', minWidth: '160px' }}
              >
                <Save size={16} />
                {saveLoading ? 'Saving...' : 'Save Profile'}
              </button>
            </div>

          </form>
        </div>

        {/* Team Registry Control Panel (Admin Only) */}
        {profile.role === 'admin' && (
          <div className="glass-card" style={{ padding: '2rem' }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Building size={18} style={{ color: 'var(--primary)' }} />
                Workspace Team Registry
              </div>
              <button type="button" onClick={fetchEmployees} disabled={loadingEmployees} className="btn btn-secondary" style={{ padding: '0.3rem 0.75rem', fontSize: '0.75rem' }}>
                {loadingEmployees ? 'Refreshing...' : 'Refresh Team'}
              </button>
            </h2>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Staff Member</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Mobile Number</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Role Permission</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Status</th>
                    <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                        No employees registered under this company workspace.
                      </td>
                    </tr>
                  ) : (
                    employees.map((emp) => (
                      <tr key={emp.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                        <td style={{ padding: '0.75rem 0.5rem' }}>
                          <strong>{emp.name || 'Unnamed Employee'}</strong>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{emp.email}</div>
                        </td>
                        <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)' }}>
                          {emp.mobile_number || 'N/A'}
                        </td>
                        <td style={{ padding: '0.75rem 0.5rem' }}>
                          <select
                            value={emp.role}
                            onChange={(e) => handleUpdateRole(emp.id, e.target.value)}
                            disabled={emp.id === user.uid} // Can't edit own role
                            className="form-input"
                            style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem', width: 'auto' }}
                          >
                            <option value="admin">Admin</option>
                            <option value="manager">Manager</option>
                            <option value="employee">Employee</option>
                          </select>
                        </td>
                        <td style={{ padding: '0.75rem 0.5rem' }}>
                          <span className={`badge ${emp.is_verified ? 'success' : 'warning'}`}>
                            {emp.is_verified ? 'Verified Active' : 'Pending Verification'}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                            {!emp.is_verified && (
                              <button
                                type="button"
                                onClick={() => handleApproveEmployee(emp.id)}
                                className="btn btn-primary"
                                style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                              >
                                Approve
                              </button>
                            )}
                            {emp.id !== user.uid && (
                              <button
                                type="button"
                                onClick={() => handleRevokeEmployee(emp.id)}
                                className="btn btn-secondary"
                                style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', borderColor: 'rgba(239,68,68,0.3)', color: '#ef4444' }}
                              >
                                Revoke
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Audit Trail Section */}
        {(profile.role === 'admin' || profile.role === 'pharmacist') && (
          <div className="glass-card" style={{ padding: '2rem' }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Shield size={18} style={{ color: 'var(--secondary)' }} />
                Organization Audit Trail & Logs
              </div>
              <button type="button" onClick={fetchAuditLogs} disabled={loadingLogs} className="btn btn-secondary" style={{ padding: '0.3rem 0.75rem', fontSize: '0.75rem' }}>
                {loadingLogs ? 'Refreshing...' : 'Refresh Logs'}
              </button>
            </h2>

            {/* Audit Logs Filter Toolbar */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: 1, minWidth: '200px' }}>
                <input
                  type="text"
                  placeholder="Search by operator name or email..."
                  className="form-input"
                  style={{ padding: '0.5rem' }}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="form-group" style={{ width: '200px' }}>
                <select
                  className="form-input"
                  style={{ padding: '0.5rem' }}
                  value={actionFilter}
                  onChange={(e) => setActionFilter(e.target.value)}
                >
                  <option value="ALL">All Action Types</option>
                  <option value="LOGIN">LOGIN</option>
                  <option value="LOGOUT">LOGOUT</option>
                  <option value="STOCK_ADD">STOCK_ADD</option>
                  <option value="STOCK_UPDATE">STOCK_UPDATE</option>
                  <option value="SALE_LOG">SALE_LOG</option>
                  <option value="REPORT_EXPORT">REPORT_EXPORT</option>
                  <option value="REPORT_DELETE">REPORT_DELETE</option>
                  <option value="EMPLOYEE_REVOKE">EMPLOYEE_REVOKE</option>
                </select>
              </div>
            </div>

            <div style={{ overflowX: 'auto', maxHeight: '350px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Timestamp</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Operator</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Action Type</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>IP Address</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Device Details</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.filter(log => {
                    const nameMatch = (log.user_name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                                       (log.user_email || '').toLowerCase().includes(searchQuery.toLowerCase());
                    const actionMatch = actionFilter === 'ALL' || log.action_type === actionFilter;
                    return nameMatch && actionMatch;
                  }).length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                        No audit logs matching filters.
                      </td>
                    </tr>
                  ) : (
                    auditLogs
                      .filter(log => {
                        const nameMatch = (log.user_name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                                           (log.user_email || '').toLowerCase().includes(searchQuery.toLowerCase());
                        const actionMatch = actionFilter === 'ALL' || log.action_type === actionFilter;
                        return nameMatch && actionMatch;
                      })
                      .map((log) => (
                        <tr key={log.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                          <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)' }}>
                            {new Date(log.timestamp).toLocaleString()}
                          </td>
                          <td style={{ padding: '0.75rem 0.5rem' }}>
                            <strong>{log.user_name || 'System / Employee'}</strong>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{log.user_email}</div>
                          </td>
                          <td style={{ padding: '0.75rem 0.5rem' }}>
                            <span className={`badge ${
                              log.action_type === 'LOGIN' || log.action_type === 'LOGOUT' ? 'warning' :
                              log.action_type === 'STOCK_ADD' || log.action_type === 'SALE_LOG' ? 'success' : 'danger'
                            }`}>
                              {log.action_type}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)' }}>{log.ip_address || '127.0.0.1'}</td>
                          <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.device_info}>
                            {log.device_info || 'Unknown Browser'}
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Workspace Custom Branding (Admin Only) */}
        {profile.role === 'admin' && (
          <div className="glass-card" style={{ padding: '2rem' }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.75rem' }}>
              <Palette size={18} style={{ color: 'var(--primary)' }} />
              Workspace Customization & Branding (White-Label)
            </h2>

            <form onSubmit={handleSaveBranding} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                    <Image size={14} style={{ color: 'var(--text-muted)' }} /> Company Logo URL
                  </label>
                  <input
                    type="url"
                    placeholder="https://example.com/logo.png"
                    className="form-input"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem', display: 'block' }}>
                    Provide a URL for your pharmacy's custom logo to be shown in the sidebar header.
                  </span>
                </div>

                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                    <Palette size={14} style={{ color: 'var(--text-muted)' }} /> Accent Theme Color
                  </label>
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    <input
                      type="color"
                      className="form-input"
                      style={{ width: '50px', height: '40px', padding: '0.2rem', cursor: 'pointer', border: 'none', background: 'transparent' }}
                      value={themeColor}
                      onChange={(e) => setThemeColor(e.target.value)}
                    />
                    <input
                      type="text"
                      placeholder="#0ea5e9"
                      className="form-input"
                      style={{ flexGrow: 1 }}
                      value={themeColor}
                      onChange={(e) => setThemeColor(e.target.value)}
                    />
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem', display: 'block' }}>
                    Pick a hex color or use the picker to update primary actions, charts, and layout highlights.
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: brandingSuccess ? 1 : 0, transition: 'opacity 0.3s' }}>
                  <CheckCircle size={18} style={{ color: '#10b981' }} />
                  <span style={{ fontSize: '0.9rem', color: '#a7f3d0', fontWeight: 500 }}>Branding settings saved!</span>
                </div>

                <button
                  type="submit"
                  disabled={brandingLoading}
                  className="btn btn-primary"
                  style={{ padding: '0.75rem 2rem', gap: '0.5rem', minWidth: '160px' }}
                >
                  <Save size={16} />
                  {brandingLoading ? 'Saving...' : 'Save Branding'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Security / System status footer */}
        <div className="glass-card" style={{ padding: '1.25rem', border: '1px solid rgba(16,185,129,0.2)', background: 'linear-gradient(135deg, rgba(16,185,129,0.05) 0%, transparent 100%)', display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
          <Shield size={20} style={{ color: 'var(--secondary)', marginTop: '2px' }} />
          <div>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 600, margin: 0 }}>System Credentials Authenticated</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0' }}>
              Your profile is verified. PharmaTrack updates DB records securely with end-to-end SSL encryption. Automatic reporting hooks are active.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
