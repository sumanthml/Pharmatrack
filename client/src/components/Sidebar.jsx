import React from 'react';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';
import { 
  LayoutDashboard, 
  Package, 
  TrendingDown, 
  BrainCircuit, 
  Users,
  LogOut, 
  Activity,
  Bell,
  User
} from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab, alertsCount = 0, branding }) {
  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Logout error:', err.message);
    }
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'inventory', label: 'Inventory', icon: Package },
    { id: 'sales', label: 'Sales Log', icon: TrendingDown },
    { id: 'predictions', label: 'AI Predict', icon: BrainCircuit },
    { id: 'suppliers', label: 'Suppliers', icon: Users },
    { id: 'alerts', label: 'Alerts', icon: Bell },
    { id: 'profile', label: 'Profile', icon: User }
  ];

  return (
    <>
      {/* Desktop Sidebar Layout */}
      <nav className="sidebar">
        <div className="logo-container">
          {branding?.logo_url ? (
            <img 
              src={branding.logo_url} 
              alt="Logo" 
              style={{ width: '24px', height: '24px', objectFit: 'contain', borderRadius: '4px' }} 
            />
          ) : (
            <Activity size={24} style={{ color: 'var(--primary)' }} />
          )}
          <span className="logo-text">{branding?.name || 'PharmaTrack'}</span>
        </div>
        
        <div className="nav-links">
          {navItems.map(item => {
            const IconComponent = item.icon;
            const isAlertsTab = item.id === 'alerts';
            const hasAlerts = isAlertsTab && alertsCount > 0;
            
            return (
              <a
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`nav-item ${activeTab === item.id ? 'active' : ''} ${hasAlerts ? 'glow-alert' : ''}`}
              >
                <IconComponent size={20} />
                <span>{item.label}</span>
                {hasAlerts && <span className="alert-badge">{alertsCount}</span>}
              </a>
            );
          })}
        </div>

        <button 
          onClick={handleLogout} 
          className="btn nav-item logout-button"
        >
          <LogOut size={20} />
          <span>Log Out</span>
        </button>
      </nav>

      {/* Mobile Bottom Navigation Layout (controlled via media query in index.css) */}
      <nav className="mobile-nav">
        {navItems.map(item => {
          const IconComponent = item.icon;
          const isAlertsTab = item.id === 'alerts';
          const hasAlerts = isAlertsTab && alertsCount > 0;
          
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`mobile-nav-item ${activeTab === item.id ? 'active' : ''} ${hasAlerts ? 'glow-alert' : ''}`}
              style={{ position: 'relative' }}
            >
              <IconComponent size={20} />
              <span>{item.label}</span>
              {hasAlerts && (
                <span 
                  className="alert-badge" 
                  style={{ 
                    position: 'absolute', 
                    top: '2px', 
                    right: '12px', 
                    margin: 0, 
                    fontSize: '0.6rem', 
                    padding: '0.1rem 0.35rem' 
                  }}
                >
                  {alertsCount}
                </span>
              )}
            </button>
          );
        })}
        <button onClick={handleLogout} className="mobile-nav-item" style={{ color: 'var(--danger)' }}>
          <LogOut size={20} />
          <span>Exit</span>
        </button>
      </nav>
    </>
  );
}
