import type { CaseSummary, OutbreakReport, AgroVetStore, LibraryDoc } from './types.js';

export const INITIAL_CASES: readonly CaseSummary[] = [
  {
    id: 'CASE-7821',
    farmer: 'Alhaji Musa Danladi',
    phone: '+234 803 123 4567',
    state: 'Kaduna',
    lga: 'Igabi',
    species: 'Broilers (4 weeks)',
    flockSize: 1200,
    symptoms: 'Sudden high mortality, gasping, greenish diarrhea, twisted necks',
    mortality: 42,
    onsetDays: 2,
    duration: '2 days ago',
    criticality: 'critical',
    status: 'escalated',
    lastActive: '10 mins ago',
    history: [
      { sender: 'Farmer', text: 'Good morning doc, my 4 weeks broilers dey die fast since yesterday night. More than 40 don die.' },
      { sender: 'Agent', text: 'Good morning Alhaji Musa. This is very serious. Are you noticing twisted necks, breathing difficulty or greenish diarrhea?' },
      { sender: 'Farmer', text: 'Yes, some necks bend backwards and green shit dey everywhere for the pen.' },
      { sender: 'Agent', text: 'This clinical picture strongly suggests acute Newcastle Disease. Stop self-medication immediately. We are escalating this case to the Zonal Veterinary Officer in Kaduna.' }
    ]
  },
  {
    id: 'CASE-7820',
    farmer: 'Mrs. Folake Adeyemi',
    phone: '+234 802 987 6543',
    state: 'Oyo',
    lga: 'Ibadan North',
    species: 'Layers (28 weeks)',
    flockSize: 850,
    symptoms: 'Fresh bloody droppings, ruffled feathers, pale combs',
    mortality: 8,
    onsetDays: 3,
    duration: '3 days ago',
    criticality: 'critical',
    status: 'in_progress',
    lastActive: '25 mins ago',
    history: [
      { sender: 'Farmer', text: 'Doc, my point of lay layers dey stool fresh blood for 3 days now. Wetin I fit give dem?' },
      { sender: 'Agent', text: 'Ehya Mrs. Adeyemi. Fresh bloody droppings in layers is a hallmark sign of caecal coccidiosis. Are the birds pale and huddled together?' },
      { sender: 'Farmer', text: 'Yes, dem comb don pale well well.' },
      { sender: 'Agent', text: 'Please isolate symptomatic birds immediately. Check your nearest verified agro-vet in Ibadan North for water-soluble amprolium or toltrazuril.' }
    ]
  },
  {
    id: 'CASE-7819',
    farmer: 'Emeka Okafor',
    phone: '+234 814 555 0192',
    state: 'Enugu',
    lga: 'Nsukka',
    species: 'Broilers (3 weeks)',
    flockSize: 500,
    symptoms: 'Facial swelling, watery eyes, sneezing, reduced feed intake',
    mortality: 2,
    onsetDays: 4,
    duration: '4 days ago',
    criticality: 'high',
    status: 'in_progress',
    lastActive: '1 hour ago',
    history: [
      { sender: 'Farmer', text: 'Good day. My broilers their face dey swell and dem dey sneeze.' },
      { sender: 'Agent', text: 'Hello Mr. Okafor. Swollen faces and sneezing indicate infectious coryza or chronic respiratory disease. Any foul smell from the nostrils?' },
      { sender: 'Farmer', text: 'Yes, bad smell dey come out from dem nose.' },
      { sender: 'Agent', text: 'Coryza confirmed. Keep the litter dry and improve pen ventilation right away.' }
    ]
  },
  {
    id: 'CASE-7818',
    farmer: 'Babatunde Gbadamosi',
    phone: '+234 805 444 3322',
    state: 'Ogun',
    lga: 'Abeokuta South',
    species: 'Cockerels (10 weeks)',
    flockSize: 400,
    symptoms: 'Warty nodules on comb and eyelids, scabs',
    mortality: 0,
    onsetDays: 5,
    duration: '5 days ago',
    criticality: 'moderate',
    status: 'in_progress',
    lastActive: '3 hours ago',
    history: [
      { sender: 'Farmer', text: 'My cockerels get black black boils for their face and comb.' },
      { sender: 'Agent', text: 'Good day Mr. Gbadamosi. These scabby nodules represent dry fowl pox transmitted by mosquitoes. Do not forcefully peel the scabs.' }
    ]
  },
  {
    id: 'CASE-7817',
    farmer: 'Fatima Sanusi',
    phone: '+234 809 333 1122',
    state: 'Kano',
    lga: 'Nassarawa',
    species: 'Layers (45 weeks)',
    flockSize: 1500,
    symptoms: 'Egg drop syndrome, soft-shelled eggs, thin shells',
    mortality: 0,
    onsetDays: 7,
    duration: '1 week ago',
    criticality: 'moderate',
    status: 'triage',
    lastActive: '5 hours ago',
    history: [
      { sender: 'Farmer', text: 'My hens dey lay soft shell egg for one week now. Production drop from 85% to 60%.' },
      { sender: 'Agent', text: 'Hello Hajiya Fatima. Soft-shell eggs and sudden production drops often trace to calcium-phosphorus imbalance or Egg Drop Syndrome (EDS-76).' }
    ]
  },
  {
    id: 'CASE-7816',
    farmer: 'Victor Ogbonna',
    phone: '+234 818 222 9988',
    state: 'Plateau',
    lga: 'Jos South',
    species: 'Pullets (14 weeks)',
    flockSize: 600,
    symptoms: 'Resolved past coccidiosis following amprolium therapy',
    mortality: 1,
    onsetDays: 10,
    duration: 'Resolved',
    criticality: 'resolved',
    status: 'resolved',
    lastActive: '1 day ago',
    history: [
      { sender: 'Farmer', text: 'Doc, the birds don stop to stool blood after 5 days of treatment.' },
      { sender: 'Agent', text: 'Excellent news Mr. Victor! Ensure you continue with multivitamin support for 3 days to rebuild their gut lining.' }
    ]
  }
];

