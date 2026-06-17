import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  FolderOpen,
  Heart,
  RotateCcw,
  RotateCw,
  Trash2,
} from 'lucide-react';
import { MemoryViewer } from './components/MemoryViewer';
import {
  MemoryItem,
  ensureDecisionFolders,
  isFileSystemAccessSupported,
  loadMemoryItems,
  moveItemToDirectory,
  moveNamedFileBetweenDirectories,
  pickRootDirectory,
} from './fileSystem';

type DestinationFolders = {
  guardar: FileSystemDirectoryHandle;
  borrar: FileSystemDirectoryHandle;
};

type ActionLog = {
  fileName: string;
  originalPath: string;
  originalParent: FileSystemDirectoryHandle;
  target: 'guardar' | 'borrar';
  savedAs: string;
};

export default function App() {
  const [root, setRoot] = useState<FileSystemDirectoryHandle | null>(null);
  const [folders, setFolders] = useState<DestinationFolders | null>(null);
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [initialCount, setInitialCount] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<ActionLog[]>([]);

  const currentItem = items[currentIndex] ?? null;
  const supported = isFileSystemAccessSupported();

  const refreshItems = useCallback(async (directory: FileSystemDirectoryHandle, resetInitialCount = false) => {
    const decisionFolders = await ensureDecisionFolders(directory);
    const loaded = await loadMemoryItems(directory);
    setFolders(decisionFolders);
    setItems(loaded);
    setCurrentIndex((idx) => Math.min(idx, Math.max(loaded.length - 1, 0)));
    if (resetInitialCount) setInitialCount(loaded.length);
    return loaded;
  }, []);

  const loadFolder = useCallback(async () => {
    try {
      setError(null);
      setIsLoading(true);

      const directory = await pickRootDirectory();
      const loaded = await refreshItems(directory, true);

      setRoot(directory);
      setCurrentIndex(0);
      setLog([]);
      if (loaded.length === 0) {
        setError('No he encontrado archivos compatibles en esa carpeta.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo abrir la carpeta.');
    } finally {
      setIsLoading(false);
    }
  }, [refreshItems]);

  const reloadCurrentFolder = useCallback(async () => {
    if (!root) return;
    try {
      setError(null);
      setIsLoading(true);
      await refreshItems(root, true);
      setCurrentIndex(0);
      setLog([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo recargar la carpeta.');
    } finally {
      setIsLoading(false);
    }
  }, [refreshItems, root]);

  const previousItem = useCallback(() => {
    setCurrentIndex((index) => Math.max(0, index - 1));
  }, []);

  const nextItem = useCallback(() => {
    setCurrentIndex((index) => Math.min(items.length - 1, index + 1));
  }, [items.length]);

  const decide = useCallback(async (target: 'guardar' | 'borrar') => {
    if (!currentItem || !folders || isMoving) return;
    try {
      setIsMoving(true);
      setError(null);
      const savedAs = await moveItemToDirectory(currentItem, folders[target]);
      setLog((prev) => [{
        fileName: currentItem.name,
        originalPath: currentItem.path,
        originalParent: currentItem.parent,
        target,
        savedAs,
      }, ...prev].slice(0, 12));
      setItems((prev) => {
        const updated = prev.filter((item) => item.id !== currentItem.id);
        setCurrentIndex((idx) => Math.min(idx, Math.max(updated.length - 1, 0)));
        return updated;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo mover el archivo.');
    } finally {
      setIsMoving(false);
    }
  }, [currentItem, folders, isMoving]);

  const undoLast = useCallback(async () => {
    const last = log[0];
    if (!last || !folders || !root || isMoving) return;

    try {
      setIsMoving(true);
      setError(null);
      await moveNamedFileBetweenDirectories(folders[last.target], last.savedAs, last.originalParent, last.fileName);
      setLog((prev) => prev.slice(1));
      await refreshItems(root, false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo deshacer el último movimiento.');
    } finally {
      setIsMoving(false);
    }
  }, [folders, isMoving, log, refreshItems, root]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const active = document.activeElement;
      const isTyping = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement;
      if (isTyping) return;

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        previousItem();
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        nextItem();
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        void decide('borrar');
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        void decide('guardar');
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        void undoLast();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [decide, nextItem, previousItem, undoLast]);

  const stats = useMemo(() => {
    const saved = log.filter((entry) => entry.target === 'guardar').length;
    const deleted = log.filter((entry) => entry.target === 'borrar').length;
    const reviewed = Math.max(initialCount - items.length, log.length);
    const progress = initialCount > 0 ? Math.round((reviewed / initialCount) * 100) : 0;
    return { saved, deleted, reviewed, progress };
  }, [initialCount, items.length, log]);

  const progressLabel = useMemo(() => {
    if (!items.length) return '0 / 0';
    return `${currentIndex + 1} / ${items.length}`;
  }, [currentIndex, items.length]);

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">PWA local · swipe friendly</p>
          <h1>MemorySlide</h1>
          <p className="subtitle">
            Revisa imágenes, vídeos y documentos con una interfaz suave tipo dashboard. En ordenador usa flechas; en móvil desliza: derecha guarda, izquierda borra, arriba y abajo navegan.
          </p>
        </div>

        <div className="hero-actions">
          <button className="primary-button" onClick={loadFolder} disabled={!supported || isLoading || isMoving}>
            <FolderOpen size={20} />
            Seleccionar carpeta
          </button>
          <button className="ghost-button" onClick={reloadCurrentFolder} disabled={!root || isLoading || isMoving}>
            <RotateCw size={18} />
            Recargar
          </button>
          <button className="ghost-button" onClick={undoLast} disabled={!log.length || isLoading || isMoving}>
            <RotateCcw size={18} />
            Deshacer
          </button>
        </div>
      </section>

      {!supported && (
        <div className="warning-card">
          Este navegador no soporta selección de carpetas locales. Usa Chrome o Edge actualizado.
        </div>
      )}

      {error && <div className="warning-card">{error}</div>}

      <section className="workspace">
        <aside className="side-card">
          <h2>Controles</h2>
          <p className="touch-hint">En smartphone: desliza ← borrar · → guardar · ↑ anterior · ↓ siguiente</p>
          <div className="key-grid">
            <span>↑</span><p>Elemento anterior</p>
            <span>↓</span><p>Siguiente elemento</p>
            <span>←</span><p>Mandar a borrar</p>
            <span>→</span><p>Guardar</p>
            <span>Ctrl Z</span><p>Deshacer último</p>
            <span>Espacio</span><p>Abrir PDF/documento</p>
          </div>

          <div className="stats-card">
            <Archive size={18} />
            <strong>{progressLabel}</strong>
            <span>pendientes</span>
          </div>

          <div className="progress-card">
            <div className="progress-top">
              <strong>{stats.progress}% revisado</strong>
              <span>{stats.reviewed} / {initialCount}</span>
            </div>
            <div className="progress-bar" aria-label="Progreso">
              <div style={{ width: `${stats.progress}%` }} />
            </div>
            <div className="mini-stats">
              <span>Guardados: {stats.saved}</span>
              <span>Borrados: {stats.deleted}</span>
              <span>Pendientes: {items.length}</span>
            </div>
          </div>

          <div className="log-list">
            <h3>Últimas decisiones</h3>
            {log.length === 0 && <p className="muted">Todavía no hay movimientos.</p>}
            {log.map((entry, index) => (
              <div className="log-item" key={`${entry.fileName}-${index}`}>
                <strong>{entry.target === 'guardar' ? 'Guardado' : 'Borrar'}</strong>
                <span>{entry.fileName}</span>
                {entry.savedAs !== entry.fileName && <small>como {entry.savedAs}</small>}
              </div>
            ))}
          </div>
        </aside>

        <section className="viewer-column">
          <MemoryViewer
            item={currentItem}
            isLoading={isLoading}
            onPrevious={previousItem}
            onNext={nextItem}
            onDelete={() => decide('borrar')}
            onSave={() => decide('guardar')}
          />

          <div className="control-pad">
            <button className="round-button" onClick={previousItem} disabled={!currentItem || currentIndex === 0 || isMoving} aria-label="Anterior">
              <ChevronUp />
            </button>
            <div className="horizontal-controls">
              <button className="decision-button delete" onClick={() => decide('borrar')} disabled={!currentItem || isMoving}>
                <ChevronLeft />
                <Trash2 size={20} />
                Borrar
              </button>
              <button className="round-button" onClick={nextItem} disabled={!currentItem || currentIndex >= items.length - 1 || isMoving} aria-label="Siguiente">
                <ChevronDown />
              </button>
              <button className="decision-button save" onClick={() => decide('guardar')} disabled={!currentItem || isMoving}>
                Guardar
                <Heart size={20} />
                <ChevronRight />
              </button>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
