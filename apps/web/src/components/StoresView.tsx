import React from 'react';

interface StoresViewProps {
  readonly stores?: readonly any[];
}

export function StoresView(_props?: StoresViewProps) {
  return (
    <section className="tab-panel" style={{ padding: '0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="coming-soon-centered-container">
        <div className="coming-soon-card">
          <span className="tag-coming-soon">Coming Soon</span>
          <h1>Veterinary & Agro-Vet Network</h1>
          <p>
            We are actively onboarding certified avian veterinarians and conducting on-the-ground cold-chain audits for local agro-vet stores across Nigerian poultry clusters.
          </p>

          <div className="coming-soon-features-list">
            <div className="coming-soon-feature-item">
              <span className="coming-soon-feature-icon">🩺</span>
              <div>
                <div className="coming-soon-feature-title">Avian Tele-Triage & Clinical Handoff</div>
                <div className="coming-soon-feature-sub">
                  Direct voice/video consultation with licensed avian veterinarians for severe mortality or complicated flock cases.
                </div>
              </div>
            </div>

            <div className="coming-soon-feature-item">
              <span className="coming-soon-feature-icon">🔬</span>
              <div>
                <div className="coming-soon-feature-title">On-Farm Post-Mortem & Necropsy Dispatch</div>
                <div className="coming-soon-feature-sub">
                  Rapid field pathologist bookings for on-site tissue sampling, organ pathology, and definitive diagnostic workups.
                </div>
              </div>
            </div>

            <div className="coming-soon-feature-item">
              <span className="coming-soon-feature-icon">🏪</span>
              <div>
                <div className="coming-soon-feature-title">Verified Cold-Chain Store Directory</div>
                <div className="coming-soon-feature-sub">
                  Physical LGA mapping with verified vaccine refrigeration, genuine NAFDAC stock, and zero fabricated inventory.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
