import React from 'react';
import type { CaseSummary } from '../types.js';

interface CaseDrawerProps {
  readonly caseItem: CaseSummary | null;
  readonly onClose: () => void;
  readonly onStatusChange?: (id: string, newStatus: any) => void;
}

export function CaseDrawer({ caseItem, onClose, onStatusChange }: CaseDrawerProps) {
  if (!caseItem) return null;

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="case-drawer">
        <div className="drawer-top">
          <div>
            <h2>{caseItem.farmer}'s Case</h2>
            <span style={{ fontSize: '12px', color: 'var(--text-light)' }}>
              Case ID: {caseItem.id}
            </span>
          </div>
          <button
            type="button"
            className="drawer-close-btn"
            onClick={onClose}
            aria-label="Close case drawer"
          >
            &times;
          </button>
        </div>

        <div className="drawer-content">
          {/* Triage Overview */}
          <div className="drawer-section">
            <h3>Clinical Assessment</h3>
            <div className="detail-row">
              <span className="detail-label">Criticality:</span>
              <span className={`tag-rect tag-${caseItem.criticality}`}>{caseItem.criticality}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Intake Status:</span>
              <span className={`tag-rect tag-${caseItem.status === 'in_progress' ? 'progress' : caseItem.status}`}>
                {caseItem.status.replace('_', ' ')}
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Mortality:</span>
              <span className="detail-value" style={{ color: caseItem.mortality > 0 ? '#F87171' : 'inherit' }}>
                {caseItem.mortality > 0 ? `${caseItem.mortality} birds dead` : '0 reported'}
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Onset Duration:</span>
              <span className="detail-value">{caseItem.duration}</span>
            </div>
            <div className="detail-row" style={{ flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
              <span className="detail-label">Reported Signs:</span>
              <span style={{ fontSize: '13px', color: 'var(--text-main)', marginTop: '2px' }}>
                {caseItem.symptoms}
              </span>
            </div>
          </div>

          {/* Farmer & Farm Profile */}
          <div className="drawer-section">
            <h3>Farmer Profile & Flock Specs</h3>
            <div className="detail-row">
              <span className="detail-label">Farmer Name:</span>
              <span className="detail-value">{caseItem.farmer}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Contact Phone:</span>
              <span className="detail-value">{caseItem.phone}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Location:</span>
              <span className="detail-value">{caseItem.lga}, {caseItem.state} State</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Flock Species & Stage:</span>
              <span className="detail-value">{caseItem.species}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Flock Size:</span>
              <span className="detail-value">{caseItem.flockSize.toLocaleString()} birds</span>
            </div>
          </div>

          {/* WhatsApp Conversation Replay */}
          <div className="drawer-section">
            <h3>WhatsApp Consultation History</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
              {caseItem.history.length === 0 ? (
                <div style={{ fontSize: '12.5px', color: 'var(--text-light)', padding: '8px 0' }}>
                  Intake logged via API telephony channel.
                </div>
              ) : (
                caseItem.history.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`chat-msg ${msg.sender === 'Farmer' ? 'farmer' : 'agent'}`}
                  >
                    <div className="chat-sender">
                      {msg.sender === 'Farmer' ? caseItem.farmer : 'BirdVet Clinical AI'}
                    </div>
                    {msg.isVoice && (
                      <div className="chat-voice-label">🎤 Voice Note (Transcribed)</div>
                    )}
                    <div>{msg.text}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="card-item-footer" style={{ padding: '16px 22px' }}>
          <button
            type="button"
            className="btn-action"
            onClick={() => onStatusChange?.(caseItem.id, 'resolved')}
          >
            Mark Resolved
          </button>
          <button
            type="button"
            className="btn-action primary"
            onClick={() => onStatusChange?.(caseItem.id, 'escalated')}
          >
            Escalate to Vet Officer
          </button>
        </div>
      </aside>
    </>
  );
}
