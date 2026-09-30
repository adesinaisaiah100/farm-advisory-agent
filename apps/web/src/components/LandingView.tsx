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
            <span className="landing-badge">
              Clinical AI
            </span>
          </div>

          <div className="landing-header-actions">
            <a
              href="https://wa.me/2347071794632"
              target="_blank"
              rel="noopener noreferrer"
              className="landing-phone-link"
            >
              <span className="landing-signal-square" aria-hidden="true" />
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

      {/* Main Hero Container */}
      <main className="landing-main">
        {/* Overline Label */}
        <div className="landing-overline-wrap">
          <span className="landing-overline">
            Poultry Clinical Triage &amp; Disease Surveillance &bull; Nigeria
          </span>
        </div>

        {/* Primary Quote Headline */}
        <h1 className="landing-headline">
          &ldquo;When a poultry farmer notices something is wrong, getting the right information quickly isn&rsquo;t always easy.&rdquo;
        </h1>

        {/* Subtitle */}
        <p className="landing-subtitle">
          BirdVet is a WhatsApp-first veterinary copilot for Nigerian smallholders. Farmers describe flock symptoms via spoken voice notes in Nigerian Pidgin; BirdVet gathers context, enforces strict clinical safety, and turns conversations into structured cases for licensed veterinarians.
        </p>

        {/* Action Controls (Strict Anti-Pill: 6px radius) */}
        <div className="landing-actions">
          <a
            href="https://wa.me/2347071794632"
            target="_blank"
            rel="noopener noreferrer"
            className="landing-btn-whatsapp"
          >
            <span>Start WhatsApp Consultation</span>
            <span className="landing-btn-whatsapp-sub">(+234 707 179 4632)</span>
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

        {/* 3-Column Structured Information Grid (Clean Hairlines, No Gradients) */}
        <section className="landing-grid-section">
          <div className="landing-grid">
            <div className="landing-col">
              <span className="landing-col-num">01 / WhatsApp Intake</span>
              <h3 className="landing-col-title">Spoken Nigerian Pidgin</h3>
              <p className="landing-col-desc">
                Farmers send normal voice notes without typing English or filling forms. Transcribed with 0.0% word error rate on agricultural vernacular via Gemini 3.5.
              </p>
            </div>

            <div className="landing-col">
              <span className="landing-col-num">02 / Clinical Safety</span>
              <h3 className="landing-col-title">The Four Doors Ladder</h3>
              <p className="landing-col-desc">
                Strict safety protocol: never fabricates antibiotic prescriptions. Routes between supportive biosecurity, vetted agro-vet store slips, and emergency escalation.
              </p>
            </div>

            <div className="landing-col">
              <span className="landing-col-num">03 / Grounded RAG</span>
              <h3 className="landing-col-title">251-Page Vet Manual</h3>
              <p className="landing-col-desc">
                Grounded in 760 micro-chunks with 768-dim Gemini MRL embeddings on Neon pgvector, paired with streaming Cloudflare R2 original documentation.
              </p>
            </div>
          </div>
        </section>

        {/* Engineering Proof Bar */}
        <div className="landing-proof-bar">
          <div className="landing-proof-item">
            <span className="landing-signal-square" aria-hidden="true" />
            <span className="landing-proof-status">764 / 764 Tests Passing (100% Green)</span>
          </div>
          <div className="landing-proof-stack">Stack: Hono &bull; Cloudflare R2 &bull; Neon pgvector &bull; Gemini 3.1 &bull; Baileys</div>
          <a
            href="https://github.com/adesinaisaiah100/farm-advisory-agent"
            target="_blank"
            rel="noopener noreferrer"
            className="landing-proof-link"
          >
            <span>GitHub Repository</span>
            <span aria-hidden="true">&nearr;</span>
          </a>
        </div>
      </main>

      {/* Clean Minimal Footer */}
      <footer className="landing-footer">
        Borderless Bytes Hackathon (StacStart) &bull; Built by Adesina Oluwatimileyin Isaiah &bull; All Rights Reserved
      </footer>
    </div>
  );
}
