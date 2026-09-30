// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { App } from './App.js';

describe('BirdVet Web Dashboard App', () => {
  afterEach(() => {
    cleanup();
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
    const storesBtn = screen.getByRole('button', { name: /Agro-Vet Stores/i });
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

    // Click Agro-Vet Stores tab
    fireEvent.click(storesBtn);
    expect(screen.getByText('Agro-Vet Referral Network')).toBeTruthy();

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

  it('opens and closes the case detail drawer', () => {
    render(<App />);

    // Click a farmer row
    const farmerRow = screen.getByText('Alhaji Musa Danladi');
    fireEvent.click(farmerRow);

    // Detail drawer should open
    expect(screen.getByText(/Alhaji Musa Danladi's Case/i)).toBeTruthy();
    expect(screen.getByText(/Clinical Assessment/i)).toBeTruthy();
    expect(screen.getByText(/WhatsApp Consultation History/i)).toBeTruthy();

    // Close drawer
    const closeBtn = screen.getByLabelText('Close case drawer');
    fireEvent.click(closeBtn);
    expect(screen.queryByText(/Clinical Assessment/i)).toBeNull();
  });
});