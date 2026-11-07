import Phaser from 'phaser';
import { clampView } from '../../core/map/camera';
import { FEET_H, FEET_W } from '../../core/map/collision';
import type { HotspotDef } from '../../core/map/hotspots';
import { GAME_HEIGHT, GAME_WIDTH, RENDER_SCALE } from '../config';
import type { MapEditorHost } from './host';

/** check-size-budget fails if this string shows up in the initial bundle. */
const EDITOR_MARKER = 'MAP_EDITOR_MARKER';
const STORAGE_KEY = 'mnnit-conquest/debug-layout';
const OVERLAY_TEXTURE = 'dbg-overlay';
const HANDLE_PX = 26; // touch-friendly hit radius, in screen (logical) pixels
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 3;
const MAX_UNDO = 60;

type Tool = 'pan' | 'select' | 'paint' | 'fill' | 'pick';
type Drag =
  | { kind: 'pan'; lastX: number; lastY: number }
  | { kind: 'move-hotspot'; def: HotspotDef; dx: number; dy: number }
  | { kind: 'radius'; def: HotspotDef }
  | { kind: 'paint'; lastCol: number; lastRow: number }
  | { kind: 'fill'; col0: number; row0: number; col1: number; row1: number }
  | null;

interface SavedLayout {
  rows: string[];
  hotspots: { id: string; x: number; y: number; radius: number }[];
}

const CSS = `
#dbg-toolbar{position:fixed;top:4px;left:4px;z-index:15;display:flex;flex-wrap:wrap;gap:4px;max-width:72vw;font:12px system-ui,sans-serif;touch-action:manipulation}
#dbg-toolbar button,#dbg-export button{font:inherit;min-height:34px;padding:4px 10px;border:1px solid #000;border-radius:6px;background:#dde3ea;color:#111}
#dbg-toolbar button[data-on=true]{background:#f2c14e}
#dbg-palette{position:fixed;right:4px;bottom:4px;z-index:15;display:none;flex-wrap:wrap;gap:3px;max-width:56vw;justify-content:flex-end;touch-action:manipulation}
#dbg-palette button{width:38px;height:38px;padding:0;border:2px solid #000;border-radius:6px;font:700 15px ui-monospace,monospace;color:#fff;text-shadow:0 0 3px #000,0 0 3px #000}
#dbg-palette button[data-on=true]{outline:3px solid #fff;border-color:#f2c14e}
#dbg-info{position:fixed;left:4px;bottom:4px;z-index:15;margin:0;padding:3px 6px;background:#000a;color:#9f9;font:11px/1.3 ui-monospace,monospace;pointer-events:none;white-space:pre}
#dbg-export{position:fixed;inset:0;z-index:25;background:#000d;color:#eee;overflow:auto;padding:10px;font:13px system-ui,sans-serif;touch-action:pan-y}
#dbg-export textarea{display:block;width:100%;height:28vh;margin:4px 0;font:11px ui-monospace,monospace;background:#111;color:#cfc;border:1px solid #555;-webkit-user-select:text;user-select:text}
#dbg-export .row{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}
`;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  text = '',
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text) e.textContent = text;
  return e;
}

