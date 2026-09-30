import type { CaseSummary, OutbreakReport, AgroVetStore, TurnMessage, SessionSummaryItem, Criticality, CaseStatus, LibraryDoc } from './types.js';

const API_BASE = (typeof window !== 'undefined' && window.location && window.location.origin) ? '' : 'http://127.0.0.1:3001';

async function fetchWithRetry(url: string, init?: RequestInit, retries = 2): Promise<Response> {
  try {
    const res = await fetch(url, init);
    if (!res.ok && res.status >= 500 && retries > 0) {
      await new Promise(r => setTimeout(r, 400));
      return fetchWithRetry(url, init, retries - 1);
    }
    return res;
  } catch (err) {
    if (retries > 0) {
      await new Promise(r => setTimeout(r, 400));
      return fetchWithRetry(url, init, retries - 1);
    }
    throw err;
  }
}

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
    const res = await fetchWithRetry(`${API_BASE}/cases`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data && Array.isArray(data.cases) && data.cases.length > 0) {
      // Group sessions by unique farmer phone number
      const farmerMap = new Map<string, any[]>();
      for (const item of data.cases) {
        const key = item.phone?.trim() || item.sessionId || item.caseId;
        const list = farmerMap.get(key) ?? [];
        list.push(item);
        farmerMap.set(key, list);
      }

      const farmerSummaries: CaseSummary[] = [];

      for (const [, sessionList] of farmerMap.entries()) {
        // Sort sessions by lastActive desc so sessionList[0] is the most recent consultation episode
        sessionList.sort((a, b) => {
          const tA = a.lastActive ? new Date(a.lastActive).getTime() : 0;
          const tB = b.lastActive ? new Date(b.lastActive).getTime() : 0;
          return tB - tA;
        });

        const latest = sessionList[0];

        const sessions: SessionSummaryItem[] = sessionList.map((s) => {
          const sArr: string[] = Array.isArray(s.symptoms) ? s.symptoms : (s.symptoms ? [s.symptoms] : []);
          const sStr = sArr.length > 0 ? sArr.join(', ') : 'Clinical observation pending';
          const mort = s.mortalityCount || 0;
          const crit: Criticality = (mort >= 3 || sStr.includes('blood') || sStr.includes('die'))
            ? 'critical'
            : (mort > 0 ? 'high' : (s.status === 'complete' ? 'resolved' : 'moderate'));
          const stat: CaseStatus = (s.status === 'completed' || s.status === 'complete')
            ? 'resolved'
            : (s.status || 'in_progress');

          return {
            sessionId: s.sessionId,
            caseId: s.caseId,
            status: stat,
            criticality: crit,
            startedAt: s.startedAt ? new Date(s.startedAt).toLocaleDateString([], { month: 'short', day: 'numeric' }) : undefined,
            lastActive: s.lastActive ? new Date(s.lastActive).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recently',
            symptoms: sStr,
            mortality: mort,
            onsetDays: s.onsetDays || 1,
            duration: s.onsetDays ? `${s.onsetDays} days ago` : 'Recent'
          };
        });

        const symptomsArr: string[] = Array.isArray(latest.symptoms) ? latest.symptoms : (latest.symptoms ? [latest.symptoms] : []);
        const symptomsStr = symptomsArr.length > 0 ? symptomsArr.join(', ') : 'Clinical observation pending';
        const mortality = latest.mortalityCount || 0;

        const hasCritical = sessionList.some(s => (s.mortalityCount || 0) >= 3 || JSON.stringify(s.symptoms || '').includes('blood'));
        const hasHigh = sessionList.some(s => (s.mortalityCount || 0) > 0);
        const criticality: Criticality = (mortality >= 3 || symptomsStr.includes('blood') || symptomsStr.includes('die'))
          ? 'critical'
          : (mortality > 0 ? 'high' : (hasCritical ? 'critical' : (hasHigh ? 'high' : (latest.status === 'complete' ? 'resolved' : 'moderate'))));

        const status: CaseStatus = (latest.status === 'completed' || latest.status === 'complete')
          ? 'resolved'
          : (latest.status || 'in_progress');

        farmerSummaries.push({
          id: latest.caseId || latest.sessionId,
          sessionId: latest.sessionId,
          farmer: latest.farmerName || 'Farmer ' + (latest.phone ? latest.phone.slice(-4) : 'Unknown'),
          phone: formatPhoneNumber(latest.phone || ''),
          state: latest.state || 'Oyo',
          lga: latest.lga || 'Ibadan',
          species: latest.species ? `${latest.species} (${latest.farmSize || 500} birds)` : 'Broilers',
          flockSize: latest.farmSize || 500,
          symptoms: symptomsStr,
          mortality,
          onsetDays: latest.onsetDays || 1,
          duration: latest.onsetDays ? `${latest.onsetDays} days ago` : 'Recent',
          criticality,
          status,
          lastActive: latest.lastActive ? new Date(latest.lastActive).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recently',
          history: [],
          sessionCount: sessionList.length,
          sessions
        });
      }

      return farmerSummaries;
    }
    return [];
  } catch {
    return [];
  }
}

