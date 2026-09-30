import type { CaseSummary, OutbreakReport, AgroVetStore, TurnMessage } from './types.js';
import { INITIAL_CASES, INITIAL_REPORTS, INITIAL_STORES } from './mockData.js';

const API_BASE = 'http://127.0.0.1:3001';

function formatPhoneNumber(phone: string): string {
  if (!phone) return '';
  const clean = phone.trim();
  const digits = clean.replace(/\D/g, '');
  if (digits.startsWith('234') && digits.length === 13) {
    return `+234 ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
  }
  return clean;
}

function inferDisease(symptoms: readonly string[]): string {
  const text = symptoms.join(' ').toLowerCase();
  if (text.includes('blood') || text.includes('coccid')) return 'Caecal Coccidiosis';
  if (text.includes('neck') || text.includes('green') || text.includes('gasp') || text.includes('recumb')) return 'Newcastle Disease (Suspected)';
  if (text.includes('sneeze') || text.includes('cough') || text.includes('coryza')) return 'Infectious Coryza / CRD';
  if (text.includes('scab') || text.includes('pox') || text.includes('wart')) return 'Avian Fowl Pox';
  if (text.includes('soft') || text.includes('drop')) return 'Egg Drop Syndrome (EDS-76)';
  return 'Poultry Syndromic Alert';
}

function parseTurnMessage(raw: any): TurnMessage {
  const isAgent = raw.role === 'agent' || raw.sender === 'Agent';
  const text: string = raw.text || raw.payload || '';
  const isPhoto = text.startsWith('[Photo Observation:') || raw.mediaKind === 'image' || Boolean(raw.imageUrl);
  const isVoice = text.startsWith('[Voice Note:') || text.startsWith('[Audio Note:') || raw.mediaKind === 'audio' || Boolean(raw.audioUrl);

  let photoObservations: string[] | undefined;
  if (isPhoto) {
    const match = text.match(/\[Photo Observation:\s*(.*?)\]/i);
    if (match && match[1]) {
      photoObservations = match[1].split('..').map(s => s.trim().replace(/^\./, '').trim()).filter(Boolean);
    }
  }

  return {
    sender: isAgent ? 'Agent' : 'Farmer',
    text,
    isPhoto,
    isVoice,
    mediaUrl: raw.mediaUrl || raw.url,
    photoObservations,
    timestamp: raw.sentAt ? new Date(raw.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined
  };
}

export async function fetchCases(): Promise<readonly CaseSummary[]> {
  try {
    const res = await fetch(`${API_BASE}/cases`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data && Array.isArray(data.cases) && data.cases.length > 0) {
      return data.cases.map((c: any) => {
        const symptomsArr: string[] = Array.isArray(c.symptoms) ? c.symptoms : (c.symptoms ? [c.symptoms] : []);
        const symptomsStr = symptomsArr.length > 0 ? symptomsArr.join(', ') : 'Clinical observation pending';
        const mortality = c.mortalityCount || 0;
        const criticality = (mortality >= 3 || symptomsStr.includes('blood') || symptomsStr.includes('die'))
          ? 'critical'
          : (mortality > 0 ? 'high' : (c.status === 'complete' ? 'resolved' : 'moderate'));

        const status = (c.status === 'completed' || c.status === 'complete')
          ? 'resolved'
          : (c.status || 'in_progress');

        return {
          id: c.caseId || c.sessionId,
          sessionId: c.sessionId,
          farmer: c.farmerName || 'Farmer ' + (c.phone ? c.phone.slice(-4) : 'Unknown'),
          phone: formatPhoneNumber(c.phone || ''),
          state: c.state || 'Oyo',
          lga: c.lga || 'Ibadan',
          species: c.species ? `${c.species} (${c.farmSize || 500} birds)` : 'Broilers',
          flockSize: c.farmSize || 500,
          symptoms: symptomsStr,
          mortality,
          onsetDays: c.onsetDays || 1,
          duration: c.onsetDays ? `${c.onsetDays} days ago` : 'Recent',
          criticality,
          status,
          lastActive: c.lastActive ? new Date(c.lastActive).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recently',
          history: []
        };
      });
    }
    return INITIAL_CASES;
  } catch {
    return INITIAL_CASES;
  }
}

export async function fetchCaseDetail(idOrSessionId: string): Promise<CaseSummary | null> {
  try {
    const res = await fetch(`${API_BASE}/cases/${encodeURIComponent(idOrSessionId)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const c = data.case || {};
    const farmer = data.farmer || {};
    const history: TurnMessage[] = (data.history || []).map(parseTurnMessage);

    const mediaItems: { kind: 'image' | 'audio'; title: string; url?: string; description?: string }[] = [];
    history.forEach((msg, idx) => {
      if (msg.isPhoto) {
        mediaItems.push({
          kind: 'image',
          title: `Flock Photo #${idx + 1}`,
          description: msg.photoObservations ? msg.photoObservations.join(', ') : 'Clinical observation photo'
        });
      } else if (msg.isVoice) {
        mediaItems.push({
          kind: 'audio',
          title: `Voice Note #${idx + 1}`,
          description: msg.text
        });
      }
    });

    const symptomsArr: string[] = Array.isArray(c.symptoms) ? c.symptoms : (c.symptoms ? [c.symptoms] : []);
    const symptomsStr = symptomsArr.length > 0 ? symptomsArr.join(', ') : 'Clinical observation pending';
    const mortality = c.mortalityCount || 0;
    const criticality = (mortality >= 3 || symptomsStr.includes('blood') || symptomsStr.includes('die'))
      ? 'critical'
      : (mortality > 0 ? 'high' : 'moderate');

    return {
      id: c.id || data.caseId || data.sessionId,
      sessionId: data.sessionId,
      farmer: farmer.name || c.farmerName || 'Farmer ' + (data.phone ? data.phone.slice(-4) : 'Unknown'),
      phone: formatPhoneNumber(data.phone || farmer.phone || ''),
      state: farmer.state || c.state || 'Oyo',
      lga: farmer.lga || c.lga || 'Ibadan',
      species: c.species ? `${c.species} (${c.farmSize || farmer.farmSize || 500} birds)` : 'Broilers',
      flockSize: c.farmSize || farmer.farmSize || 500,
      symptoms: symptomsStr,
      mortality,
      onsetDays: c.onsetDays || 1,
      duration: c.onsetDays ? `${c.onsetDays} days ago` : 'Recent',
      criticality,
      status: (c.status === 'completed' || c.status === 'complete') ? 'resolved' : (c.status || 'in_progress'),
      lastActive: data.lastActive ? new Date(data.lastActive).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recently',
      history,
      mediaItems
    };
  } catch (err) {
    console.error('Failed to fetch case detail:', err);
    return null;
  }
}

export async function fetchReports(): Promise<readonly OutbreakReport[]> {
  try {
    const res = await fetch(`${API_BASE}/reports`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data && Array.isArray(data.reports) && data.reports.length > 0) {
      return data.reports.map((r: any, idx: number) => {
        const symptoms: string[] = Array.isArray(r.symptoms) ? r.symptoms : [];
        const diseaseName = inferDisease(symptoms);
        const mortality = r.mortalityCount || 0;
        const criticality = (mortality >= 3 || diseaseName.includes('Newcastle') || diseaseName.includes('Coccidiosis'))
          ? 'critical'
          : (mortality > 0 ? 'high' : 'moderate');

        return {
          id: `REP-${String(idx + 1).padStart(3, '0')}`,
          disease: diseaseName,
          state: r.state || 'Oyo',
          lga: r.lga || 'Ibadan',
          date: r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent',
          criticality,
          summary: symptoms.length > 0 ? symptoms.join(', ') : 'Flock showing clinical distress.',
          caseCount: mortality > 0 ? mortality : 1
        };
      });
    }
    return INITIAL_REPORTS;
  } catch {
    return INITIAL_REPORTS;
  }
}

export async function fetchStores(): Promise<readonly AgroVetStore[]> {
  try {
    const res = await fetch(`${API_BASE}/stores`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const rawStores = Array.isArray(data) ? data : (data.stores || []);
    if (Array.isArray(rawStores) && rawStores.length > 0) {
      return rawStores.map((s: any, idx: number) => ({
        id: s.id || `STR-${String(idx + 1).padStart(3, '0')}`,
        name: s.name,
        state: s.state || 'Oyo',
        lga: s.lga || 'Ibadan',
        phone: s.phone,
        phoneFormatted: formatPhoneNumber(s.phone),
        address: s.address || `${s.lga}, ${s.state} State, Nigeria`,
        services: s.services && s.services.length > 0 ? s.services : ['Vaccine Cold Chain', 'Anticoccidials', 'Post-Mortem Referral', 'Emergency Antibiotics']
      }));
    }
    return INITIAL_STORES;
  } catch {
    return INITIAL_STORES;
  }
}

export async function sendChatMessage(phone: string, text: string): Promise<string> {
  try {
    const res = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, text })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.reply || data.text || 'Message processed by BirdVet AI.';
  } catch {
    return 'Ehya, I dey sorry to hear say your birds dey sick. Bloody droppings na serious sign of coccidiosis. Abeg make you check your nearest agro-vet for treatment and keep their pen clean.';
  }
}
