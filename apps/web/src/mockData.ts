import type { CaseSummary, OutbreakReport, AgroVetStore, LibraryDoc } from './types.js';

export const INITIAL_CASES: readonly CaseSummary[] = [];

export const INITIAL_REPORTS: readonly OutbreakReport[] = [];

export const INITIAL_STORES: readonly AgroVetStore[] = [];

export const INITIAL_LIBRARY_DOCS: readonly LibraryDoc[] = [
  {
    id: 'DOC-001',
    name: 'FAO Poultry Diseases Field Handbook (4th Edition).pdf',
    category: 'Clinical Pathology & Diagnostics',
    size: '3.8 MB',
    date: 'Sep 24, 2026',
    status: 'active'
  },
  {
    id: 'DOC-002',
    name: 'NVRI Newcastle Disease & Gumboro Field Protocol.pdf',
    category: 'Disease Outbreaks & Epidemiology',
    size: '1.4 MB',
    date: 'Sep 20, 2026',
    status: 'active'
  },
  {
    id: 'DOC-003',
    name: 'National Poultry Biosecurity & Disinfection Standards.pdf',
    category: 'Biosecurity, Sanitation & Disinfection',
    size: '2.1 MB',
    date: 'Sep 15, 2026',
    status: 'active'
  },
  {
    id: 'DOC-004',
    name: 'Veterinary Antibiotic Withdrawal Periods Schedule.pdf',
    category: 'Medications, Vaccines & Dosage',
    size: '890 KB',
    date: 'Sep 10, 2026',
    status: 'active'
  }
];
