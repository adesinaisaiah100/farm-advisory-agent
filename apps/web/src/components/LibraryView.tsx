import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { LibraryDoc } from '../types.js';
import {
  deleteLibraryDocument,
  fetchLibrary,
  fetchLibraryPreview,
  libraryFileUrl,
  uploadLibraryDocument,
} from '../api.js';

const PRESET_CATEGORIES = [
  'Clinical Pathology & Diagnostics',
  'Disease Outbreaks & Epidemiology',
  'Medications, Vaccines & Dosage',
  'Biosecurity, Sanitation & Disinfection',
  'Flock Nutrition & Feed Formulation',
  'Housing, Brooding & Management',
  'Other / Custom Category',
] as const;

const ACCEPTED = '.pdf,.txt';

function formatDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

export function LibraryView() {
  const [docs, setDocs] = useState<readonly LibraryDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');

  const [selectedCategory, setSelectedCategory] = useState<string>(PRESET_CATEGORIES[0]);
  const [customCategory, setCustomCategory] = useState('');
  const [docTitle, setDocTitle] = useState('');
  const [docPublisher, setDocPublisher] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ doc: LibraryDoc; chunks: readonly string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setDocs(await fetchLibrary());
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not reach the library API.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setUploadError(null);
    if (!docTitle.trim()) {
      setDocTitle(file.name.replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' '));
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploadError(null);
    setUploadNotice(null);

    const category =
      selectedCategory === 'Other / Custom Category' ? customCategory.trim() : selectedCategory;

    if (!docTitle.trim()) {
      setUploadError('A document title is required.');
      return;
    }
    if (!category) {
      setUploadError('A category is required.');
      return;
    }
    if (!selectedFile) {
      setUploadError('Choose a PDF or text file to upload.');
      return;
    }

    setUploading(true);
    try {
      const created = await uploadLibraryDocument({
        title: docTitle.trim(),
        category,
        file: selectedFile,
        ...(docPublisher.trim() ? { publisher: docPublisher.trim() } : {}),
      });
      setDocs((prev) => [created, ...prev.filter((d) => d.id !== created.id)]);
      setUploadNotice(
        `Indexed "${created.name}" into ${created.chunkCount} chunks across ${created.category}.`,
      );
      setDocTitle('');
      setDocPublisher('');
      setSelectedFile(null);
      setCustomCategory('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (doc: LibraryDoc) => {
    setRowError(null);
    if (!window.confirm(`Delete "${doc.name}" and its ${doc.chunkCount} indexed chunks?`)) return;
    try {
      await deleteLibraryDocument(doc.id);
      setDocs((prev) => prev.filter((d) => d.id !== doc.id));
      if (preview?.doc.id === doc.id) setPreview(null);
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'Delete failed.');
    }
  };

  const handleView = async (doc: LibraryDoc) => {
    setRowError(null);
    try {
      const chunks = await fetchLibraryPreview(doc.id);
      setPreview({ doc, chunks });
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'Could not load extracted text.');
    }
  };

  const filteredDocs = docs.filter((d) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q || d.name.toLowerCase().includes(q) || d.category.toLowerCase().includes(q);
    const matchesCat = filterCategory === 'all' || d.category === filterCategory;
    return matchesSearch && matchesCat;
  });

  return (
    <section className="tab-panel">
      <div className="page-header">
        <div className="page-title">
          <h1>Veterinary Reference Library</h1>
          <p>
            Uploaded documents are parsed, chunked and embedded into the retrieval corpus that grounds
            clinical answers.
          </p>
        </div>
        <button type="button" className="btn-action" onClick={() => void refresh()}>
          Refresh
        </button>
      </div>

      {loadError && (
        <div className="form-error" role="alert">
          Cannot load the library: {loadError}
        </div>
      )}

      <div className="library-layout">
        <div className="library-upload-card">
          <div className="library-upload-header">
            <h2>Add Reference Manual or Guideline</h2>
            <p>PDF or plain text. The file is stored, read, chunked and embedded before it appears.</p>
          </div>

          <div className="library-dropzone" onClick={() => fileInputRef.current?.click()}>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED}
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
            <div className="dropzone-text">
              {selectedFile
                ? `Selected: ${selectedFile.name} (${(selectedFile.size / 1024).toFixed(0)} KB)`
                : 'Click to choose a PDF or text file'}
            </div>
            <div className="dropzone-hint">Accepts PDF and TXT reference materials</div>
          </div>

          <form onSubmit={(e) => void handleUploadSubmit(e)}>
            <div className="library-upload-fields">
              <div className="form-group" style={{ margin: 0 }}>
                <label htmlFor="lib-title">Document Title</label>
                <input
                  id="lib-title"
                  type="text"
                  placeholder="e.g. FAO Poultry Disease Field Manual"
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label htmlFor="lib-category">Category</label>
                <select
                  id="lib-category"
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                >
                  {PRESET_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group" style={{ marginTop: '12px' }}>
              <label htmlFor="lib-publisher">Publisher (optional)</label>
              <input
                id="lib-publisher"
                type="text"
                placeholder="Leave blank if unknown — it is recorded as unattributed"
                value={docPublisher}
                onChange={(e) => setDocPublisher(e.target.value)}
              />
            </div>

            {selectedCategory === 'Other / Custom Category' && (
              <div className="form-group" style={{ marginTop: '12px' }}>
                <label htmlFor="lib-custom-category">Custom Category</label>
                <input
                  id="lib-custom-category"
                  type="text"
                  placeholder="e.g. Newcastle Vaccination Schedule"
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                />
              </div>
            )}

            <button
              type="submit"
              className="btn-action primary"
              style={{ height: '36px', padding: '0 18px', marginTop: '14px' }}
              disabled={uploading}
            >
              {uploading ? 'Indexing…' : 'Upload & Index'}
            </button>
          </form>

          {uploadError && (
            <div className="form-error" role="alert" style={{ marginTop: '12px' }}>
              {uploadError}
            </div>
          )}
          {uploadNotice && (
            <div className="form-success" role="status" style={{ marginTop: '12px' }}>
              {uploadNotice}
            </div>
          )}
        </div>

        <div>
          <div className="library-toolbar">
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)' }}>
              Indexed Documents ({filteredDocs.length})
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                type="text"
                className="library-search"
                placeholder="Search reference library..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <select
                className="filter-dropdown"
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
              >
                <option value="all">All Categories</option>
                {Array.from(new Set(docs.map((d) => d.category))).map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {rowError && (
            <div className="form-error" role="alert" style={{ marginBottom: '12px' }}>
              {rowError}
            </div>
          )}

          {preview && (
            <div className="table-card" style={{ marginBottom: '12px', padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div>
                  <strong>{preview.doc.name}</strong>
                  <div style={{ fontSize: '12px', color: 'var(--text-light)', marginTop: '2px' }}>
                    {preview.doc.chunkCount} chunks · {preview.doc.publisher ?? 'unattributed'}
                    {preview.doc.year ? ` · ${preview.doc.year}` : ''} ·{' '}
                    <a href={libraryFileUrl(preview.doc.id)} target="_blank" rel="noreferrer">
                      open original file
                    </a>
                  </div>
                </div>
                <button type="button" className="btn-action" onClick={() => setPreview(null)}>
                  Close
                </button>
              </div>
              <div style={{ marginTop: '12px', display: 'grid', gap: '10px' }}>
                {preview.chunks.length === 0 ? (
                  <p style={{ margin: 0, color: 'var(--text-light)' }}>
                    This document produced no extractable chunks.
                  </p>
                ) : (
                  preview.chunks.map((chunk, i) => (
                    <pre
                      key={i}
                      style={{
                        margin: 0,
                        whiteSpace: 'pre-wrap',
                        fontSize: '12px',
                        background: 'var(--bg-subtle)',
                        padding: '10px',
                        borderRadius: '6px',
                        maxHeight: '180px',
                        overflow: 'auto',
                      }}
                    >
                      {chunk}
                    </pre>
                  ))
                )}
              </div>
            </div>
          )}

          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th>Document Name</th>
                  <th>Category</th>
                  <th>Size</th>
                  <th>Chunks</th>
                  <th>Date Added</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-light)' }}>
                      Loading library…
                    </td>
                  </tr>
                ) : filteredDocs.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-light)' }}>
                      No documents indexed yet. Upload a PDF or text file to build the corpus.
                    </td>
                  </tr>
                ) : (
                  filteredDocs.map((doc) => (
                    <tr key={doc.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{doc.name}</div>
                        <div style={{ fontSize: '11.5px', color: 'var(--text-light)' }}>
                          {doc.publisher ?? 'Unattributed upload'}
                          {doc.year ? ` · ${doc.year}` : ''}
                        </div>
                      </td>
                      <td>
                        <span className="tag-rect tag-service">{doc.category}</span>
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '12.5px' }}>{doc.size}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '12.5px' }}>
                        {doc.chunkCount}
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '12.5px' }}>
                        {formatDate(doc.date)}
                      </td>
                      <td>
                        <span className="tag-rect tag-resolved">Indexed</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn-action"
                          style={{ height: '28px', padding: '0 10px', fontSize: '12px', marginRight: '6px' }}
                          onClick={() => void handleView(doc)}
                        >
                          View
                        </button>
                        <button
                          type="button"
                          className="btn-action"
                          style={{ height: '28px', padding: '0 10px', fontSize: '12px', color: '#F87171' }}
                          onClick={() => void handleDelete(doc)}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
