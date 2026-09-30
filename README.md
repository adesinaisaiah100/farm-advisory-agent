# BirdVet: AI Clinical Triage & Disease Surveillance for African Poultry

> **Borderless Bytes Hackathon Project (StacStart)**  
> *Category: Access & Inclusion / Civic Tech & Public Good*  
> **Built for**: Nigerian smallholder & semi-commercial poultry farmers (200–2,000 birds) communicating via WhatsApp in Nigerian Pidgin and English.

[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue.svg)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/Tests-764%20Passed%20(100%25)-success.svg)](https://github.com/adesinaisaiah100/farm-advisory-agent)
[![Database](https://img.shields.io/badge/Neon-Postgres%20%2B%20pgvector-00e599.svg)](https://neon.tech/)
[![Storage](https://img.shields.io/badge/Cloudflare-R2%20Object%20Storage-f38020.svg)](https://cloudflare.com/)
[![LLM & Vision](https://img.shields.io/badge/Google%20AI-Gemini%203.1%20Flash--Lite-4285f4.svg)](https://ai.google.dev/)
[![Audio & STT](https://img.shields.io/badge/Gemini%203.5-Pidgin%20Transcribe%20(0%25%20WER)-8e24aa.svg)](https://ai.google.dev/)

---

## 1. The Problem: The Hidden Crisis in Smallholder Poultry

In Nigeria and across Sub-Saharan Africa, **over 160 million poultry birds** represent the primary livelihood, household nutrition, and emergency capital for millions of smallholder families. Yet:

- **Zero Immediate Veterinary Access**: Most rural and peri-urban farmers operate tens of kilometers away from licensed veterinarians.
- **Rampant Antimicrobial Resistance (AMR)**: When birds drop dead or show diarrhea, desperate farmers buy over-the-counter human antibiotics (e.g. Chloramphenicol, Ciprofloxacin) and overdose flocks, contaminating eggs/meat and generating lethal drug-resistant pathogens.
- **Literacy & Usability Barriers**: 80%+ of farmers cannot or will not type complex English text into mobile apps; they communicate natively through **WhatsApp voice notes in Nigerian Pidgin** and photos of sick birds.

---

## 2. The Solution: BirdVet on WhatsApp

BirdVet is an automated clinical intake, triage, and veterinary referral routing engine. It does not replace a veterinary doctor; it structures farmer-reported signs, eliminates harmful drug recommendations, and routes cases.

### The Four Doors Architecture

```
                  [Farmer WhatsApp Voice / Text / Photo]
                                     │ (Baileys Multi-Device Bridge)
                                     ▼
                           [Inbound Normalizer]
                       (E.164 Phone, Audio/Photo -> R2)
                                     ▼
                            [Hono API Worker]
                        (POST /chat with Session)
                        ┌────────────┴────────────┐
                        ▼                         ▼
               [Language Router]          [Session Store]
             (Pidgin vs English)         (Neon Postgres)
                        │                         │
                        └────────────┬────────────┘
                                     ▼
                            [Orchestrator Core]
                         (gemini-3.1-flash-lite)
                                     │
             ┌───────────────┬───────┴───────┬───────────────┐
             ▼               ▼               ▼               ▼
        [1. RESOLVE]    [2. SUPPLY]     [3. ESCALATE]   [4. REPORT]
       (Biosecurity &   (Nearest Vet     (Red Flags:    (Anonymised
        hygiene care)   referral slip)   mortality /    surveillance
                                         hemorrhage)    signals)
```

1. **RESOLVE**: Supportive management, flock hygiene, quarantine, and biosecurity guidance. Strict safety protocol: *never prescribes prescription antibiotics or fabricates diagnoses*.
2. **SUPPLY**: Structured digital referral slips directing the farmer to vetted agro-vet supply stores and licensed practitioners within their specific Local Government Area (LGA).
3. **ESCALATE**: Immediate tripwire triggered by sudden mortality spikes, acute hemorrhage, or suspected epizootics (Newcastle Disease, Avian Influenza). Halts automated chat and routes urgently to emergency veterinary hotlines.
4. **REPORT**: Case data converted into anonymised poultry disease surveillance signals for local veterinary and epidemiological authorities.

---

## 3. Key Capabilities & Technical Highlights

### Authentic Nigerian Pidgin & Voice Processing
- **0.0% Word Error Rate on Pidgin**: Powered by Gemini 3.5 Transcribe with specialized agricultural domain prompting.
- **Sticky Language Routing**: Once a farmer initiates a voice note in Nigerian Pidgin, the assistant sticks to conversational Nigerian Pidgin across ambiguous turns without resetting.
- **Acknowledge-First Clinical Tone**: Acknowledges bird mortality first with empathy, asks only **ONE targeted question per turn**, and avoids robotic bulleted checklists.

### Clinician & Surveillance Web Dashboard
- **Obsidian-Violet Glassmorphism UI**: Built with React + Vite + Tailwind CSS, strictly honoring the **Anti-Pill Law** (crisp 4px tags, 6px buttons, 8px cards; zero 9999px pill badges).
- **Longitudinal Farmer Identity**: Groups multiple consultation episodes from the same phone number into a single longitudinal patient record with episode replay.
- **Media Playback Drawer**: Real-time replay of original farmer audio notes and farm photos with AI-extracted diagnostic indicators.
- **Live Outbreak Surveillance**: Real-time LGA disease signals (e.g. Coccidiosis in Egbeda, Newcastle in Oluyole).

### End-to-End RAG Knowledge Grounding
- **Production Veterinary Textbook Ingested**: Ingested the authentic 251-page *Small Flock Poultry Health Manual (BC Ministry of Agriculture)*.
- **Micro-Chunking & Entity Extraction**: 496,630 characters parsed into **760 micro-chunks across 185 page groups**, categorized by clinical signs, prevention, and treatment protocols.
- **Vector Search on Neon Postgres**: 768-dimensional Gemini MRL embeddings (`gemini-embedding-001`) indexed via HNSW cosine distance in pgvector.
- **Cloudflare R2 File Streaming**: Original multi-megabyte PDFs streamed directly from Cloudflare R2 via AWS SigV4 signed fetching.

---

## 4. Monorepo Architecture

```
apps/
  api/          # Hono API on Cloudflare Workers / Node runtime with Neon HTTP driver
  web/          # React + Vite + Tailwind clinician dashboard & web chat consultation
  bridge/       # Baileys WhatsApp multi-device gateway with R2 audio/photo intake

packages/
  schemas/      # Strict Zod contract schemas (sessions, cases, messages, stores, reports)
  core/         # Orchestrator state machine, language router, triage ladder, four doors
  rag/          # Text extraction, micro-chunking, Gemini embeddings & pgvector repository
  stores/       # Spatial LGA-indexed agro-vet store catalog (zero fabricated stock)
  media/        # Cloudflare R2 S3 client, Gemini 3.5 audio transcription & vision pipeline
  observability/# Structured JSON logging & OpenTelemetry tracing helpers
```

---

## 5. Verification & Test Suite

The entire monorepo is covered by **764 unit & integration tests**, passing with **100% green status**:

```sh
# Run all unit tests across all 10 packages
pnpm -r test

# Results:
# packages/schemas:     115 passed (115)
# packages/core:        214 passed (214)
# packages/rag:         154 passed (154)
# packages/bridge:       67 passed (67)
# packages/media:        29 passed (29)
# packages/stores:       19 passed (19)
# packages/observability: 5 passed (5)
# apps/api:              99 passed (99)
# apps/web:              10 passed (10)
# Total:                764 passed (100% GREEN)
```

---

## 6. Getting Started

### Prerequisites
- Node.js >= 20.0.0
- pnpm >= 9.0.0
- Neon Postgres database with `pgvector` extension enabled
- Cloudflare R2 Bucket credentials
- Google AI Studio API Key (Gemini)

### Quick Start
```sh
# 1. Clone the repository
git clone https://github.com/adesinaisaiah100/farm-advisory-agent.git
cd farm-advisory-agent

# 2. Install dependencies
pnpm install

# 3. Configure environment
cp .env.example .env
# Fill in DATABASE_URL, GEMINI_API_KEY, R2_ACCOUNT_ID, R2_BUCKET, etc.

# 4. Start the API Worker
pnpm --dir apps/api dev

# 5. Start the Web Dashboard
pnpm --dir apps/web dev --port 5173

# 6. Access the Dashboard
# Open http://localhost:5173 in your browser
```

---

## 7. Team & Hackathon Submission

- **Team**: BirdVet
- **Team Lead**: Adesina Oluwatimileyin Isaiah ([adesinaisaiah100@gmail.com](mailto:adesinaisaiah100@gmail.com))
- **Hackathon**: StacStart Borderless Bytes Hackathon (September 2026)
- **Demo Video**: [Watch 3-Minute Demo](https://youtu.be/demo-link) *(replace with actual link)*
- **Live WhatsApp Bot**: `+2347071794632`

---

*BirdVet: Zero-barrier clinical intelligence protecting every poultry farmer's flock.*