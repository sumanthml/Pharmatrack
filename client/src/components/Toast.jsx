import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

export default function Toast() {
  const [notification, setNotification] = useState(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    let timer;
    const handleNotify = (e) => {
      if (e.detail) {
        setNotification({
          message: e.detail.message,
          type: e.detail.type || 'success'
        });
        setIsVisible(true);
        
        // Auto-close after 4 seconds
        clearTimeout(timer);
        timer = setTimeout(() => {
          setIsVisible(false);
        }, 4000);
      }
    };

    window.addEventListener('custom-notify', handleNotify);
    return () => {
      window.removeEventListener('custom-notify', handleNotify);
      clearTimeout(timer);
    };
  }, []);

  if (!notification) return null;

  const typeConfig = {
    success: {
      color: '#10b981',
      bg: 'rgba(16, 185, 129, 0.08)',
      border: '1px solid rgba(16, 185, 129, 0.25)',
      shadow: '0 8px 32px rgba(16, 185, 129, 0.1)',
      icon: CheckCircle2
    },
    error: {
      color: '#ef4444',
      bg: 'rgba(239, 68, 68, 0.08)',
      border: '1px solid rgba(239, 68, 68, 0.25)',
      shadow: '0 8px 32px rgba(239, 68, 68, 0.1)',
      icon: XCircle
    },
    warning: {
      color: '#eab308',
      bg: 'rgba(234, 179, 8, 0.08)',
      border: '1px solid rgba(234, 179, 8, 0.25)',
      shadow: '0 8px 32px rgba(234, 179, 8, 0.1)',
      icon: AlertTriangle
    },
    info: {
      color: '#0ea5e9',
      bg: 'rgba(14, 165, 233, 0.08)',
      border: '1px solid rgba(14, 165, 233, 0.25)',
      shadow: '0 8px 32px rgba(14, 165, 233, 0.1)',
      icon: Info
    }
  };

  const config = typeConfig[notification.type] || typeConfig.info;
  const Icon = config.icon;

  return (
    <div style={{
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      zIndex: 99999,
      transform: isVisible ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.95)',
      opacity: isVisible ? 1 : 0,
      pointerEvents: isVisible ? 'all' : 'none',
      transition: 'all 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      background: 'rgba(15, 23, 42, 0.85)',
      backdropFilter: 'blur(12px)',
      border: config.border,
      boxShadow: `0 20px 25px -5px rgba(0,0,0,0.5), ${config.shadow}`,
      padding: '1rem 1.25rem',
      borderRadius: '12px',
      maxWidth: '380px',
      width: 'calc(100vw - 48px)'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: config.bg,
        borderRadius: '8px',
        width: '32px',
        height: '32px',
        color: config.color,
        flexShrink: 0
      }}>
        <Icon size={18} />
      </div>
      
      <div style={{ flex: 1, fontSize: '0.85rem', color: '#f1f5f9', fontWeight: 500, lineHeight: 1.4 }}>
        {notification.message}
      </div>

      <button 
        type="button"
        onClick={() => setIsVisible(false)}
        style={{
          background: 'transparent',
          border: 'none',
          color: '#94a3b8',
          cursor: 'pointer',
          padding: '0.2rem',
          borderRadius: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s',
          marginLeft: '0.5rem'
        }}
        onMouseEnter={(e) => e.target.style.color = '#f1f5f9'}
        onMouseLeave={(e) => e.target.style.color = '#94a3b8'}
      >
        <X size={14} />
      </button>
    </div>
  );
}
