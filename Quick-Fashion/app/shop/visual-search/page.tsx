'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { visualSearchByImage, type VisualSearchResult, type VisualSearchResponse } from '@/lib/api';
import AuctionCard from '@/app/components/AuctionCard';


type SearchState = 'idle' | 'analysing' | 'results' | 'error';

export default function VisualSearchPage() {
  const [state, setState] = useState<SearchState>('idle');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [results, setResults] = useState<VisualSearchResult[]>([]);
  const [totalScanned, setTotalScanned] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [analysisDetails, setAnalysisDetails] = useState<VisualSearchResponse['analysisDetails'] | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  /** Store the current image data URL so we can re-search when category changes */
  const currentImageRef = useRef<string | null>(null);

  const doSearch = useCallback(async (imageDataUrl: string, category: string) => {
    setState('analysing');
    setErrorMessage('');
    try {
      const response = await visualSearchByImage(imageDataUrl, category || undefined);
      setResults(response.results);
      setTotalScanned(response.totalScanned);
      setAnalysisDetails(response.analysisDetails ?? null);
      setState('results');
    } catch (err) {
      console.error('Visual search failed:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Visual search failed');
      setState('error');
    }
  }, []);

  const processImage = useCallback(async (file: File) => {
    // Create preview
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      setImagePreview(dataUrl);
      currentImageRef.current = dataUrl;
      await doSearch(dataUrl, selectedCategory);
    };
    reader.readAsDataURL(file);
  }, [selectedCategory, doSearch]);

  // Re-search when category changes (if image is already uploaded)
  const reSearch = useCallback(async (category: string) => {
    if (!currentImageRef.current) return;
    await doSearch(currentImageRef.current, category);
  }, [doSearch]);

  const handleFileSelect = useCallback((files: FileList | null) => {
    if (!files?.length) return;
    const file = files[0];
    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please upload an image file');
      setState('error');
      return;
    }
    processImage(file);
  }, [processImage]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  }, [handleFileSelect]);

  const handleReset = () => {
    setState('idle');
    setImagePreview(null);
    setResults([]);
    setTotalScanned(0);
    setErrorMessage('');
    setAnalysisDetails(null);
    currentImageRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="vs-page">
      {/* ── Hero header ────────────────────────────────────────── */}
      <header className="vs-hero">
        <h1>Visual Search</h1>
        <p className="vs-hero-copy">
          Upload a photo of any garment and we&apos;ll find the most similar pieces in our collection.
        </p>
      </header>

      {/* ── Upload / Analysis / Results ────────────────────────── */}
      <div className="vs-container">

        {/* Upload zone — always visible, collapses in results mode */}
        <div className={`vs-upload-section ${state !== 'idle' ? 'vs-upload-compact' : ''}`}>
          <div
            className={`vs-drop-zone ${isDragging ? 'vs-dragging' : ''} ${imagePreview ? 'vs-has-image' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            aria-label="Upload garment image"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => handleFileSelect(e.target.files)}
              className="vs-file-input"
            />

            {imagePreview ? (
              <div className="vs-preview-wrapper">
                <img src={imagePreview} alt="Uploaded garment" className="vs-preview-image" />
              </div>
            ) : (
              <div className="vs-upload-prompt">
                <div className="vs-upload-icon">
                  <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M24 32V16M24 16L18 22M24 16L30 22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M8 32C8 36.4183 11.5817 40 16 40H32C36.4183 40 40 36.4183 40 32V24C40 19.5817 36.4183 16 32 16H28" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    <circle cx="16" cy="12" r="4" stroke="currentColor" strokeWidth="2"/>
                  </svg>
                </div>
                <h3>Drop your garment image here</h3>
                <p>or click to browse · JPG, PNG, WebP</p>
              </div>
            )}
          </div>

          {/* Category selector */}
          <div className="vs-controls">
            <label className="vs-label">Narrow by category</label>
            <div className="vs-category-pills">
              <button
                className={`vs-pill ${!selectedCategory ? 'active' : ''}`}
                onClick={() => { setSelectedCategory(''); if (state === 'results') reSearch(''); }}
              >
                All
              </button>
              {['shirt', 't-shirt', 'dress', 'jacket', 'bottoms', 'sweatshirt', 'sweater'].map((cat) => (
                <button
                  key={cat}
                  className={`vs-pill ${selectedCategory === cat ? 'active' : ''}`}
                  onClick={() => { setSelectedCategory(cat); if (state === 'results') reSearch(cat); }}
                >
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </button>
              ))}
            </div>
            {state !== 'idle' && (
              <button className="vs-reset-btn" onClick={handleReset}>
                ← Upload a new image
              </button>
            )}
          </div>
        </div>

        {state === 'analysing' && (
          <div className="vs-analysing">
            <div className="vs-spinner" />
            <h3>Analysing garment with AI</h3>
            <p>Identifying category, style, colour, and pattern…</p>
          </div>
        )}

        {/* ── Error state ──────────────────────────────────────── */}
        {state === 'error' && (
          <div className="vs-error">
            <h3>Something went wrong</h3>
            <p>{errorMessage || 'Please try again with a different image.'}</p>
            <button className="button-dark" onClick={handleReset}>Try again</button>
          </div>
        )}

        {/* ── AI Analysis Details ──────────────────────────────── */}
        {analysisDetails?.geminiLabels && state === 'results' && (
          <div className="vs-analysis-details">
            <div className="vs-label-grid">
              {Object.entries(analysisDetails.geminiLabels).map(([key, value]) => (
                <div key={key} className="vs-label-item">
                  <span className="vs-label-key">{key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}</span>
                  <span className="vs-label-value">{value as string}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {state === 'results' && (
          <div className="vs-results-section">
            <div className="vs-results-header">
              <h2>Similar Garments</h2>
              <p className="vs-results-meta">
                {results.length} match{results.length !== 1 ? 'es' : ''} found · {totalScanned} scanned
              </p>
            </div>

            {results.length > 0 ? (
              <div className="vs-results-grid">
                {results.map((product) => (
                  <div key={product.id} className="vs-result-card">
                    <div className="vs-similarity-badge">
                      <span className="vs-sim-score">{Math.round(product.similarityScore * 100)}%</span>
                      <span className="vs-sim-label">match</span>
                    </div>
                    <AuctionCard product={product} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="vs-no-results">
                <h3>No similar garments found</h3>
                <p>Try uploading a different image or broadening your category filter.</p>
                <Link href="/shop" className="button-dark">Browse all garments</Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

