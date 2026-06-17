import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, File, FileAudio, FileText, Loader2, Maximize2, Sparkles } from 'lucide-react';
import type { MemoryItem } from '../fileSystem';

type Props = {
  item: MemoryItem | null;
  isLoading: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
  onDelete?: () => void;
  onSave?: () => void;
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** exponent).toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

export function MemoryViewer({ item, isLoading, onPrevious, onNext, onDelete, onSave }: Props) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const touchStart = useRef<{ x: number; y: number; time: number } | null>(null);

  const isDocumentLike = item?.kind === 'pdf' || item?.kind === 'text';

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;

    async function createPreviewUrl() {
      setObjectUrl(null);
      setPreviewError(null);
      if (!item) return;

      try {
        const file = await item.handle.getFile();
        if (cancelled) return;
        url = URL.createObjectURL(file);
        setObjectUrl(url);
      } catch {
        if (!cancelled) setPreviewError('No se pudo preparar la vista previa de este archivo.');
      }
    }

    void createPreviewUrl();

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [item]);

  const openInNewTab = useCallback(() => {
    if (!objectUrl) return;
    window.open(objectUrl, '_blank', 'noopener,noreferrer');
  }, [objectUrl]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space' && objectUrl && isDocumentLike) {
        event.preventDefault();
        openInNewTab();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isDocumentLike, objectUrl, openInNewTab]);

  const documentSrc = useMemo(() => {
    if (!objectUrl) return '';
    if (item?.kind === 'pdf') return `${objectUrl}#toolbar=1&navpanes=0&scrollbar=1&view=FitH`;
    return objectUrl;
  }, [item?.kind, objectUrl]);

  const handleTouchStart = useCallback((event: React.TouchEvent<HTMLElement>) => {
    const touch = event.changedTouches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  }, []);

  const handleTouchEnd = useCallback((event: React.TouchEvent<HTMLElement>) => {
    if (!touchStart.current) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStart.current.x;
    const dy = touch.clientY - touchStart.current.y;
    const elapsed = Date.now() - touchStart.current.time;
    touchStart.current = null;

    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    const minDistance = 64;
    if (elapsed > 900 || Math.max(absX, absY) < minDistance) return;

    if (absX > absY) {
      if (dx > 0) onSave?.();
      else onDelete?.();
      return;
    }

    if (dy > 0) onNext?.();
    else onPrevious?.();
  }, [onDelete, onNext, onPrevious, onSave]);

  if (isLoading) {
    return (
      <article className="viewer-card empty-state">
        <Loader2 className="spinner" size={42} />
        <h2>Cargando recuerdos...</h2>
        <p>Estoy abriendo cajones digitales sin hacer ruido.</p>
      </article>
    );
  }

  if (!item) {
    return (
      <article className="viewer-card empty-state">
        <Sparkles size={48} />
        <h2>Selecciona una carpeta</h2>
        <p>Cuando abras una carpeta, aparecerán aquí sus archivos para clasificarlos.</p>
      </article>
    );
  }

  return (
    <article
      className={`viewer-card ${item.kind === 'pdf' ? 'pdf-card' : ''} ${item.kind === 'text' ? 'text-card' : ''}`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <header className="file-header">
        <div>
          <p className="file-path">{item.path}</p>
          <h2>{item.name}</h2>
        </div>
        <div className="file-actions">
          {objectUrl && isDocumentLike && (
            <button className="small-action" onClick={openInNewTab} title="Abrir en pestaña nueva">
              <ExternalLink size={16} />
              Abrir
            </button>
          )}
          <span className="file-pill">{item.kind} · {formatBytes(item.size)}</span>
        </div>
      </header>

      <div className="preview-area">
        {previewError && <div className="document-preview"><File size={72} /><p>{previewError}</p></div>}
        {!previewError && !objectUrl && <Loader2 className="spinner" size={42} />}

        {!previewError && objectUrl && item.kind === 'image' && (
          <img src={objectUrl} alt={item.name} className="media-preview" />
        )}

        {!previewError && objectUrl && item.kind === 'video' && (
          <video src={objectUrl} className="media-preview" controls autoPlay muted loop playsInline />
        )}

        {!previewError && objectUrl && item.kind === 'audio' && (
          <div className="document-preview">
            <FileAudio size={72} />
            <audio src={objectUrl} controls />
          </div>
        )}

        {!previewError && objectUrl && item.kind === 'pdf' && (
          <div className="document-shell">
            <iframe src={documentSrc} title={item.name} className="document-frame" />
            <button className="floating-open" onClick={openInNewTab} title="Abrir PDF en pestaña nueva">
              <Maximize2 size={18} />
              Abrir grande
            </button>
          </div>
        )}

        {!previewError && objectUrl && item.kind === 'text' && (
          <div className="document-shell">
            <iframe src={documentSrc} title={item.name} className="document-frame" />
            <button className="floating-open" onClick={openInNewTab} title="Abrir documento en pestaña nueva">
              <Maximize2 size={18} />
              Abrir grande
            </button>
          </div>
        )}

        {!previewError && objectUrl && item.kind === 'other' && (
          <div className="document-preview">
            <File size={72} />
            <h3>Vista previa no disponible</h3>
            <p>Puedes clasificarlo igualmente.</p>
            <a href={objectUrl} download={item.name}>Abrir/descargar copia temporal</a>
          </div>
        )}
      </div>

      <footer className="file-footer">
        <FileText size={16} />
        <span>Ruta original: {item.path}</span>
      </footer>
    </article>
  );
}