function download(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = el('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 2000);
}

export function attachMapEditor(host: MapEditorHost): () => void {
  const scene = host.scene;
  const grid = host.grid;
  const ts = grid.tileSize;
  const S = RENDER_SCALE;
  let editMode = false;
  let tool: Tool = 'paint';
  let brushType = Math.max(0, grid.indexOfChar('='));
  let brushSize = 1;
  let selectedHotspot: HotspotDef | null = null;
  let drag: Drag = null;
  let overlayOn = true;
  let gridOn = false;
  let dirty = true;
  let lastPx = NaN;
  let lastPy = NaN;
  let stroke = new Map<number, number>();
  const undoStack: Map<number, number>[] = [];

  // ---- restore a previous session's layout (phone sessions must survive an accidental reload)
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as SavedLayout;
      const sameShape =
        Array.isArray(saved.rows) &&
        saved.rows.length === grid.rows &&
        saved.rows.every((line) => typeof line === 'string' && line.length === grid.cols);
      if (sameShape) {
        saved.rows.forEach((line, r) => {
          for (let c = 0; c < grid.cols; c++) {
            const t = grid.indexOfChar(line.charAt(c));
            if (t >= 0 && t !== grid.typeAt(c, r)) host.setTile(c, r, t);
          }
        });
      }
      for (const s of saved.hotspots) {
        const h = host.hotspots.find((d) => d.id === s.id);
        if (h) {
          h.x = s.x;
          h.y = s.y;
          h.radius = s.radius;
        }
      }
      host.syncVisuals();
    }
  } catch (err) {
    console.warn('Ignoring unreadable debug layout', err);
  }

  const persist = (): void => {
    try {
      const saved: SavedLayout = {
        rows: grid.toRows(),
        hotspots: host.hotspots.map((h) => ({ id: h.id, x: h.x, y: h.y, radius: h.radius })),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch (err) {
      console.warn('Could not store debug layout', err);
    }
  };

  // ---- blocked-tile tint, as a second tile layer so a paint stroke updates it cheaply
  if (!scene.textures.exists(OVERLAY_TEXTURE)) {
    const tex = scene.textures.createCanvas(OVERLAY_TEXTURE, ts * 2, ts);
    const ctx = tex?.getContext();
    if (tex && ctx) {
      ctx.fillStyle = 'rgba(255,59,48,0.38)';
      ctx.fillRect(ts, 0, ts, ts);
      tex.refresh();
    }
  }
  const tintData: number[][] = [];
  for (let r = 0; r < grid.rows; r++) {
    const row: number[] = [];
    for (let c = 0; c < grid.cols; c++) row.push(grid.isWalkableTile(c, r) ? 0 : 1);
    tintData.push(row);
  }
  const tintMap = scene.make.tilemap({ data: tintData, tileWidth: ts, tileHeight: ts });
  const tintSet = tintMap.addTilesetImage(OVERLAY_TEXTURE, OVERLAY_TEXTURE, ts, ts, 0, 0);
  const tint = tintSet ? tintMap.createLayer(0, tintSet, 0, 0) : null;
  if (tint) host.worldLayer.add(tint);

  const setTileWithTint = (col: number, row: number, type: number): void => {
    host.setTile(col, row, type);
    tint?.putTileAt(grid.isWalkableTile(col, row) ? 0 : 1, col, row);
  };

  // ---- DOM
  const style = el('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const toolbar = el('div', { id: 'dbg-toolbar', 'data-editor': EDITOR_MARKER });
  const palette = el('div', { id: 'dbg-palette' });
  const info = el('pre', { id: 'dbg-info' });
  document.body.append(toolbar, palette, info);

  const buttons = new Map<string, HTMLButtonElement>();
  const addButton = (id: string, label: string, onClick: () => void): HTMLButtonElement => {
    const b = el('button', { type: 'button', 'data-id': id }, label);
    b.addEventListener('click', onClick);
    toolbar.appendChild(b);
    buttons.set(id, b);
    return b;
  };

  const swatches: HTMLButtonElement[] = [];
  grid.defs.forEach((def, i) => {
    const b = el('button', { type: 'button', title: def.name, 'data-char': def.char }, def.char);
    b.style.background = def.color;
    b.addEventListener('click', () => {
      brushType = i;
      if (tool !== 'fill') tool = 'paint';
      refreshToolbar();
    });
    palette.appendChild(b);
    swatches.push(b);
  });

  const EDIT_ONLY = [
    'pan',
    'select',
    'paint',
    'fill',
    'pick',
    'brush',
    'undo',
    'zoomout',
    'zoomin',
    'fit',
    'grid',
  ];
  function refreshToolbar(): void {
    for (const [id, b] of buttons)
      b.style.display = EDIT_ONLY.includes(id) && !editMode ? 'none' : '';
    buttons.get('mode')?.setAttribute('data-on', String(editMode));
    buttons.get('overlay')?.setAttribute('data-on', String(overlayOn));
    buttons.get('grid')?.setAttribute('data-on', String(gridOn));
    for (const t of ['pan', 'select', 'paint', 'fill', 'pick'] as const) {
      buttons.get(t)?.setAttribute('data-on', String(tool === t));
    }
    const brush = buttons.get('brush');
    if (brush) brush.textContent = `Brush ${brushSize}x${brushSize}`;
    palette.style.display = editMode && (tool === 'paint' || tool === 'fill') ? 'flex' : 'none';
    swatches.forEach((b, i) => {
      b.setAttribute('data-on', String(i === brushType));
    });
    tint?.setVisible(overlayOn);
  }

  const setEditMode = (on: boolean): void => {
    editMode = on;
    host.freeCam = on;
    host.inputEnabled = !on;
    if (!on) {
      host.zoom = 1;
      drag = null;
    }
    dirty = true;
    refreshToolbar();
  };

  const setZoom = (z: number): void => {
    const nz = Math.min(Math.max(z, MIN_ZOOM), MAX_ZOOM);
    const cx = host.view.x + GAME_WIDTH / 2 / host.zoom;
    const cy = host.view.y + GAME_HEIGHT / 2 / host.zoom;
    host.zoom = nz;
    host.view.x = cx - GAME_WIDTH / 2 / nz;
    host.view.y = cy - GAME_HEIGHT / 2 / nz;
    clampView(host.view, GAME_WIDTH / nz, GAME_HEIGHT / nz, host.mapSize);
    dirty = true;
  };

  const tools: [Tool, string][] = [
    ['pan', 'Pan'],
    ['select', 'Hotspots'],
    ['paint', 'Paint'],
    ['fill', 'Fill rect'],
    ['pick', 'Pick'],
  ];
  addButton('mode', 'Edit', () => {
    setEditMode(!editMode);
  });
  for (const [t, label] of tools) {
    addButton(t, label, () => {
      tool = t;
      refreshToolbar();
    });
  }
  addButton('brush', 'Brush 1x1', () => {
    brushSize = brushSize === 1 ? 2 : brushSize === 2 ? 3 : 1;
    refreshToolbar();
  });
  addButton('undo', 'Undo', () => {
    undo();
  });
  addButton('zoomout', '−', () => {
    setZoom(host.zoom / 1.25);
  });
  addButton('zoomin', '+', () => {
    setZoom(host.zoom * 1.25);
  });
  addButton('fit', 'Fit', () => {
    setZoom(Math.min(GAME_WIDTH / host.mapSize.width, GAME_HEIGHT / host.mapSize.height));
  });
  addButton('grid', 'Grid', () => {
    gridOn = !gridOn;
    dirty = true;
    refreshToolbar();
  });
  addButton('overlay', 'Blocked', () => {
    overlayOn = !overlayOn;
    dirty = true;
    refreshToolbar();
  });
  addButton('export', 'Export', () => {
    openExport();
  });
  addButton('reset', 'Reset layout', () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* nothing stored */
    }
    location.reload();
  });
  refreshToolbar();

  // ---- overlay graphics: hotspot circles, grid lines, fill preview, player feet box
  const g = scene.add.graphics();
  host.worldLayer.add(g);

  const redraw = (): void => {
    g.clear();
    const lw = 2 / host.zoom;
    const hs = 6 / host.zoom;
    if (gridOn && editMode) {
      const vw = GAME_WIDTH / host.zoom;
      const vh = GAME_HEIGHT / host.zoom;
      g.lineStyle(1 / host.zoom, 0x000000, 0.28);
      const c0 = Math.max(0, Math.floor(host.view.x / ts));
      const c1 = Math.min(grid.cols, Math.ceil((host.view.x + vw) / ts));
      const r0 = Math.max(0, Math.floor(host.view.y / ts));
      const r1 = Math.min(grid.rows, Math.ceil((host.view.y + vh) / ts));
      for (let c = c0; c <= c1; c++) g.lineBetween(c * ts, r0 * ts, c * ts, r1 * ts);
      for (let r = r0; r <= r1; r++) g.lineBetween(c0 * ts, r * ts, c1 * ts, r * ts);
    }
    if (overlayOn || editMode) {
      for (const h of host.hotspots) {
        const sel = selectedHotspot === h;
        const color = h.kind === 'spawn' ? 0x69f0ae : sel ? 0xffeb3b : 0x40c4ff;
        g.fillStyle(color, 0.1);
        g.fillCircle(h.x, h.y, h.radius);
        g.lineStyle(lw, color, 0.9);
        g.strokeCircle(h.x, h.y, h.radius);
        g.fillStyle(color, 1);
        g.fillCircle(h.x, h.y, 4 / host.zoom);
        if (editMode && tool === 'select')
          g.fillRect(h.x + h.radius - hs, h.y - hs, hs * 2, hs * 2);
      }
    }
    if (drag?.kind === 'fill') {
      const x0 = Math.min(drag.col0, drag.col1) * ts;
      const y0 = Math.min(drag.row0, drag.row1) * ts;
      const w = (Math.abs(drag.col1 - drag.col0) + 1) * ts;
      const h = (Math.abs(drag.row1 - drag.row0) + 1) * ts;
      g.fillStyle(0xffffff, 0.25);
      g.fillRect(x0, y0, w, h);
      g.lineStyle(lw, 0xffffff, 1);
      g.strokeRect(x0, y0, w, h);
    }
    g.lineStyle(lw, 0x76ff03, 1);
    g.strokeRect(host.player.x - FEET_W / 2, host.player.y - FEET_H / 2, FEET_W, FEET_H);
  };

  // ---- tile editing
  const applyTile = (col: number, row: number, type: number): void => {
    if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return;
    const old = grid.typeAt(col, row);
    if (old === type) return;
    const key = row * grid.cols + col;
    if (!stroke.has(key)) stroke.set(key, old);
    setTileWithTint(col, row, type);
  };

  const paintBrush = (col: number, row: number): void => {
    const lo = Math.floor((brushSize - 1) / 2);
    for (let dr = 0; dr < brushSize; dr++) {
      for (let dc = 0; dc < brushSize; dc++) applyTile(col - lo + dc, row - lo + dr, brushType);
    }
  };

  /** Paint every tile on the line between two tiles so a fast finger leaves no gaps. */
  const paintLine = (c0: number, r0: number, c1: number, r1: number): void => {
    const steps = Math.max(Math.abs(c1 - c0), Math.abs(r1 - r0), 1);
    for (let i = 0; i <= steps; i++) {
      paintBrush(
        Math.round(c0 + ((c1 - c0) * i) / steps),
        Math.round(r0 + ((r1 - r0) * i) / steps),
      );
    }
  };

  const finishStroke = (): void => {
    if (stroke.size === 0) return;
    undoStack.push(stroke);
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    stroke = new Map<number, number>();
    persist();
  };

  function undo(): void {
    const last = undoStack.pop();
    if (!last) return;
    for (const [key, old] of last) {
      setTileWithTint(key % grid.cols, Math.floor(key / grid.cols), old);
    }
    persist();
    dirty = true;
  }

  // ---- pointer handling
  const wp = { x: 0, y: 0 };
  const toWorld = (p: Phaser.Input.Pointer): void => {
    wp.x = host.view.x + p.x / S / host.zoom;
    wp.y = host.view.y + p.y / S / host.zoom;
  };
  const colOf = (x: number): number => Math.floor(x / ts);

  const hitHotspot = (x: number, y: number): Drag => {
    const tol = HANDLE_PX / host.zoom;
    for (let i = host.hotspots.length - 1; i >= 0; i--) {
      const h = host.hotspots[i];
      if (h && Math.abs(x - (h.x + h.radius)) <= tol && Math.abs(y - h.y) <= tol) {
        selectedHotspot = h;
        return { kind: 'radius', def: h };
      }
    }
    for (let i = host.hotspots.length - 1; i >= 0; i--) {
      const h = host.hotspots[i];
      if (h && Math.hypot(x - h.x, y - h.y) <= tol) {
        selectedHotspot = h;
        return { kind: 'move-hotspot', def: h, dx: x - h.x, dy: y - h.y };
      }
    }
    selectedHotspot = null;
    return null;
  };

  const onDown = (p: Phaser.Input.Pointer): void => {
    if (!editMode) return;
    toWorld(p);
    const col = colOf(wp.x);
    const row = colOf(wp.y);
    const panFrom: Drag = { kind: 'pan', lastX: p.x / S, lastY: p.y / S };
    if (tool === 'pan') drag = panFrom;
    else if (tool === 'select') drag = hitHotspot(wp.x, wp.y) ?? panFrom;
    else if (tool === 'paint') {
      stroke = new Map<number, number>();
      paintBrush(col, row);
      drag = { kind: 'paint', lastCol: col, lastRow: row };
    } else if (tool === 'fill') {
      drag = { kind: 'fill', col0: col, row0: row, col1: col, row1: row };
    } else {
      const t = grid.typeAt(col, row);
      if (t >= 0) {
        brushType = t;
        tool = 'paint';
        refreshToolbar();
      }
    }
    dirty = true;
  };

  const onMove = (p: Phaser.Input.Pointer): void => {
    if (!editMode || !drag || !p.isDown) return;
    toWorld(p);
    const d = drag;
    switch (d.kind) {
      case 'pan': {
        const lx = p.x / S;
        const ly = p.y / S;
        host.view.x -= (lx - d.lastX) / host.zoom;
        host.view.y -= (ly - d.lastY) / host.zoom;
        d.lastX = lx;
        d.lastY = ly;
        clampView(host.view, GAME_WIDTH / host.zoom, GAME_HEIGHT / host.zoom, host.mapSize);
        break;
      }
      case 'move-hotspot':
        d.def.x = Math.round(wp.x - d.dx);
        d.def.y = Math.round(wp.y - d.dy);
        host.syncVisuals();
        break;
      case 'radius':
        d.def.radius = Math.max(8, Math.round(Math.hypot(wp.x - d.def.x, wp.y - d.def.y)));
        break;
      case 'paint': {
        const col = colOf(wp.x);
        const row = colOf(wp.y);
        if (col !== d.lastCol || row !== d.lastRow) {
          paintLine(d.lastCol, d.lastRow, col, row);
          d.lastCol = col;
          d.lastRow = row;
        }
        break;
      }
      case 'fill':
        d.col1 = colOf(wp.x);
        d.row1 = colOf(wp.y);
        break;
    }
    dirty = true;
  };

  const onUp = (): void => {
    const d = drag;
    drag = null;
    if (!editMode || !d) return;
    if (d.kind === 'fill') {
      stroke = new Map<number, number>();
      for (let r = Math.min(d.row0, d.row1); r <= Math.max(d.row0, d.row1); r++) {
        for (let c = Math.min(d.col0, d.col1); c <= Math.max(d.col0, d.col1); c++)
          applyTile(c, r, brushType);
      }
      finishStroke();
    } else if (d.kind === 'paint') {
      finishStroke();
    } else if (d.kind === 'move-hotspot' || d.kind === 'radius') {
      persist();
    }
    dirty = true;
  };

  scene.input.on(Phaser.Input.Events.POINTER_DOWN, onDown);
  scene.input.on(Phaser.Input.Events.POINTER_MOVE, onMove);
  scene.input.on(Phaser.Input.Events.POINTER_UP, onUp);
  scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, onUp);

  const onKey = (e: KeyboardEvent): void => {
    if (editMode && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      undo();
    }
  };
  window.addEventListener('keydown', onKey);

  const onUpdate = (): void => {
    const p = host.player;
    if (p.x !== lastPx || p.y !== lastPy) {
      lastPx = p.x;
      lastPy = p.y;
      dirty = true;
    }
    if (dirty) {
      dirty = false;
      redraw();
    }
  };
  scene.events.on(Phaser.Scenes.Events.POST_UPDATE, onUpdate);

  const loop = scene.game.loop;
  const infoTimer = scene.time.addEvent({
    delay: 250,
    loop: true,
    callback: () => {
      const brush = grid.defs[brushType]?.name ?? '?';
      const pc = Math.floor(host.player.x / ts);
      const pr = Math.floor(host.player.y / ts);
      const under = grid.defs[grid.typeAt(pc, pr)]?.name ?? 'outside';
      info.textContent =
        `player ${Math.round(host.player.x)},${Math.round(host.player.y)} tile ${pc},${pr} (${under})  rs${S}  zoom ${host.zoom.toFixed(2)}\n` +
        `fps ${loop.actualFps.toFixed(0)}  frame ${loop.delta.toFixed(1)} ms  objects ${host.objectCount()}\n` +
        `${editMode ? `EDIT/${tool}  brush ${brush}` : 'PLAY'}${selectedHotspot ? `  hotspot ${selectedHotspot.id} (${selectedHotspot.x},${selectedHotspot.y}) r${selectedHotspot.radius}` : ''}`;
    },
  });

  // ---- export
  const buildFiles = (): { name: string; text: string }[] => [
    {
      name: 'tilemap.json',
      text: `${JSON.stringify({ v: 1, tileSize: ts, rows: grid.toRows() }, null, 2)}\n`,
    },
    {
      name: 'hotspots.json',
      text: `${JSON.stringify({ v: 1, hotspots: host.hotspots }, null, 2)}\n`,
    },
  ];

  let exportPanel: HTMLElement | null = null;
  const closeExport = (): void => {
    exportPanel?.remove();
    exportPanel = null;
    scene.input.keyboard?.enableGlobalCapture();
  };

  function openExport(): void {
    closeExport();
    scene.input.keyboard?.disableGlobalCapture();
    const files = buildFiles();
    const panel = el('div', { id: 'dbg-export' });
    const status = el('div', {}, '');
    const copyAll = async (): Promise<boolean> => {
      try {
        await navigator.clipboard.writeText(files.map((f) => `// ${f.name}\n${f.text}`).join('\n'));
        return true;
      } catch {
        return false;
      }
    };
    const downloadAll = (): void => {
      files.forEach((f, i) => {
        window.setTimeout(() => {
          download(f.name, f.text);
        }, i * 400);
      });
    };
    const top = el('div', { class: 'row' });
    const dlAll = el('button', { type: 'button' }, 'Download both');
    dlAll.addEventListener('click', () => {
      downloadAll();
      status.textContent = 'Downloading tilemap.json and hotspots.json…';
    });
    const cpAll = el('button', { type: 'button' }, 'Copy both');
    cpAll.addEventListener('click', () => {
      void copyAll().then((ok) => {
        status.textContent = ok
          ? 'Copied both files to the clipboard.'
          : 'Clipboard blocked: select the text below and copy it.';
      });
    });
    const close = el('button', { type: 'button' }, 'Close');
    close.addEventListener('click', closeExport);
    top.append(dlAll, cpAll, close);
    panel.append(top, status);
    for (const f of files) {
      const row = el('div', { class: 'row' });
      const dl = el('button', { type: 'button' }, `Download ${f.name}`);
      dl.addEventListener('click', () => {
        download(f.name, f.text);
      });
      row.append(el('strong', {}, f.name), dl);
      const ta = el('textarea', { readonly: 'true', 'data-file': f.name });
      ta.value = f.text;
      panel.append(row, ta);
    }
    document.body.appendChild(panel);
    exportPanel = panel;
    // Export = copy + download as the spec asks; the panel is the fallback if either is blocked.
    void copyAll().then((ok) => {
      status.textContent = ok
        ? 'Copied both files to the clipboard.'
        : 'Clipboard blocked: use the buttons or select the text.';
    });
    downloadAll();
  }

  return () => {
    closeExport();
    infoTimer.remove();
    scene.input.off(Phaser.Input.Events.POINTER_DOWN, onDown);
    scene.input.off(Phaser.Input.Events.POINTER_MOVE, onMove);
    scene.input.off(Phaser.Input.Events.POINTER_UP, onUp);
    scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, onUp);
    scene.events.off(Phaser.Scenes.Events.POST_UPDATE, onUpdate);
    window.removeEventListener('keydown', onKey);
    g.destroy();
    tint?.destroy();
    toolbar.remove();
    palette.remove();
    info.remove();
    style.remove();
  };
}
