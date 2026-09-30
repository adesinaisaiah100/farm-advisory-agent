import type { Analyzer, AnalyzeRequest, Region, SectionKind, SourceSpecies, Treatment } from '@poultry/rag';
import type { Disease } from '@poultry/schemas';

const KNOWN_DISEASES: { pattern: RegExp; disease: Disease }[] = [
  { pattern: /newcastle|ndv/i, disease: 'newcastle' },
  { pattern: /coccidi/i, disease: 'coccidiosis' },
  { pattern: /gumboro|ibdv/i, disease: 'gumboro' },
  { pattern: /fowl\s*pox|pox/i, disease: 'fowlpox' },
  { pattern: /infectious\s*bronchitis|ibv/i, disease: 'infectious_bronchitis' },
  { pattern: /necrotic\s*enteritis/i, disease: 'necrotic_enteritis' },
  { pattern: /avian\s*influenza|bird\s*flu|h5n1/i, disease: 'avian_influenza' },
];

export class ClinicalDocumentAnalyzer implements Analyzer {
  async analyze(request: AnalyzeRequest): Promise<{ regions: Region[] }> {
    const rawText = request.text;
    const lines = rawText.split('\n');

    const sections: { heading: string; lines: string[]; pageHint?: number }[] = [];
    let currentHeading = request.document.title;
    let currentLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!.trim();
      if (!line) {
        if (currentLines.length > 0) currentLines.push('');
        continue;
      }

      // Detect section headings: markdown headings, lines starting with capital words or numbered sections
      const isHeading =
        line.startsWith('#') ||
        /^(?:chapter|section|part|guideline|protocol|\d+\.|\d+\))\s+/i.test(line) ||
        (/^[A-Z][A-Za-z0-9\s—–:-]{3,60}$/.test(line) && !line.endsWith('.') && line.length < 60 && currentLines.length > 3);

      if (isHeading && currentLines.length > 0) {
        const textContent = currentLines.join('\n').trim();
        if (textContent.length > 40) {
          sections.push({
            heading: currentHeading.replace(/^#+\s*/, '').trim(),
            lines: [...currentLines],
          });
        }
        currentHeading = line.replace(/^#+\s*/, '').trim();
        currentLines = [];
      } else {
        currentLines.push(line);
      }
    }

    if (currentLines.length > 0) {
      sections.push({
        heading: currentHeading.replace(/^#+\s*/, '').trim(),
        lines: currentLines,
      });
    }

    // Fallback if no sections detected: chunk by pages or paragraphs
    if (sections.length === 0) {
      if (request.pages.length > 0) {
        for (const page of request.pages) {
          sections.push({
            heading: `${request.document.title} - Page ${page.number}`,
            lines: [page.text],
            pageHint: page.number,
          });
        }
      } else {
        sections.push({
          heading: request.document.title,
          lines: [rawText],
        });
      }
    }

    const regions: Region[] = [];

    for (const section of sections) {
      const sectionText = section.lines.join('\n').trim();
      if (sectionText.length < 20) continue;

      const lower = sectionText.toLowerCase();

      // Detect diseases
      const diseases: Disease[] = [];
      for (const { pattern, disease } of KNOWN_DISEASES) {
        if (pattern.test(lower) && !diseases.includes(disease)) {
          diseases.push(disease);
        }
      }

      // Detect species
      const species: SourceSpecies[] = [];
      if (lower.includes('broiler')) species.push('broiler');
      if (lower.includes('layer')) species.push('layer');
      if (lower.includes('cockerel')) species.push('cockerel');
      if (lower.includes('parent stock')) species.push('parent_stock');
      if (species.length === 0) species.push('poultry');

      // Detect section kind
      let sectionKind: SectionKind = 'other';
      if (/signs|symptoms|lesions|appearance|post-mortem|recumben|diarrhoea|paralysis/i.test(lower)) {
        sectionKind = 'disease_signs';
      } else if (/treatment|therapy|dosage|administration|cure|supportive|medicine|antibiotic/i.test(lower)) {
        sectionKind = 'disease_treatment';
      } else if (/prevention|biosecurity|vaccin|sanitation|disinfect|hygiene|isolation|quarantine/i.test(lower)) {
        sectionKind = 'disease_prevention';
      } else if (/diagnosis|differential|differential diagnosis|laboratory|necropsy/i.test(lower)) {
        sectionKind = 'diagnosis';
      } else if (/withdrawal|contraindication|monograph|toxicity/i.test(lower)) {
        sectionKind = 'drug_monograph';
      } else if (/stewardship|antimicrobial resistance|amr|prudent use/i.test(lower)) {
        sectionKind = 'antimicrobial_stewardship';
      }

      // Structure treatment if this is treatment advice
      let treatment: Treatment | undefined;
      if (sectionKind === 'disease_treatment') {
        treatment = {
          productClass: 'Veterinary clinical intervention protocol',
          why: sectionText.slice(0, 160).replace(/\n/g, ' '),
          askTheSeller: [
            'Is this prescription product appropriate for this specific poultry flock age?',
            'What is the mandatory withdrawal period before egg/meat consumption?',
          ],
          needsVet: true,
        };
      }

      regions.push({
        heading: section.heading || request.document.title,
        sectionKind,
        species,
        diseases,
        text: sectionText,
        treatment,
        pageHint: section.pageHint,
      });
    }

    return { regions };
  }
}
