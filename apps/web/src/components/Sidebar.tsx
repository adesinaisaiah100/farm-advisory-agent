import React from 'react';

export type TabId = 'cases' | 'reports' | 'stores' | 'library' | 'chat';

interface SidebarProps {
  readonly activeTab: TabId;
  readonly onSelectTab: (tab: TabId) => void;
  readonly caseCount: number;
  readonly reportCount: number;
  readonly _storeCount?: number;
  readonly libraryCount: number;
  readonly theme: 'dark' | 'light';
  readonly onToggleTheme: () => void;
  readonly onBackToLanding?: () => void;
}

export function Sidebar({
  activeTab,
  onSelectTab,
  caseCount,
  reportCount,
  _storeCount,
  libraryCount,
  theme,
  onToggleTheme,
  onBackToLanding
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h2 className="sidebar-brand-title">BirdVet</h2>
        <p className="sidebar-brand-sub">Poultry Advisory System</p>
      </div>

      <nav className="sidebar-menu">
        {onBackToLanding && (
          <button
            type="button"
            className="sidebar-link"
            style={{ marginBottom: '6px', color: '#a1a1aa' }}
            onClick={onBackToLanding}
          >
            <span>&larr; Landing Overview</span>
          </button>
        )}
        <button
          type="button"
          className={`sidebar-link ${activeTab === 'cases' ? 'active' : ''}`}
          onClick={() => onSelectTab('cases')}
        >
          <span>Cases</span>
          <span className="sidebar-count">{caseCount}</span>
        </button>

        <button
          type="button"
          className={`sidebar-link ${activeTab === 'reports' ? 'active' : ''}`}
          onClick={() => onSelectTab('reports')}
        >
          <span>Outbreak Reports</span>
          <span className="sidebar-count">{reportCount}</span>
        </button>

        <button
          type="button"
          className={`sidebar-link ${activeTab === 'stores' ? 'active' : ''}`}
          onClick={() => onSelectTab('stores')}
        >
          <span>Veterinary Network</span>
          <span className="sidebar-count" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Soon</span>
        </button>

        <button
          type="button"
          className={`sidebar-link ${activeTab === 'library' ? 'active' : ''}`}
          onClick={() => onSelectTab('library')}
        >
          <span>Veterinary Library</span>
          <span className="sidebar-count">{libraryCount}</span>
        </button>

        <button
          type="button"
          className={`sidebar-link ${activeTab === 'chat' ? 'active' : ''}`}
          onClick={() => onSelectTab('chat')}
        >
          <span>Web Chat</span>
        </button>
      </nav>

      <div className="sidebar-footer">
        <span style={{ fontSize: '12px', color: 'var(--text-light)' }}>Phase 9 Web</span>
        <button
          type="button"
          className="btn-toggle-theme"
          onClick={onToggleTheme}
        >
          Theme: {theme === 'dark' ? 'Dark' : 'Light'}
        </button>
      </div>
    </aside>
  );
}
