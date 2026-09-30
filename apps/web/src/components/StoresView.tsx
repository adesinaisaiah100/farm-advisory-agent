import React, { useState } from 'react';
import type { AgroVetStore } from '../types.js';

interface StoresViewProps {
  readonly stores: readonly AgroVetStore[];
}

export function StoresView({ stores }: StoresViewProps) {
  const [selectedState, setSelectedState] = useState<string>('all');

  const filtered = selectedState === 'all'
    ? stores
    : stores.filter(s => s.state === selectedState);

  return (
    <section className="tab-panel">
      <div className="page-header">
        <div className="page-title">
          <h1>Agro-Vet Referral Network</h1>
          <p>Verified medication, vaccine cold-chain, and post-mortem referral partners.</p>
        </div>

        <div className="filters-group">
          <select
            className="filter-dropdown"
            value={selectedState}
            onChange={(e) => setSelectedState(e.target.value)}
          >
            <option value="all">All States</option>
            <option value="Oyo">Oyo State</option>
            <option value="Kaduna">Kaduna State</option>
            <option value="Ogun">Ogun State</option>
            <option value="Enugu">Enugu State</option>
            <option value="Plateau">Plateau State</option>
          </select>
        </div>
      </div>

      <div className="grid-cards">
        {filtered.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', padding: '36px', textAlign: 'center', color: 'var(--text-light)' }}>
            No verified agro-vet stores found in this location.
          </div>
        ) : (
          filtered.map(s => (
            <div key={s.id} className="card-item">
              <div className="card-item-header">
                <div>
                  <div className="card-item-title">{s.name}</div>
                  <div className="card-item-subtitle">{s.lga}, {s.state} State</div>
                </div>
                <span className="tag-rect tag-resolved">Verified Partner</span>
              </div>

              <div className="card-item-body">
                <div className="store-phone-row">
                  <span className="store-phone-label">Direct Contact:</span>
                  <span className="store-phone-number">{s.phoneFormatted}</span>
                </div>

                <div style={{ fontSize: '12.5px', color: 'var(--text-light)' }}>
                  {s.address}
                </div>

                <div className="services-tag-row">
                  {s.services.map((srv, idx) => (
                    <span key={idx} className="tag-service">{srv}</span>
                  ))}
                </div>
              </div>

              <div className="card-item-footer">
                <span style={{ fontSize: '11px', color: 'var(--text-light)' }}>
                  Zero fabricated inventory
                </span>
                <a
                  href={`tel:${s.phone}`}
                  className="btn-action primary"
                  style={{ textDecoration: 'none' }}
                >
                  Call Store
                </a>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
