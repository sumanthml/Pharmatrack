import React, { useEffect, useState } from 'react';
import { User, Mail, Phone, MapPin, FileText, Save, CheckCircle, Shield, Building } from 'lucide-react';
import { API_BASE_URL } from '../config';

export default function Profile({ user }) {
  const [profile, setProfile] = useState({
    alert_email: '',
    company_name: '',
    company_phone: '',
    company_address: '',
    license_number: '',
    role: 'pharmacist'
  });

  const [loading, setLoading] = useState(true);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

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
            role: data.role || 'pharmacist'
          });
        } else {
          // Default values
          setProfile({
            alert_email: user.email || '',
            company_name: '',
            company_phone: '',
            company_address: '',
            license_number: '',
            role: 'pharmacist'
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
        role: data.role || profile.role || 'pharmacist'
      });
      
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
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
