import React, { useEffect, useState } from 'react';
import { 
  DollarSign, 
  Package, 
  AlertTriangle, 
  TrendingUp, 
  Sparkles, 
  AlertOctagon, 
  CheckCircle2, 
  Clock 
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
    timeline: []
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
      <div className="page-header">
        <div className="page-title">
          <h1>Dashboard Overview</h1>
          <p>Real-time analytics and intelligent recommendation panels</p>
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
    </div>
  );
}