export async function fetchCaseDetail(idOrSessionId: string): Promise<CaseSummary | null> {
  try {
    const res = await fetchWithRetry(`${API_BASE}/cases/${encodeURIComponent(idOrSessionId)}`);
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

    const sessionsList: SessionSummaryItem[] = Array.isArray(data.sessions) && data.sessions.length > 0
      ? data.sessions.map((s: any) => {
          const sArr: string[] = Array.isArray(s.symptoms) ? s.symptoms : (s.symptoms ? [s.symptoms] : []);
          const sStr = sArr.length > 0 ? sArr.join(', ') : 'Clinical observation pending';
          const mort = s.mortalityCount || 0;
          const crit: Criticality = (mort >= 3 || sStr.includes('blood') || sStr.includes('die'))
            ? 'critical'
            : (mort > 0 ? 'high' : (s.status === 'complete' ? 'resolved' : 'moderate'));
          const stat: CaseStatus = (s.status === 'completed' || s.status === 'complete')
            ? 'resolved'
            : (s.status || 'in_progress');

          return {
            sessionId: s.sessionId,
            caseId: s.caseId,
            status: stat,
            criticality: crit,
            startedAt: s.startedAt ? new Date(s.startedAt).toLocaleDateString([], { month: 'short', day: 'numeric' }) : undefined,
            lastActive: s.lastActive ? new Date(s.lastActive).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recently',
            symptoms: sStr,
            mortality: mort,
          };
        })
      : [];

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
      mediaItems,
      sessionCount: sessionsList.length || 1,
      sessions: sessionsList
    };
  } catch (err) {
    console.error('Failed to fetch case detail:', err);
    return null;
  }
}

export async function fetchReports(): Promise<readonly OutbreakReport[]> {
  try {
    const res = await fetchWithRetry(`${API_BASE}/reports`);
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
    return [];
  } catch {
    return [];
  }
}

export async function fetchStores(): Promise<readonly AgroVetStore[]> {
  try {
    const res = await fetchWithRetry(`${API_BASE}/stores`);
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
    return [];
  } catch {
    return [];
  }
}

export interface LibraryUploadInput {
  readonly title: string;
  readonly category: string;
  readonly file: File;
  readonly publisher?: string;
}

async function readApiError(res: Response, fallback: string): Promise<Error> {
  try {
    const data = await res.json();
    const message = data?.error?.message;
    return new Error(typeof message === 'string' && message ? message : fallback);
  } catch {
    return new Error(fallback);
  }
}

export async function fetchLibrary(): Promise<readonly LibraryDoc[]> {
  const res = await fetchWithRetry(`${API_BASE}/library`);
  if (!res.ok) throw await readApiError(res, `HTTP ${res.status}`);
  const data = await res.json();
  const raw = Array.isArray(data) ? data : (data.documents ?? []);
  return raw.map((d: any): LibraryDoc => ({
    id: d.id,
    name: d.name,
    category: d.category,
    size: d.size,
    date: d.date,
    status: d.status,
    chunkCount: d.chunkCount,
    ...(d.url ? { url: d.url } : {}),
    ...(d.publisher ? { publisher: d.publisher } : {}),
    ...(typeof d.year === 'number' ? { year: d.year } : {}),
  }));
}

export async function uploadLibraryDocument(input: LibraryUploadInput): Promise<LibraryDoc> {
  const form = new FormData();
  form.append('title', input.title);
  form.append('category', input.category);
  if (input.publisher?.trim()) form.append('publisher', input.publisher.trim());
  form.append('file', input.file, input.file.name);

  const res = await fetchWithRetry(`${API_BASE}/library/upload`, { method: 'POST', body: form });
  if (!res.ok) throw await readApiError(res, `HTTP ${res.status}`);
  const data = await res.json();
  return fetchLibraryDocument(data.document.id);
}

export async function fetchLibraryDocument(id: string): Promise<LibraryDoc> {
  const res = await fetchWithRetry(`${API_BASE}/library/${encodeURIComponent(id)}`);
  if (!res.ok) throw await readApiError(res, `HTTP ${res.status}`);
  return res.json() as Promise<LibraryDoc>;
}

export async function fetchLibraryPreview(id: string): Promise<readonly string[]> {
  const res = await fetchWithRetry(`${API_BASE}/library/${encodeURIComponent(id)}/preview`);
  if (!res.ok) throw await readApiError(res, `HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data.chunks) ? data.chunks : [];
}

export async function deleteLibraryDocument(id: string): Promise<void> {
  const res = await fetchWithRetry(`${API_BASE}/library/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) throw await readApiError(res, `HTTP ${res.status}`);
}

export function libraryFileUrl(id: string): string {
  return `${API_BASE}/library/${encodeURIComponent(id)}/file`;
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
