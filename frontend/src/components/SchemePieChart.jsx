import React, { useState, useMemo } from 'react';
import { PieChart as PieIcon, Layers } from 'lucide-react';
import { useBjpSchemes } from '../utils/schemesData';

// Curated Apple (España) harmonious color palette for 23 schemes
const SCHEME_COLORS = [
  '#0071e3', '#34c759', '#ff9500', '#af52de', '#5856d6',
  '#ff2d55', '#00c7be', '#30b0c7', '#a2845e', '#596680',
  '#0066cc', '#b64400', '#2e7d32', '#1d1d1f', '#707070',
  '#e53935', '#d81b60', '#8e24aa', '#3949ab', '#1e88e5',
  '#00acc1', '#00897b', '#43a047'
];

/**
 * SchemePieChart — Apple (España) style visual Pie Chart for all 23 BJP Welfare Schemes
 */
const SchemePieChart = ({ schemePopularity = [], scopeLabel = '' }) => {
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const BJP_SCHEMES = useBjpSchemes();

  // Process data to merge API popularity counts with the 23 canonical schemes
  const chartData = useMemo(() => {
    // Convert array or object to map
    const countsMap = {};
    if (Array.isArray(schemePopularity)) {
      schemePopularity.forEach(item => {
        if (!item) return;
        const name = String(item._id || item.schemeName || item.name || '').trim();
        const cnt = Number(item.count || item.totalApps || 0);
        if (name) countsMap[name.toLowerCase()] = (countsMap[name.toLowerCase()] || 0) + cnt;
      });
    } else if (typeof schemePopularity === 'object' && schemePopularity !== null) {
      Object.entries(schemePopularity).forEach(([key, val]) => {
        const cnt = typeof val === 'number' ? val : Number(val?.count || 0);
        countsMap[key.toLowerCase()] = cnt;
      });
    }

    // Map each of the 23 BJP schemes
    const list = BJP_SCHEMES.map((scheme, idx) => {
      const matchKey = scheme.name.toLowerCase();
      let count = countsMap[matchKey] || 0;
      
      // Fallback matching for scheme ID or aliases
      if (count === 0 && countsMap[String(scheme.id)]) {
        count = countsMap[String(scheme.id)];
      }

      return {
        id: scheme.id,
        name: scheme.name,
        fullTitle: scheme.fullTitle,
        cluster: scheme.cluster,
        count: count,
        color: SCHEME_COLORS[idx % SCHEME_COLORS.length]
      };
    });

    const total = list.reduce((sum, item) => sum + item.count, 0);

    // Calculate slice angles for SVG Donut
    let cumulativeAngle = 0;
    const slices = list.map((item, idx) => {
      const percentage = total > 0 ? (item.count / total) * 100 : 0;
      const angle = total > 0 ? (item.count / total) * 360 : (360 / list.length);
      const startAngle = cumulativeAngle;
      const endAngle = cumulativeAngle + angle;
      cumulativeAngle = endAngle;

      return {
        ...item,
        percentage: percentage.toFixed(1),
        startAngle,
        endAngle
      };
    });

    return { slices, total };
  }, [schemePopularity, BJP_SCHEMES]);

  // Helper to convert polar coordinates to SVG arc paths
  const getArcPath = (cx, cy, rInner, rOuter, startAngleDeg, endAngleDeg) => {
    // If empty or single slice near 360, adjust slightly to avoid SVG path glitches
    const diff = endAngleDeg - startAngleDeg;
    if (diff >= 359.99) endAngleDeg = startAngleDeg + 359.9;

    const startRad = ((startAngleDeg - 90) * Math.PI) / 180;
    const endRad = ((endAngleDeg - 90) * Math.PI) / 180;

    const x1Outer = cx + rOuter * Math.cos(startRad);
    const y1Outer = cy + rOuter * Math.sin(startRad);
    const x2Outer = cx + rOuter * Math.cos(endRad);
    const y2Outer = cy + rOuter * Math.sin(endRad);

    const x1Inner = cx + rInner * Math.cos(endRad);
    const y1Inner = cy + rInner * Math.sin(endRad);
    const x2Inner = cx + rInner * Math.cos(startRad);
    const y2Inner = cy + rInner * Math.sin(startRad);

    const largeArcFlag = diff > 180 ? 1 : 0;

    return [
      `M ${x1Outer} ${y1Outer}`,
      `A ${rOuter} ${rOuter} 0 ${largeArcFlag} 1 ${x2Outer} ${y2Outer}`,
      `L ${x1Inner} ${y1Inner}`,
      `A ${rInner} ${rInner} 0 ${largeArcFlag} 0 ${x2Inner} ${y2Inner}`,
      'Z'
    ].join(' ');
  };

  const activeSlice = hoveredIdx !== null ? chartData.slices[hoveredIdx] : null;

  return (
    <div className="campsite-card" style={{
      width: '100%',
      padding: '28px',
      marginBottom: '32px',
      boxSizing: 'border-box',
      borderRadius: '28px',
      backgroundColor: '#ffffff',
      border: 'none'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '24px',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div>
          <h3 style={{
            fontFamily: 'var(--font-sf-pro-display)',
            fontSize: '24px',
            fontWeight: '600',
            color: 'var(--color-primary-ink)',
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            letterSpacing: '0.007em'
          }}>
            <PieIcon size={22} color="var(--color-electric-blue)" />
            Scheme Breakdown & Distribution {scopeLabel ? `— ${scopeLabel}` : ''}
          </h3>
          <div style={{ fontSize: '14px', color: 'var(--color-mid-gray)', marginTop: '4px' }}>
            Application distribution across all 23 BJP Central Welfare Schemes
          </div>
        </div>
        <span className="tag-pill tag-active" style={{ fontSize: '13px', background: 'var(--color-canvas)', color: 'var(--color-primary-ink)' }}>
          <Layers size={14} style={{ marginRight: '4px' }} />
          23 Welfare Schemes
        </span>
      </div>

      {/* Main Grid: Left SVG Donut, Right Interactive Legend */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '32px',
        alignItems: 'center'
      }}>
        
        {/* Left Donut Chart Graphic */}
        <div style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px'
        }}>
          <svg width="260" height="260" viewBox="0 0 260 260" style={{ overflow: 'visible' }}>
            <g transform="translate(0, 0)">
              {chartData.slices.map((slice, idx) => {
                const isHovered = hoveredIdx === idx;
                const rInner = isHovered ? 72 : 75;
                const rOuter = isHovered ? 118 : 112;

                return (
                  <path
                    key={slice.id}
                    d={getArcPath(130, 130, rInner, rOuter, slice.startAngle, slice.endAngle)}
                    fill={slice.color}
                    opacity={hoveredIdx === null || isHovered ? 1 : 0.45}
                    style={{
                      transition: 'all 0.25s ease-out',
                      cursor: 'pointer',
                      filter: isHovered ? 'drop-shadow(0 4px 12px rgba(0, 113, 227, 0.25))' : 'none'
                    }}
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                  />
                );
              })}
            </g>

            {/* Donut Center Display */}
            <circle cx="130" cy="130" r="70" fill="#ffffff" />
          </svg>

          {/* Donut Overlay Content */}
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            pointerEvents: 'none'
          }}>
            {activeSlice ? (
              <>
                <div style={{ fontSize: '11px', color: activeSlice.color, textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.05em' }}>
                  {activeSlice.name}
                </div>
                <div style={{ fontFamily: 'var(--font-sf-pro-display)', fontSize: '26px', fontWeight: '700', color: 'var(--color-primary-ink)', lineHeight: '1.1' }}>
                  {activeSlice.count.toLocaleString()}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--color-mid-gray)' }}>
                  {activeSlice.percentage}% Share
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: '12px', color: 'var(--color-mid-gray)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '600' }}>
                  Total
                </div>
                <div style={{ fontFamily: 'var(--font-sf-pro-display)', fontSize: '28px', fontWeight: '700', color: 'var(--color-primary-ink)', lineHeight: '1.1' }}>
                  {chartData.total.toLocaleString()}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--color-mid-gray)' }}>
                  Applications
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right Interactive Legend Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: '10px',
          maxHeight: '300px',
          overflowY: 'auto',
          paddingRight: '6px'
        }}>
          {chartData.slices.map((item, idx) => {
            const isHovered = hoveredIdx === idx;
            return (
              <div
                key={item.id}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: '12px',
                  backgroundColor: isHovered ? 'var(--color-canvas)' : 'transparent',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                  <span style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    backgroundColor: item.color,
                    flexShrink: 0
                  }} />
                  <span style={{
                    fontSize: '13px',
                    fontWeight: isHovered ? '600' : '400',
                    color: 'var(--color-primary-ink)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    {item.name}
                  </span>
                </div>
                <span style={{
                  fontSize: '12px',
                  fontWeight: '600',
                  color: 'var(--color-mid-gray)',
                  marginLeft: '8px',
                  flexShrink: 0
                }}>
                  {item.count > 0 ? item.count.toLocaleString() : '0'}
                </span>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
};

export default SchemePieChart;
