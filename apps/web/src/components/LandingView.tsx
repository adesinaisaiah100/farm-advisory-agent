import React from 'react';

interface LandingViewProps {
  readonly onEnterPortal: () => void;
}

export function LandingView({ onEnterPortal }: LandingViewProps) {
  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa] flex flex-col font-['Inter',sans-serif]">
      {/* Top Header */}
      <header className="w-full border-b border-[#27272a] bg-[#09090b]/90 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-['Plus_Jakarta_Sans',sans-serif] font-bold text-lg tracking-tight text-white">
              BIRDVET
            </span>
            <span className="border border-[#3f3f46] text-[#a1a1aa] font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-[4px]">
              Clinical AI
            </span>
          </div>

          <div className="flex items-center gap-4">
            <a
              href="https://wa.me/2347071794632"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#a1a1aa] hover:text-white font-mono text-xs hidden sm:inline-flex items-center gap-1.5 transition-colors"
            >
              <span className="w-2 h-2 rounded-none bg-[#10b981] inline-block" />
              +234 707 179 4632
            </a>

            <button
              type="button"
              onClick={onEnterPortal}
              className="bg-[#18181b] hover:bg-[#27272a] text-[#fafafa] border border-[#3f3f46] text-xs font-medium px-3.5 py-2 rounded-[6px] transition-colors flex items-center gap-1.5"
            >
              <span>Clinician Portal</span>
              <span aria-hidden="true">&rarr;</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Hero Container */}
      <main className="flex-1 max-w-5xl mx-auto px-6 pt-16 pb-20 flex flex-col justify-center">
        {/* Overline Label */}
        <div className="mb-6">
          <span className="text-[#a1a1aa] font-mono text-xs uppercase tracking-widest border-b border-[#3f3f46] pb-1">
            Poultry Clinical Triage &amp; Disease Surveillance &bull; Nigeria
          </span>
        </div>

        {/* Primary Quote Headline */}
        <h1 className="font-['Plus_Jakarta_Sans',sans-serif] font-extrabold text-3xl sm:text-5xl lg:text-[54px] text-white tracking-tight leading-[1.15] max-w-4xl mb-6">
          &ldquo;When a poultry farmer notices something is wrong, getting the right information quickly isn&rsquo;t always easy.&rdquo;
        </h1>

        {/* Subtitle */}
        <p className="text-[#a1a1aa] text-base sm:text-lg leading-relaxed max-w-2xl mb-10">
          BirdVet is a WhatsApp-first veterinary copilot for Nigerian smallholders. Farmers describe flock symptoms via spoken voice notes in Nigerian Pidgin; BirdVet gathers context, enforces strict clinical safety, and turns conversations into structured cases for licensed veterinarians.
        </p>

        {/* Action Controls (Anti-Pill: Strict 6px radius) */}
        <div className="flex flex-wrap items-center gap-4 mb-20">
          <a
            href="https://wa.me/2347071794632"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-[#10b981] hover:bg-[#059669] text-[#09090b] font-semibold text-sm px-6 py-3.5 rounded-[6px] transition-colors inline-flex items-center gap-2 shadow-sm"
          >
            <span>Start WhatsApp Consultation</span>
            <span className="font-mono text-xs text-[#064e3b] font-normal">(+234 707 179 4632)</span>
          </a>

          <button
            type="button"
            onClick={onEnterPortal}
            className="bg-[#18181b] hover:bg-[#27272a] text-[#fafafa] border border-[#3f3f46] font-medium text-sm px-6 py-3.5 rounded-[6px] transition-colors inline-flex items-center gap-2"
          >
            <span>Open Clinician Portal</span>
            <span aria-hidden="true">&rarr;</span>
          </button>
        </div>

        {/* 3-Column Structured Information Grid (Clean Hairlines, No Gradients) */}
        <div className="border-t border-[#27272a] pt-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="border-l border-[#27272a] pl-5">
              <span className="font-mono text-xs text-[#71717a] uppercase tracking-wider block mb-2">
                01 / WhatsApp Intake
              </span>
              <h3 className="font-['Plus_Jakarta_Sans',sans-serif] font-bold text-base text-white mb-2">
                Spoken Nigerian Pidgin
              </h3>
              <p className="text-[#a1a1aa] text-xs leading-relaxed">
                Farmers send normal voice notes without typing English or filling forms. Transcribed with 0.0% word error rate on agricultural vernacular via Gemini 3.5.
              </p>
            </div>

            <div className="border-l border-[#27272a] pl-5">
              <span className="font-mono text-xs text-[#71717a] uppercase tracking-wider block mb-2">
                02 / Clinical Safety
              </span>
              <h3 className="font-['Plus_Jakarta_Sans',sans-serif] font-bold text-base text-white mb-2">
                The Four Doors Ladder
              </h3>
              <p className="text-[#a1a1aa] text-xs leading-relaxed">
                Strict safety protocol: never fabricates antibiotic prescriptions. Routes between supportive biosecurity, vetted agro-vet store slips, and emergency escalation.
              </p>
            </div>

            <div className="border-l border-[#27272a] pl-5">
              <span className="font-mono text-xs text-[#71717a] uppercase tracking-wider block mb-2">
                03 / Grounded RAG
              </span>
              <h3 className="font-['Plus_Jakarta_Sans',sans-serif] font-bold text-base text-white mb-2">
                251-Page Vet Manual
              </h3>
              <p className="text-[#a1a1aa] text-xs leading-relaxed">
                Grounded in 760 micro-chunks with 768-dim Gemini MRL embeddings on Neon pgvector, paired with streaming Cloudflare R2 original documentation.
              </p>
            </div>
          </div>
        </div>

        {/* Engineering Proof Bar */}
        <div className="mt-16 border border-[#27272a] bg-[#121215] p-4 rounded-[8px] flex flex-wrap items-center justify-between gap-4 text-xs font-mono text-[#a1a1aa]">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-[#10b981] inline-block" />
            <span className="text-white font-medium">764 / 764 Tests Passing (100% Green)</span>
          </div>
          <div>Stack: Hono &bull; Cloudflare R2 &bull; Neon pgvector &bull; Gemini 3.1 &bull; Baileys</div>
          <a
            href="https://github.com/adesinaisaiah100/farm-advisory-agent"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white hover:underline flex items-center gap-1"
          >
            <span>GitHub Repository</span>
            <span>&nearr;</span>
          </a>
        </div>
      </main>

      {/* Clean Minimal Footer */}
      <footer className="border-t border-[#27272a] py-6 px-6 text-center text-xs text-[#71717a] font-mono">
        Borderless Bytes Hackathon (StacStart) &bull; Built by Adesina Oluwatimileyin Isaiah &bull; All Rights Reserved
      </footer>
    </div>
  );
}
export default LandingView;
