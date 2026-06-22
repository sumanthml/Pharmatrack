import React, { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import io from 'socket.io-client';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import Inventory from './components/Inventory';
import Sales from './components/Sales';
import Predictions from './components/Predictions';
import Suppliers from './components/Suppliers';
import Alerts from './components/Alerts';
import Profile from './components/Profile';
import AIChat from './components/AIChat';
import Login from './components/Login';
import Toast from './components/Toast';
import { Activity } from 'lucide-react';
import { API_BASE_URL } from './config';

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [socket, setSocket] = useState(null);
  const [alertsCount, setAlertsCount] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [branding, setBranding] = useState({
    name: 'PharmaTrack',
    logo_url: '',
    theme_color: '#0ea5e9'
  });
  const [dbStatus, setDbStatus] = useState('loading');
  const [isUnverifiedEmployee, setIsUnverifiedEmployee] = useState(false);
  const [unverifiedDetails, setUnverifiedDetails] = useState(null);

  const fetchCompanyBranding = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/companies/settings`);
      if (res.ok) {
        const data = await res.json();
        setBranding({
          name: data.name || 'PharmaTrack',
          logo_url: data.logo_url || '',
          theme_color: data.theme_color || '#0ea5e9'
        });
        
        // Dynamically inject primary color variable
        const themeColor = data.theme_color || '#0ea5e9';
        document.documentElement.style.setProperty('--primary', themeColor);
        document.documentElement.style.setProperty('--primary-glow', `${themeColor}26`);
      }
    } catch (err) {
      console.error('Error fetching company branding:', err.message);
    }
  };

  const fetchAlertsCount = async () => {
    if (!user) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/medicines?userId=${user.uid}`);
      if (res.ok) {
        const meds = await res.json();
        const now = new Date();
        let count = 0;
        meds.forEach(med => {
          const expiry = new Date(med.expiry_date);
          const diffDays = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
          
          let isAlert = false;
          if (med.quantity === 0) isAlert = true;
          else if (med.quantity <= med.min_stock_level) isAlert = true;
          
          if (diffDays <= 0) isAlert = true;
          else if (diffDays <= 60) isAlert = true;
          
          if (isAlert) count++;
        });
        setAlertsCount(count);
      }
    } catch (err) {
      console.error('Error fetching alerts count:', err.message);
    }
  };

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const checkDbHealth = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/health`);
      if (res.ok) {
        const data = await res.json();
        if (data.database === 'connected') {
          setDbStatus('connected');
          return;
        }
      }
      setDbStatus('offline');
    } catch (err) {
      setDbStatus('offline');
    }
  };

  useEffect(() => {
    checkDbHealth();
    const interval = setInterval(checkDbHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const checkVerificationStatus = async (firebaseUser) => {
    if (!firebaseUser) {
      setIsUnverifiedEmployee(false);
      setUnverifiedDetails(null);
      setUser(null);
      setAuthLoading(false);
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/users/profile/${firebaseUser.uid}`);
      if (res.ok) {
        const data = await res.json();
        if (data.company_id && data.role !== 'admin' && !data.is_verified) {
          setIsUnverifiedEmployee(true);
          setUnverifiedDetails({
            name: data.name,
            role: data.role,
            companyName: data.company_name || 'Your Registered Organization',
            email: data.email
          });
          setUser(firebaseUser);
        } else {
          setIsUnverifiedEmployee(false);
          setUnverifiedDetails(null);
          setUser(firebaseUser);
        }
      } else {
        // Fallback
        setIsUnverifiedEmployee(false);
        setUser(firebaseUser);
      }
    } catch (err) {
      console.error('Error checking verification status:', err.message);
      setIsUnverifiedEmployee(false);
      setUser(firebaseUser);
    } finally {
      setAuthLoading(false);
    }
  };

  useEffect(() => {
    // Monitor Auth State
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setAuthLoading(true);
        checkVerificationStatus(firebaseUser);
      } else {
        setUser(null);
        setIsUnverifiedEmployee(false);
        setUnverifiedDetails(null);
        setAuthLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (user && !isUnverifiedEmployee) {
      // Connect socket when user is logged in
      const newSocket = io(API_BASE_URL);
      
      newSocket.on('connect', () => {
        console.log('🔌 Socket connected, joining room:', user.uid);
        newSocket.emit('join_room', user.uid);
      });

      setSocket(newSocket);

      // Initial load
      fetchAlertsCount();
      fetchCompanyBranding();

      // Listen to real-time events to update alerts count globally
      newSocket.on('alert', () => {
        fetchAlertsCount();
      });

      newSocket.on('medicine_change', () => fetchAlertsCount());
      newSocket.on('sale_created', () => fetchAlertsCount());

      return () => {
        newSocket.close();
      };
    } else {
      setSocket(null);
    }
  }, [user, isUnverifiedEmployee]);

  if (authLoading) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#020617',
        color: 'white',
        gap: '1rem'
      }}>
        <Activity size={48} style={{ color: 'var(--primary)', animation: 'spin 2s linear infinite' }} />
        <span style={{ fontSize: '1.1rem', fontWeight: 600, letterSpacing: '0.5px' }}>Loading PharmaTrack...</span>
      </div>
    );
  }

  // Gateway check
  if (!user) {
    return <Login onAuthSuccess={(usr) => checkVerificationStatus(usr)} />;
  }

  // Block dashboard access if unverified employee
  if (isUnverifiedEmployee) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#020617',
        color: 'white',
        padding: '1.5rem'
      }}>
        <div className="glass-card modal-content" style={{
          maxWidth: '480px',
          width: '100%',
          padding: '2.5rem 2rem',
          border: '1px solid rgba(234, 179, 8, 0.3)',
          textAlign: 'center'
        }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'rgba(234, 179, 8, 0.15)',
            color: '#eab308',
            marginBottom: '1.5rem',
            border: '1px solid rgba(234, 179, 8, 0.3)'
          }}>
            <Activity size={32} style={{ animation: 'pulse 2s infinite' }} />
          </div>
          
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#eab308', marginBottom: '0.75rem' }}>
            Awaiting Admin Approval
          </h2>
          
          <p style={{ color: 'var(--text)', fontSize: '0.95rem', lineHeight: '1.6', marginBottom: '1.5rem' }}>
            Welcome, <strong>{unverifiedDetails?.name || 'Employee'}</strong>!<br/>
            Your request to join <strong>{unverifiedDetails?.companyName}</strong> as a <strong>{unverifiedDetails?.role}</strong> is pending administrator verification.
          </p>

          <div style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            borderRadius: '8px',
            padding: '1rem',
            fontSize: '0.8rem',
            color: 'var(--text-muted)',
            textAlign: 'left',
            marginBottom: '1.75rem',
            lineHeight: '1.5'
          }}>
            📧 <strong>Next Steps:</strong> An email notification has been dispatched to your company administrator. Please contact your manager to approve your request in their <strong>Workspace Team Registry</strong> panel.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <button
              onClick={() => checkVerificationStatus(auth.currentUser)}
              className="btn btn-primary"
              style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', fontWeight: 600 }}
            >
              🔄 Check Verification Status
            </button>
            
            <button
              onClick={async () => {
                await auth.signOut();
                setUser(null);
                setIsUnverifiedEmployee(false);
                setUnverifiedDetails(null);
              }}
              className="btn btn-secondary"
              style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', fontWeight: 600, color: '#f87171', borderColor: 'rgba(239, 68, 68, 0.2)' }}
            >
              Log Out & Sign In to Another Account
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} alertsCount={alertsCount} branding={branding} dbStatus={dbStatus} />

      {/* Main Layout Area */}
      <main className="main-content">
        {!isOnline && (
          <div style={{
            background: 'linear-gradient(90deg, #ef4444 0%, #dc2626 100%)',
            color: 'white',
            padding: '0.6rem 1rem',
            textAlign: 'center',
            fontSize: '0.85rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            boxShadow: '0 4px 12px rgba(239, 68, 68, 0.2)',
            borderRadius: '8px',
            marginBottom: '1rem'
          }}>
            <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#fff', animation: 'pulse 1.2s infinite' }} />
            <strong>OFFLINE MODE:</strong> Serving cached inventory in read-only mode. Checkout transactions and inventory updates are disabled.
          </div>
        )}

        {/* Glowing Top Alert Bar */}
        {alertsCount > 0 && (
          <div className="top-alert-bar" onClick={() => setActiveTab('alerts')}>
            <span className="top-alert-text">
              🚨 <strong>SYSTEM WARNING:</strong> {alertsCount} active stock/expiry warning(s) detected. Click here to audit.
            </span>
          </div>
        )}

        {activeTab === 'dashboard' && <Dashboard socket={socket} user={user} />}
        {activeTab === 'inventory' && <Inventory socket={socket} user={user} />}
        {activeTab === 'sales' && <Sales socket={socket} user={user} />}
        {activeTab === 'predictions' && <Predictions socket={socket} user={user} />}
        {activeTab === 'suppliers' && <Suppliers socket={socket} user={user} />}
        {activeTab === 'alerts' && <Alerts socket={socket} user={user} />}
        {activeTab === 'profile' && <Profile user={user} onBrandingUpdate={fetchCompanyBranding} />}
      </main>

      {/* Floating AI Assistant Chatbot */}
      <AIChat user={user} />
      
      {/* Premium Notification Toast System */}
      <Toast />
    </div>
  );
}
