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
          <p>Field verification and cold-chain inspection of local agro-vet stores and avian veterinarians are currently in progress.</p>
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

      {/* Agro-Vet Stores & Veterinary Network — Coming Soon Banner */}
      <div className="vet-coming-soon-banner">
        <div className="vet-banner-header">
          <div>
            <div className="vet-banner-title">Agro-Vet Stores & Veterinary Tele-Consultation Network</div>
            <div className="vet-banner-desc">
              Physical store auditing, cold-chain temperature verification, and licensed avian veterinary practitioner onboarding are currently in progress. Zero fabricated store stock or unverified partner claims.
            </div>
          </div>
          <span className="tag-coming-soon">Coming Soon</span>
        </div>

        <div className="vet-features-grid">
          <div className="vet-feature-card">
            <div className="vet-feature-title">🩺 Avian Tele-Triage & Consultation</div>
            <div className="vet-feature-desc">
              Direct handoff from WhatsApp intake to a licensed avian veterinarian for complex or multi-pathogen flock emergencies.
            </div>
          </div>

          <div className="vet-feature-card">
            <div className="vet-feature-title">🔬 Field Post-Mortem & Necropsy Dispatch</div>
            <div className="vet-feature-desc">
              On-demand booking of accredited veterinary field pathologists for immediate flock necropsy and tissue sample retrieval.
            </div>
          </div>

          <div className="vet-feature-card">
            <div className="vet-feature-title">🏪 Certified Cold-Chain Agro-Vet Hubs</div>
            <div className="vet-feature-desc">
              In-person audit of refrigeration, vaccine potency, and authentic NAFDAC-registered stock prior to verified listing.
            </div>
          </div>
        </div>
      </div>

      {/* Directory Section */}
      <div style={{ marginBottom: '12px' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-main)' }}>
          Community Directory — Pending Field Verification ({filtered.length})
        </h2>
        <span style={{ fontSize: '12px', color: 'var(--text-light)' }}>
          All listings are provisional until verified by local field veterinary officers.
        </span>
      </div>

      <div className="grid-cards">
        {filtered.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', padding: '36px', textAlign: 'center', color: 'var(--text-light)' }}>
            No agro-vet directory listings found for this location.
          </div>
        ) : (
          filtered.map(s => (
            <div key={s.id} className="card-item">
              <div className="card-item-header">
                <div>
                  <div className="card-item-title">{s.name}</div>
                  <div className="card-item-subtitle">{s.lga}, {s.state} State</div>
                </div>
                <span className="tag-rect tag-moderate">Pending Field Verification</span>
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
                  Cold-chain audit required
                </span>
                <a
                  href={`tel:${s.phone}`}
                  className="btn-action"
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
