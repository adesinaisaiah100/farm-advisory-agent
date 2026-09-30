import React, { useState, useEffect } from 'react';
import './styles/theme.css';
import type { CaseSummary, OutbreakReport, AgroVetStore, LibraryDoc } from './types.js';
import { INITIAL_CASES, INITIAL_REPORTS, INITIAL_STORES, INITIAL_LIBRARY_DOCS } from './mockData.js';
import { fetchCases, fetchCaseDetail, fetchReports, fetchStores } from './api.js';
import { Sidebar, type TabId } from './components/Sidebar.js';
import { TopBar } from './components/TopBar.js';
import { CasesView } from './components/CasesView.js';
import { CaseDrawer } from './components/CaseDrawer.js';
import { ReportsView } from './components/ReportsView.js';
import { StoresView } from './components/StoresView.js';
import { LibraryView } from './components/LibraryView.js';
import { ChatView } from './components/ChatView.js';

export function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [activeTab, setActiveTab] = useState<TabId>('cases');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [cases, setCases] = useState<readonly CaseSummary[]>(INITIAL_CASES);
  const [reports, setReports] = useState<readonly OutbreakReport[]>(INITIAL_REPORTS);
  const [stores, setStores] = useState<readonly AgroVetStore[]>(INITIAL_STORES);
  const [libraryDocs, setLibraryDocs] = useState<readonly LibraryDoc[]>(INITIAL_LIBRARY_DOCS);

  const [selectedCase, setSelectedCase] = useState<CaseSummary | null>(null);
  const [loadingCases, setLoadingCases] = useState<boolean>(true);

  // Sync initial theme attribute to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const loadData = () => {
    setLoadingCases(true);
    fetchCases()
      .then(setCases)
      .catch(() => {})
      .finally(() => setLoadingCases(false));

    fetchReports().then(setReports).catch(() => {});
    fetchStores().then(setStores).catch(() => {});
  };

  // Fetch live cases, outbreak reports, and verified stores from Neon Postgres on mount
  useEffect(() => {
    loadData();
  }, []);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  const handleSelectCase = (caseItem: CaseSummary) => {
    setSelectedCase(caseItem);
    fetchCaseDetail(caseItem.sessionId || caseItem.id)
      .then(detail => {
        if (detail) {
          setSelectedCase(detail);
        }
      })
      .catch(() => {});
  };

  const handleStatusChange = (caseId: string, newStatus: any) => {
    setCases(prev => prev.map(c => (c.id === caseId ? { ...c, status: newStatus } : c)));
    if (selectedCase && selectedCase.id === caseId) {
      setSelectedCase(prev => (prev ? { ...prev, status: newStatus } : null));
    }
  };

  const handleAddLibraryDoc = (newDoc: LibraryDoc) => {
    setLibraryDocs(prev => [newDoc, ...prev]);
  };

  const handleDeleteLibraryDoc = (id: string) => {
    setLibraryDocs(prev => prev.filter(d => d.id !== id));
  };

  // Filter cases by global search query
  const searchedCases = cases.filter(c => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      c.farmer.toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      c.lga.toLowerCase().includes(q) ||
      c.state.toLowerCase().includes(q) ||
      c.symptoms.toLowerCase().includes(q)
    );
  });

  return (
    <div className="app-container">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        caseCount={cases.length}
        reportCount={reports.length}
        storeCount={stores.length}
        libraryCount={libraryDocs.length}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <main className="main-content">
        <TopBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          cases={cases}
        />

        {activeTab === 'cases' && (
          <CasesView
            cases={searchedCases}
            selectedCaseId={selectedCase?.id}
            onSelectCase={handleSelectCase}
            isLoading={loadingCases}
            onRefresh={loadData}
          />
        )}

        {activeTab === 'reports' && (
          <ReportsView
            reports={reports}
            onOpenLinkedCases={() => setActiveTab('cases')}
          />
        )}

        {activeTab === 'stores' && (
          <StoresView stores={stores} />
        )}

        {activeTab === 'library' && (
          <LibraryView
            docs={libraryDocs}
            onAddDoc={handleAddLibraryDoc}
            onDeleteDoc={handleDeleteLibraryDoc}
          />
        )}

        {activeTab === 'chat' && (
          <ChatView />
        )}
      </main>

      {selectedCase && (
        <CaseDrawer
          caseItem={selectedCase}
          onClose={() => setSelectedCase(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  );
}
export default App;