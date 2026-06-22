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
  AlertTriangle,
  Upload,
  Download,
  FileText,
  Check,
  ShoppingCart
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { API_BASE_URL } from '../config';
import { showToast } from '../utils/toast';

export default function Inventory({ socket, user }) {
  const [medicines, setMedicines] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewMode, setViewMode] = useState('table'); // table or grid
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;
  
  // Suppliers integration
  const [suppliers, setSuppliers] = useState([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState('custom');

  // CSV Import State
  const [showImportSection, setShowImportSection] = useState(false);
  const [importMedsList, setImportMedsList] = useState([]);
  const [csvError, setCsvError] = useState('');
  const [csvSuccess, setCsvSuccess] = useState('');
  const [importing, setImporting] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  
  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingMed, setEditingMed] = useState(null);

  // Supplier Reorder PO States
  const [isReorderModalOpen, setIsReorderModalOpen] = useState(false);
  const [reorderMed, setReorderMed] = useState(null);
  const [reorderQty, setReorderQty] = useState(50);
  const [reorderError, setReorderError] = useState('');
  const [reorderSuccess, setReorderSuccess] = useState('');
  const [companySettings, setCompanySettings] = useState(null);
  
  // Form State
  const initialFormState = {
    name: '',
    batch_number: '',
    barcode: '',
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

  // CSV File parser helper
  const handleCSVFileParse = (file) => {
    setCsvError('');
    setCsvSuccess('');
    setImportMedsList([]);

    if (!file.name.endsWith('.csv')) {
      setCsvError('Please upload a valid CSV file (.csv).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        // Standard CSV split by newlines
        const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
        if (lines.length < 2) {
          throw new Error('CSV file is empty or missing data rows.');
        }

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
        const requiredHeaders = ['name', 'batch_number', 'expiry_date', 'quantity', 'price'];
        
        // Check if all required headers exist
        const missing = requiredHeaders.filter(req => !headers.includes(req));
        if (missing.length > 0) {
          throw new Error(`Missing required CSV headers: ${missing.join(', ')}`);
        }

        const parsedList = [];
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
          if (values.length < headers.length) continue;

          const rowData = {};
          headers.forEach((header, index) => {
            rowData[header] = values[index];
          });

          // Validate fields and assign types
          const qty = parseInt(rowData.quantity) || 0;
          const priceVal = parseFloat(rowData.price) || 0;
          const minStock = parseInt(rowData.min_stock_level) || 10;
          
          if (!rowData.name || !rowData.batch_number || !rowData.expiry_date) {
            throw new Error(`Row ${i} has empty required fields (name, batch_number, or expiry_date).`);
          }

          parsedList.push({
            name: rowData.name,
            batch_number: rowData.batch_number,
            barcode: rowData.barcode || '',
            manufacturing_date: rowData.manufacturing_date || new Date().toISOString().split('T')[0],
            expiry_date: rowData.expiry_date,
            quantity: qty,
            min_stock_level: minStock,
            price: priceVal,
            supplier_name: rowData.supplier_name || '',
            supplier_email: rowData.supplier_email || '',
            supplier_phone: rowData.supplier_phone || '',
            purchase_date: rowData.purchase_date || new Date().toISOString().split('T')[0]
          });
        }

        setImportMedsList(parsedList);
        setCsvSuccess(`Successfully parsed ${parsedList.length} medicine records! Click 'Confirm Import' to save them.`);
      } catch (err) {
        setCsvError(`CSV Parsing Error: ${err.message}`);
      }
    };

    reader.onerror = () => {
      setCsvError('Failed to read file.');
    };
    
    reader.readAsText(file);
  };

  // Confirm CSV bulk import and save to postgresql
  const handleConfirmBatchImport = async () => {
    if (importMedsList.length === 0) return;
    setImporting(true);
    setCsvError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/medicines/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          medicines: importMedsList,
          userId: user.uid
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Batch submission failed');
      }

      setCsvSuccess(`Successfully imported ${importMedsList.length} medicines!`);
      setImportMedsList([]);
      setShowImportSection(false);
      // Refresh inventory list
      fetchMedicines();
    } catch (err) {
      setCsvError(`Import Error: ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

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

  const fetchCompanySettings = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/companies/settings`);
      if (res.ok) {
        const data = await res.json();
        setCompanySettings(data);
      }
    } catch (err) {
      console.error('Error fetching company settings in Inventory:', err.message);
    }
  };

  const handleReorderClick = (med) => {
    setReorderMed(med);
    const suggested = Math.max(50, med.min_stock_level * 2);
    setReorderQty(suggested);
    setIsReorderModalOpen(true);
    setReorderSuccess('');
    setReorderError('');
  };

  const handleSendEmailPO = () => {
    if (!reorderMed || !reorderMed.supplier_email) return;
    try {
      const companyName = companySettings?.name || user.email.split('@')[0] + ' Pharmacy';
      const subject = encodeURIComponent(`Purchase Order request: ${reorderMed.name} (Batch: ${reorderMed.batch_number})`);
      const body = encodeURIComponent(
        `Dear ${reorderMed.supplier_name || 'Supplier'},\n\n` +
        `This is a purchase order from ${companyName}.\n\n` +
        `Please arrange restock of the following medicine:\n` +
        `- Medicine Name: ${reorderMed.name}\n` +
        `- Batch Number: ${reorderMed.batch_number}\n` +
        `- Quantity Requested: ${reorderQty} units\n` +
        `- Unit Price agreed: $${parseFloat(reorderMed.price).toFixed(2)}\n` +
        `- Total Estimated Cost: $${(reorderQty * parseFloat(reorderMed.price)).toFixed(2)}\n\n` +
        `Please send us the delivery details and invoice at your earliest convenience.\n\n` +
        `Best regards,\n` +
        `${user.email}\n` +
        `${companyName}`
      );
      window.location.href = `mailto:${reorderMed.supplier_email}?subject=${subject}&body=${body}`;
      setReorderSuccess('Email client opened successfully!');
      
      // Log audit trail
      fetch(`${API_BASE_URL}/api/audit-logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType: 'PO_EMAIL_GENERATE',
          userId: user.uid
        })
      }).catch(e => console.error(e));
    } catch (err) {
      setReorderError('Failed to open email client: ' + err.message);
    }
  };

  const handleDownloadPDFPO = () => {
    if (!reorderMed) return;
    try {
      const companyName = companySettings?.name || 'PharmaTrack Workspace';
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const primaryColor = companySettings?.theme_color || '#0ea5e9';
      
      // Draw branded header strip
      doc.setFillColor(primaryColor);
      doc.rect(0, 0, 210, 15, 'F');

      // Title
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text('PURCHASE ORDER', 15, 10);

      // Workspace / Sender Details
      doc.setTextColor(51, 65, 85);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`From:\n${companyName}\nEmail: ${user.email}`, 15, 25);

      // Supplier Details
      doc.text(
        `To:\n${reorderMed.supplier_name || 'N/A'}\nEmail: ${reorderMed.supplier_email || 'N/A'}\nPhone: ${reorderMed.supplier_phone || 'N/A'}`,
        120, 25
      );

      // Divider Line
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.5);
      doc.line(15, 50, 195, 50);

      // PO Metadata
      doc.setFont('helvetica', 'bold');
      doc.text('Purchase Order Details', 15, 58);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`PO Number: PO-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`, 15, 64);
      doc.text(`Date Issued: ${new Date().toLocaleDateString()}`, 15, 69);
      doc.text(`Status: Pending Approval`, 15, 74);

      // Table Header
      doc.setFillColor(248, 250, 252);
      doc.rect(15, 83, 180, 8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.text('Item Description', 18, 88);
      doc.text('Batch', 90, 88);
      doc.text('Qty', 135, 88, { align: 'right' });
      doc.text('Unit Price', 165, 88, { align: 'right' });
      doc.text('Total', 190, 88, { align: 'right' });

      // Table Row
      doc.setFont('helvetica', 'normal');
      doc.text(reorderMed.name, 18, 98);
      doc.text(reorderMed.batch_number, 90, 98);
      doc.text(reorderQty.toString(), 135, 98, { align: 'right' });
      doc.text(`$${parseFloat(reorderMed.price).toFixed(2)}`, 165, 98, { align: 'right' });
      
      const totalPrice = (reorderQty * parseFloat(reorderMed.price)).toFixed(2);
      doc.text(`$${totalPrice}`, 190, 98, { align: 'right' });

      // Line
      doc.line(15, 104, 195, 104);

      // Summary
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Total PO Value:', 120, 114);
      doc.text(`$${totalPrice}`, 190, 114, { align: 'right' });

      // Footer
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text('PharmaTrack Automated White-Label Purchase Order.', 105, 275, { align: 'center' });

      doc.save(`po-${reorderMed.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}.pdf`);
      setReorderSuccess('PO PDF downloaded successfully!');

      // Log audit trail
      fetch(`${API_BASE_URL}/api/audit-logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType: 'PO_PDF_GENERATE',
          userId: user.uid
        })
      }).catch(e => console.error(e));
    } catch (err) {
      setReorderError('Failed to generate PO PDF: ' + err.message);
    }
  };

  // Reset page when search or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  useEffect(() => {
    fetchMedicines();
    fetchSuppliers();
    fetchCompanySettings();

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
      showToast(`Error deleting: ${err.message}`, 'error');
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
      showToast(`Error updating stock: ${err.message}`, 'error');
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

  const totalPages = Math.ceil(filteredMedicines.length / itemsPerPage);
  const paginatedMedicines = filteredMedicines.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="inventory-container">
      <div className="page-header">
        <div className="page-title">
          <h1>Medicine Inventory</h1>
          <p>Manage medicine batches, stock levels, and supplier profiles</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button 
            onClick={() => {
              if (!navigator.onLine) return;
              setShowImportSection(!showImportSection);
              setCsvError('');
              setCsvSuccess('');
              setImportMedsList([]);
            }} 
            disabled={!navigator.onLine}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', opacity: !navigator.onLine ? 0.5 : 1, cursor: !navigator.onLine ? 'not-allowed' : 'pointer' }}
          >
            <Upload size={16} />
            Import CSV
          </button>
          <button 
            onClick={() => {
              if (!navigator.onLine) return;
              handleAddClick();
            }} 
            disabled={!navigator.onLine}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', opacity: !navigator.onLine ? 0.5 : 1, cursor: !navigator.onLine ? 'not-allowed' : 'pointer' }}
          >
            <Plus size={18} />
            Add Medicine
          </button>
        </div>
      </div>

      {/* CSV Import Overlay Box */}
      {showImportSection && (
        <div 
          className="glass-card" 
          style={{ 
            padding: '1.5rem', 
            marginBottom: '1.5rem',
            border: isDragOver ? '2px dashed var(--primary)' : '2px dashed rgba(255,255,255,0.15)',
            background: isDragOver ? 'rgba(14,165,233,0.05)' : 'rgba(255,255,255,0.01)',
            transition: 'all 0.2s ease',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            alignItems: 'center',
            textAlign: 'center'
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
              handleCSVFileParse(e.dataTransfer.files[0]);
            }
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
            <FileText size={40} style={{ color: isDragOver ? 'var(--primary)' : 'var(--text-muted)', marginBottom: '0.25rem' }} />
            <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Bulk Import Medicine Batches</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: '400px' }}>
              Drag and drop your medicines CSV template file here, or click to upload.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
            <input 
              type="file" 
              accept=".csv" 
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleCSVFileParse(e.target.files[0]);
                }
              }}
              style={{ display: 'none' }}
              id="csv-file-input"
            />
            <label htmlFor="csv-file-input" className="btn btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.8rem', cursor: 'pointer' }}>
              Browse Files
            </label>

            {/* Template download link */}
            <a 
              href="data:text/csv;charset=utf-8,name,batch_number,barcode,expiry_date,quantity,price,min_stock_level,manufacturing_date,supplier_name,supplier_email%0AAmoxicillin%20250mg,AMX002,1234567890,2027-12-31,100,4.50,15,2025-12-01,AlphaDistributors,alpha@dist.com" 
              download="pharmatrack_import_template.csv"
              style={{ fontSize: '0.75rem', color: 'var(--primary)', textDecoration: 'underline', marginTop: '0.25rem' }}
            >
              Download CSV Import Template
            </a>
          </div>

          {csvError && (
            <div style={{ fontSize: '0.85rem', color: '#f87171', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '0.5rem 1rem', borderRadius: '6px' }}>
              {csvError}
            </div>
          )}

          {csvSuccess && (
            <div style={{ fontSize: '0.85rem', color: '#34d399', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '0.5rem 1rem', borderRadius: '6px' }}>
              {csvSuccess}
            </div>
          )}

          {importMedsList.length > 0 && (
            <div style={{ width: '100%', maxWidth: '600px', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ maxHeight: '150px', overflowY: 'auto', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '6px', textAlign: 'left', background: 'rgba(0,0,0,0.2)' }}>
                <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <th style={{ padding: '0.4rem 0.6rem' }}>Medicine</th>
                      <th style={{ padding: '0.4rem 0.6rem' }}>Batch</th>
                      <th style={{ padding: '0.4rem 0.6rem' }}>Qty</th>
                      <th style={{ padding: '0.4rem 0.6rem' }}>Price</th>
                      <th style={{ padding: '0.4rem 0.6rem' }}>Expiry</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importMedsList.map((m, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                        <td style={{ padding: '0.4rem 0.6rem' }}>{m.name}</td>
                        <td style={{ padding: '0.4rem 0.6rem' }}>{m.batch_number}</td>
                        <td style={{ padding: '0.4rem 0.6rem' }}>{m.quantity}</td>
                        <td style={{ padding: '0.4rem 0.6rem' }}>${m.price.toFixed(2)}</td>
                        <td style={{ padding: '0.4rem 0.6rem' }}>{m.expiry_date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                <button 
                  onClick={handleConfirmBatchImport} 
                  disabled={importing} 
                  className="btn btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem 1rem', fontSize: '0.8rem' }}
                >
                  <Check size={14} />
                  {importing ? 'Importing...' : 'Confirm Import'}
                </button>
                <button 
                  onClick={() => {
                    setImportMedsList([]);
                    setCsvSuccess('');
                  }} 
                  className="btn btn-secondary"
                  style={{ padding: '0.4rem 1rem', fontSize: '0.8rem' }}
                >
                  Clear
                </button>
              </div>
            </div>
          )}
        </div>
      )}

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
              {paginatedMedicines.map(med => {
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
                            disabled={med.quantity === 0 || !navigator.onLine}
                            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: (med.quantity === 0 || !navigator.onLine) ? 'var(--text-muted)' : 'var(--text-main)', borderRadius: '4px', padding: '0.15rem 0.35rem', cursor: (med.quantity === 0 || !navigator.onLine) ? 'default' : 'pointer', fontSize: '0.75rem', fontWeight: 600, opacity: !navigator.onLine ? 0.5 : 1 }}
                            title="Reduce stock by 10"
                          >
                            -10
                          </button>
                          <button 
                            onClick={() => handleQuickStockAdjust(med, 10)} 
                            disabled={!navigator.onLine}
                            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: !navigator.onLine ? 'var(--text-muted)' : 'var(--text-main)', borderRadius: '4px', padding: '0.15rem 0.35rem', cursor: !navigator.onLine ? 'default' : 'pointer', fontSize: '0.75rem', fontWeight: 600, opacity: !navigator.onLine ? 0.5 : 1 }}
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
                        {(status === 'low_stock' || status === 'out_of_stock') && (
                          <button 
                            onClick={() => handleReorderClick(med)} 
                            className="btn btn-primary" 
                            style={{ padding: '0.4rem', background: 'rgba(14,165,233,0.15)', color: 'var(--primary)' }}
                            title="Generate Reorder PO"
                          >
                            <ShoppingCart size={14} />
                          </button>
                        )}
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
          {paginatedMedicines.map(med => {
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
                  {(status === 'low_stock' || status === 'out_of_stock') && (
                    <button onClick={() => handleReorderClick(med)} style={{ background: 'rgba(14,165,233,0.1)', border: 'none', padding: '0.35rem', borderRadius: '6px', color: 'var(--primary)', cursor: 'pointer' }} title="Generate Reorder PO">
                      <ShoppingCart size={12} />
                    </button>
                  )}
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
                      disabled={med.quantity === 0 || !navigator.onLine}
                      className="btn btn-secondary"
                      style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.2rem', opacity: !navigator.onLine ? 0.5 : 1, cursor: !navigator.onLine ? 'not-allowed' : 'pointer' }}
                    >
                      <MinusCircle size={12} /> -10
                    </button>
                    <button 
                      onClick={() => handleQuickStockAdjust(med, 10)} 
                      disabled={!navigator.onLine}
                      className="btn btn-secondary"
                      style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.2rem', opacity: !navigator.onLine ? 0.5 : 1, cursor: !navigator.onLine ? 'not-allowed' : 'pointer' }}
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

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '1.5rem', padding: '1rem 0' }}>
          <button 
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
            className="btn btn-secondary"
            style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
          >
            Previous
          </button>
          <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            Page <strong>{currentPage}</strong> of {totalPages} ({filteredMedicines.length} items)
          </span>
          <button 
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
            className="btn btn-secondary"
            style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
          >
            Next
          </button>
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
                  <label>Barcode (UPC/EAN/Code39)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. 501234567890"
                    value={formData.barcode || ''}
                    onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
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

      {/* Supplier Reorder Purchase Order Modal */}
      {isReorderModalOpen && reorderMed && (
        <div className="modal-overlay" style={{ zIndex: 1000 }}>
          <div className="glass-card modal-content" style={{ maxWidth: '500px', width: '100%', padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShoppingCart size={20} style={{ color: 'var(--primary)' }} />
                <h3 style={{ margin: 0, fontWeight: 700, fontSize: '1.2rem' }}>Generate Purchase Order</h3>
              </div>
              <button 
                onClick={() => { setIsReorderModalOpen(false); setReorderMed(null); setReorderSuccess(''); setReorderError(''); }} 
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {reorderSuccess && (
              <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '8px', padding: '0.6rem 0.8rem', color: '#a7f3d0', fontSize: '0.85rem', marginBottom: '1rem', textAlign: 'center' }}>
                {reorderSuccess}
              </div>
            )}
            {reorderError && (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', padding: '0.6rem 0.8rem', color: '#fca5a5', fontSize: '0.85rem', marginBottom: '1rem', textAlign: 'center' }}>
                {reorderError}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', gap: '1rem', background: 'rgba(2, 6, 23, 0.2)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '8px', padding: '0.75rem' }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Medicine Name</span>
                  <div style={{ fontWeight: 700, fontSize: '1rem' }}>{reorderMed.name}</div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Batch: {reorderMed.batch_number}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Current Stock</span>
                  <div style={{ fontWeight: 700, fontSize: '1rem', color: reorderMed.quantity === 0 ? 'var(--danger)' : 'var(--secondary)' }}>{reorderMed.quantity} units</div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'rgba(2, 6, 23, 0.2)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '8px', padding: '0.75rem' }}>
                <div style={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Supplier Information</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{reorderMed.supplier_name || 'No Supplier Linked'}</div>
                {reorderMed.supplier_email && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    <Mail size={12} /> {reorderMed.supplier_email}
                  </div>
                )}
                {reorderMed.supplier_phone && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    <Phone size={12} /> {reorderMed.supplier_phone}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label style={{ fontSize: '0.8rem', marginBottom: '0.3rem', display: 'block' }}>Order Quantity *</label>
                <input 
                  type="number" 
                  min="1" 
                  className="form-input" 
                  style={{ fontSize: '0.9rem' }} 
                  value={reorderQty} 
                  onChange={(e) => setReorderQty(Math.max(1, parseInt(e.target.value) || 1))} 
                />
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
                  Estimated Cost: <strong style={{ color: 'var(--secondary)' }}>${(reorderQty * parseFloat(reorderMed.price)).toFixed(2)}</strong> (${parseFloat(reorderMed.price).toFixed(2)} / unit)
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button 
                type="button" 
                onClick={() => { setIsReorderModalOpen(false); setReorderMed(null); setReorderSuccess(''); setReorderError(''); }} 
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button 
                type="button" 
                onClick={handleSendEmailPO} 
                disabled={!reorderMed.supplier_email}
                className="btn btn-primary"
                style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.2)' }}
              >
                <Mail size={14} style={{ marginRight: '0.25rem' }} /> Email PO
              </button>
              <button 
                type="button" 
                onClick={handleDownloadPDFPO} 
                className="btn btn-primary"
              >
                <FileText size={14} style={{ marginRight: '0.25rem' }} /> PDF PO
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
