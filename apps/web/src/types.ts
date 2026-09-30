export type Criticality = 'critical' | 'high' | 'moderate' | 'resolved';
export type CaseStatus = 'triage' | 'escalated' | 'in_progress' | 'resolved';

export interface TurnMessage {
  readonly sender: 'Farmer' | 'Agent';
  readonly text: string;
  readonly isVoice?: boolean;
  readonly isPhoto?: boolean;
  readonly mediaUrl?: string;
  readonly photoObservations?: readonly string[];
  readonly timestamp?: string;
}

export interface CaseSummary {
  readonly id: string;
  readonly sessionId?: string;
  readonly farmer: string;
  readonly phone: string;
  readonly state: string;
  readonly lga: string;
  readonly species: string;
  readonly flockSize: number;
  readonly symptoms: string;
  readonly mortality: number;
  readonly onsetDays: number;
  readonly duration: string;
  readonly criticality: Criticality;
  readonly status: CaseStatus;
  readonly history: readonly TurnMessage[];
  readonly lastActive: string;
  readonly mediaItems?: readonly {
    kind: 'image' | 'audio';
    title: string;
    url?: string;
    description?: string;
  }[];
}

export interface OutbreakReport {
  readonly id: string;
  readonly disease: string;
  readonly state: string;
  readonly lga: string;
  readonly date: string;
  readonly criticality: Criticality;
  readonly summary: string;
  readonly caseCount: number;
}

export interface AgroVetStore {
  readonly id: string;
  readonly name: string;
  readonly state: string;
  readonly lga: string;
  readonly phone: string;
  readonly phoneFormatted: string;
  readonly address: string;
  readonly services: readonly string[];
}

export interface LibraryDoc {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly size: string;
  readonly date: string;
  readonly status: 'active' | 'processing';
}

export interface ChatMessage {
  readonly id: string;
  readonly sender: 'farmer' | 'agent';
  readonly text: string;
  readonly timestamp: string;
}
