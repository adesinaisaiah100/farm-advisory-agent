// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { App } from './App.js';
import * as api from './api.js';

describe('BirdVet Web Dashboard App', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the BirdVet dashboard with sidebar navigation', () => {
    render(<App />);
    expect(screen.getByText('BirdVet')).toBeTruthy();
    expect(screen.getByText('Poultry Advisory System')).toBeTruthy();
    expect(screen.getByText('Farmer Cases')).toBeTruthy();
  });

  it('renders the 5 navigation tabs and switches tabs', () => {
    render(<App />);

    // Check tabs exist
    const casesBtn = screen.getByRole('button', { name: /Cases/i });
    const reportsBtn = screen.getByRole('button', { name: /Outbreak Reports/i });
    const storesBtn = screen.getByRole('button', { name: /Veterinary Network/i });
    const libraryBtn = screen.getByRole('button', { name: /Veterinary Library/i });
    const chatBtn = screen.getByRole('button', { name: /Web Chat/i });

    expect(casesBtn).toBeTruthy();
    expect(reportsBtn).toBeTruthy();
    expect(storesBtn).toBeTruthy();
    expect(libraryBtn).toBeTruthy();
    expect(chatBtn).toBeTruthy();

    // Click Outbreak Reports tab
    fireEvent.click(reportsBtn);
    expect(screen.getByText('Poultry Disease Outbreaks')).toBeTruthy();

    // Click Veterinary Network tab
    fireEvent.click(storesBtn);
    expect(screen.getByText('Veterinary & Agro-Vet Network')).toBeTruthy();
    expect(screen.getByText('Coming Soon')).toBeTruthy();

    // Click Veterinary Library tab
    fireEvent.click(libraryBtn);
    expect(screen.getByText('Veterinary Reference Library')).toBeTruthy();

    // Click Web Chat tab
    fireEvent.click(chatBtn);
    expect(screen.getByText('Clinical Web Chat')).toBeTruthy();
  });

  it('toggles theme between dark and light mode', () => {
    render(<App />);
    const themeBtn = screen.getByRole('button', { name: /Theme:/i });
    expect(themeBtn.textContent).toContain('Dark');

    fireEvent.click(themeBtn);
    expect(themeBtn.textContent).toContain('Light');

    fireEvent.click(themeBtn);
    expect(themeBtn.textContent).toContain('Dark');
  });

  it('opens and closes the case detail drawer', async () => {
    vi.spyOn(api, 'fetchCases').mockResolvedValue([
      {
        id: 'case_live_01',
        farmer: 'Segun Adebayo',
        phone: '+234 915 513 2405',
        state: 'Oyo',
        lga: 'Ibadan North',
        species: 'Broilers (600 birds)',
        flockSize: 600,
        symptoms: 'Bloody stooling, lethargy',
        mortality: 3,
        onsetDays: 1,
        duration: '1 day ago',
        criticality: 'critical',
        status: 'triage',
        lastActive: '14:20',
        history: []
      }
    ]);

    render(<App />);

    const farmerRow = await screen.findByText('Segun Adebayo');
    fireEvent.click(farmerRow);

    expect(await screen.findByText(/Segun Adebayo's Case/i)).toBeTruthy();
    expect(screen.getByText(/Clinical Assessment/i)).toBeTruthy();
    expect(screen.getByText(/WhatsApp Consultation History/i)).toBeTruthy();

    const closeBtn = screen.getByLabelText('Close case drawer');
    fireEvent.click(closeBtn);
    expect(screen.queryByText(/Clinical Assessment/i)).toBeNull();
  });

  it('renders the LandingView component with punchy headline and transitions to portal', async () => {
    const { LandingView } = await import('./components/LandingView.js');
    let entered = false;
    render(<LandingView onEnterPortal={() => { entered = true; }} />);

    expect(screen.getByText('BIRDVET')).toBeTruthy();
    expect(screen.getByText(/Protect Your Flock with Instant Veterinary AI/i)).toBeTruthy();
    expect(screen.getByText(/Start WhatsApp Consultation/i)).toBeTruthy();

    const portalBtn = screen.getByRole('button', { name: /Open Clinician Portal/i });
    expect(portalBtn).toBeTruthy();
    fireEvent.click(portalBtn);
    expect(entered).toBe(true);
  });
});