import React, { useEffect, useState } from 'react';
import { 
  DollarSign, 
  Package, 
  AlertTriangle, 
  TrendingUp, 
  Sparkles, 
  AlertOctagon, 
  CheckCircle2, 
  Clock,
  Users,
  Download
} from 'lucide-react';
import { API_BASE_URL } from '../config';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export default function Dashboard({ socket, onAlert, user }) {
  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalUnitsSold: 0,
    totalMedicines: 0,
    outOfStock: 0,
    lowStock: 0,
    expired: 0,
    topSelling: [],
    timeline: [],
    isCompanyScoped: false,
    userRole: 'employee',
    activePersonnel: 0,
    salesByEmployee: []
  });
  const [alerts, setAlerts] = useState([]);
  const [loadingStats, setLoadingStats] = useState(true);

  // Fetch Stats
  const fetchDashboardData = async () => {
    try {
      if (!user?.uid) return;
      const statsRes = await fetch(`${API_BASE_URL}/api/sales/analytics?userId=${user.uid}`);
      const statsData = await statsRes.json();
      setStats(statsData);
      setLoadingStats(false);
    } catch (e) {
      console.error('Error fetching analytics:', e.message);
    }
  };

  useEffect(() => {
    fetchDashboardData();

    // Listen to real-time alerts from Socket.io
    if (socket) {
      const handleAlert = (alert) => {
        setAlerts(prev => {
          // Prevent duplicates
          if (prev.some(a => a.message === alert.message)) return prev;
          return [alert, ...prev];
        });
        if (onAlert) onAlert(alert);
      };

      const handleSaleCreated = () => {
        fetchDashboardData(); // Refresh metrics when a sale happens
      };

      const handleMedicineChange = () => {
        fetchDashboardData(); // Refresh metrics when stock is added or edited
      };

      socket.on('alert', handleAlert);
      socket.on('sale_created', handleSaleCreated);
      socket.on('medicine_change', handleMedicineChange);

      return () => {
        socket.off('alert', handleAlert);
        socket.off('sale_created', handleSaleCreated);
        socket.off('medicine_change', handleMedicineChange);
      };
    }
  }, [socket, user]);

  // Setup line chart data
  const lineChartData = {
    labels: stats.timeline.map(t => new Date(t.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })),
    datasets: [
      {
        fill: true,
        label: 'Revenue ($)',
        data: stats.timeline.map(t => t.revenue),
        borderColor: '#0ea5e9',
        backgroundColor: 'rgba(14, 165, 233, 0.1)',
        tension: 0.4
      }
    ]
  };

  // Setup bar chart data
  const barChartData = {
    labels: stats.topSelling.map(item => item.name),
    datasets: [
      {
        label: 'Units Sold',
        data: stats.topSelling.map(item => item.sold),
        backgroundColor: 'rgba(16, 185, 129, 0.75)',
        borderRadius: 8
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#94a3b8' }
      },
      y: {
        grid: { color: 'rgba(255,255,255,0.05)' },
        ticks: { color: '#94a3b8' }
      }
    }
  };

  return (
    <div className="dashboard-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div className="page-title">
          <h1>Dashboard Overview</h1>
          <p>Real-time analytics and intelligent recommendation panels</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button 
            onClick={() => window.open(`${API_BASE_URL}/api/reports/employee/export?userId=${user.uid}`, '_blank')} 
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', padding: '0.5rem 1rem' }}
          >
            <Download size={14} /> Export Personal Sales
          </button>
          
          {stats.isCompanyScoped && (stats.userRole === 'admin' || stats.userRole === 'manager') && (
            <button 
              onClick={() => window.open(`${API_BASE_URL}/api/reports/company/export?userId=${user.uid}`, '_blank')} 
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', padding: '0.5rem 1rem' }}
            >
              <Download size={14} /> Export Company Excel
            </button>
          )}
        </div>
      </div>

      {/* Stats Summary Cards Grid */}
      <div className="stats-grid">
        <div className="glass-card stat-card">
          <div className="stat-info">
            <h3>Total Revenue</h3>
            <div className="stat-value" style={{ color: 'var(--primary)' }}>
              ${stats.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className="stat-icon primary">
            <DollarSign size={24} />
          </div>
        </div>

        <div className="glass-card stat-card">
          <div className="stat-info">
            <h3>Inventory Items</h3>
            <div className="stat-value">{stats.totalMedicines}</div>
          </div>
          <div className="stat-icon secondary">
            <Package size={24} />
          </div>
        </div>

        <div className="glass-card stat-card">
          <div className="stat-info">
            <h3>Low Stock Alerts</h3>
            <div className="stat-value" style={{ color: stats.lowStock > 0 ? 'var(--warning)' : 'inherit' }}>
              {stats.lowStock}
            </div>
          </div>
          <div className="stat-icon warning">
            <AlertTriangle size={24} />
          </div>
        </div>

        <div className="glass-card stat-card">
          <div className="stat-info">
            <h3>Expired Batches</h3>
            <div className="stat-value" style={{ color: stats.expired > 0 ? 'var(--danger)' : 'inherit' }}>
              {stats.expired}
            </div>
          </div>
          <div className="stat-icon danger">
            <AlertOctagon size={24} />
          </div>
        </div>

        {stats.isCompanyScoped && (
          <div className="glass-card stat-card">
            <div className="stat-info">
              <h3>Active Staff</h3>
              <div className="stat-value" style={{ color: 'var(--secondary)' }}>{stats.activePersonnel}</div>
            </div>
            <div className="stat-icon secondary" style={{ background: 'rgba(14,165,233,0.15)', color: 'var(--secondary)' }}>
              <Users size={24} />
            </div>
          </div>
        )}
      </div>



      {/* Charts and Real-time Alerts Panel */}
      <div className="dashboard-sections" style={{ gridTemplateColumns: '1fr' }}>
        {/* Sales Trend Line Chart */}
        <div className="glass-card chart-card">
          <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <TrendingUp size={20} style={{ color: 'var(--primary)' }} />
            Sales Revenue Timeline
          </h2>
          <div style={{ height: '260px', position: 'relative' }}>
            {loadingStats ? (
              <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>Loading Chart...</div>
            ) : stats.timeline.length === 0 ? (
              <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>No Sales Data to Plot</div>
            ) : (
              <Line data={lineChartData} options={chartOptions} />
            )}
          </div>
        </div>
      </div>

      {/* Top Sellers Chart Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
        <div className="glass-card" style={{ height: '300px' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Package size={20} style={{ color: 'var(--secondary)' }} />
            Best Performing Medicines
          </h2>
          <div style={{ height: '200px', position: 'relative' }}>
            {loadingStats ? (
              <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>Loading Chart...</div>
            ) : stats.topSelling.length === 0 ? (
              <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>No sales transactions found</div>
            ) : (
              <Bar data={barChartData} options={chartOptions} />
            )}
          </div>
        </div>
      </div>

      {/* Employee Sales Contributions (only for company scoped workspaces) */}
      {stats.isCompanyScoped && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem', marginTop: '1.5rem' }}>
          <div className="glass-card" style={{ padding: '2rem' }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.75rem' }}>
              <Users size={20} style={{ color: 'var(--secondary)' }} />
              Staff Performance & Sales Contributions
            </h2>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Staff Member</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Role</th>
                    <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>Total Sales Transactions</th>
                    <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Revenue Generated</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.salesByEmployee.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                        No staff sales logged yet.
                      </td>
                    </tr>
                  ) : (
                    stats.salesByEmployee.map((emp, index) => (
                      <tr key={index} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                        <td style={{ padding: '0.75rem 0.5rem' }}>
                          <strong>{emp.name || 'Workspace Staff'}</strong>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{emp.email}</div>
                        </td>
                        <td style={{ padding: '0.75rem 0.5rem' }}>
                          <span className={`badge ${emp.role === 'admin' ? 'danger' : emp.role === 'manager' ? 'warning' : 'success'}`}>
                            {emp.role.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>{emp.sales_count}</td>
                        <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontWeight: 600, color: 'var(--primary)' }}>
                          ${parseFloat(emp.revenue).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
