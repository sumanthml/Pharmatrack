import React, { useState } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';
import { Shield, Mail, Lock, Activity, Building, User, Phone, Key, CheckCircle, Smartphone } from 'lucide-react';
import { API_BASE_URL } from '../config';
import { playScanBeep, playSuccessChime, playWarningBeep } from '../utils/sound';

export default function Login({ onAuthSuccess }) {
  const [authType, setAuthType] = useState('signin'); // 'signin', 'employee', 'company'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Company registration fields
  const [companyName, setCompanyName] = useState('');
  const [companyPhone, setCompanyPhone] = useState('');
  const [adminMobile, setAdminMobile] = useState('');

  // Employee registration fields
  const [employeeName, setEmployeeName] = useState('');
  const [employeeMobile, setEmployeeMobile] = useState('');
  const [companyPasskey, setCompanyPasskey] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [employeeRole, setEmployeeRole] = useState('employee'); // 'employee' or 'manager'

  // OTP Simulation State
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpTargetMobile, setOtpTargetMobile] = useState('');
  const [otpError, setOtpError] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [isMobileVerified, setIsMobileVerified] = useState(false);
  const [pendingFormSubmit, setPendingFormSubmit] = useState(null);
  const [currentOtp, setCurrentOtp] = useState('');

  // Success view (to display generated passkey to new Company Admins)
  const [successPasskey, setSuccessPasskey] = useState('');
  const [successCompanyName, setSuccessCompanyName] = useState('');

  const triggerOtpVerification = async (targetEmail, callback) => {
    setOtpTargetMobile(targetEmail);
    setOtpCode('');
    setOtpError('');
    setShowOtpModal(true);
    setOtpLoading(true);
    setPendingFormSubmit(() => callback);

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to dispatch verification code.');
      }
      // Play audio cue
      playScanBeep();
    } catch (err) {
      playWarningBeep();
      setOtpError(err.message);
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setOtpLoading(true);
    setOtpError('');

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: otpTargetMobile, code: otpCode })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Verification failed.');
      }

      setIsMobileVerified(true);
      setShowOtpModal(false);
      setOtpLoading(false);

      // Play success audio chime
      playSuccessChime();

      // Execute the pending registration form submit
      if (pendingFormSubmit) {
        pendingFormSubmit();
      }
    } catch (err) {
      playWarningBeep();
      setOtpError(err.message);
      setOtpLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setOtpCode('');
    setOtpError('');
    setOtpLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: otpTargetMobile })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to dispatch verification code.');
      }
      // Play audio cue
      playScanBeep();
    } catch (err) {
      playWarningBeep();
      setOtpError(err.message);
    } finally {
      setOtpLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (authType === 'signin') {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        onAuthSuccess(userCredential.user);
      } 
      else if (authType === 'company') {
        // Trigger OTP verification first if not verified
        if (!isMobileVerified) {
          setLoading(false);
          triggerOtpVerification(email, () => doCompanyRegister());
          return;
        }
        await doCompanyRegister();
      } 
      else if (authType === 'employee') {
        // Trigger OTP verification first if not verified
        if (!isMobileVerified) {
          setLoading(false);
          triggerOtpVerification(email, () => doEmployeeRegister());
          return;
        }
        await doEmployeeRegister();
      }
    } catch (err) {
      console.error(err);
      handleAuthErrors(err);
    } finally {
      setLoading(false);
    }
  };

  const doCompanyRegister = async () => {
    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      const res = await fetch(`${API_BASE_URL}/api/companies/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: user.uid,
          email: user.email,
          company_name: companyName,
          company_phone: null,
          admin_mobile: null
        })
      });

      if (!res.ok) {
        throw new Error('Failed to register company profile on backend');
      }

      const data = await res.json();
      setSuccessCompanyName(data.company.name);
      setSuccessPasskey(data.company.passkey);
      
      // Keep admin logged in
      onAuthSuccess(user);
    } catch (err) {
      handleAuthErrors(err);
    } finally {
      setLoading(false);
    }
  };

  const doEmployeeRegister = async () => {
    setLoading(true);
    try {
      // 1. Verify Company Passkey and Company Email combination
      const verifyRes = await fetch(`${API_BASE_URL}/api/companies/verify-passkey`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          passkey: companyPasskey,
          company_email: companyEmail
        })
      });

      if (!verifyRes.ok) {
        const errData = await verifyRes.json();
        throw new Error(errData.error || 'Invalid Company Passkey or Company Email.');
      }

      const { company_id } = await verifyRes.json();

      // 2. Register Firebase Auth user
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 3. Register user in PostgreSQL database
      const pgRes = await fetch(`${API_BASE_URL}/api/users/register-employee`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: user.uid,
          email: user.email,
          name: employeeName,
          mobile_number: null,
          company_id,
          role: employeeRole
        })
      });

      if (!pgRes.ok) {
        throw new Error('Failed to sync employee profile with backend database');
      }

      onAuthSuccess(user);
    } catch (err) {
      handleAuthErrors(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAuthErrors = (err) => {
    if (err.code === 'auth/email-already-in-use') {
      setError('This email is already registered.');
    } else if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
      setError('Incorrect email or password.');
    } else if (err.code === 'auth/weak-password') {
      setError('Password should be at least 6 characters.');
    } else {
      setError(err.message || 'Authentication failed. Please try again.');
    }
  };

  // If Admin registers, show them a nice success screen to celebrate onboarding & print passkey
  if (successPasskey && successCompanyName) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
        <div className="glass-card modal-content" style={{ maxWidth: '460px', padding: '2.5rem 2rem', border: '1px solid rgba(16, 185, 129, 0.3)', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifySelf: 'center', width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid var(--secondary)', color: 'var(--secondary)', justifyContent: 'center', marginBottom: '1.5rem' }}>
            <CheckCircle size={36} />
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--secondary)', marginBottom: '0.5rem' }}>Company Onboarded!</h2>
          <p style={{ color: 'var(--text-main)', fontSize: '0.95rem', marginBottom: '1.5rem' }}>
            <strong>{successCompanyName}</strong> is now registered.
          </p>

          <div style={{ background: 'rgba(2, 6, 23, 0.4)', border: '1px dashed rgba(16,185,129,0.4)', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.5rem' }}>Company Passkey</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#38bdf8', letterSpacing: '1px', fontFamily: 'monospace' }}>
              {successPasskey}
            </div>
          </div>

          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 1.5rem 0', textAlign: 'left', lineHeight: 1.5 }}>
            💡 <strong>Next Steps:</strong> We have sent this passkey to your email inbox. Share this passkey with your staff so they can onboard under your organization workspace.
          </p>

          <button
            onClick={() => onAuthSuccess(auth.currentUser)}
            className="btn btn-primary"
            style={{ width: '100%', padding: '0.8rem', borderRadius: '10px' }}
          >
            Enter Organization Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1.5rem',
      position: 'relative'
    }}>

      <div className="glass-card modal-content" style={{
        maxWidth: '460px',
        width: '100%',
        padding: '2rem 1.75rem',
        boxShadow: '0 0 40px rgba(14, 165, 233, 0.15)',
        border: '1px solid rgba(14, 165, 233, 0.2)'
      }}>
        {/* Logo and Brand */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '56px',
            height: '56px',
            borderRadius: '14px',
            background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.2) 0%, rgba(16, 185, 129, 0.1) 100%)',
            border: '1px solid rgba(14, 165, 233, 0.3)',
            marginBottom: '0.75rem',
            color: '#0ea5e9'
          }}>
            <Activity size={28} style={{ animation: 'pulse 2s infinite' }} />
          </div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: '0.2rem' }}>PharmaTrack</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Enterprise Multi-Company Inventory Management
          </p>
        </div>

        {/* Tab Selection */}
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', marginBottom: '1.5rem', paddingBottom: '0.25rem' }}>
          <button
            onClick={() => { setAuthType('signin'); setError(''); setIsMobileVerified(false); }}
            style={{ flex: 1, padding: '0.5rem 0', background: 'transparent', border: 'none', color: authType === 'signin' ? 'var(--primary)' : 'var(--text-muted)', fontWeight: authType === 'signin' ? 700 : 500, fontSize: '0.85rem', borderBottom: authType === 'signin' ? '2px solid var(--primary)' : 'none', cursor: 'pointer' }}
          >
            Sign In
          </button>
          <button
            onClick={() => { setAuthType('employee'); setError(''); setIsMobileVerified(false); }}
            style={{ flex: 1, padding: '0.5rem 0', background: 'transparent', border: 'none', color: authType === 'employee' ? 'var(--primary)' : 'var(--text-muted)', fontWeight: authType === 'employee' ? 700 : 500, fontSize: '0.85rem', borderBottom: authType === 'employee' ? '2px solid var(--primary)' : 'none', cursor: 'pointer' }}
          >
            Join Organization
          </button>
          <button
            onClick={() => { setAuthType('company'); setError(''); setIsMobileVerified(false); }}
            style={{ flex: 1, padding: '0.5rem 0', background: 'transparent', border: 'none', color: authType === 'company' ? 'var(--primary)' : 'var(--text-muted)', fontWeight: authType === 'company' ? 700 : 500, fontSize: '0.85rem', borderBottom: authType === 'company' ? '2px solid var(--primary)' : 'none', cursor: 'pointer' }}
          >
            Register Org
          </button>
        </div>

        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            borderRadius: '8px',
            padding: '0.6rem 0.8rem',
            color: '#fca5a5',
            fontSize: '0.8rem',
            marginBottom: '1rem',
            textAlign: 'center'
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Company Admin Registration Fields */}
          {authType === 'company' && (
            <>
              <div className="form-group" style={{ marginBottom: '0.85rem' }}>
                <label style={{ fontSize: '0.75rem', marginBottom: '0.3rem' }}>Organization Name *</label>
                <div style={{ position: 'relative' }}>
                  <Building size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    required
                    className="form-input"
                    style={{ paddingLeft: '38px', fontSize: '0.85rem' }}
                    placeholder="e.g. ABC Mining Corporation"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                  />
                </div>
              </div>


            </>
          )}

          {/* Employee / Staff Registration Fields */}
          {authType === 'employee' && (
            <>
              <div className="form-group" style={{ marginBottom: '0.85rem' }}>
                <label style={{ fontSize: '0.75rem', marginBottom: '0.3rem' }}>Full Name *</label>
                <div style={{ position: 'relative' }}>
                  <User size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    required
                    className="form-input"
                    style={{ paddingLeft: '38px', fontSize: '0.85rem' }}
                    placeholder="e.g. John Doe"
                    value={employeeName}
                    onChange={(e) => setEmployeeName(e.target.value)}
                  />
                </div>
              </div>



              <div className="form-group" style={{ marginBottom: '0.85rem' }}>
                <label style={{ fontSize: '0.75rem', marginBottom: '0.3rem' }}>Company Passkey *</label>
                <div style={{ position: 'relative' }}>
                  <Key size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    required
                    className="form-input"
                    style={{ paddingLeft: '38px', fontSize: '0.85rem', fontFamily: 'monospace' }}
                    placeholder="E.g. ABCM-8374-XYZ"
                    value={companyPasskey}
                    onChange={(e) => setCompanyPasskey(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '0.85rem' }}>
                <label style={{ fontSize: '0.75rem', marginBottom: '0.3rem' }}>Company Admin Email *</label>
                <div style={{ position: 'relative' }}>
                  <Mail size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="email"
                    required
                    className="form-input"
                    style={{ paddingLeft: '38px', fontSize: '0.85rem' }}
                    placeholder="admin@company.com"
                    value={companyEmail}
                    onChange={(e) => setCompanyEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '0.85rem' }}>
                <label style={{ fontSize: '0.75rem', marginBottom: '0.3rem' }}>Your Target Role *</label>
                <div style={{ position: 'relative' }}>
                  <Shield size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <select
                    className="form-input"
                    style={{ paddingLeft: '38px', fontSize: '0.85rem', appearance: 'none' }}
                    value={employeeRole}
                    onChange={(e) => setEmployeeRole(e.target.value)}
                  >
                    <option value="employee">Pharmacist / Employee</option>
                    <option value="manager">Inventory Manager</option>
                  </select>
                </div>
              </div>
            </>
          )}

          {/* Standard Fields: Email & Password */}
          <div className="form-group" style={{ marginBottom: '0.85rem' }}>
            <label style={{ fontSize: '0.75rem', marginBottom: '0.3rem' }}>
              {authType === 'signin' ? 'Email Address' : authType === 'company' ? 'Admin Login Email *' : 'Employee Login Email *'}
            </label>
            <div style={{ position: 'relative' }}>
              <Mail size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="email"
                required
                className="form-input"
                style={{ paddingLeft: '38px', fontSize: '0.85rem' }}
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label style={{ fontSize: '0.75rem', marginBottom: '0.3rem' }}>Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="password"
                required
                className="form-input"
                style={{ paddingLeft: '38px', fontSize: '0.85rem' }}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{ width: '100%', padding: '0.8rem', borderRadius: '10px', fontSize: '0.9rem', fontWeight: 600, display: 'flex', justifyContent: 'center', alignItems: 'center' }}
          >
            {loading ? 'Processing...' : authType === 'signin' ? 'Sign In' : authType === 'company' ? 'Register Company' : 'Join Workspace'}
          </button>
        </form>
      </div>

      {/* Simulated OTP Modal */}
      {showOtpModal && (
        <div className="modal-overlay" style={{ zIndex: 1000 }}>
          <div className="glass-card modal-content" style={{ maxWidth: '380px', padding: '2rem 1.5rem', textAlign: 'center', border: '1px solid rgba(14, 165, 233, 0.3)' }}>
            <Mail size={32} style={{ color: 'var(--primary)', marginBottom: '1rem' }} />
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.5rem' }}>OTP Email Verification</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
              A 6-digit verification code has been dispatched to <strong>{otpTargetMobile}</strong>.<br/>
              Please check your email inbox (including Spam folder) and enter the code below.
            </p>

            {otpError && (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#fca5a5', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '0.5rem', borderRadius: '6px', fontSize: '0.75rem', marginBottom: '1rem' }}>
                {otpError}
              </div>
            )}

            <form onSubmit={handleVerifyOtp}>
              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <input
                  type="text"
                  required
                  maxLength={6}
                  className="form-input"
                  style={{ textAlign: 'center', fontSize: '1.4rem', letterSpacing: '8px', padding: '0.5rem', fontFamily: 'monospace' }}
                  placeholder="000000"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                <button
                  type="button"
                  onClick={() => { setShowOtpModal(false); }}
                  className="btn btn-secondary"
                  style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', fontSize: '0.85rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={otpLoading || otpCode.length !== 6}
                  className="btn btn-primary"
                  style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', fontSize: '0.85rem' }}
                >
                  {otpLoading ? 'Verifying...' : 'Verify OTP'}
                </button>
              </div>

              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Didn't receive the code?{' '}
                <button
                  type="button"
                  onClick={handleResendOtp}
                  style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', textDecoration: 'underline', padding: 0, fontWeight: 600 }}
                >
                  Resend OTP
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
