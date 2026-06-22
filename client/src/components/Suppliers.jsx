import React, { useEffect, useState } from 'react';
import { User, Mail, Phone, Package, Send, Plus, Edit, Trash2, MapPin, X, Save, Building, MessageSquare } from 'lucide-react';
import { API_BASE_URL } from '../config';
import { showToast } from '../utils/toast';

export default function Suppliers({ socket, user }) {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: ''
  });
  const [formError, setFormError] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);

  const fetchSuppliers = async () => {
    try {
      if (!user?.uid) return;
      const res = await fetch(`${API_BASE_URL}/api/suppliers?userId=${user.uid}`);
      if (res.ok) {
        const data = await res.json();
        setSuppliers(data);
      }
      setLoading(false);
    } catch (e) {
      console.error('Error fetching suppliers:', e.message);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();

    if (socket) {
      const handleSync = () => fetchSuppliers();
      socket.on('supplier_change', handleSync);
      socket.on('medicine_change', handleSync); // Refresh products list when medicines update
      return () => {
        socket.off('supplier_change', handleSync);
        socket.off('medicine_change', handleSync);
      };
    }
  }, [socket, user]);

  const openAddModal = () => {
    setEditingSupplier(null);
    setFormData({
      name: '',
      email: '',
      phone: '',
      address: ''
    });
    setFormError('');
    setIsModalOpen(true);
  };

  const openEditModal = (supplier) => {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name,
      email: supplier.email || '',
      phone: supplier.phone || '',
      address: supplier.address || ''
    });
    setFormError('');
    setIsModalOpen(true);
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you absolutely sure you want to delete supplier "${name}"?`)) {
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/suppliers/${id}?userId=${user.uid}`, {
        method: 'DELETE'
      });

      if (!res.ok) {
        throw new Error('Failed to delete supplier.');
      }
    } catch (err) {
      showToast(`Error deleting supplier: ${err.message}`, 'error');
    }
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setSubmitLoading(true);

    const url = editingSupplier
      ? `${API_BASE_URL}/api/suppliers/${editingSupplier.id}`
      : `${API_BASE_URL}/api/suppliers`;
    
    const method = editingSupplier ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, userId: user.uid })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save supplier details.');
      }

      setIsModalOpen(false);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitLoading(false);
    }
  };

  return (
    <div className="suppliers-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="page-title">
          <h1>Supplier Directory</h1>
          <p>Register, coordinate, and review active pharmaceutical suppliers and product lines</p>
        </div>
        <button className="btn btn-primary" onClick={openAddModal} style={{ gap: '0.4rem' }}>
          <Plus size={18} /> Add Supplier
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px', color: 'var(--text-muted)' }}>
          Loading Supplier Profiles...
        </div>
      ) : suppliers.length === 0 ? (
        <div className="glass-card" style={{ padding: '4rem 2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <Building size={48} style={{ opacity: 0.3, marginBottom: '1rem', color: 'var(--primary)' }} />
          <p style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0 0 0.5rem 0' }}>No Suppliers Registered Yet</p>
          <p style={{ fontSize: '0.875rem', margin: '0 0 1.5rem 0', color: 'var(--text-muted)' }}>
            Start by adding supplier details here to easily link them to new medicine batches.
          </p>
          <button className="btn btn-primary" onClick={openAddModal} style={{ margin: '0 auto', gap: '0.4rem' }}>
            <Plus size={16} /> Register First Supplier
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem', marginTop: '1.5rem' }}>
          {suppliers.map((sup) => (
            <div key={sup.id} className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', position: 'relative' }}>
              
              {/* Action Buttons */}
              <div style={{ position: 'absolute', top: '16px', right: '16px', display: 'flex', gap: '0.5rem' }}>
                <button 
                  onClick={() => openEditModal(sup)} 
                  style={{ background: 'rgba(255,255,255,0.05)', border: 'none', padding: '0.35rem', borderRadius: '6px', color: 'var(--primary)', cursor: 'pointer' }}
                  title="Edit Supplier"
                >
                  <Edit size={14} />
                </button>
                <button 
                  onClick={() => handleDelete(sup.id, sup.name)} 
                  style={{ background: 'rgba(239,68,68,0.1)', border: 'none', padding: '0.35rem', borderRadius: '6px', color: 'var(--danger)', cursor: 'pointer' }}
                  title="Delete Supplier"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.25rem', color: 'var(--primary)', paddingRight: '56px', wordBreak: 'break-word' }}>
                  {sup.name}
                </h2>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Authorized Pharmacy Vendor</span>
              </div>

              {/* Contact Information */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.9rem' }}>
                {sup.email && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ color: 'var(--text-muted)' }}><Mail size={15} /></div>
                    <a href={`mailto:${sup.email}`} style={{ color: 'var(--text-main)', textDecoration: 'none' }} className="hover-link">
                      {sup.email}
                    </a>
                  </div>
                )}
                
                {sup.phone && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ color: 'var(--text-muted)' }}><Phone size={15} /></div>
                    <a href={`tel:${sup.phone}`} style={{ color: 'var(--text-main)', textDecoration: 'none' }}>
                      {sup.phone}
                    </a>
                  </div>
                )}

                {sup.address && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                    <div style={{ color: 'var(--text-muted)', marginTop: '2px' }}><MapPin size={15} /></div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: '1.3' }}>
                      {sup.address}
                    </span>
                  </div>
                )}
              </div>

              {/* Supply Catalog */}
              <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '1rem', flexGrow: 1 }}>
                <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <Package size={14} /> Supplied Products ({sup.medicines?.length || 0})
                </h3>
                {sup.medicines && sup.medicines.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                    {sup.medicines.map((medName, mIdx) => (
                      <span key={mIdx} style={{ fontSize: '0.75rem', background: 'rgba(14,165,233,0.06)', border: '1px solid rgba(14,165,233,0.12)', color: '#7dd3fc', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                        {medName}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    No products cataloged in inventory.
                  </span>
                )}
              </div>

              {/* Quick Message */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                {sup.email && (
                  <a 
                    href={`mailto:${sup.email}?subject=Inquiry%20from%20Pharmacy`} 
                    className="btn btn-secondary" 
                    style={{ width: '100%', gap: '0.4rem', justifyContent: 'center' }}
                  >
                    <Send size={13} /> Send Email Catalog
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Dialog Form */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="glass-card modal-content" style={{ padding: '2rem' }}>
            <div className="modal-header">
              <h2>{editingSupplier ? 'Edit Vendor Details' : 'Register New Vendor'}</h2>
              <button 
                onClick={() => setIsModalOpen(false)} 
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {formError && (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '0.75rem', color: '#fca5a5', borderRadius: '8px', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
                {formError}
              </div>
            )}

            <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div className="form-group">
                <label>Vendor / Supplier Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Apex Pharmaceutical Corp"
                  className="form-input"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label>Contact Email</label>
                  <input
                    type="email"
                    placeholder="e.g. sales@apexpharma.com"
                    className="form-input"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Contact Phone</label>
                  <input
                    type="text"
                    placeholder="e.g. +1 (555) 019-2831"
                    className="form-input"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Physical Address / Office Details</label>
                <textarea
                  placeholder="e.g. Suite 400, Industrial Biotech Complex, Boston, MA"
                  className="form-input"
                  rows={3}
                  style={{ resize: 'none', fontFamily: 'inherit' }}
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  disabled={submitLoading}
                  style={{ gap: '0.4rem' }}
                >
                  <Save size={16} />
                  {submitLoading ? 'Saving...' : 'Save Vendor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
