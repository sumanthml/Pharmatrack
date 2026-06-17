import React, { useEffect, useState } from 'react';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { 
  BrainCircuit, 
  TrendingUp, 
  AlertTriangle, 
  AlertCircle, 
  ShoppingCart, 
  Mail, 
  Percent, 
  X,
  Package,
  DollarSign,
  CalendarCheck,
  ShieldCheck,
  MessageSquare
} from 'lucide-react';
import { API_BASE_URL } from '../config';

// Register ChartJS elements
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export default function Predictions({ socket, user }) {
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [discountMed, setDiscountMed] = useState(null);
  const [discountVal, setDiscountVal] = useState(20); // default 20% discount

  const fetchPredictions = async () => {
    try {
      if (!user?.uid) return;
      const res = await fetch(`${API_BASE_URL}/api/predictions?userId=${user.uid}`);
      const data = await res.json();
      
      // Sort predictions by riskLevel (Expired, High, Medium, Low) and potential loss
      const riskOrder = { 'Expired': 0, 'High': 1, 'Medium': 2, 'Low': 3 };
      const sorted = data.sort((a, b) => {
        if (riskOrder[a.riskLevel] !== riskOrder[b.riskLevel]) {
          return riskOrder[a.riskLevel] - riskOrder[b.riskLevel];
        }
        return b.potentialLoss - a.potentialLoss;
      });

      setPredictions(sorted);
      setLoading(false);
    } catch (e) {
      console.error('Error fetching ML predictions:', e.message);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPredictions();

    if (socket) {
      // Refresh predictions in real time when sales are made or stock levels change
      const handleSync = () => {
        fetchPredictions();
      };
      socket.on('sale_created', handleSync);
      socket.on('medicine_change', handleSync);

      return () => {
        socket.off('sale_created', handleSync);
        socket.off('medicine_change', handleSync);
      };
    }
  }, [socket, user]);

  // Apply a promotional discount via the backend PUT medicine endpoint
  const handleApplyDiscount = async () => {
    if (!discountMed) return;

    const discountFactor = (100 - discountVal) / 100;
    const newPrice = Number((parseFloat(discountMed.price) * discountFactor).toFixed(2));

    try {
      const res = await fetch(`${API_BASE_URL}/api/medicines/${discountMed.medicineId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: discountMed.name,
          batch_number: discountMed.batchNumber,
          manufacturing_date: discountMed.expiryDate, // placeholder (not actually changing)
          expiry_date: discountMed.expiryDate,
          quantity: discountMed.quantity,
          min_stock_level: 10, // placeholder
          price: newPrice,
          supplier_name: discountMed.supplierName,
          supplier_email: discountMed.supplierEmail,
          purchase_date: new Date().toISOString().split('T')[0], // placeholder
          userId: user.uid
        })
      });

      if (!res.ok) throw new Error('Failed to update price');
      alert(`Successfully discounted ${discountMed.name} to $${newPrice}!`);
      setDiscountMed(null);
      fetchPredictions();
    } catch (err) {
      alert(`Error discounting: ${err.message}`);
    }
  };

  // Helper: generates points for a stock depletion line chart
  const getDepletionChartData = (med) => {
    const daysToExpiry = med.daysToExpiry;
    const velocity = med.salesVelocity;
    const initialQty = med.quantity;
    
    // Construct days intervals (e.g. 5 steps from Day 0 to Expiry Day)
    const step = Math.max(1, Math.ceil(daysToExpiry / 5));
    const labels = [];
    const stockPoints = [];
    const today = new Date();

    for (let i = 0; i <= 5; i++) {
      const dayOffset = Math.min(daysToExpiry, i * step);
      const targetDate = new Date(today.getTime() + dayOffset * 24 * 60 * 60 * 1000);
      labels.push(targetDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
      
      const projectedStock = Math.max(0, initialQty - Math.floor(velocity * dayOffset));
      stockPoints.push(projectedStock);

      // Stop loop if we reached expiry or stock hit 0
      if (dayOffset === daysToExpiry) break;
    }

    const hasWastage = med.predictedWastageQty > 0;
    
    return {
      labels,
      datasets: [
        {
          fill: true,
          label: 'Projected Stock',
          data: stockPoints,
          borderColor: hasWastage ? '#ef4444' : '#10b981',
          backgroundColor: hasWastage ? 'rgba(239, 68, 68, 0.05)' : 'rgba(16, 185, 129, 0.05)',
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: hasWastage ? '#ef4444' : '#10b981',
          tension: 0.2
        }
      ]
    };
  };

  // 1. Calculations for aggregate summary statistics
  const totalFinancialRisk = predictions.reduce((sum, p) => sum + p.potentialLoss, 0);
  const totalWastageVolume = predictions.reduce((sum, p) => sum + p.predictedWastageQty, 0);
  const urgentReorders = predictions.filter(p => p.reorderStatus === 'Urgent Restock').length;
  const highRiskBatches = predictions.filter(p => p.riskLevel === 'High' || p.riskLevel === 'Expired').length;

  // 2. Expiry Risk Distribution (Doughnut Chart)
  const expiredCount = predictions.filter(p => p.riskLevel === 'Expired').length;
  const highRiskCount = predictions.filter(p => p.riskLevel === 'High').length;
  const medRiskCount = predictions.filter(p => p.riskLevel === 'Medium').length;
  const lowRiskCount = predictions.filter(p => p.riskLevel === 'Low').length;

  const doughnutData = {
    labels: ['Expired', 'High Risk', 'Medium Risk', 'Low Risk'],
    datasets: [
      {
        data: [expiredCount, highRiskCount, medRiskCount, lowRiskCount],
        backgroundColor: [
          '#64748b', // Expired: Slate/Gray
          'rgba(239, 68, 68, 0.85)', // High: Red
          'rgba(245, 158, 11, 0.85)', // Medium: Orange
          'rgba(16, 185, 129, 0.85)'  // Low: Emerald
        ],
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)'
      }
    ]
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right',
        labels: {
          color: '#cbd5e1',
          font: { size: 11, family: 'inherit' },
          boxWidth: 12
        }
      },
      tooltip: {
        backgroundColor: '#0f172a',
        titleColor: '#cbd5e1',
        bodyColor: '#cbd5e1',
        borderColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1
      }
    }
  };

  // 3. Top Financial Waste by Medicine (Horizontal Bar Chart)
  const topLossMeds = [...predictions]
    .filter(p => p.potentialLoss > 0)
    .sort((a, b) => b.potentialLoss - a.potentialLoss)
    .slice(0, 5);

  const barData = {
    labels: topLossMeds.map(m => m.name.length > 15 ? `${m.name.substring(0, 15)}...` : m.name),
    datasets: [
      {
        label: 'Financial Loss ($)',
        data: topLossMeds.map(m => m.potentialLoss),
        backgroundColor: 'rgba(239, 68, 68, 0.65)',
        borderColor: '#ef4444',
        borderWidth: 1,
        borderRadius: 4
      }
    ]
  };

  const barOptions = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0f172a',
        borderColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1
      }
    },
    scales: {
      x: {
        grid: { color: 'rgba(255,255,255,0.05)' },
        ticks: { color: '#94a3b8', font: { size: 10 } }
      },
      y: {
        grid: { display: false },
        ticks: { color: '#cbd5e1', font: { size: 10 } }
      }
    }
  };

  // Mini Chart styling for depletion visual
  const miniChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        enabled: true,
        backgroundColor: '#0f172a',
        titleFont: { size: 9 },
        bodyFont: { size: 9 },
        displayColors: false
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#64748b', font: { size: 8 } }
      },
      y: {
        grid: { color: 'rgba(255,255,255,0.03)' },
        ticks: { color: '#64748b', font: { size: 8 }, precision: 0 }
      }
    }
  };

  return (
    <div className="predictions-container">
      <div className="page-header">
        <div className="page-title">
          <h1>Predictive Expiry Analytics</h1>
          <p>Machine Learning and analytics model forecasting stock depletion, waste volume, and order quantities</p>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '300px', fontSize: '1.2rem', color: 'var(--text-muted)' }}>
          Running Predictive Models...
        </div>
      ) : predictions.length === 0 ? (
        <div style={{ padding: '4rem 2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <BrainCircuit size={48} style={{ opacity: 0.3, marginBottom: '1rem', color: 'var(--primary)' }} />
          <p style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0 0 0.5rem 0' }}>No Data Available to Train Models</p>
          <p style={{ fontSize: '0.875rem', margin: 0, color: 'var(--text-muted)' }}>
            Add medicine inventory batches and record sales transactions in the POS tab to run predictive calculations.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Summary Cards Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem' }}>
            
            <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.25rem' }}>
              <div style={{ padding: '0.75rem', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
                <DollarSign size={20} />
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total Financial Waste Risk</span>
                <div style={{ fontSize: '1.35rem', fontWeight: 700, color: totalFinancialRisk > 0 ? '#fca5a5' : 'inherit', marginTop: '0.15rem' }}>
                  ${totalFinancialRisk.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>

            <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.25rem' }}>
              <div style={{ padding: '0.75rem', borderRadius: '12px', background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
                <Package size={20} />
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Projected Wastage Volume</span>
                <div style={{ fontSize: '1.35rem', fontWeight: 700, color: totalWastageVolume > 0 ? '#fde047' : 'inherit', marginTop: '0.15rem' }}>
                  {totalWastageVolume.toLocaleString()} <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-muted)' }}>units</span>
                </div>
              </div>
            </div>

            <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.25rem' }}>
              <div style={{ padding: '0.75rem', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                <CalendarCheck size={20} />
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>High-Risk Batches</span>
                <div style={{ fontSize: '1.35rem', fontWeight: 700, color: highRiskBatches > 0 ? '#fca5a5' : 'inherit', marginTop: '0.15rem' }}>
                  {highRiskBatches}
                </div>
              </div>
            </div>

            <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.25rem' }}>
              <div style={{ padding: '0.75rem', borderRadius: '12px', background: 'rgba(14, 165, 233, 0.1)', color: '#0ea5e9' }}>
                <ShieldCheck size={20} />
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Urgent Reorder Actions</span>
                <div style={{ fontSize: '1.35rem', fontWeight: 700, color: urgentReorders > 0 ? '#7dd3fc' : 'inherit', marginTop: '0.15rem' }}>
                  {urgentReorders}
                </div>
              </div>
            </div>

          </div>

          {/* Charts Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem' }}>
            
            <div className="glass-card" style={{ height: '240px', display: 'flex', flexDirection: 'column' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                Expiry Risk Level Distribution
              </h3>
              <div style={{ flexGrow: 1, position: 'relative', height: '180px' }}>
                <Doughnut data={doughnutData} options={doughnutOptions} />
              </div>
            </div>

            <div className="glass-card" style={{ height: '240px', display: 'flex', flexDirection: 'column' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                Top 5 High Loss Risk Batches ($)
              </h3>
              <div style={{ flexGrow: 1, position: 'relative', height: '180px' }}>
                {topLossMeds.length === 0 ? (
                  <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    No financial losses predicted.
                  </div>
                ) : (
                  <Bar data={barData} options={barOptions} />
                )}
              </div>
            </div>

          </div>

          {/* Summary Warning Banner */}
          {predictions.some(p => p.riskLevel === 'High' || p.riskLevel === 'Expired') && (
            <div className="glass-card" style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.5rem' }}>
              <AlertCircle size={28} style={{ color: 'var(--danger)' }} />
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#fca5a5' }}>Inventory Wastage Warning</h3>
                <p style={{ fontSize: '0.875rem', color: '#fecaca', margin: 0 }}>
                  Our models predict that {predictions.filter(p => p.predictedWastageQty > 0).length} medicine batches will expire before current sales rates clear their stock, resulting in potential losses.
                </p>
              </div>
            </div>
          )}

          {/* Predictions Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
            {predictions.map(med => {
              let badgeColor = 'success';
              if (med.riskLevel === 'High') badgeColor = 'danger';
              else if (med.riskLevel === 'Medium') badgeColor = 'warning';
              else if (med.riskLevel === 'Expired') badgeColor = 'expired';

              return (
                <div key={med.medicineId} className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', borderLeft: `5px solid var(--${badgeColor === 'expired' ? 'text-muted' : badgeColor})` }}>
                  {/* Card Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div>
                      <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>{med.name}</h2>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Batch: {med.batchNumber} | Expiry: {new Date(med.expiryDate).toLocaleDateString()}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span className={`badge ${badgeColor}`} style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
                        {med.riskLevel} Risk
                      </span>
                    </div>
                  </div>

                  {/* Main section: splits stats metrics (left) and depletion graph (right) */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '1.5rem', alignItems: 'center' }}>
                    
                    {/* Forecast details Grid */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, 1fr)',
                      gap: '0.75rem',
                      background: 'rgba(255,255,255,0.01)',
                      padding: '0.85rem',
                      borderRadius: '10px',
                      border: '1px solid rgba(255,255,255,0.03)'
                    }}>
                      <div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>Sales Velocity</div>
                        <div style={{ fontSize: '0.95rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <TrendingUp size={13} style={{ color: 'var(--secondary)' }} />
                          {med.salesVelocity} <span style={{ fontSize: '0.7rem', fontWeight: 500, color: 'var(--text-muted)' }}>/ day</span>
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>Run-out Date</div>
                        <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>
                          {med.runOutDate}
                        </div>
                        {med.daysToRunOut && <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>In {med.daysToRunOut} days</div>}
                      </div>

                      <div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>Predicted Wastage</div>
                        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: med.predictedWastageQty > 0 ? 'var(--danger)' : 'inherit' }}>
                          {med.predictedWastageQty} units
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>Financial Risk</div>
                        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: med.potentialLoss > 0 ? 'var(--danger)' : 'inherit' }}>
                          ${med.potentialLoss.toFixed(2)}
                        </div>
                      </div>

                      <div style={{ gridColumn: 'span 2' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>Reorder Action</div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 700, color: med.reorderStatus.includes('Urgent') ? 'var(--danger)' : med.reorderStatus.includes('Soon') ? 'var(--warning)' : 'var(--text-muted)' }}>
                          {med.reorderStatus}
                          {med.recommendedOrderQty > 0 && <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--primary)', marginLeft: '0.5rem' }}>Order: +{med.recommendedOrderQty}</span>}
                        </div>
                      </div>
                    </div>

                    {/* Stock depletion curve graph */}
                    <div style={{ height: '140px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.02)', padding: '0.5rem', borderRadius: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.35rem', padding: '0 0.25rem' }}>
                        <span>Projected Stock Depletion Timeline</span>
                        <span style={{ fontWeight: 600, color: med.predictedWastageQty > 0 ? '#fca5a5' : '#a7f3d0' }}>
                          {med.predictedWastageQty > 0 ? `Wastes: ${med.predictedWastageQty} units` : 'Clears successfully'}
                        </span>
                      </div>
                      <div style={{ height: '105px', position: 'relative' }}>
                        {med.daysToExpiry <= 0 ? (
                          <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.75rem', fontStyle: 'italic' }}>
                            Depletion timeline unavailable for expired batches.
                          </div>
                        ) : (
                          <Line data={getDepletionChartData(med)} options={miniChartOptions} />
                        )}
                      </div>
                    </div>

                  </div>

                  {/* Rationale and actions */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '0.75rem' }}>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      <strong>ML Insight:</strong> {med.riskReason}
                    </div>
                    
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      {med.predictedWastageQty > 0 && med.riskLevel !== 'Expired' && (
                        <button onClick={() => setDiscountMed(med)} className="btn btn-secondary" style={{ color: 'var(--warning)', borderColor: 'rgba(245,158,11,0.2)' }}>
                          <Percent size={14} />
                          Discount to Clear
                        </button>
                      )}
                      
                      {med.recommendedOrderQty > 0 && med.supplierEmail && (
                        <a href={`mailto:${med.supplierEmail}?subject=Purchase%20Order:%20${encodeURIComponent(med.name)}&body=Dear%20Supplier,%0D%0A%0D%0AWe%20would%20like%20to%20order%20${med.recommendedOrderQty}%20units%20of%20${encodeURIComponent(med.name)}.%20Please%20confirm%20pricing%20and%20estimated%20delivery%20date.%0D%0A%0D%0ABest%20Regards,%0D%0APharmacy%20Inventory%20Team`} className="btn btn-primary" style={{ textDecoration: 'none' }}>
                          <Mail size={14} />
                          Order stock
                        </a>
                      )}
                      
                      {med.recommendedOrderQty > 0 && med.supplierPhone && (
                        <a 
                          href={`https://wa.me/${med.supplierPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hello, we would like to order ${med.recommendedOrderQty} units of ${med.name}. Please confirm pricing and delivery. Thanks!`)}`} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="btn btn-secondary" 
                          style={{ textDecoration: 'none', color: '#25D366', borderColor: 'rgba(37,211,102,0.3)', gap: '0.4rem', display: 'flex', alignItems: 'center' }}
                        >
                          <MessageSquare size={14} />
                          WhatsApp PO
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Discount Modal overlay */}
      {discountMed && (
        <div className="modal-overlay">
          <div className="glass-card modal-content" style={{ maxWidth: '400px', padding: '2rem' }}>
            <div className="modal-header">
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Apply Promotional Discount</h2>
              <button onClick={() => setDiscountMed(null)} className="close-btn"><X size={20} /></button>
            </div>
            
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
              To prevent discarding the expiring stock of <strong>{discountMed.name}</strong>, apply a markdown price to stimulate consumer demand.
            </p>

            <div className="form-group">
              <label>Select Discount %</label>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <input
                  type="range"
                  min="5"
                  max="75"
                  step="5"
                  style={{ flexGrow: 1 }}
                  value={discountVal}
                  onChange={(e) => setDiscountVal(parseInt(e.target.value))}
                />
                <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--warning)' }}>{discountVal}%</span>
              </div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                <span>Current Price:</span>
                <span style={{ fontWeight: 600 }}>${parseFloat(discountMed.price).toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: 'var(--secondary)', fontWeight: 700 }}>
                <span>Promotional Price:</span>
                <span>${(parseFloat(discountMed.price) * (100 - discountVal) / 100).toFixed(2)}</span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button onClick={() => setDiscountMed(null)} className="btn btn-secondary">Cancel</button>
              <button onClick={handleApplyDiscount} className="btn btn-primary" style={{ background: 'var(--warning)', color: '#0f172a' }}>
                Apply Price Markdown
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