export const INITIAL_REPORTS: readonly OutbreakReport[] = [
  {
    id: 'REP-049',
    disease: 'Newcastle Disease (Velogenic)',
    state: 'Kaduna',
    lga: 'Igabi',
    date: 'Sep 29, 2026',
    criticality: 'critical',
    summary: 'Multiple broiler farms reporting acute mortality (>30%), nervous signs, and greenish diarrhea.',
    caseCount: 8
  },
  {
    id: 'REP-048',
    disease: 'Caecal Coccidiosis',
    state: 'Oyo',
    lga: 'Ibadan North',
    date: 'Sep 27, 2026',
    criticality: 'critical',
    summary: 'Clustered bloody stooling reports in young layers following continuous humidity and wet litter.',
    caseCount: 5
  },
  {
    id: 'REP-047',
    disease: 'Infectious Coryza',
    state: 'Enugu',
    lga: 'Nsukka',
    date: 'Sep 25, 2026',
    criticality: 'high',
    summary: 'Localized respiratory outbreaks with facial edema and foul nasal discharge.',
    caseCount: 4
  },
  {
    id: 'REP-046',
    disease: 'Avian Fowl Pox',
    state: 'Ogun',
    lga: 'Abeokuta South',
    date: 'Sep 22, 2026',
    criticality: 'moderate',
    summary: 'Scattered cutaneous nodule cases correlated with mosquito breeding near poultry pens.',
    caseCount: 3
  }
];

export const INITIAL_STORES: readonly AgroVetStore[] = [
  {
    id: 'STR-001',
    name: 'Bodija Animal Health & Vet Supplies',
    state: 'Oyo',
    lga: 'Ibadan North',
    phone: '+2348035551234',
    phoneFormatted: '+234 803 555 1234',
    address: 'Plot 14, Commercial Layout, Bodija Market, Ibadan',
    services: ['Cold Chain Vaccines', 'Anticoccidials', 'Post-Mortem Referral', 'Feed Premix']
  },
  {
    id: 'STR-002',
    name: 'Premier Livestock Pharmacy & Diagnostics',
    state: 'Oyo',
    lga: 'Ibadan North',
    phone: '+2348024445678',
    phoneFormatted: '+234 802 444 5678',
    address: '8 University Crescent, Near UI Gate, Agbowo, Ibadan',
    services: ['Veterinary Doctor on Duty', 'Electrolytes', 'Antibiotic Sensitisation']
  },
  {
    id: 'STR-003',
    name: 'Kaduna Central Agro-Vet Hub',
    state: 'Kaduna',
    lga: 'Kaduna North',
    phone: '+2348057778899',
    phoneFormatted: '+234 805 777 8899',
    address: '22 Ahmadu Bello Way, Central Business District, Kaduna',
    services: ['Poultry Vaccines (NVRI)', 'Emergency Biosecurity Kits', 'Disinfectants']
  },
  {
    id: 'STR-004',
    name: 'Zaria Road Farm Inputs Center',
    state: 'Kaduna',
    lga: 'Igabi',
    phone: '+2348149990011',
    phoneFormatted: '+234 814 999 0011',
    address: 'Mile 4, Zaria Expressway, Rigachikun, Igabi',
    services: ['Feed & Supplements', 'Dewormers', 'Field Sampling']
  },
  {
    id: 'STR-005',
    name: 'Abeokuta Farmers Companion Vet Store',
    state: 'Ogun',
    lga: 'Abeokuta South',
    phone: '+2348091112233',
    phoneFormatted: '+234 809 111 2233',
    address: '15 Lalubu Street, Oke-Ilewo, Abeokuta',
    services: ['Fowl Pox Vaccines', 'Water Sanitizers', 'Biosecurity Sprays']
  },
  {
    id: 'STR-006',
    name: 'Nsukka University Agro-Veterinary Center',
    state: 'Enugu',
    lga: 'Nsukka',
    phone: '+2348183334455',
    phoneFormatted: '+234 818 333 4455',
    address: '4 University Road, Opposite Faculty of Agriculture, Nsukka',
    services: ['Clinical Consultations', 'Laboratory Culture', 'Coryza Treatments']
  },
  {
    id: 'STR-007',
    name: 'Plateau Livestock & Poultry Care',
    state: 'Plateau',
    lga: 'Jos South',
    phone: '+2348062223344',
    phoneFormatted: '+234 806 222 3344',
    address: 'Old Airport Junction, Rayfield Road, Jos South',
    services: ['Brooding Equipments', 'Anti-stress Formulations', 'Post-Mortem Examination']
  }
];

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
