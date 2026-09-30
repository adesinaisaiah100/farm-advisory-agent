import React, { useState, useRef } from 'react';
import type { LibraryDoc } from '../types.js';

interface LibraryViewProps {
  readonly docs: readonly LibraryDoc[];
  readonly onAddDoc: (doc: LibraryDoc) => void;
  readonly onDeleteDoc: (id: string) => void;
}

const PRESET_CATEGORIES = [
  'Clinical Pathology & Diagnostics',
  'Disease Outbreaks & Epidemiology',
  'Medications, Vaccines & Dosage',
  'Biosecurity, Sanitation & Disinfection',
  'Flock Nutrition & Feed Formulation',
  'Housing, Brooding & Management',
  'Other / Custom Category'
] as const;

export function LibraryView({ docs, onAddDoc, onDeleteDoc }: LibraryViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');

  // Form states
  const [selectedCategory, setSelectedCategory] = useState<string>(PRESET_CATEGORIES[0]);
  const [customCategory, setCustomCategory] = useState<string>('');
  const [docTitle, setDocTitle] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      if (!docTitle) {
        setDocTitle(file.name.replace(/\.[^/.]+$/, ''));
      }
    }
  };

  const handleUploadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalCategory = selectedCategory === 'Other / Custom Category'
      ? (customCategory.trim() || 'General Veterinary Guidance')
      : selectedCategory;

    let finalName = docTitle.trim() || (selectedFile ? selectedFile.name : 'Untitled Reference Guideline');
    if (!finalName.toLowerCase().endsWith('.pdf') && !finalName.toLowerCase().endsWith('.docx') && !finalName.toLowerCase().endsWith('.txt')) {
      finalName += '.pdf';
    }

    const fileSize = selectedFile
      ? `${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB`
      : '1.5 MB';

    const newDoc: LibraryDoc = {
      id: `DOC-${String(docs.length + 1).padStart(3, '0')}`,
      name: finalName,
      category: finalCategory,
      size: fileSize,
      date: 'Today',
      status: 'active'
    };

    onAddDoc(newDoc);

    // Reset Form
    setDocTitle('');
    setSelectedFile(null);
    setCustomCategory('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const filteredDocs = docs.filter(d => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch = !q || d.name.toLowerCase().includes(q) || d.category.toLowerCase().includes(q);
    const matchesCat = filterCategory === 'all' || d.category === filterCategory;
    return matchesSearch && matchesCat;
  });

  return (
    <section className="tab-panel">
      <div className="page-header">
        <div className="page-title">
          <h1>Veterinary Reference Library</h1>
          <p>Manage and upload clinical textbooks, biosecurity manuals, and treatment protocols.</p>
        </div>
      </div>

      <div className="library-layout">
        {/* Simple Document Upload Card */}
        <div className="library-upload-card">
          <div className="library-upload-header">
            <h2>Add Reference Manual or Guideline</h2>
            <p>Upload veterinary files in PDF or Word format to ground the clinical advisory assistant.</p>
          </div>

          <div
            className="library-dropzone"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
            <div className="dropzone-text">
              {selectedFile
                ? `Selected: ${selectedFile.name} (${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)`
                : 'Click to choose a PDF or document file, or drag and drop here'}
            </div>
            <div className="dropzone-hint">
              Accepts PDF, DOCX, TXT clinical materials up to 50 MB
            </div>
          </div>

          <form onSubmit={handleUploadSubmit}>
            <div className="library-upload-fields">
              <div className="form-group" style={{ margin: 0 }}>
                <label>Document Title (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. FAO Poultry Disease Field Manual 2026"
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label>Category (Flexible)</label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                >
                  {PRESET_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                className="btn-action primary"
                style={{ height: '36px', padding: '0 18px' }}
              >
                Upload Document
              </button>
            </div>

            {selectedCategory === 'Other / Custom Category' && (
              <div className="form-group" style={{ marginTop: '12px' }}>
                <label>Specify Custom Category</label>
                <input
                  type="text"
                  placeholder="e.g. Herbal Poultry Remedies, Newcastle Vaccination Schedule..."
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  required
                />
              </div>
            )}
          </form>
        </div>

        {/* Uploaded Documents Table */}
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
                {Array.from(new Set(docs.map(d => d.category))).map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th>Document Name</th>
                  <th>Category</th>
                  <th>File Size</th>
                  <th>Date Added</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDocs.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-light)' }}>
                      No documents found matching filters.
                    </td>
                  </tr>
                ) : (
                  filteredDocs.map(doc => (
                    <tr key={doc.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{doc.name}</div>
                        <div style={{ fontSize: '11.5px', color: 'var(--text-light)' }}>ID: {doc.id}</div>
                      </td>
                      <td>
                        <span className="tag-rect tag-service">{doc.category}</span>
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '12.5px' }}>{doc.size}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '12.5px' }}>{doc.date}</td>
                      <td>
                        <span className="tag-rect tag-resolved">
                          {doc.status === 'active' ? 'Active' : 'Processing'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn-action"
                          style={{ height: '28px', padding: '0 10px', fontSize: '12px', marginRight: '6px' }}
                          onClick={() => alert(`Document: ${doc.name}\nCategory: ${doc.category}\nSize: ${doc.size}\nStatus: ${doc.status}`)}
                        >
                          View
                        </button>
                        <button
                          type="button"
                          className="btn-action"
                          style={{ height: '28px', padding: '0 10px', fontSize: '12px', color: '#F87171' }}
                          onClick={() => onDeleteDoc(doc.id)}
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
