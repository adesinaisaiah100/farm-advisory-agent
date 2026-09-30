import React from 'react';
import '../styles/landing.css';

interface LandingViewProps {
  readonly onEnterPortal: () => void;
}

export function LandingView({ onEnterPortal }: LandingViewProps) {
  return (
    <div className="landing-root">
      {/* Top Header */}
      <header className="landing-header">
        <div className="landing-header-inner">
          <div className="landing-brand">
            <span className="landing-brand-title">
              BIRDVET
            </span>
          </div>

          <div className="landing-header-actions">
            <a
              href="https://wa.me/2347071794632"
              target="_blank"
              rel="noopener noreferrer"
              className="landing-phone-link"
              title="Chat with BirdVet on WhatsApp"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              <span>+234 707 179 4632</span>
            </a>

            <button
              type="button"
              onClick={onEnterPortal}
              className="landing-btn-portal-sm"
            >
              <span>Clinician Portal</span>
              <span aria-hidden="true">&rarr;</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Hero Container (Centered) */}
      <main className="landing-main">
        {/* Punchy Outcome Headline */}
        <h1 className="landing-headline">
          Protect Your Flock with Instant Veterinary AI
        </h1>

        {/* Clear Conversational Subtitle */}
        <p className="landing-subtitle">
          Send a WhatsApp voice note in Nigerian Pidgin or English. BirdVet spots disease symptoms early, guides emergency biosecurity, and connects you with licensed veterinarians before mortality spreads.
        </p>

        {/* Action Controls (Strict Anti-Pill: 6px radius) */}
        <div className="landing-actions">
          <a
            href="https://wa.me/2347071794632"
            target="_blank"
            rel="noopener noreferrer"
            className="landing-btn-whatsapp"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
            </svg>
            <span>Start WhatsApp Consultation</span>
            <span className="landing-btn-whatsapp-phone">+234 707 179 4632</span>
          </a>

          <button
            type="button"
            onClick={onEnterPortal}
            className="landing-btn-portal-lg"
          >
            <span>Open Clinician Portal</span>
            <span aria-hidden="true">&rarr;</span>
          </button>
        </div>

        {/* 3-Column Structured Information Cards */}
        <section className="landing-grid-section">
          <div className="landing-grid">
            <div className="landing-col-card">
              <span className="landing-col-num">01 / Voice First</span>
              <h3 className="landing-col-title">Spoken Nigerian Pidgin</h3>
              <p className="landing-col-desc">
                Farmers send natural WhatsApp voice notes without typing or filling complicated forms. Understood natively across vernacular dialects.
              </p>
            </div>

            <div className="landing-col-card">
              <span className="landing-col-num">02 / Early Warning</span>
              <h3 className="landing-col-title">Prevent Flock Outbreaks</h3>
              <p className="landing-col-desc">
                Identifies respiratory, digestive, and lethargy signs early. Enforces biosecurity measures and stops harmful drug self-medication.
              </p>
            </div>

            <div className="landing-col-card">
              <span className="landing-col-num">03 / Vet Referral</span>
              <h3 className="landing-col-title">Licensed Care Nearby</h3>
              <p className="landing-col-desc">
                Generates clinical triage summaries and referral slips connecting you directly with licensed veterinary professionals in your LGA.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Clean Minimal Footer */}
      <footer className="landing-footer">
        BirdVet &bull; Borderless Bytes Hackathon (StacStart) &bull; Built by Adesina Oluwatimileyin Isaiah
      </footer>
    </div>
  );
}
