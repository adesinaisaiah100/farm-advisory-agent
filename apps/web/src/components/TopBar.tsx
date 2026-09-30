import React from 'react';
import type { CaseSummary } from '../types.js';

interface TopBarProps {
  readonly searchQuery: string;
  readonly onSearchChange: (q: string) => void;
  readonly cases: readonly CaseSummary[];
}

export function TopBar({ searchQuery, onSearchChange, cases }: TopBarProps) {
  const total = cases.length;
  const critical = cases.filter(c => c.criticality === 'critical').length;
  const high = cases.filter(c => c.criticality === 'high').length;
  const moderate = cases.filter(c => c.criticality === 'moderate').length;
  const resolved = cases.filter(c => c.criticality === 'resolved').length;

  return (
    <header className="top-bar">
      <div className="search-input-wrapper">
        <input
          type="text"
          className="search-input"
          placeholder="Search farmer, location, or signs..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      <div className="top-summary">
        <span>Total Cases: <strong>{total}</strong></span>
        <span>Critical: <strong style={{ color: 'var(--crit-critical-text)' }}>{critical}</strong></span>
        <span>High Risk: <strong style={{ color: 'var(--crit-high-text)' }}>{high}</strong></span>
        <span>Moderate: <strong style={{ color: 'var(--crit-moderate-text)' }}>{moderate}</strong></span>
        <span>Resolved: <strong style={{ color: 'var(--crit-resolved-text)' }}>{resolved}</strong></span>
      </div>
    </header>
  );
}
