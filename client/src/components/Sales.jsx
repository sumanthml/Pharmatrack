import React, { useEffect, useState } from 'react';
import { 
  ShoppingCart, 
  Calendar, 
  DollarSign, 
  ClipboardList, 
  Search, 
  Plus, 
  Minus, 
  CheckCircle, 
  Package, 
  AlertTriangle,
  Receipt,
  User
} from 'lucide-react';
import { API_BASE_URL } from '../config';

export default function Sales({ socket, user }) {
  const [medicines, setMedicines] = useState([]);
  const [salesHistory, setSalesHistory] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Sale Basket State
  const [selectedMedId, setSelectedMedId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [saleError, setSaleError] = useState('');
  const [saleSuccess, setSaleSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  // Fetch medicines and sales logs
  const fetchData = async () => {
    try {
      if (!user?.uid) return;
      const medRes = await fetch(`${API_BASE_URL}/api/medicines?userId=${user.uid}`);
      const medData = await medRes.json();
      setMedicines(medData);

      const salesRes = await fetch(`${API_BASE_URL}/api/sales?userId=${user.uid}`);
      const salesData = await salesRes.json();
      setSalesHistory(salesData);
    } catch (e) {
      console.error('Error fetching sales data:', e.message);
    }
  };

  useEffect(() => {
    fetchData();

    // Listen to real-time sales logged by other operators
    if (socket) {
      const handleSaleCreated = (payload) => {
        const { sale, medicine_name } = payload;
        setSalesHistory(prev => [
          { ...sale, medicine_name },
          ...prev
        ]);
        
        // Refresh medicine quantities in selection drop-down
        fetchData();
      };

      const handleMedicineChange = () => {
        fetchData(); // Sync list if stock values were adjusted in inventory tab
      };

      socket.on('sale_created', handleSaleCreated);
      socket.on('medicine_change', handleMedicineChange);

      return () => {
        socket.off('sale_created', handleSaleCreated);
        socket.off('medicine_change', handleMedicineChange);
      };
    }
  }, [socket, user]);

  // Find currently selected medicine details
  const selectedMed = medicines.find(m => m.id === parseInt(selectedMedId));
  
  // Computed price
  const unitPrice = selectedMed ? parseFloat(selectedMed.price) : 0;
  const totalPrice = unitPrice * quantity;

  // POS calculations for today's summary metrics
  const todayStr = new Date().toDateString();
  const todaySales = salesHistory.filter(s => new Date(s.sale_date).toDateString() === todayStr);
  const todayRevenue = todaySales.reduce((sum, s) => sum + parseFloat(s.total_price), 0);
  const todayCount = todaySales.length;

  const medicineCounts = {};
  todaySales.forEach(s => {
    medicineCounts[s.medicine_name] = (medicineCounts[s.medicine_name] || 0) + s.quantity;
  });
  let topSoldToday = 'None';
  let maxQty = 0;
  Object.keys(medicineCounts).forEach(name => {
    if (medicineCounts[name] > maxQty) {
      maxQty = medicineCounts[name];
      topSoldToday = name;
    }
  });

  const handleLogSale = async (e) => {
    if (e) e.preventDefault();
    setSaleError('');
    setSaleSuccess('');
    
    if (!selectedMedId) {
      setSaleError('Please select a medicine batch.');
      return;
    }

    if (quantity <= 0) {
      setSaleError('Quantity must be greater than 0.');
      return;
    }

    if (selectedMed && selectedMed.quantity < quantity) {
      setSaleError(`Insufficient stock. Only ${selectedMed.quantity} units available.`);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/sales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          medicine_id: parseInt(selectedMedId),
          quantity: parseInt(quantity),
          userId: user.uid
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to record sale.');
      }

      setSaleSuccess(`Successfully sold ${quantity} units of ${selectedMed.name}!`);
      setSelectedMedId('');
      setQuantity(1);
    } catch (err) {
      setSaleError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleIncrement = () => {
    if (!selectedMed) return;
    setQuantity(prev => Math.min(selectedMed.quantity, prev + 1));
  };

  const handleDecrement = () => {
    setQuantity(prev => Math.max(1, prev - 1));
  };

  const filteredMedicines = medicines.filter(med => 
    med.quantity > 0 &&
    (med.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
     med.batch_number.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="sales-container">
      <div className="page-header">
        <div className="page-title">
          <h1>Sales & Transactions</h1>
          <p>Process customer sales and view real-time transaction history</p>
        </div>
      </div>

      {/* POS Daily KPI indicators */}
      <div className="stats-grid" style={{ marginBottom: '1.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <div className="glass-card stat-card" style={{ padding: '1rem 1.25rem' }}>
          <div className="stat-info">
            <h3 style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Today's Revenue</h3>
            <div className="stat-value" style={{ color: 'var(--secondary)', fontSize: '1.35rem', fontWeight: 700, marginTop: '0.15rem' }}>
              ${todayRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className="stat-icon secondary" style={{ padding: '0.5rem', borderRadius: '8px' }}>
            <DollarSign size={18} />
          </div>
        </div>

        <div className="glass-card stat-card" style={{ padding: '1rem 1.25rem' }}>
          <div className="stat-info">
            <h3 style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Today's Sales Count</h3>
            <div className="stat-value" style={{ fontSize: '1.35rem', fontWeight: 700, marginTop: '0.15rem' }}>
              {todayCount} <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-muted)' }}>transactions</span>
            </div>
          </div>
          <div className="stat-icon primary" style={{ padding: '0.5rem', borderRadius: '8px' }}>
            <Receipt size={18} />
          </div>
        </div>

        <div className="glass-card stat-card" style={{ padding: '1rem 1.25rem' }}>
          <div className="stat-info">
            <h3 style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Top Product Today</h3>
            <div className="stat-value" style={{ fontSize: '1.15rem', fontWeight: 700, marginTop: '0.15rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px', color: 'var(--primary)' }} title={topSoldToday}>
              {topSoldToday}
            </div>
          </div>
          <div className="stat-icon warning" style={{ padding: '0.5rem', borderRadius: '8px' }}>
            <Package size={18} />
          </div>
        </div>
      </div>

      {/* Main Layout Area */}
      <div className="dashboard-sections" style={{ gridTemplateColumns: '1.8fr 1.2fr', gap: '1.5rem' }}>
        
        {/* Left Side: Product Catalog Grid & Search */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="glass-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Package size={18} style={{ color: 'var(--primary)' }} />
                Available Stock Catalog
              </h2>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{filteredMedicines.length} batches ready</span>
            </div>
            
            <div className="search-input-wrapper" style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                className="form-input"
                style={{ paddingLeft: '38px', fontSize: '0.875rem' }}
                placeholder="Quick search catalog by name or batch..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', 
            gap: '1rem',
            overflowY: 'auto',
            maxHeight: '480px',
            paddingRight: '0.25rem'
          }}>
            {filteredMedicines.length === 0 ? (
              <div className="glass-card" style={{ gridColumn: '1 / -1', padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                No active medicine batches found matching "{searchTerm}".
              </div>
            ) : (
              filteredMedicines.map(med => {
                const isSelected = selectedMedId === med.id.toString();
                const isExpiringSoon = (new Date(med.expiry_date) - new Date()) / (1000 * 60 * 60 * 24) <= 60;
                
                return (
                  <div 
                    key={med.id} 
                    className="glass-card" 
                    onClick={() => {
                      setSelectedMedId(med.id.toString());
                      setQuantity(1);
                      setSaleError('');
                      setSaleSuccess('');
                    }}
                    style={{ 
                      padding: '1rem', 
                      cursor: 'pointer',
                      border: isSelected ? '1px solid var(--primary)' : '1px solid rgba(255,255,255,0.05)',
                      background: isSelected ? 'linear-gradient(135deg, rgba(14,165,233,0.1) 0%, rgba(255,255,255,0.01) 100%)' : 'rgba(255,255,255,0.01)',
                      transition: 'all 0.2s ease',
                      transform: isSelected ? 'scale(1.02)' : 'none',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.65rem'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: isSelected ? 'var(--primary)' : 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {med.name}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                        <span>Batch: {med.batch_number}</span>
                        <span style={{ color: isExpiringSoon ? 'var(--danger)' : 'var(--text-muted)', fontWeight: isExpiringSoon ? 600 : 'normal' }}>
                          Exp: {new Date(med.expiry_date).toLocaleDateString(undefined, { month: 'short', year: '2-digit' })}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 'auto' }}>
                      <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--secondary)' }}>
                        ${parseFloat(med.price).toFixed(2)}
                      </div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: med.quantity <= med.min_stock_level ? 'var(--warning)' : '#a7f3d0' }}>
                        {med.quantity} left
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Side: Cashier checkout basket & History logs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Checkout Basket Card */}
          <div className="glass-card" style={{ height: 'fit-content', border: selectedMed ? '1px solid rgba(14,165,233,0.25)' : '1px solid rgba(255,255,255,0.05)' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <ShoppingCart size={18} style={{ color: 'var(--primary)' }} />
              Checkout Basket
            </h2>

            {saleError && (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '0.75rem', color: '#fca5a5', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1rem' }}>
                {saleError}
              </div>
            )}

            {saleSuccess && (
              <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '0.75rem', color: '#a7f3d0', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1rem' }}>
                {saleSuccess}
              </div>
            )}

            {!selectedMed ? (
              <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                <ShoppingCart size={32} style={{ opacity: 0.2, margin: '0 auto 0.75rem auto' }} />
                Click an item in the catalog to prepare checkout.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.85rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--primary)' }}>{selectedMed.name}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                    <span>Batch: <strong>{selectedMed.batch_number}</strong></span>
                    <span>Stock: <strong>{selectedMed.quantity} units</strong></span>
                  </div>
                </div>

                {/* Tactile Quantity Adjuster */}
                <div className="form-group">
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem', display: 'block' }}>Sales Quantity</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <button 
                      type="button" 
                      onClick={handleDecrement}
                      style={{ 
                        background: 'rgba(255,255,255,0.05)', 
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: 'var(--text-main)',
                        padding: '0.5rem',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                    >
                      <Minus size={14} />
                    </button>
                    <input
                      type="number"
                      min="1"
                      max={selectedMed.quantity}
                      required
                      className="form-input"
                      style={{ textAlign: 'center', fontWeight: 700, padding: '0.4rem 0.5rem', fontSize: '1rem', width: '80px' }}
                      value={quantity}
                      onChange={(e) => setQuantity(Math.max(1, Math.min(selectedMed.quantity, parseInt(e.target.value) || 1)))}
                    />
                    <button 
                      type="button" 
                      onClick={handleIncrement}
                      style={{ 
                        background: 'rgba(255,255,255,0.05)', 
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: 'var(--text-main)',
                        padding: '0.5rem',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>

                <div style={{ borderTop: '1px dashed var(--glass-border)', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Checkout Total:</span>
                  <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--secondary)' }}>
                    ${totalPrice.toFixed(2)}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleLogSale}
                  disabled={loading}
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.4rem' }}
                >
                  <CheckCircle size={16} />
                  {loading ? 'Processing...' : 'Complete Sale'}
                </button>
              </div>
            )}
          </div>

          {/* Sales History Log Card */}
          <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', minHeight: '220px', maxHeight: '360px' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <ClipboardList size={18} style={{ color: 'var(--secondary)' }} />
              Recent Logs
            </h2>

            <div style={{ flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.65rem', paddingRight: '0.25rem' }}>
              {salesHistory.length === 0 ? (
                <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>
                  No sales logged today.
                </div>
              ) : (
                salesHistory.map(sale => (
                  <div 
                    key={sale.id} 
                    style={{ 
                      background: 'rgba(255,255,255,0.01)',
                      border: '1px solid rgba(255,255,255,0.03)',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 650, fontSize: '0.85rem' }}>{sale.medicine_name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem', display: 'flex', gap: '0.5rem' }}>
                        <span>Batch: {sale.batch_number}</span>
                        <span>•</span>
                        <span>Qty: {sale.quantity}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, color: 'var(--secondary)', fontSize: '0.9rem' }}>
                        ${parseFloat(sale.total_price).toFixed(2)}
                      </div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                        {new Date(sale.sale_date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
