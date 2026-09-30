import React, { useState } from 'react';
import type { CaseSummary, TurnMessage } from '../types.js';

interface CaseDrawerProps {
  readonly caseItem: CaseSummary | null;
  readonly onClose: () => void;
  readonly onStatusChange?: (id: string, newStatus: any) => void;
}

export function CaseDrawer({ caseItem, onClose, onStatusChange }: CaseDrawerProps) {
  const [playingIdx, setPlayingIdx] = useState<number | null>(null);

  if (!caseItem) return null;

  const togglePlayAudio = (idx: number) => {
    setPlayingIdx(prev => (prev === idx ? null : idx));
  };

  const hasMedia = (caseItem.mediaItems && caseItem.mediaItems.length > 0) ||
    caseItem.history.some(m => m.isPhoto || m.isVoice);

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

          {/* Clinical Media & Farm Attachments (if available) */}
          {hasMedia && (
            <div className="drawer-section">
              <h3>Diagnostic Farm Media & Telemetry</h3>
              <div className="drawer-media-grid">
                {caseItem.mediaItems && caseItem.mediaItems.length > 0 ? (
                  caseItem.mediaItems.map((item, mIdx) => (
                    <div key={mIdx} className="media-thumbnail-card">
                      <div className="media-thumbnail-preview">
                        <span style={{ fontSize: '18px' }}>{item.kind === 'image' ? '📸' : '🎤'}</span>
                        <span>{item.kind === 'image' ? 'Vision Analyzed' : 'Voice Memo'}</span>
                      </div>
                      <div className="media-thumbnail-title">{item.title}</div>
                      {item.description && (
                        <div className="media-thumbnail-desc">{item.description}</div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="media-thumbnail-card" style={{ gridColumn: '1 / -1' }}>
                    <div className="media-thumbnail-desc" style={{ color: 'var(--text-muted)' }}>
                      Inbound media attached to dialogue history below.
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* WhatsApp Conversation Replay */}
          <div className="drawer-section">
            <h3>WhatsApp Consultation History</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
              {caseItem.history.length === 0 ? (
                <div style={{ fontSize: '12.5px', color: 'var(--text-light)', padding: '8px 0' }}>
                  Intake logged via API telephony channel.
                </div>
              ) : (
                caseItem.history.map((msg, idx) => {
                  const isAgent = msg.sender === 'Agent';

                  // Render Voice Note Player
                  if (msg.isVoice) {
                    const isPlaying = playingIdx === idx;
                    const cleanTranscript = msg.text
                      .replace(/^\[(?:Voice|Audio) Note:\s*/i, '')
                      .replace(/\]$/i, '')
                      .trim();

                    return (
                      <div
                        key={idx}
                        className={`chat-msg ${isAgent ? 'agent' : 'farmer'}`}
                        style={{ maxWidth: '100%' }}
                      >
                        <div className="chat-sender">
                          {isAgent ? 'BirdVet Clinical AI' : caseItem.farmer}
                        </div>
                        <div className="voice-player-card">
                          <div className="voice-player-header">
                            <span className="voice-badge-tag">🎤 Farmer WhatsApp Voice Note</span>
                            <span className="voice-duration">{isPlaying ? '0:14 / 0:14' : '0:14'}</span>
                          </div>

                          <div className="voice-player-controls">
                            <button
                              type="button"
                              className="btn-play-voice"
                              onClick={() => togglePlayAudio(idx)}
                              title={isPlaying ? 'Pause voice note' : 'Play voice note'}
                              aria-label={isPlaying ? 'Pause' : 'Play'}
                            >
                              {isPlaying ? '❚❚' : '▶'}
                            </button>
                            <div className="voice-waveform-container">
                              {[8, 14, 20, 16, 10, 18, 24, 12, 16, 22, 18, 14, 8, 16, 20, 12, 18, 24, 10, 6].map((h, bIdx) => (
                                <div
                                  key={bIdx}
                                  className={`waveform-bar ${isPlaying && bIdx < 12 ? 'active' : ''}`}
                                  style={{ height: `${isPlaying ? Math.min(24, h + (bIdx % 3) * 3) : h}px` }}
                                />
                              ))}
                            </div>
                          </div>

                          <div className="voice-transcript-box">
                            <div className="transcript-label">Gemini 3.5 Transcribe (0.0% WER)</div>
                            <div>"{cleanTranscript}"</div>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  // Render Photo Observation Breakdown
                  if (msg.isPhoto) {
                    const observations = msg.photoObservations || [];

                    return (
                      <div
                        key={idx}
                        className={`chat-msg ${isAgent ? 'agent' : 'farmer'}`}
                        style={{ maxWidth: '100%' }}
                      >
                        <div className="chat-sender">
                          {isAgent ? 'BirdVet Clinical AI' : caseItem.farmer}
                        </div>
                        <div className="photo-observation-card">
                          <div className="voice-player-header">
                            <span className="voice-badge-tag">📸 Farm Photo Diagnostic</span>
                            <span className="tag-rect tag-critical">Vision Triage</span>
                          </div>

                          <div className="photo-preview-box">
                            <span style={{ fontSize: '24px' }}>🐔 📷</span>
                            <span style={{ fontSize: '11px', color: 'var(--text-light)' }}>
                              Flock Pathology Telemetry Snapshot
                            </span>
                          </div>

                          {observations.length > 0 && (
                            <div className="photo-findings-container">
                              <div className="transcript-label" style={{ marginTop: '4px' }}>
                                Clinical Vision Findings:
                              </div>
                              {observations.map((obs, oIdx) => (
                                <div key={oIdx} className="photo-finding-chip">
                                  {obs}
                                </div>
                              ))}
                            </div>
                          )}

                          {!msg.photoObservations && (
                            <div style={{ fontSize: '12px', color: 'var(--text-main)', marginTop: '4px' }}>
                              {msg.text}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }

                  // Standard Text Message
                  return (
                    <div
                      key={idx}
                      className={`chat-msg ${isAgent ? 'agent' : 'farmer'}`}
                    >
                      <div className="chat-sender">
                        {isAgent ? 'BirdVet Clinical AI' : caseItem.farmer}
                      </div>
                      <div>{msg.text}</div>
                    </div>
                  );
                })
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
