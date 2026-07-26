import React from 'react';
import { Check, ShieldAlert, HeartPulse, Landmark, Store, Banknote, TrendingUp, Briefcase, Award, Rocket, Sprout, Sun, Coins, Flame, Baby, Heart, GraduationCap, BookOpen, Wrench, Wallet, Users } from 'lucide-react';

const ICON_MAP = {
  ShieldAlert, HeartPulse, Landmark, Store, Banknote, TrendingUp, Briefcase, Award, Rocket, Sprout, Sun, Coins, Flame, Baby, Heart, GraduationCap, BookOpen, Wrench, Wallet, Users
};

const SchemeCard = ({ scheme, isSelected, onToggleSelect, isAlreadyApplied, existingApplication }) => {
  const IconComponent = ICON_MAP[scheme.icon] || ShieldAlert;

  return (
    <div
      onClick={() => {
        if (!isAlreadyApplied) onToggleSelect(scheme.id);
      }}
      className="campsite-card"
      style={{
        position: 'relative',
        cursor: isAlreadyApplied ? 'default' : 'pointer',
        border: isSelected
          ? '2px solid var(--color-midnight-ink)'
          : isAlreadyApplied
          ? '1px solid var(--color-forest-pulse)'
          : '1px solid var(--color-linen)',
        background: isSelected
          ? '#fafafa'
          : isAlreadyApplied
          ? '#f0fdf4'
          : 'var(--color-paper-white)',
        transform: isSelected ? 'translateY(-2px)' : 'none'
      }}
    >
      {/* Cluster Pill & Check */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <span className="tag-pill tag-sunlit">
          {scheme.clusterShort}
        </span>

        {isAlreadyApplied ? (
          <span className="tag-pill tag-success">
            <Check size={12} /> Applied
          </span>
        ) : (
          <div style={{
            width: '22px',
            height: '22px',
            borderRadius: '9999px',
            border: isSelected ? 'none' : '1px solid var(--color-ash-gray)',
            background: isSelected ? 'var(--color-midnight-ink)' : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease'
          }}>
            {isSelected && <Check size={14} color="#ffffff" strokeWidth={3} />}
          </div>
        )}
      </div>

      {/* Scheme Title & Icon */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
        <div style={{
          width: '38px',
          height: '38px',
          borderRadius: '9999px',
          background: isSelected ? 'var(--color-midnight-ink)' : 'var(--color-fog-gray)',
          color: isSelected ? '#ffffff' : 'var(--color-midnight-ink)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}>
          <IconComponent size={18} />
        </div>
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: 'var(--color-midnight-ink)', margin: 0 }}>
            {scheme.name}
          </h3>
          <div style={{ fontSize: '13px', color: 'var(--color-slate)' }}>
            {scheme.fullTitle}
          </div>
        </div>
      </div>

      {/* Benefit Highlight */}
      <div style={{
        margin: '12px 0',
        padding: '6px 12px',
        background: 'var(--color-sunlit-cream)',
        borderRadius: '8px',
        fontSize: '13px',
        fontWeight: '500',
        color: 'var(--color-ember-brown)'
      }}>
        ✨ {scheme.benefit}
      </div>

      {/* Description */}
      <p style={{ fontSize: '13px', color: 'var(--color-slate)', margin: 0, lineHeight: '1.4' }}>
        {scheme.description}
      </p>

      {/* Applied Note */}
      {isAlreadyApplied && existingApplication && (
        <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--color-linen)', fontSize: '12px', color: 'var(--color-slate)' }}>
          Status: <strong style={{ color: 'var(--color-midnight-ink)' }}>{existingApplication.status}</strong> • Applied: {new Date(existingApplication.appliedAt).toLocaleDateString()}
        </div>
      )}
    </div>
  );
};

export default SchemeCard;
