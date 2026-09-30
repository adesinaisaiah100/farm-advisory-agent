import React, { useState } from 'react';
import type { OutbreakReport } from '../types.js';

interface ReportsViewProps {
  readonly reports: readonly OutbreakReport[];
  readonly onOpenLinkedCases?: (lga: string) => void;
}

export function ReportsView({ reports, onOpenLinkedCases }: ReportsViewProps) {
  const [selectedState, setSelectedState] = useState<string>('all');

  const filtered = selectedState === 'all'
    ? reports
    : reports.filter(r => r.state === selectedState);

  return (
    <section className="tab-panel">
      <div className="page-header">
        <div className="page-title">
          <h1>Poultry Disease Outbreaks</h1>
          <p>Real-time syndromic surveillance signals aggregated from farmer intakes.</p>
        </div>

        <div className="filters-group">
          <select
            className="filter-dropdown"
            value={selectedState}
            onChange={(e) => setSelectedState(e.target.value)}
          >
            <option value="all">All States</option>
            <option value="Kaduna">Kaduna State</option>
            <option value="Oyo">Oyo State</option>
            <option value="Enugu">Enugu State</option>
            <option value="Ogun">Ogun State</option>
            <option value="Plateau">Plateau State</option>
          </select>
        </div>
      </div>

      <div className="grid-cards">
        {filtered.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', padding: '36px', textAlign: 'center', color: 'var(--text-light)' }}>
            No outbreak reports found for this state.
          </div>
        ) : (
          filtered.map(r => (
            <div key={r.id} className="card-item">
              <div className="card-item-header">
                <div>
                  <div className="card-item-title">{r.disease}</div>
                  <div className="card-item-subtitle">
                    {r.lga}, {r.state} State · {r.date}
                  </div>
                </div>
                <span className={`tag-rect tag-${r.criticality}`}>{r.criticality}</span>
              </div>

              <div className="card-item-body">
                <div>{r.summary}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-light)', marginTop: '4px' }}>
                  Linked Active Cases: <strong>{r.caseCount}</strong>
                </div>
              </div>

              <div className="card-item-footer">
                <span style={{ color: 'var(--text-light)', fontSize: '11.5px' }}>
                  Signal Ref: {r.id}
                </span>
                <button
                  type="button"
                  className="btn-action"
                  onClick={() => onOpenLinkedCases?.(r.lga)}
                >
                  View Linked Cases
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
