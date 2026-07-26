import React, { useState, useEffect } from 'react';
import API from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { Phone, ArrowRight, RefreshCw, Search, CheckCircle2, UserCheck, AlertCircle } from 'lucide-react';

const UserOnboarding = ({ onCompleteOnboarding }) => {
  const { loginUser, referredByCode } = useAuth();

  const [step, setStep] = useState(1);
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [epicNo, setEpicNo] = useState('');

  const [timer, setTimer] = useState(30);
  const [canResend, setCanResend] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [devOtpHint, setDevOtpHint] = useState('');
  const [voterData, setVoterData] = useState(null);

  useEffect(() => {
    let interval = null;
    if (step === 2 && timer > 0) {
      interval = setInterval(() => {
        setTimer((prev) => prev - 1);
      }, 1000);
    } else if (timer === 0) {
      setCanResend(true);
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [step, timer]);

  const handleSendOtp = async (e) => {
    if (e) e.preventDefault();
    setErrorMsg('');

    if (!/^[6-9]\d{9}$/.test(mobile.trim())) {
      setErrorMsg('Please enter a valid 10-digit mobile number starting with 6-9');
      return;
    }

    setLoading(true);
    try {
      const res = await API.post('/auth/send-otp', { mobile: mobile.trim() });
      if (res.data.success) {
        setStep(2);
        setTimer(30);
        setCanResend(false);
        setOtp('');
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Failed to send OTP. Please check mobile number.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = () => {
    handleSendOtp(null);
  };

  const handleVerifyOtp = async (e) => {
    if (e) e.preventDefault();
    setErrorMsg('');

    if (!otp || otp.trim().length !== 6) {
      setErrorMsg('Please enter the 6-digit OTP code');
      return;
    }

    setLoading(true);
    try {
      const res = await API.post('/auth/verify-otp', {
        mobile: mobile.trim(),
        otp: otp.trim()
      });

      if (res.data.success) {
        if (res.data.isExistingUser && res.data.token) {
          loginUser(res.data.user, res.data.token);
          onCompleteOnboarding();
        } else {
          setStep(3);
        }
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Invalid OTP code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchEpic = async (e) => {
    if (e) e.preventDefault();
    setErrorMsg('');

    if (!epicNo || epicNo.trim().length < 5) {
      setErrorMsg('Please enter a valid 10-character EPIC voter card number (e.g. TFN2578318)');
      return;
    }

    setLoading(true);
    try {
      const res = await API.post('/voter/search-epic', { epicNo: epicNo.trim() });
      if (res.data.success) {
        setVoterData(res.data.voter);
        setStep(4);
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'EPIC number not found in voter database.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmVoter = async () => {
    if (!voterData) return;
    setLoading(true);
    setErrorMsg('');

    try {
      const res = await API.post('/voter/confirm-registration', {
        mobile: mobile.trim(),
        epicNo: voterData.epicNo,
        voterName: voterData.voterName,
        district: voterData.district,
        assemblyNo: voterData.assemblyNo,
        assemblyName: voterData.assemblyName,
        boothNo: voterData.boothNo,
        gender: voterData.gender,
        referredBy: referredByCode || null
      });

      if (res.data.success && res.data.token) {
        loginUser(res.data.user, res.data.token);
        onCompleteOnboarding();
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Failed to confirm registration');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '85vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', textAlign: 'center' }}>
      
      {/* Notification Pill Banner */}
      <div style={{ marginBottom: '20px' }}>
        <div className="notification-pill">
          <span className="new-tag">NEW</span>
          <span>BJP Nalam Thittam — 20 Government Schemes Automation</span>
        </div>
      </div>

      {/* Hero Display Title & Subtitle */}
      <h1 className="text-display" style={{ maxWidth: '750px', margin: '0 auto 16px' }}>
        Sunlit Editorial Welfare Portal.
      </h1>
      <p className="text-subheading" style={{ maxWidth: '600px', margin: '0 auto 36px' }}>
        {step === 1 && 'Enter your 10-digit mobile number to verify and get instant access to 20 welfare schemes.'}
        {step === 2 && 'Verify 6-digit OTP sent via 2Factor SMS gateway.'}
        {step === 3 && 'Enter your EPIC Voter Card number to fetch your constituency details.'}
        {step === 4 && 'Confirm your voter profile to unlock instant benefit transfers.'}
      </p>

      {/* Form Card (Paper White surface floating on Parchment canvas) */}
      <div className="campsite-card" style={{ maxWidth: '460px', width: '100%', padding: '32px', textAlign: 'left' }}>
        
        {/* Error Alert */}
        {errorMsg && (
          <div className="tag-pill tag-error" style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={16} flexShrink={0} />
            <div>{errorMsg}</div>
          </div>
        )}

        {/* STEP 1: MOBILE ENTRY */}
        {step === 1 && (
          <form onSubmit={handleSendOtp}>
            <div className="form-group">
              <label className="form-label">Mobile Number</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-midnight-ink)', fontWeight: '600', fontSize: '14px' }}>
                  +91
                </span>
                <input
                  type="tel"
                  maxLength={10}
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="Enter 10-digit mobile number"
                  className="form-control"
                  style={{ paddingLeft: '50px' }}
                  required
                />
              </div>
            </div>

            {referredByCode && (
              <div className="tag-pill tag-sunlit" style={{ width: '100%', borderRadius: '8px', padding: '8px 12px', marginBottom: '16px' }}>
                🎁 Inviter Referral Code Active: <strong>{referredByCode}</strong>
              </div>
            )}

            <button type="submit" className="btn btn-filled" style={{ width: '100%', marginTop: '8px' }} disabled={loading}>
              {loading ? 'Sending OTP via 2Factor...' : 'Send OTP'} <ArrowRight size={14} />
            </button>
          </form>
        )}

        {/* STEP 2: OTP VERIFICATION */}
        {step === 2 && (
          <form onSubmit={handleVerifyOtp}>
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="form-label">Enter 6-Digit OTP</label>
                <span style={{ fontSize: '12px', color: 'var(--color-slate)' }}>Sent to +91 {mobile}</span>
              </div>
              <input
                type="text"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="123456"
                className="form-control"
                style={{ textAlign: 'center', letterSpacing: '6px', fontSize: '20px', fontWeight: '600' }}
                required
              />
            </div>



            {/* 30 Sec Timer & Resend Button */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '16px 0', fontSize: '13px' }}>
              <div style={{ color: timer > 0 ? 'var(--color-campfire-orange)' : 'var(--color-slate)', fontWeight: '500' }}>
                {timer > 0 ? (
                  `⏳ Resend OTP in ${timer}s`
                ) : (
                  'OTP expired or didn\'t receive?'
                )}
              </div>
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={!canResend || loading}
                className="btn btn-ghost"
                style={{ padding: '4px 10px', fontSize: '12px' }}
              >
                <RefreshCw size={12} /> Resend OTP
              </button>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" onClick={() => setStep(1)} className="btn btn-ghost" style={{ flex: 1 }}>
                Back
              </button>
              <button type="submit" className="btn btn-filled" style={{ flex: 2 }} disabled={loading}>
                {loading ? 'Verifying...' : 'Verify & Continue'}
              </button>
            </div>
          </form>
        )}

        {/* STEP 3: EPIC SEARCH */}
        {step === 3 && (
          <form onSubmit={handleSearchEpic}>
            <div className="form-group">
              <label className="form-label">EPIC Voter Card Number</label>
              <input
                type="text"
                value={epicNo}
                onChange={(e) => setEpicNo(e.target.value.toUpperCase())}
                placeholder="e.g. TFN2578318 or ASU1148816"
                className="form-control"
                style={{ textTransform: 'uppercase', letterSpacing: '2px', fontWeight: '600' }}
                required
              />
            </div>

            <div style={{ fontSize: '12px', color: 'var(--color-slate)', marginBottom: '16px', background: 'var(--color-fog-gray)', padding: '10px 12px', borderRadius: '8px' }}>
              💡 We query the official read-only Voter Database to fetch your registered Assembly Constituency, District, and Polling Booth.
            </div>

            <button type="submit" className="btn btn-filled" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'Searching...' : 'Search EPIC Details'} <Search size={14} />
            </button>
          </form>
        )}

        {/* STEP 4: VOTER CONFIRMATION */}
        {step === 4 && voterData && (
          <div>
            <div style={{
              padding: '16px',
              background: 'var(--color-fog-gray)',
              border: '1px solid var(--color-linen)',
              borderRadius: '8px',
              marginBottom: '20px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', borderBottom: '1px solid var(--color-linen)', paddingBottom: '8px' }}>
                <UserCheck size={20} color="var(--color-midnight-ink)" />
                <div>
                  <div style={{ fontSize: '16px', fontWeight: '600', color: 'var(--color-midnight-ink)' }}>{voterData.voterName}</div>
                  <div style={{ fontSize: '12px', color: 'var(--color-slate)' }}>EPIC: {voterData.epicNo}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px' }}>
                <div>
                  <div style={{ color: 'var(--color-slate)' }}>District:</div>
                  <div style={{ color: 'var(--color-midnight-ink)', fontWeight: '600' }}>{voterData.district}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--color-slate)' }}>Assembly:</div>
                  <div style={{ color: 'var(--color-midnight-ink)', fontWeight: '600' }}>{voterData.assemblyName} ({voterData.assemblyNo})</div>
                </div>
                <div>
                  <div style={{ color: 'var(--color-slate)' }}>Booth/Part No:</div>
                  <div style={{ color: 'var(--color-midnight-ink)', fontWeight: '600' }}>Booth {voterData.boothNo}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--color-slate)' }}>Gender:</div>
                  <div style={{ color: 'var(--color-midnight-ink)', fontWeight: '600' }}>{voterData.gender}</div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" onClick={() => setStep(3)} className="btn btn-ghost" style={{ flex: 1 }}>
                Wrong EPIC?
              </button>
              <button type="button" onClick={handleConfirmVoter} className="btn btn-filled" style={{ flex: 2 }} disabled={loading}>
                {loading ? 'Confirming...' : 'Confirm & Proceed'} <CheckCircle2 size={14} />
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default UserOnboarding;
