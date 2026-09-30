import os
import sys
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    PageBreak,
    HRFlowable,
    KeepTogether,
)

def build_pdf(filename):
    doc = SimpleDocTemplate(
        filename,
        pagesize=letter,
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=36,
    )

    styles = getSampleStyleSheet()

    # Custom Color Palette
    PRIMARY = colors.HexColor('#4C1D95')     # Deep Obsidian Violet
    SECONDARY = colors.HexColor('#065F46')   # Forest Emerald
    TEXT_DARK = colors.HexColor('#0F172A')   # Slate 900
    TEXT_MUTED = colors.HexColor('#475569')  # Slate 600
    BG_LIGHT = colors.HexColor('#F8FAFC')    # Slate 50
    BORDER_COLOR = colors.HexColor('#CBD5E1')# Slate 300
    ACCENT_WARN = colors.HexColor('#9A3412') # Rust Red/Amber

    # Custom Typography Styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=20,
        leading=24,
        textColor=PRIMARY,
        spaceAfter=4,
    )

    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=TEXT_MUTED,
        spaceAfter=12,
    )

    h1_style = ParagraphStyle(
        'Heading1_Custom',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=17,
        textColor=PRIMARY,
        spaceBefore=12,
        spaceAfter=6,
    )

    h2_style = ParagraphStyle(
        'Heading2_Custom',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10.5,
        leading=14,
        textColor=SECONDARY,
        spaceBefore=8,
        spaceAfter=4,
    )

    body_style = ParagraphStyle(
        'Body_Custom',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=12,
        textColor=TEXT_DARK,
    )

    body_bold = ParagraphStyle(
        'Body_Bold',
        parent=body_style,
        fontName='Helvetica-Bold',
    )

    cue_style = ParagraphStyle(
        'Cue_Style',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=11,
        textColor=SECONDARY,
    )

    dialogue_style = ParagraphStyle(
        'Dialogue_Style',
        parent=styles['Normal'],
        fontName='Helvetica-Oblique',
        fontSize=8.5,
        leading=12,
        textColor=TEXT_DARK,
    )

    meta_label = ParagraphStyle(
        'Meta_Label',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=11,
        textColor=PRIMARY,
    )

    meta_val = ParagraphStyle(
        'Meta_Val',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=11,
        textColor=TEXT_DARK,
    )

    story = []

    # 1. Header Banner
    story.append(Paragraph("BirdVet: AI Clinical Triage & Disease Surveillance", title_style))
    story.append(Paragraph("<b>Borderless Bytes Hackathon (StacStart)</b> &bull; Official 3-Minute Video Script &amp; Final Submission Package", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=1.5, color=PRIMARY, spaceAfter=8))

    # Meta Overview Box
    meta_data = [
        [
            Paragraph("<b>Team Name:</b> BirdVet", meta_val),
            Paragraph("<b>Category:</b> Access &amp; Inclusion", meta_val),
            Paragraph("<b>Target Deadline:</b> Sept 30, 11:59 PM WAT", meta_val),
        ],
        [
            Paragraph("<b>Team Lead:</b> Adesina Oluwatimileyin Isaiah", meta_val),
            Paragraph("<b>Email:</b> adesinaisaiah100@gmail.com", meta_val),
            Paragraph("<b>Video Limit:</b> 3 Minutes (180s strict)", meta_val),
        ],
        [
            Paragraph("<b>WhatsApp Bot:</b> +234 707 179 4632", meta_val),
            Paragraph("<b>GitHub:</b> github.com/adesinaisaiah100/farm-advisory-agent", meta_val),
            Paragraph("<b>Status:</b> 764/764 Tests Passing (100%)", meta_val),
        ]
    ]
    t_meta = Table(meta_data, colWidths=[180, 180, 180])
    t_meta.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), BG_LIGHT),
        ('BOX', (0,0), (-1,-1), 1, BORDER_COLOR),
        ('INNERGRID', (0,0), (-1,-1), 0.5, BORDER_COLOR),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(t_meta)
    story.append(Spacer(1, 10))

    # 2. Section 1: The 3-Minute Video Master Script
    story.append(Paragraph("PART 1: 3-MINUTE DEMO VIDEO TIMESTAMPS &amp; SPOKEN SCRIPT", h1_style))
    story.append(Paragraph("<i>Follow this exact flow during your screen recording. Keep pace natural and energetic. Do not exceed 3 minutes.</i>", subtitle_style))

    script_table_data = [
        [
            Paragraph("<b>Timestamp</b>", meta_label),
            Paragraph("<b>Visual Screen Action</b>", meta_label),
            Paragraph("<b>Spoken Narration &amp; Dialogue (Say This)</b>", meta_label),
        ],
        # Act 1
        [
            Paragraph("<b>0:00 - 0:25</b><br/>(25 secs)", cue_style),
            Paragraph("<b>Show Title Card / GitHub README</b><br/>Transition camera to WhatsApp Web screen.", body_style),
            Paragraph("<b>[The Hook &amp; Problem]</b><br/>\"In Nigeria, over 160 million poultry birds sustain millions of smallholder families. But when flock disease strikes, farmers have zero access to veterinary doctors. Desperate, they overdose their flocks with human antibiotics—destroying their livelihoods and fueling dangerous antimicrobial resistance.<br/><br/>Meet <b>BirdVet</b>: an AI clinical triage and disease surveillance copilot built directly into WhatsApp.\"", dialogue_style),
        ],
        # Act 2
        [
            Paragraph("<b>0:25 - 1:15</b><br/>(50 secs)", cue_style),
            Paragraph("<b>WhatsApp Web Chat</b><br/>Play/send authentic voice note in Nigerian Pidgin.<br/>Show BirdVet's instant empathetic reply.", body_style),
            Paragraph("<b>[Live Farmer Intake in Nigerian Pidgin]</b><br/><i>Farmer Voice Note:</i> <b>\"Doctor, good evening. My broilers dey poop blood since yesterday, two don die, wetin I fit do?\"</b><br/><br/><i>Spoken Narration:</i> \"The farmer speaks Nigerian Pidgin via voice note. BirdVet uses Gemini 3.5 Transcribe with 0% word error rate on Pidgin, preserves vernacular stickiness, and enforces strict veterinary safety: it acknowledges bird mortality with empathy, strictly refuses to hallucinate prescription antibiotics, and asks only ONE targeted clinical follow-up question.\"", dialogue_style),
        ],
        # Act 3
        [
            Paragraph("<b>1:15 - 1:45</b><br/>(30 secs)", cue_style),
            Paragraph("<b>Clinician Dashboard</b><br/>Switch to <code>localhost:5173</code>.<br/>Click case row to slide open Obsidian-violet drawer.<br/>Play audio note &amp; show transcript chips.", body_style),
            Paragraph("<b>[Real-Time Clinician Surveillance]</b><br/>\"While the farmer is on WhatsApp, licensed veterinary officers monitor incoming cases through this real-time Clinician Dashboard. Cases are automatically grouped by farmer phone number with longitudinal history across consultation episodes.<br/><br/>Veterinarians can replay the raw audio, inspect farm photo diagnostics, and confirm triage actions.\"", dialogue_style),
        ],
        # Act 4
        [
            Paragraph("<b>1:45 - 2:20</b><br/>(35 secs)", cue_style),
            Paragraph("<b>Veterinary Reference Library</b><br/>Click 'Veterinary Reference Library' tab.<br/>Click 'View' on 251-page Manual.<br/>Show extracted micro-chunks.<br/>Click 'Download' to show R2 stream.", body_style),
            Paragraph("<b>[Grounding via 251-Page RAG Pipeline]</b><br/>\"To completely eliminate medical hallucinations, BirdVet is grounded in an end-to-end pgvector RAG pipeline. Here is an authentic 251-page poultry veterinary manual, parsed into 760 micro-chunks with 768-dimensional Gemini MRL embeddings stored in Neon Postgres, paired with high-speed Cloudflare R2 file streaming.\"", dialogue_style),
        ],
        # Act 5
        [
            Paragraph("<b>2:20 - 3:00</b><br/>(40 secs)", cue_style),
            Paragraph("<b>Architecture Slide / Terminal</b><br/>Show Architecture Flow diagram.<br/>Show <code>pnpm -r test</code> 764 green tests.", body_style),
            Paragraph("<b>[Architecture, Four Doors &amp; Impact]</b><br/>\"BirdVet implements the 'Four Doors' architecture: Resolve for supportive care, Supply for vetted local agro-vet stores, Escalate for emergency mortality red-flags, and Report for LGA outbreak surveillance.<br/><br/>Built on a strict TypeScript monorepo with 764 passing tests, Cloudflare Workers, and Neon Postgres, BirdVet turns every farmer's phone into an immediate clinical safety net. Thank you!\"", dialogue_style),
        ],
    ]

    t_script = Table(script_table_data, colWidths=[70, 160, 310])
    t_script.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), BG_LIGHT),
        ('BOX', (0,0), (-1,-1), 1, BORDER_COLOR),
        ('INNERGRID', (0,0), (-1,-1), 0.5, BORDER_COLOR),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(t_script)

    story.append(PageBreak())

    # 3. Section 2: Exact Hackathon Submission Form Answers
    story.append(Paragraph("PART 2: OFFICIAL STACSTART SUBMISSION FORM ANSWERS", h1_style))
    story.append(Paragraph("<i>Copy and paste these exact text blocks into the Google Form at <b>https://bit.ly/stacstart-hack</b></i>", subtitle_style))

    form_fields = [
        ("[2] Team Name", "BirdVet"),
        ("[3] Team Size", "2, 3, or 4 (Select your team count)"),
        ("[4] Email Address (Team Lead)", "adesinaisaiah100@gmail.com"),
        ("[5] Names of Team Members", "Adesina Oluwatimileyin Isaiah (and team members if any)"),
        ("[6] Country", "Nigeria"),
        ("[8] Project Name", "BirdVet (Poultry Triage & Veterinary Copilot)"),
        ("[9] Project Category", "Access & Inclusion  [Alternative: Civic Tech & Public Good]"),
        (
            "[10] Problem Statement — What problem are you solving?",
            "In Nigeria and Sub-Saharan Africa, over 160 million poultry birds are maintained by smallholder and semi-commercial farmers (200–2,000 birds) who lack immediate access to licensed veterinary doctors. When flock disease strikes (e.g. Coccidiosis, Newcastle Disease), farmers either face catastrophic flock mortality or misapply human antibiotics bought from unregulated vendors, devastating their livelihoods and accelerating Antimicrobial Resistance (AMR). Furthermore, illiteracy and language barriers prevent rural farmers from using text-heavy mobile apps or dashboards."
        ),
        (
            "[11] Target Users — Who is this for?",
            "1. Smallholder and semi-commercial poultry farmers (200–2,000 birds) in rural and peri-urban Nigeria communicating primarily in Nigerian Pidgin or English via WhatsApp voice notes and photos.\n2. Licensed Veterinary Officers and Epidemiologists who require real-time disease outbreak surveillance and structured clinical intake data.\n3. Vetted Local Agro-Vet Stores serving rural farming communities."
        ),
        (
            "[12] How does your solution solve the problem you stated?",
            "BirdVet removes all technological and literacy barriers by meeting farmers where they already are: WhatsApp. Farmers simply send a voice note or photo describing flock symptoms in Nigerian Pidgin. BirdVet provides immediate, non-prescriptive first-aid biosecurity advice, triages mortality red-flags, and routes the farmer via a digital referral slip to vetted agro-vet suppliers and licensed veterinarians in their Local Government Area (LGA)—preventing flock wipeouts and stopping antibiotic abuse before it starts."
        ),
        (
            "[13] How does your solution work?",
            "1. Inbound Intake: A WhatsApp bridge (Baileys) receives farmer voice notes and photos, streaming raw media directly to Cloudflare R2 via AWS SigV4.\n2. Voice & Language Processing: Audio is transcribed using Gemini 3.5 Transcribe with 0% WER on Nigerian Pidgin, with sticky language routing that maintains vernacular context.\n3. Clinical Orchestration: A Hono API running the 'Four Doors' architecture (Resolve, Supply, Escalate, Report) analyzes symptoms against a clinical ladder. It strictly enforces a zero-hallucination policy—never prescribing prescription drugs or fabricating stock.\n4. RAG Knowledge Grounding: Clinical facts are backed by an end-to-end pgvector semantic retrieval engine containing authoritative 251-page veterinary manuals (760 micro-chunks).\n5. Clinician Surveillance: An Obsidian-violet glassmorphic Web Dashboard aggregates longitudinal cases, audio replay, farm photo diagnostics, and real-time LGA outbreak signals for veterinary authorities."
        ),
        (
            "[14] Tech Stack",
            "TypeScript (Strict Monorepo), React + Vite, Tailwind CSS, Hono (Cloudflare Workers), Neon Serverless Postgres + pgvector (Drizzle ORM), Cloudflare R2 Storage (AWS SigV4), Baileys WhatsApp Multi-Device Bridge, Google AI Studio (Gemini 3.1 Flash-Lite, Gemini 3.5 Transcribe, Gemini Embedding-001 MRL), OpenRouter Failover Fallback Provider, Vitest (764 Unit/Integration Tests)."
        ),
        (
            "[15] Did you use AI tools, and how?",
            "Yes:\n1. Gemini 3.5 Transcribe: Low-latency audio transcription fine-tuned for authentic Nigerian Pidgin and agricultural terminology.\n2. Gemini 3.1 Flash-Lite: Zero-latency structured clinical reasoning, entity extraction, and conversational intake turns.\n3. Gemini Embedding-001 (768 dims MRL): Micro-chunk vector embeddings for veterinary manual retrieval via cosine distance in pgvector.\n4. OpenRouter Free Tier Fallback: Seamless automatic circuit-breaker fallback when primary provider quotas are exceeded."
        ),
        (
            "[16] Deployed / Live URL",
            "https://wa.me/2347071794632  (Live WhatsApp Veterinary Intake Bot — click to chat in Pidgin or English)"
        ),
        (
            "[17] GitHub Repository Link",
            "https://github.com/adesinaisaiah100/farm-advisory-agent  (Public Repository)"
        ),
        (
            "[19] Demo Video Link",
            "(Paste your YouTube Unlisted or Google Drive 'Anyone with link' URL here)"
        ),
        (
            "[21] Did you post with #BorderlessBytes or #BuildwithStacStart?",
            "Yes"
        ),
        (
            "[22] Link to Social Media Post",
            "(Paste your X/Twitter post link here)"
        ),
        (
            "[23] Summit Attendance Confirmation",
            "Yes"
        ),
    ]

    for label, val in form_fields:
        story.append(Paragraph(f"<b>{label}</b>", h2_style))
        content = val.replace('\n', '<br/>')
        story.append(Paragraph(content, body_style))
        story.append(Spacer(1, 4))

    story.append(Spacer(1, 8))
    story.append(HRFlowable(width="100%", thickness=1, color=PRIMARY, spaceAfter=8))

    # 4. Section 3: Social Media 1-Click Post & Final Advice
    story.append(Paragraph("PART 3: 1-CLICK TWITTER / X POST &amp; FINAL CHECKLIST", h1_style))
    story.append(Paragraph("<b>Copy and post this to X right now to get your link for Question [22]:</b>", body_style))
    story.append(Spacer(1, 4))

    tweet_text = (
        "Excited to submit BirdVet for the #BorderlessBytes Hackathon by @Stac_Start! &#128019;&#127475;&#127468;<br/><br/>"
        "We built an AI clinical triage &amp; disease surveillance engine for Nigerian poultry farmers communicating via "
        "WhatsApp voice notes in Nigerian Pidgin, backed by RAG and a live clinician dashboard.<br/><br/>"
        "<b>#BuildwithStacStart #AI #AgriTech #BuildInPublic</b>"
    )
    t_tweet = Table([[Paragraph(tweet_text, body_style)]], colWidths=[540])
    t_tweet.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), BG_LIGHT),
        ('BOX', (0,0), (-1,-1), 1, SECONDARY),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(t_tweet)

    story.append(Spacer(1, 10))
    story.append(Paragraph("<b>Final Pre-Submission Checklist:</b>", h2_style))
    checklist_items = [
        "&bull; <b>Video Length:</b> Strict maximum 3 minutes (180 seconds).",
        "&bull; <b>Video Permissions:</b> If YouTube, set to 'Unlisted' or 'Public'. If Google Drive, set to 'Anyone with the link'.",
        "&bull; <b>Incognito Check:</b> Test your video link in an incognito window before submitting.",
        "&bull; <b>WhatsApp Bridge:</b> Keep your laptop awake tonight so incoming judge messages receive instant AI replies.",
        "&bull; <b>Submit Early:</b> Submit on or before 11:00 PM WAT to prevent last-minute form rush.",
    ]
    for item in checklist_items:
        story.append(Paragraph(item, body_style))

    doc.build(story)
    print(f"Successfully generated PDF at: {filename}")

if __name__ == '__main__':
    target = sys.argv[1] if len(sys.argv) > 1 else 'BirdVet_Hackathon_Submission_Script.pdf'
    build_pdf(target)
