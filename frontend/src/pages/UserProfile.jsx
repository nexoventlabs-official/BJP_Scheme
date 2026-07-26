import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Phone, MapPin, Building, LandPlot, ShieldCheck } from 'lucide-react';

const UserProfile = () => {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <div style={{ maxWidth: '750px', margin: '0 auto' }}>
      
      {/* Profile Header Card */}
      <div className="campsite-card" style={{ padding: '32px', marginBottom: '24px' }}>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px', borderBottom: '1px solid var(--color-linen)', paddingBottom: '20px' }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '9999px',
            background: 'var(--color-midnight-ink)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '22px',
            fontWeight: '600'
          }}>
            {user.voterName?.charAt(0)}
          </div>
          <div>
            <h1 className="text-heading" style={{ margin: 0 }}>
              {user.voterName}
            </h1>
            <div className="tag-pill tag-sunlit" style={{ marginTop: '4px' }}>
              EPIC: {user.epicNo}
            </div>
          </div>
        </div>

        {/* Profile Details Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
          
          <div style={{ background: 'var(--color-fog-gray)', padding: '16px', borderRadius: '8px', border: '1px solid var(--color-linen)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-slate)', fontSize: '12px', marginBottom: '4px' }}>
              <Phone size={14} color="var(--color-midnight-ink)" /> Registered Mobile
            </div>
            <div style={{ fontSize: '16px', fontWeight: '600', color: 'var(--color-midnight-ink)' }}>
              +91 {user.mobile}
            </div>
          </div>

          <div style={{ background: 'var(--color-fog-gray)', padding: '16px', borderRadius: '8px', border: '1px solid var(--color-linen)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-slate)', fontSize: '12px', marginBottom: '4px' }}>
              <MapPin size={14} color="var(--color-midnight-ink)" /> District
            </div>
            <div style={{ fontSize: '16px', fontWeight: '600', color: 'var(--color-midnight-ink)' }}>
              {user.district}
            </div>
          </div>

          <div style={{ background: 'var(--color-fog-gray)', padding: '16px', borderRadius: '8px', border: '1px solid var(--color-linen)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-slate)', fontSize: '12px', marginBottom: '4px' }}>
              <Building size={14} color="var(--color-midnight-ink)" /> Assembly Constituency
            </div>
            <div style={{ fontSize: '16px', fontWeight: '600', color: 'var(--color-midnight-ink)' }}>
              {user.assemblyName} ({user.assemblyNo})
            </div>
          </div>

          <div style={{ background: 'var(--color-fog-gray)', padding: '16px', borderRadius: '8px', border: '1px solid var(--color-linen)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-slate)', fontSize: '12px', marginBottom: '4px' }}>
              <LandPlot size={14} color="var(--color-midnight-ink)" /> Polling Station / Booth
            </div>
            <div style={{ fontSize: '16px', fontWeight: '600', color: 'var(--color-midnight-ink)' }}>
              Part / Booth No. {user.boothNo}
            </div>
          </div>

        </div>

        {/* Verification Badge */}
        <div style={{ marginTop: '24px', padding: '14px 18px', background: '#f0fdf4', border: '1px solid var(--color-forest-pulse)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <ShieldCheck size={24} color="var(--color-forest-pulse)" />
          <div>
            <div style={{ fontWeight: '600', color: 'var(--color-midnight-ink)', fontSize: '14px' }}>Verified Voter Identity</div>
            <div style={{ fontSize: '12px', color: 'var(--color-slate)' }}>
              Your voter card and mobile number are authenticated in the BJP Nalam Thittam database.
            </div>
          </div>
        </div>

      </div>

    </div>
  );
};

export default UserProfile;
