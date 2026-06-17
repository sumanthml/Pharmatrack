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

  useEffect(() => {
    // Monitor Auth State
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
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
  }, [user]);

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
    return <Login onAuthSuccess={(usr) => setUser(usr)} />;
  }

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} alertsCount={alertsCount} branding={branding} />

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
    </div>
  );
}
