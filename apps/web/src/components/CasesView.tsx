import React, { useState } from 'react';
import type { CaseSummary } from '../types.js';

interface CasesViewProps {
  readonly cases: readonly CaseSummary[];
  readonly selectedCaseId?: string | null;
  readonly onSelectCase: (caseItem: CaseSummary) => void;
  readonly isLoading?: boolean;
  readonly onRefresh?: () => void;
}

export function CasesView({
  cases,
  selectedCaseId,
  onSelectCase,
  isLoading = false,
  onRefresh
}: CasesViewProps) {
  const [filterCriticality, setFilterCriticality] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterState, setFilterState] = useState<string>('all');

  const filtered = cases.filter(c => {
    const matchCrit = filterCriticality === 'all' || c.criticality === filterCriticality;
    const matchStatus = filterStatus === 'all' || c.status === filterStatus;
    const matchState = filterState === 'all' || (c.state && c.state.toLowerCase() === filterState.toLowerCase());
    return matchCrit && matchStatus && matchState;
  });

  return (
    <section className="tab-panel">
      <div className="page-header">
        <div className="page-title">
          <h1>Farmer Cases</h1>
          <p>Active clinical cases with verified severity and intake status.</p>
        </div>

        <div className="filters-group">
          <select
            className="filter-dropdown"
            value={filterCriticality}
            onChange={(e) => setFilterCriticality(e.target.value)}
          >
            <option value="all">All Criticality Levels</option>
            <option value="critical">Critical</option>
            <option value="high">High Risk</option>
            <option value="moderate">Moderate</option>
            <option value="resolved">Resolved</option>
          </select>

          <select
            className="filter-dropdown"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="escalated">Escalated</option>
            <option value="in_progress">In Progress</option>
            <option value="triage">Triage</option>
            <option value="resolved">Resolved</option>
          </select>

          <select
            className="filter-dropdown"
            value={filterState}
            onChange={(e) => setFilterState(e.target.value)}
          >
            <option value="all">All States</option>
            <option value="Kaduna">Kaduna</option>
            <option value="Oyo">Oyo</option>
            <option value="Ogun">Ogun</option>
            <option value="Enugu">Enugu</option>
            <option value="Kano">Kano</option>
            <option value="Plateau">Plateau</option>
          </select>

          {onRefresh && (
            <button
              type="button"
              className="btn-action"
              onClick={onRefresh}
              title="Refresh cases from Neon database"
              style={{ height: '36px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <span>↻</span>
              <span>{isLoading ? 'Loading...' : 'Refresh'}</span>
            </button>
          )}
        </div>
      </div>

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Criticality</th>
              <th>Farmer & Phone</th>
              <th>Location</th>
              <th>Flock Specs</th>
              <th>Clinical Signs</th>
              <th>Mortality</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                  Connecting to Neon Postgres and fetching clinical sessions...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-light)' }}>
                  <div>No cases found matching filters.</div>
                  {onRefresh && (
                    <button
                      type="button"
                      className="btn-action"
                      onClick={onRefresh}
                      style={{ marginTop: '12px' }}
                    >
                      Check Neon Database
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => onSelectCase(c)}
                  className={c.id === selectedCaseId ? 'selected' : ''}
                >
                  <td>
                    <span className={`tag-rect tag-${c.criticality}`}>{c.criticality}</span>
                  </td>
                  <td>
                    <div className="cell-farmer">{c.farmer}</div>
                    <div className="cell-phone">{c.phone}</div>
                  </td>
                  <td>{c.lga ? `${c.lga}, ` : ''}{c.state || 'Oyo'}</td>
                  <td>{c.species}</td>
                  <td className="cell-symptoms" title={c.symptoms}>
                    {c.symptoms}
                  </td>
                  <td>{c.mortality > 0 ? `${c.mortality} dead` : 'None'}</td>
                  <td>
                    <span className={`tag-rect tag-${c.status === 'in_progress' ? 'progress' : c.status}`}>
                      {c.status.replace('_', ' ')}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
