# MemorySlide 3.0

PWA local para revisar imágenes, vídeos y documentos de una carpeta y clasificarlos en `guardar` o `borrar`.

## Novedades

- Estética glass/pastel inspirada en dashboards modernos.
- Gestos táctiles en smartphone:
  - Deslizar a la derecha: guardar.
  - Deslizar a la izquierda: borrar.
  - Deslizar hacia arriba: elemento anterior.
  - Deslizar hacia abajo: siguiente elemento.
- PDFs con botón para abrir en grande.
- Barra de progreso y deshacer con Ctrl+Z.

## Uso

```bash
npm install
npm run dev
```

Abre la URL que aparezca en Chrome o Edge. Después pulsa **Seleccionar carpeta**.

> Importante: la selección y modificación de carpetas locales necesita Chrome/Edge por la File System Access API.
