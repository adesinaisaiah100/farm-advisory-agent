import type { CaseSummary, OutbreakReport, AgroVetStore } from './types.js';
import { INITIAL_CASES, INITIAL_REPORTS, INITIAL_STORES } from './mockData.js';

const API_BASE = 'http://127.0.0.1:3001';

export async function fetchCases(): Promise<readonly CaseSummary[]> {
  try {
    const res = await fetch(`${API_BASE}/cases`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data && Array.isArray(data.cases) && data.cases.length > 0) {
      return data.cases.map((c: any) => ({
        id: c.caseId || c.sessionId,
        farmer: c.farmerName || 'Farmer ' + (c.phone ? c.phone.slice(-4) : 'Unknown'),
        phone: c.phone || 'Unknown',
        state: c.state || 'Unknown',
        lga: c.lga || 'Unknown',
        species: c.species || 'Poultry',
        flockSize: c.farmSize || 500,
        symptoms: Array.isArray(c.symptoms) ? c.symptoms.join(', ') : (c.symptoms || 'None reported'),
        mortality: c.mortalityCount || 0,
        onsetDays: c.onsetDays || 1,
        duration: c.onsetDays ? `${c.onsetDays} days ago` : 'Recent',
        criticality: (c.mortalityCount && c.mortalityCount > 10) ? 'critical' : (c.mortalityCount && c.mortalityCount > 0) ? 'high' : 'moderate',
        status: c.status === 'completed' ? 'resolved' : c.status || 'in_progress',
        lastActive: c.lastActive || 'Recently',
        history: []
      }));
    }
    return INITIAL_CASES;
  } catch {
    return INITIAL_CASES;
  }
}

export async function fetchReports(): Promise<readonly OutbreakReport[]> {
  try {
    const res = await fetch(`${API_BASE}/reports`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data && Array.isArray(data.reports) && data.reports.length > 0) {
      return data.reports.map((r: any, idx: number) => ({
        id: `REP-${String(idx + 1).padStart(3, '0')}`,
        disease: r.disease || 'Poultry Outbreak',
        state: r.state || 'Unknown',
        lga: r.lga || 'Unknown',
        date: r.date || 'Recent',
        criticality: r.criticality || 'high',
        summary: r.summary || 'Surveillance report signal received.',
        caseCount: r.caseCount || 1
      }));
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
    if (Array.isArray(data) && data.length > 0) {
      return data.map((s: any, idx: number) => ({
        id: s.id || `STR-${String(idx + 1).padStart(3, '0')}`,
        name: s.name,
        state: s.state,
        lga: s.lga,
        phone: s.phone,
        phoneFormatted: s.phoneFormatted || s.phone,
        address: s.address,
        services: s.services || []
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
