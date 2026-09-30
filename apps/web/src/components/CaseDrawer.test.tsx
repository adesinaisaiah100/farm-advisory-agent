// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { CaseDrawer } from './CaseDrawer.js';
import type { CaseSummary } from '../types.js';

const mockCaseWithMedia: CaseSummary = {
  id: 'case_media_001',
  farmer: 'Segun Adebayo',
  phone: '+234 915 513 2405',
  state: 'Oyo',
  lga: 'Ibadan North',
  species: 'Broilers (600 birds)',
  flockSize: 600,
  symptoms: 'Bloody stooling, lethargy, splayed legs',
  mortality: 3,
  onsetDays: 2,
  duration: '2 days ago',
  criticality: 'critical',
  status: 'triage',
  lastActive: '14:20',
  mediaItems: [
    { kind: 'image', title: 'Flock Pen Photo #1', description: 'Three birds in recumbent posture' },
    { kind: 'audio', title: 'Farmer Audio Note #1', description: 'Voice memo reporting sudden deaths' }
  ],
  history: [
    {
      sender: 'Farmer',
      text: '[Voice Note: Doctor my birds dey stool blood since morning and 3 don die]',
      isVoice: true
    },
    {
      sender: 'Agent',
      text: 'I understand Segun. Have you noticed any nasal discharge or swollen eyes?'
    },
    {
      sender: 'Farmer',
      text: '[Photo Observation: Three birds are resting in sternal recumbency.. Splayed legs visible on the right bird.. Matted ocular discharge..]',
      isPhoto: true,
      photoObservations: [
        'Three birds are resting in sternal recumbency',
        'Splayed legs visible on the right bird',
        'Matted ocular discharge'
      ]
    }
  ]
};

describe('CaseDrawer Media Playback & Observation Component', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders clinical assessment and farmer flock details', () => {
    render(<CaseDrawer caseItem={mockCaseWithMedia} onClose={() => {}} />);

    expect(screen.getByText("Segun Adebayo's Case")).toBeTruthy();
    expect(screen.getByText('3 birds dead')).toBeTruthy();
    expect(screen.getByText('Ibadan North, Oyo State')).toBeTruthy();
  });

  it('renders interactive voice note player and transcript', () => {
    render(<CaseDrawer caseItem={mockCaseWithMedia} onClose={() => {}} />);

    expect(screen.getByText('🎤 Farmer WhatsApp Voice Note')).toBeTruthy();
    expect(screen.getByText(/Doctor my birds dey stool blood since morning/i)).toBeTruthy();

    const playBtn = screen.getByRole('button', { name: /Play/i });
    expect(playBtn).toBeTruthy();
    fireEvent.click(playBtn);
    expect(screen.getByRole('button', { name: /Pause/i })).toBeTruthy();
  });

  it('renders farm photo diagnostic with structured observation chips', () => {
    render(<CaseDrawer caseItem={mockCaseWithMedia} onClose={() => {}} />);

    expect(screen.getByText('📸 Farm Photo Diagnostic')).toBeTruthy();
    expect(screen.getByText('Three birds are resting in sternal recumbency')).toBeTruthy();
    expect(screen.getByText('Splayed legs visible on the right bird')).toBeTruthy();
    expect(screen.getByText('Matted ocular discharge')).toBeTruthy();
  });

  it('triggers status changes when action buttons are clicked', () => {
    const handleStatusChange = vi.fn();
    render(<CaseDrawer caseItem={mockCaseWithMedia} onClose={() => {}} onStatusChange={handleStatusChange} />);

    fireEvent.click(screen.getByRole('button', { name: /Mark Resolved/i }));
    expect(handleStatusChange).toHaveBeenCalledWith('case_media_001', 'resolved');

    fireEvent.click(screen.getByRole('button', { name: /Escalate to Vet Officer/i }));
    expect(handleStatusChange).toHaveBeenCalledWith('case_media_001', 'escalated');
  });

  it('renders longitudinal consultation episodes timeline and switches between sessions', () => {
    const multiSessionCase: CaseSummary = {
      ...mockCaseWithMedia,
      sessionCount: 2,
      sessions: [
        {
          sessionId: 'case_media_002',
          caseId: 'case_media_002',
          status: 'triage',
          criticality: 'critical',
          startedAt: 'Sep 30',
          lastActive: '14:20',
          symptoms: 'Sudden high mortality, torticollis',
          mortality: 8,
          duration: '1 day ago'
        },
        {
          sessionId: 'case_media_001',
          caseId: 'case_media_001',
          status: 'resolved',
          criticality: 'moderate',
          startedAt: 'Sep 24',
          lastActive: '10:00',
          symptoms: 'Mild sneezing and coughing',
          mortality: 0,
          duration: '7 days ago'
        }
      ]
    };

    render(<CaseDrawer caseItem={multiSessionCase} onClose={() => {}} />);

    expect(screen.getByText('Consultation Episodes (2)')).toBeTruthy();
    expect(screen.getByText('Ep #2')).toBeTruthy();
    expect(screen.getByText('Ep #1')).toBeTruthy();

    const ep1Btn = screen.getByRole('button', { name: /Consultation episode 1/i });
    fireEvent.click(ep1Btn);

    expect(screen.getByText('Mild sneezing and coughing')).toBeTruthy();
    expect(screen.getByText('0 reported')).toBeTruthy();
  });
});
