export type MemoryKind = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'other';

export type MemoryItem = {
  id: string;
  name: string;
  path: string;
  size: number;
  type: string;
  lastModified: number;
  handle: FileSystemFileHandle;
  parent: FileSystemDirectoryHandle;
  kind: MemoryKind;
};

const supportedExtensions = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif',
  'mp4', 'webm', 'mov', 'm4v', 'avi', 'mkv',
  'mp3', 'wav', 'ogg', 'm4a',
  'pdf', 'txt', 'md', 'csv', 'json', 'html', 'css', 'js', 'ts',
  'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx'
]);

const ignoredFolders = new Set(['guardar', 'borrar']);

function getExtension(name: string): string {
  return name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
}

function getKind(file: File): MemoryKind {
  const ext = getExtension(file.name);
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (file.type.startsWith('text/') || ['txt', 'md', 'csv', 'json', 'html', 'css', 'js', 'ts'].includes(ext)) return 'text';
  return 'other';
}

export function isFileSystemAccessSupported(): boolean {
  return typeof window.showDirectoryPicker === 'function';
}

export async function pickRootDirectory(): Promise<FileSystemDirectoryHandle> {
  if (!window.showDirectoryPicker) {
    throw new Error('Tu navegador no permite seleccionar carpetas locales. Usa Chrome o Edge actualizado.');
  }
  return window.showDirectoryPicker({ mode: 'readwrite' });
}

export async function ensureDecisionFolders(root: FileSystemDirectoryHandle) {
  const guardar = await root.getDirectoryHandle('guardar', { create: true });
  const borrar = await root.getDirectoryHandle('borrar', { create: true });
  return { guardar, borrar };
}

async function* walkDirectory(
  directory: FileSystemDirectoryHandle,
  basePath = ''
): AsyncGenerator<{ fileHandle: FileSystemFileHandle; parent: FileSystemDirectoryHandle; path: string }> {
  for await (const [name, handle] of directory.entries()) {
    if (handle.kind === 'directory') {
      if (basePath === '' && ignoredFolders.has(name.toLowerCase())) continue;
      yield* walkDirectory(handle as FileSystemDirectoryHandle, `${basePath}${name}/`);
    } else if (handle.kind === 'file') {
      yield { fileHandle: handle as FileSystemFileHandle, parent: directory, path: `${basePath}${name}` };
    }
  }
}

export async function loadMemoryItems(root: FileSystemDirectoryHandle): Promise<MemoryItem[]> {
  const items: MemoryItem[] = [];

  for await (const entry of walkDirectory(root)) {
    const file = await entry.fileHandle.getFile();
    const ext = getExtension(file.name);
    if (!supportedExtensions.has(ext) && !file.type) continue;

    items.push({
      id: `${entry.path}-${file.lastModified}-${file.size}`,
      name: file.name,
      path: entry.path,
      size: file.size,
      type: file.type,
      lastModified: file.lastModified,
      handle: entry.fileHandle,
      parent: entry.parent,
      kind: getKind(file),
    });
  }

  return items.sort((a, b) => a.path.localeCompare(b.path, 'es'));
}

async function getAvailableName(directory: FileSystemDirectoryHandle, originalName: string): Promise<string> {
  const dotIndex = originalName.lastIndexOf('.');
  const base = dotIndex > 0 ? originalName.slice(0, dotIndex) : originalName;
  const ext = dotIndex > 0 ? originalName.slice(dotIndex) : '';

  let candidate = originalName;
  let counter = 1;

  while (true) {
    try {
      await directory.getFileHandle(candidate);
      candidate = `${base} (${counter})${ext}`;
      counter += 1;
    } catch {
      return candidate;
    }
  }
}

async function copyFileHandleToDirectory(
  handle: FileSystemFileHandle,
  destination: FileSystemDirectoryHandle,
  preferredName: string
): Promise<string> {
  const safeName = await getAvailableName(destination, preferredName);
  const newHandle = await destination.getFileHandle(safeName, { create: true });
  const writable = await newHandle.createWritable();
  const file = await handle.getFile();
  await writable.write(await file.arrayBuffer());
  await writable.close();
  return safeName;
}

export async function copyItemToDirectory(item: MemoryItem, destination: FileSystemDirectoryHandle): Promise<string> {
  return copyFileHandleToDirectory(item.handle, destination, item.name);
}

export async function moveItemToDirectory(item: MemoryItem, destination: FileSystemDirectoryHandle): Promise<string> {
  const copiedName = await copyItemToDirectory(item, destination);
  try {
    await item.parent.removeEntry(item.name);
  } catch {
    // Si el navegador bloquea el borrado, al menos queda copiado en destino.
  }
  return copiedName;
}

export async function moveNamedFileBetweenDirectories(
  source: FileSystemDirectoryHandle,
  sourceName: string,
  destination: FileSystemDirectoryHandle,
  preferredName: string
): Promise<string> {
  const sourceHandle = await source.getFileHandle(sourceName);
  const copiedName = await copyFileHandleToDirectory(sourceHandle, destination, preferredName);
  try {
    await source.removeEntry(sourceName);
  } catch {
    // Si no se puede borrar, queda copiado. Lo avisará el usuario al ver duplicado.
  }
  return copiedName;
}
