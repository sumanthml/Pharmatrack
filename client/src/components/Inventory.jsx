import React, { useEffect, useState } from 'react';
import { 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  X, 
  User, 
  Mail, 
  Phone,
  LayoutGrid,
  List,
  DollarSign,
  Layers,
  HeartPulse,
  AlertOctagon,
  TrendingUp,
  PlusCircle,
  MinusCircle,
  CalendarDays,
  Boxes,
  Package,
  AlertTriangle
} from 'lucide-react';
import { API_BASE_URL } from '../config';

export default function Inventory({ socket, user }) {
  const [medicines, setMedicines] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewMode, setViewMode] = useState('table'); // table or grid
  
  // Suppliers integration
  const [suppliers, setSuppliers] = useState([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState('custom');
  
  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingMed, setEditingMed] = useState(null);
  
  // Form State
  const initialFormState = {
    name: '',
    batch_number: '',
    manufacturing_date: '',
    expiry_date: '',
    quantity: 0,
    min_stock_level: 10,
    price: 0.00,
    supplier_name: '',
    supplier_email: '',
    supplier_phone: '',
    purchase_date: new Date().toISOString().split('T')[0]
  };
  const [formData, setFormData] = useState(initialFormState);
  const [formError, setFormError] = useState('');

  // Fetch all medicines
  const fetchMedicines = async () => {
    try {
      if (!user?.uid) return;
      const res = await fetch(`${API_BASE_URL}/api/medicines?userId=${user.uid}`);
      const data = await res.json();
      setMedicines(data);
    } catch (err) {
      console.error('Error fetching inventory:', err.message);
    }
  };

  // Fetch all suppliers
  const fetchSuppliers = async () => {
    try {
      if (!user?.uid) return;
      const res = await fetch(`${API_BASE_URL}/api/suppliers?userId=${user.uid}`);
      if (res.ok) {
        const data = await res.json();
        setSuppliers(data);
      }
    } catch (err) {
      console.error('Error fetching suppliers:', err.message);
    }
  };

  useEffect(() => {
    fetchMedicines();
    fetchSuppliers();

    // Listen to real-time updates from Socket.io
    if (socket) {
      const handleMedicineChange = (payload) => {
        const { action, data } = payload;
        
        setMedicines(prev => {
          if (action === 'create') {
            if (prev.some(m => m.id === data.id)) return prev;
            return [data, ...prev];
          }
          if (action === 'update') {
            return prev.map(m => m.id === data.id ? data : m);
          }
          if (action === 'delete') {
            return prev.filter(m => m.id !== data.id);
          }
          return prev;
        });
      };

      const handleSupplierChange = () => {
        fetchSuppliers();
      };

      socket.on('medicine_change', handleMedicineChange);
      socket.on('supplier_change', handleSupplierChange);
      return () => {
        socket.off('medicine_change', handleMedicineChange);
        socket.off('supplier_change', handleSupplierChange);
      };
    }
  }, [socket, user]);

  // Open modal for Adding
  const handleAddClick = () => {
    setEditingMed(null);
    setFormData(initialFormState);
    setSelectedSupplierId('custom');
    setFormError('');
    setShowModal(true);
  };

  // Open modal for Editing
  const handleEditClick = (med) => {
    setEditingMed(med);
    const formattedMed = {
      ...med,
      manufacturing_date: new Date(med.manufacturing_date).toISOString().split('T')[0],
      expiry_date: new Date(med.expiry_date).toISOString().split('T')[0],
      purchase_date: new Date(med.purchase_date).toISOString().split('T')[0],
      price: parseFloat(med.price)
    };
    setFormData(formattedMed);

    // Sync supplier select dropdown
    const matchedSup = suppliers.find(s => s.name.toLowerCase() === (med.supplier_name || '').toLowerCase());
    setSelectedSupplierId(matchedSup ? matchedSup.id : 'custom');

    setFormError('');
    setShowModal(true);
  };

  // Handle Supplier Select change
  const handleSupplierSelect = (value) => {
    setSelectedSupplierId(value);
    if (value === 'custom') {
      setFormData(prev => ({
        ...prev,
        supplier_name: '',
        supplier_email: '',
        supplier_phone: ''
      }));
    } else {
      const sup = suppliers.find(s => s.id === parseInt(value));
      if (sup) {
        setFormData(prev => ({
          ...prev,
          supplier_name: sup.name,
          supplier_email: sup.email || '',
          supplier_phone: sup.phone || ''
        }));
      }
    }
  };

  // Handle Delete
  const handleDeleteClick = async (id) => {
    if (!window.confirm('Are you sure you want to delete this medicine batch?')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/medicines/${id}?userId=${user.uid}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Delete failed');
    } catch (err) {
      alert(`Error deleting: ${err.message}`);
    }
  };

  // Form Submit
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    // Pre-validations
    if (new Date(formData.manufacturing_date) > new Date(formData.expiry_date)) {
      setFormError('Manufacturing date cannot be after expiry date.');
      return;
    }

    try {
      const url = editingMed 
        ? `${API_BASE_URL}/api/medicines/${editingMed.id}`
        : `${API_BASE_URL}/api/medicines`;
      const method = editingMed ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, userId: user.uid })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Submission failed');
      }

      setShowModal(false);
    } catch (err) {
      setFormError(err.message);
    }
  };

  // Quick Inline Stock Refilling adjustment
  const handleQuickStockAdjust = async (med, increment) => {
    const newQty = Math.max(0, med.quantity + increment);
    try {
      const res = await fetch(`${API_BASE_URL}/api/medicines/${med.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: med.name,
          batch_number: med.batch_number,
          manufacturing_date: new Date(med.manufacturing_date).toISOString().split('T')[0],
          expiry_date: new Date(med.expiry_date).toISOString().split('T')[0],
          quantity: newQty,
          min_stock_level: med.min_stock_level,
          price: parseFloat(med.price),
          supplier_name: med.supplier_name || '',
          supplier_email: med.supplier_email || '',
          supplier_phone: med.supplier_phone || '',
          purchase_date: new Date(med.purchase_date).toISOString().split('T')[0],
          userId: user.uid
        })
      });

      if (!res.ok) throw new Error('Failed to update stock quantity.');
    } catch (err) {
      alert(`Error updating stock: ${err.message}`);
    }
  };

  // Expiry timeline calculations
  const getShelfLifeProgress = (mfg, exp) => {
    const mfgDate = new Date(mfg);
    const expDate = new Date(exp);
    const now = new Date();

    if (now >= expDate) return 100;
    if (now <= mfgDate) return 0;

    const totalLife = expDate.getTime() - mfgDate.getTime();
    const elapsedLife = now.getTime() - mfgDate.getTime();

    return Math.min(100, Math.max(0, Math.round((elapsedLife / totalLife) * 100)));
  };

  // Filters logic
  const getMedicineStatus = (med) => {
    const expiry = new Date(med.expiry_date);
    const now = new Date();
    
    if (expiry <= now) return 'expired';
    if (med.quantity === 0) return 'out_of_stock';
    if (med.quantity <= med.min_stock_level) return 'low_stock';
    
    const diffDays = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
    if (diffDays <= 60) return 'near_expiry';
    
    return 'normal';
  };

  // Calculate dynamic dashboard banner metrics
  const totalCapital = medicines.reduce((sum, m) => sum + (parseFloat(m.price) * m.quantity), 0);
  const activeBatchesCount = medicines.filter(m => m.quantity > 0).length;
  const healthyBatchesCount = medicines.filter(m => {
    const status = getMedicineStatus(m);
    return status === 'normal' || status === 'near_expiry';
  }).length;
  const healthScore = medicines.length > 0 ? Math.round((healthyBatchesCount / medicines.length) * 100) : 100;
  const lowStockCount = medicines.filter(m => getMedicineStatus(m) === 'low_stock' || getMedicineStatus(m) === 'out_of_stock').length;
  const expiredCount = medicines.filter(m => getMedicineStatus(m) === 'expired').length;

  const filteredMedicines = medicines.filter(med => {
    // Search filter
    const matchesSearch = 
      med.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      med.batch_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (med.supplier_name && med.supplier_name.toLowerCase().includes(searchTerm.toLowerCase()));

    // Status filter
    const status = getMedicineStatus(med);
    let matchesStatus = true;
    if (statusFilter === 'low_stock') {
      matchesStatus = status === 'low_stock' || status === 'out_of_stock';
    } else if (statusFilter === 'expired') {
      matchesStatus = status === 'expired';
    } else if (statusFilter === 'near_expiry') {
      matchesStatus = status === 'near_expiry';
    } else if (statusFilter === 'normal') {
      matchesStatus = status === 'normal';
    }

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="inventory-container">
      <div className="page-header">
        <div className="page-title">
          <h1>Medicine Inventory</h1>
          <p>Manage medicine batches, stock levels, and supplier profiles</p>
        </div>
        <button onClick={handleAddClick} className="btn btn-primary">
          <Plus size={18} />
          Add Medicine
        </button>
      </div>

      {/* Mindful Inventory Dashboard Banner */}
      <div className="stats-grid" style={{ marginBottom: '1.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        
        <div className="glass-card stat-card" style={{ padding: '1rem 1.25rem' }}>
          <div className="stat-info">
            <h3 style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total Capital Tied Up</h3>
            <div className="stat-value" style={{ color: 'var(--primary)', fontSize: '1.35rem', fontWeight: 700, marginTop: '0.15rem' }}>
              ${totalCapital.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className="stat-icon primary" style={{ padding: '0.5rem', borderRadius: '8px' }}>
            <DollarSign size={18} />
          </div>
        </div>

        <div className="glass-card stat-card" style={{ padding: '1rem 1.25rem' }}>
          <div className="stat-info">
            <h3 style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Active Batches</h3>
            <div className="stat-value" style={{ color: '#10b981', fontSize: '1.35rem', fontWeight: 700, marginTop: '0.15rem' }}>
              {activeBatchesCount} <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-muted)' }}>batches</span>
            </div>
          </div>
          <div className="stat-icon secondary" style={{ padding: '0.5rem', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
            <Boxes size={18} />
          </div>
        </div>

        <div className="glass-card stat-card" style={{ padding: '1rem 1.25rem' }}>
          <div className="stat-info">
            <h3 style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Inventory Health Index</h3>
            <div className="stat-value" style={{ color: healthScore >= 80 ? 'var(--secondary)' : 'var(--warning)', fontSize: '1.35rem', fontWeight: 700, marginTop: '0.15rem' }}>
              {healthScore}%
            </div>
          </div>
          <div className="stat-icon secondary" style={{ padding: '0.5rem', borderRadius: '8px' }}>
            <HeartPulse size={18} />
          </div>
        </div>

        <div className="glass-card stat-card" style={{ padding: '1rem 1.25rem' }}>
          <div className="stat-info">
            <h3 style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Critical Low Stock</h3>
            <div className="stat-value" style={{ color: lowStockCount > 0 ? 'var(--warning)' : 'inherit', fontSize: '1.35rem', fontWeight: 700, marginTop: '0.15rem' }}>
              {lowStockCount} <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-muted)' }}>items</span>
            </div>
          </div>
          <div className="stat-icon warning" style={{ padding: '0.5rem', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.1)', color: 'var(--warning)' }}>
            <AlertTriangle size={18} />
          </div>
        </div>

        <div className="glass-card stat-card" style={{ padding: '1rem 1.25rem' }}>
          <div className="stat-info">
            <h3 style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Expired Batches</h3>
            <div className="stat-value" style={{ color: expiredCount > 0 ? 'var(--danger)' : 'inherit', fontSize: '1.35rem', fontWeight: 700, marginTop: '0.15rem' }}>
              {expiredCount} <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-muted)' }}>batches</span>
            </div>
          </div>
          <div className="stat-icon danger" style={{ padding: '0.5rem', borderRadius: '8px' }}>
            <AlertOctagon size={18} />
          </div>
        </div>

      </div>

      {/* Filter and Search Row */}
      <div className="glass-card filters-row" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', gap: '1rem', flexGrow: 1, maxWeight: '500px' }}>
          <div className="search-input-wrapper" style={{ flexGrow: 1 }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="form-input"
              style={{ paddingLeft: '40px' }}
              placeholder="Search by name, batch, or supplier..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button 
            onClick={() => setStatusFilter('all')} 
            className={`btn ${statusFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
          >
            All
          </button>
          <button 
            onClick={() => setStatusFilter('low_stock')} 
            className={`btn ${statusFilter === 'low_stock' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', borderColor: 'rgba(245, 158, 11, 0.3)' }}
          >
            Low Stock
          </button>
          <button 
            onClick={() => setStatusFilter('near_expiry')} 
            className={`btn ${statusFilter === 'near_expiry' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', borderColor: 'rgba(14, 165, 233, 0.3)' }}
          >
            Near Expiry
          </button>
          <button 
            onClick={() => setStatusFilter('expired')} 
            className={`btn ${statusFilter === 'expired' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', borderColor: 'rgba(239, 68, 68, 0.3)' }}
          >
            Expired
          </button>

          <span style={{ height: '20px', borderLeft: '1px solid rgba(255,255,255,0.1)', margin: '0 0.25rem' }} />

          {/* Table/Grid togglers */}
          <div style={{ display: 'inline-flex', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '2px' }}>
            <button 
              onClick={() => setViewMode('table')} 
              style={{ background: viewMode === 'table' ? 'var(--primary)' : 'transparent', border: 'none', padding: '0.4rem', borderRadius: '6px', color: viewMode === 'table' ? '#0f172a' : 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              title="Table View"
            >
              <List size={16} />
            </button>
            <button 
              onClick={() => setViewMode('grid')} 
              style={{ background: viewMode === 'grid' ? 'var(--primary)' : 'transparent', border: 'none', padding: '0.4rem', borderRadius: '6px', color: viewMode === 'grid' ? '#0f172a' : 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              title="Grid View"
            >
              <LayoutGrid size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Main List Rendering */}
      {filteredMedicines.length === 0 ? (
        <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          No medicines match the selected filter criteria.
        </div>
      ) : viewMode === 'table' ? (
        /* Table Layout View */
        <div className="glass-card table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Medicine / Batch</th>
                <th>Dates & Shelf Life</th>
                <th>Price</th>
                <th>Quantity Adjuster</th>
                <th>Supplier Details</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredMedicines.map(med => {
                const status = getMedicineStatus(med);
                let badgeClass = 'success';
                let badgeText = 'Normal';

                if (status === 'expired') { badgeClass = 'expired'; badgeText = 'Expired'; }
                else if (status === 'out_of_stock') { badgeClass = 'danger'; badgeText = 'Out of Stock'; }
                else if (status === 'low_stock') { badgeClass = 'warning'; badgeText = 'Low Stock'; }
                else if (status === 'near_expiry') { badgeClass = 'warning'; badgeText = 'Near Expiry'; }

                const elapsedProgress = getShelfLifeProgress(med.manufacturing_date, med.expiry_date);

                return (
                  <tr key={med.id}>
                    <td data-label="Medicine / Batch">
                      <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{med.name}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>Batch: {med.batch_number}</div>
                    </td>
                    <td data-label="Dates & Shelf Life">
                      <div style={{ fontSize: '0.8rem' }}>Mfg: {new Date(med.manufacturing_date).toLocaleDateString()}</div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: status === 'expired' || status === 'near_expiry' ? 'var(--danger)' : 'var(--text-muted)', marginTop: '0.15rem' }}>
                        Exp: {new Date(med.expiry_date).toLocaleDateString()}
                      </div>
                      
                      {/* Mini visual shelf life timeline */}
                      {status !== 'expired' && (
                        <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', marginTop: '0.4rem', overflow: 'hidden' }} title={`Shelf Life Elapsed: ${elapsedProgress}%`}>
                          <div style={{ width: `${elapsedProgress}%`, height: '100%', background: elapsedProgress >= 85 ? '#ef4444' : elapsedProgress >= 65 ? '#f59e0b' : '#10b981' }} />
                        </div>
                      )}
                    </td>
                    <td data-label="Price">
                      <div style={{ fontWeight: 700, color: 'var(--secondary)' }}>${parseFloat(med.price).toFixed(2)}</div>
                    </td>
                    <td data-label="Quantity Adjuster">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '1rem', fontWeight: 700, minWidth: '32px' }}>{med.quantity}</span>
                        <span className={`badge ${badgeClass}`} style={{ fontSize: '0.7rem' }}>{badgeText}</span>
                        
                        {/* Tactile restock controls */}
                        <div style={{ display: 'inline-flex', gap: '0.25rem', marginLeft: '0.5rem' }}>
                          <button 
                            onClick={() => handleQuickStockAdjust(med, -10)} 
                            disabled={med.quantity === 0}
                            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: med.quantity === 0 ? 'var(--text-muted)' : 'var(--text-main)', borderRadius: '4px', padding: '0.15rem 0.35rem', cursor: med.quantity === 0 ? 'default' : 'pointer', fontSize: '0.75rem', fontWeight: 600 }}
                            title="Reduce stock by 10"
                          >
                            -10
                          </button>
                          <button 
                            onClick={() => handleQuickStockAdjust(med, 10)} 
                            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'var(--text-main)', borderRadius: '4px', padding: '0.15rem 0.35rem', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}
                            title="Refill stock by 10"
                          >
                            +10
                          </button>
                        </div>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Threshold: {med.min_stock_level}</div>
                    </td>
                    <td data-label="Supplier Details">
                      {med.supplier_name ? (
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem' }}><User size={12} /> {med.supplier_name}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}><Mail size={11} /> {med.supplier_email}</div>
                          {med.supplier_phone && <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}><Phone size={11} /> {med.supplier_phone}</div>}
                        </div>
                      ) : (
                        <span style={{ fontStyle: 'italic', color: 'var(--text-muted)', fontSize: '0.85rem' }}>None recorded</span>
                      )}
                    </td>
                    <td data-label="Actions" style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                        <button onClick={() => handleEditClick(med)} className="btn btn-secondary" style={{ padding: '0.4rem' }}>
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => handleDeleteClick(med.id)} className="btn btn-danger" style={{ padding: '0.4rem', background: 'rgba(239,68,68,0.15)', color: 'var(--danger)' }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* Tactile Grid Layout View */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
          {filteredMedicines.map(med => {
            const status = getMedicineStatus(med);
            let badgeClass = 'success';
            let badgeText = 'Normal';

            if (status === 'expired') { badgeClass = 'expired'; badgeText = 'Expired'; }
            else if (status === 'out_of_stock') { badgeClass = 'danger'; badgeText = 'Out of Stock'; }
            else if (status === 'low_stock') { badgeClass = 'warning'; badgeText = 'Low Stock'; }
            else if (status === 'near_expiry') { badgeClass = 'warning'; badgeText = 'Near Expiry'; }

            const elapsedProgress = getShelfLifeProgress(med.manufacturing_date, med.expiry_date);
            const stockPct = Math.min(100, Math.round((med.quantity / Math.max(med.min_stock_level * 3, med.quantity)) * 100));

            return (
              <div 
                key={med.id} 
                className="glass-card" 
                style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '1rem',
                  borderTop: `4px solid var(--${badgeClass === 'expired' ? 'text-muted' : badgeClass})`,
                  position: 'relative'
                }}
              >
                
                {/* Actions overlay */}
                <div style={{ position: 'absolute', top: '16px', right: '16px', display: 'flex', gap: '0.4rem' }}>
                  <button onClick={() => handleEditClick(med)} style={{ background: 'rgba(255,255,255,0.04)', border: 'none', padding: '0.35rem', borderRadius: '6px', color: 'var(--primary)', cursor: 'pointer' }}>
                    <Edit2 size={12} />
                  </button>
                  <button onClick={() => handleDeleteClick(med.id)} style={{ background: 'rgba(239,68,68,0.1)', border: 'none', padding: '0.35rem', borderRadius: '6px', color: 'var(--danger)', cursor: 'pointer' }}>
                    <Trash2 size={12} />
                  </button>
                </div>

                <div>
                  <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, paddingRight: '56px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {med.name}
                  </h2>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.25rem' }}>
                    <span className="badge normal" style={{ background: 'rgba(255,255,255,0.05)', color: '#cbd5e1', fontSize: '0.7rem' }}>Batch: {med.batchNumber || med.batch_number}</span>
                    <span className={`badge ${badgeClass}`} style={{ fontSize: '0.7rem' }}>{badgeText}</span>
                  </div>
                </div>

                {/* Expiry Shelf Life progress meter */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}><CalendarDays size={12} /> Expiry Timeline</span>
                    <span style={{ fontWeight: 600, color: status === 'expired' ? 'var(--danger)' : 'inherit' }}>
                      {status === 'expired' ? 'Expired' : `${100 - elapsedProgress}% shelf life left`}
                    </span>
                  </div>
                  <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${elapsedProgress}%`, height: '100%', background: elapsedProgress >= 85 ? '#ef4444' : elapsedProgress >= 65 ? '#f59e0b' : '#10b981' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    <span>Mfg: {new Date(med.manufacturing_date).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span>
                    <span>Exp: {new Date(med.expiry_date).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span>
                  </div>
                </div>

                {/* Stock Level progress meter */}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                    <span>Stock Level Gauge</span>
                    <strong>{med.quantity} units</strong>
                  </div>
                  <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${stockPct}%`, height: '100%', background: med.quantity === 0 ? '#ef4444' : med.quantity <= med.min_stock_level ? '#f59e0b' : '#10b981' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    <span>Threshold: {med.min_stock_level}</span>
                    <span>Price: <strong>${parseFloat(med.price).toFixed(2)} ea</strong></span>
                  </div>
                </div>

                {/* Tactile Restock Buttons */}
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between', 
                  background: 'rgba(255,255,255,0.02)', 
                  border: '1px solid rgba(255,255,255,0.04)',
                  padding: '0.5rem 0.75rem', 
                  borderRadius: '8px',
                  marginTop: 'auto'
                }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Quick Refill</span>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button 
                      onClick={() => handleQuickStockAdjust(med, -10)} 
                      disabled={med.quantity === 0}
                      className="btn btn-secondary"
                      style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                    >
                      <MinusCircle size={12} /> -10
                    </button>
                    <button 
                      onClick={() => handleQuickStockAdjust(med, 10)} 
                      className="btn btn-secondary"
                      style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                    >
                      <PlusCircle size={12} /> +10
                    </button>
                  </div>
                </div>

                {/* Supplier Footer details */}
                {med.supplier_name && (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '0.65rem', fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                    <div style={{ fontWeight: 600 }}>Vendor: {med.supplier_name}</div>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{med.supplier_email}</div>
                  </div>
                )}

              </div>
            );
          })}
        </div>
      )}

      {/* CRUD Add/Edit Overlay Sheet Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="glass-card modal-content" style={{ padding: '2rem' }}>
            <div className="modal-header">
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                {editingMed ? `Edit Medicine batch: ${editingMed.name}` : 'Register New Medicine Batch'}
              </h2>
              <button onClick={() => setShowModal(false)} className="close-btn">
                <X size={20} />
              </button>
            </div>

            {formError && (
              <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', padding: '0.75rem', color: '#feb2b2', borderRadius: '8px', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
                {formError}
              </div>
            )}

            <form onSubmit={handleFormSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label>Medicine Name *</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    placeholder="e.g. Paracetamol 500mg"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>Batch Number *</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    placeholder="e.g. B101"
                    value={formData.batch_number}
                    onChange={(e) => setFormData({ ...formData, batch_number: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>Unit Price ($) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    className="form-input"
                    placeholder="e.g. 2.50"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                  />
                </div>

                <div className="form-group">
                  <label>Quantity *</label>
                  <input
                    type="number"
                    min="0"
                    required
                    className="form-input"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })}
                  />
                </div>

                <div className="form-group">
                  <label>Min Stock Level (Alert Threshold) *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    className="form-input"
                    value={formData.min_stock_level}
                    onChange={(e) => setFormData({ ...formData, min_stock_level: parseInt(e.target.value) || 10 })}
                  />
                </div>

                <div className="form-group">
                  <label>Manufacturing Date *</label>
                  <input
                    type="date"
                    required
                    className="form-input"
                    value={formData.manufacturing_date}
                    onChange={(e) => setFormData({ ...formData, manufacturing_date: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>Expiry Date *</label>
                  <input
                    type="date"
                    required
                    className="form-input"
                    value={formData.expiry_date}
                    onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>Purchase Date *</label>
                  <input
                    type="date"
                    required
                    className="form-input"
                    value={formData.purchase_date}
                    onChange={(e) => setFormData({ ...formData, purchase_date: e.target.value })}
                  />
                </div>

                 <div className="form-group" style={{ gridColumn: 'span 2', marginTop: '0.5rem', borderTop: '1px dashed var(--glass-border)', paddingTop: '1rem' }}>
                   <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>Supplier Information</span>
                 </div>

                 <div className="form-group" style={{ gridColumn: 'span 2' }}>
                   <label>Select Registered Supplier</label>
                   <select
                     className="form-input"
                     value={selectedSupplierId}
                     onChange={(e) => handleSupplierSelect(e.target.value)}
                   >
                     <option value="custom">-- Enter Custom / Unregistered Vendor --</option>
                     {suppliers.map(s => (
                       <option key={s.id} value={s.id}>{s.name}</option>
                     ))}
                   </select>
                 </div>

                 <div className="form-group">
                   <label>Supplier Name</label>
                   <input
                     type="text"
                     className="form-input"
                     placeholder="e.g. Apex Pharma"
                     value={formData.supplier_name}
                     onChange={(e) => setFormData({ ...formData, supplier_name: e.target.value })}
                     disabled={selectedSupplierId !== 'custom'}
                   />
                 </div>

                 <div className="form-group">
                   <label>Supplier Email</label>
                   <input
                     type="email"
                     className="form-input"
                     placeholder="e.g. sales@apex.com"
                     value={formData.supplier_email}
                     onChange={(e) => setFormData({ ...formData, supplier_email: e.target.value })}
                     disabled={selectedSupplierId !== 'custom'}
                   />
                 </div>

                 <div className="form-group" style={{ gridColumn: 'span 2' }}>
                   <label>Supplier Phone</label>
                   <input
                     type="text"
                     className="form-input"
                     placeholder="e.g. +1 555-0199"
                     value={formData.supplier_phone}
                     onChange={(e) => setFormData({ ...formData, supplier_phone: e.target.value })}
                     disabled={selectedSupplierId !== 'custom'}
                   />
                 </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingMed ? 'Save Changes' : 'Register Batch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
