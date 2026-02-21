import { useState, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import type { Reference } from '../api/types';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PDFViewerProps {
  documentId: string;
  pageNumber: number;
  onLoadSuccess?: (numPages: number) => void;
  onLoadError?: (error: Error) => void;
  activeHighlight?: Reference | null;
}

export default function PDFViewer({ documentId, pageNumber, onLoadSuccess, onLoadError, activeHighlight }: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const [pageWidth, setPageWidth] = useState(700); // Increased from 550

  const pdfUrl = `http://localhost:8000/api/v1/documents/${documentId}/pdf`;

  // Scroll to highlight when it changes
  useEffect(() => {
    if (activeHighlight && pageContainerRef.current) {
      // Smooth scroll to the page container
      pageContainerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeHighlight]);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setIsLoading(false);
    onLoadSuccess?.(numPages);
  }

  function onDocumentLoadError(error: Error) {
    setIsLoading(false);
    console.error('PDF load error:', error);
    onLoadError?.(error);
  }

  const hasHighlight = activeHighlight !== null && activeHighlight !== undefined;
  const highlightTerms = activeHighlight?.highlightText || [];

  // Apply text highlighting after page loads
  useEffect(() => {
    if (!hasHighlight || highlightTerms.length === 0) return;

    // Wait for text layer to render
    const timer = setTimeout(() => {
      const textLayer = pageContainerRef.current?.querySelector('.react-pdf__Page__textContent');
      if (!textLayer) {
        console.log('Text layer not found for highlighting');
        return;
      }

      // Remove previous highlights
      textLayer.querySelectorAll('mark.highlight-text').forEach(mark => {
        const parent = mark.parentNode;
        if (parent) {
          parent.replaceChild(document.createTextNode(mark.textContent || ''), mark);
          parent.normalize();
        }
      });

      // Get all text content from the page
      const allText = textLayer.textContent || '';
      console.log('Searching for highlights. Terms:', highlightTerms);
      console.log('Page text sample:', allText.substring(0, 200));

      // Try to highlight each term more aggressively
      let highlightCount = 0;
      const spans = textLayer.querySelectorAll('span');
      
      spans.forEach((span) => {
        const text = span.textContent || '';
        if (!text.trim()) return;

        // Check each highlight term
        for (const term of highlightTerms) {
          if (!term || term.length < 3) continue; // Skip very short terms
          
          // Try multiple matching strategies
          const patterns = [
            new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), // Word boundary
            new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), // Exact match
            new RegExp(term.split(/\s+/).join('\\s*'), 'gi'), // Flexible whitespace
          ];

          for (const regex of patterns) {
            if (regex.test(text)) {
              // Highlight this span
              const mark = document.createElement('mark');
              mark.className = 'highlight-text';
              mark.textContent = text;
              span.replaceWith(mark);
              highlightCount++;
              console.log(`Highlighted: "${text.substring(0, 50)}..." (matched term: "${term}")`);
              return; // Move to next span
            }
          }
        }
      });

      console.log(`Applied ${highlightCount} highlights`);
      
      // If no highlights found, try the excerpt
      if (highlightCount === 0 && activeHighlight?.excerpt) {
        const excerpt = activeHighlight.excerpt.substring(0, 50);
        console.log('No highlights found, trying excerpt:', excerpt);
        
        spans.forEach((span) => {
          const text = span.textContent || '';
          if (text.includes(excerpt) || excerpt.includes(text.trim())) {
            const mark = document.createElement('mark');
            mark.className = 'highlight-text';
            mark.textContent = text;
            span.replaceWith(mark);
            highlightCount++;
          }
        });
        
        console.log(`Applied ${highlightCount} highlights from excerpt`);
      }
    }, 500); // Increased timeout for text layer render

    return () => clearTimeout(timer);
  }, [hasHighlight, highlightTerms, pageNumber, activeHighlight]);

  return (
    <div className="flex flex-col items-center h-full overflow-auto bg-slate-50 p-4">
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-sm text-slate-600">Loading PDF...</span>
        </div>
      )}
      
      {/* Highlight indicator banner - only show if we have content to display */}
      {hasHighlight && activeHighlight.excerpt && (
        <div className="mb-3 px-4 py-2 bg-yellow-50 border border-yellow-200 rounded-lg shadow-sm max-w-2xl">
          <div className="flex items-start gap-2 text-sm text-yellow-800">
            <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse mt-1 flex-shrink-0"></div>
            <div className="flex-1">
              <span className="font-medium block mb-1">Reference excerpt:</span>
              <p className="text-xs text-yellow-700 italic leading-relaxed">"{activeHighlight.excerpt.substring(0, 150)}{activeHighlight.excerpt.length > 150 ? '...' : ''}"</p>
            </div>
          </div>
        </div>
      )}
      
      <div ref={pageContainerRef} className="relative">
        <Document
          file={pdfUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          loading={null}
          error={
            <div className="text-center py-12">
              <div className="text-red-600 mb-2">Failed to load PDF</div>
              <div className="text-sm text-slate-500">Please check if the document exists and try again</div>
            </div>
          }
        >
          <div className="relative inline-block">
            <Page
              pageNumber={pageNumber}
              renderTextLayer={true}
              renderAnnotationLayer={false}
              className={`shadow-lg ${hasHighlight ? 'ring-4 ring-yellow-300 ring-opacity-50' : ''}`}
              width={pageWidth}
              onLoadSuccess={(page) => {
                setPageWidth(page.width);
              }}
            />
            
            {/* Highlight overlay */}
            {hasHighlight && activeHighlight.highlightArea && (
              <div
                className="absolute pointer-events-none"
                style={{
                  top: `${activeHighlight.highlightArea.top}%`,
                  left: `${activeHighlight.highlightArea.left}%`,
                  width: `${activeHighlight.highlightArea.width}%`,
                  height: `${activeHighlight.highlightArea.height}%`,
                  backgroundColor: 'rgba(255, 235, 59, 0.4)',
                  border: '2px solid rgba(255, 193, 7, 0.8)',
                  borderRadius: '4px',
                  animation: 'highlight-pulse 2s ease-in-out infinite',
                }}
              />
            )}
          </div>
        </Document>
      </div>
      
      {numPages && (
        <div className="mt-4 text-xs text-slate-500">
          Page {pageNumber} of {numPages}
        </div>
      )}
      
      {/* CSS for highlight animation */}
      <style>{`
        /* Fix PDF layer stacking - text layer should overlay canvas */
        .react-pdf__Page {
          position: relative;
        }
        
        .react-pdf__Page__canvas {
          display: block;
        }
        
        .react-pdf__Page__textContent {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          overflow: hidden;
          opacity: 0.2;
          line-height: 1;
        }
        
        .react-pdf__Page__textContent span {
          color: transparent;
          position: absolute;
          white-space: pre;
          cursor: text;
          transform-origin: 0% 0%;
        }
        
        @keyframes highlight-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255, 193, 7, 0.7); }
          50% { box-shadow: 0 0 0 8px rgba(255, 193, 7, 0); }
        }
        
        /* Text highlighting styles */
        .react-pdf__Page__textContent mark.highlight-text {
          background-color: rgba(255, 235, 59, 0.6);
          color: transparent;
          padding: 2px 0;
          border-radius: 2px;
          animation: highlight-fade 1.5s ease-in-out;
        }
        
        @keyframes highlight-fade {
          0% { background-color: rgba(255, 193, 7, 0.9); }
          100% { background-color: rgba(255, 235, 59, 0.6); }
        }
      `}</style>
    </div>
  );
}
