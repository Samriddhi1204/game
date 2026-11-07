import Phaser from 'phaser';
import { clampView } from '../../core/map/camera';
import { FEET_H, FEET_W } from '../../core/map/collision';
import type { HotspotDef } from '../../core/map/hotspots';
import type { NamedRect } from '../../core/map/types';
import { GAME_HEIGHT, GAME_WIDTH, RENDER_SCALE } from '../config';
import type { MapEditorHost } from './host';

/** check-size-budget fails if this string shows up in the initial bundle. */
const EDITOR_MARKER = 'MAP_EDITOR_MARKER';
const STORAGE_KEY = 'mnnit-conquest/debug-layout';
const HANDLE_PX = 26; // touch-friendly hit radius, in screen (logical) pixels
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 3;

type Tool = 'pan' | 'edit' | 'draw';
type Selection = { kind: 'rect'; rect: NamedRect } | { kind: 'hotspot'; def: HotspotDef } | null;
type Corner = 'nw' | 'ne' | 'sw' | 'se';
type Drag =
  | { kind: 'pan'; lastX: number; lastY: number }
  | { kind: 'move-rect'; rect: NamedRect; dx: number; dy: number }
  | { kind: 'move-hotspot'; def: HotspotDef; dx: number; dy: number }
  | { kind: 'radius'; def: HotspotDef }
  | { kind: 'corner'; rect: NamedRect; corner: Corner }
  | { kind: 'draw'; x: number; y: number; x2: number; y2: number }
  | null;

interface SavedLayout {
  hotspots: { id: string; x: number; y: number; radius: number }[];
  rects: NamedRect[];
}

const CSS = `
#dbg-toolbar{position:fixed;top:4px;left:4px;z-index:15;display:flex;flex-wrap:wrap;gap:4px;max-width:72vw;font:12px system-ui,sans-serif;touch-action:manipulation}
#dbg-toolbar button,#dbg-export button{font:inherit;min-height:34px;padding:4px 10px;border:1px solid #000;border-radius:6px;background:#dde3ea;color:#111}
#dbg-toolbar button[data-on=true]{background:#f2c14e}
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
  const S = RENDER_SCALE;
  let editMode = false;
  let tool: Tool = 'edit';
  let selection: Selection = null;
  let drag: Drag = null;
  let overlayOn = true;
  let dirty = true;
  let lastPx = NaN;
  let lastPy = NaN;

  // ---- restore a previous session's layout (phone sessions must survive an accidental reload)
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as SavedLayout;
      for (const s of saved.hotspots) {
        const h = host.hotspots.find((d) => d.id === s.id);
        if (h) {
          h.x = s.x;
          h.y = s.y;
          h.radius = s.radius;
        }
      }
      host.rects.splice(0, host.rects.length, ...saved.rects);
      host.syncVisuals();
    }
  } catch (err) {
    console.warn('Ignoring unreadable debug layout', err);
  }

  const persist = (): void => {
    try {
      const saved: SavedLayout = {
        hotspots: host.hotspots.map((h) => ({ id: h.id, x: h.x, y: h.y, radius: h.radius })),
        rects: host.rects,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch (err) {
      console.warn('Could not store debug layout', err);
    }
  };

  // ---- DOM
  const style = el('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const toolbar = el('div', { id: 'dbg-toolbar', 'data-editor': EDITOR_MARKER });
  const info = el('pre', { id: 'dbg-info' });
  document.body.append(toolbar, info);

  const buttons = new Map<string, HTMLButtonElement>();
  const addButton = (id: string, label: string, onClick: () => void): HTMLButtonElement => {
    const b = el('button', { type: 'button', 'data-id': id }, label);
    b.addEventListener('click', onClick);
    toolbar.appendChild(b);
    buttons.set(id, b);
    return b;
  };

  const refreshToolbar = (): void => {
    for (const [id, b] of buttons) {
      const editOnly = ['pan', 'edit', 'draw', 'del', 'zoomout', 'zoomin', 'fit'].includes(id);
      b.style.display = editOnly && !editMode ? 'none' : '';
    }
    buttons.get('mode')?.setAttribute('data-on', String(editMode));
    buttons.get('overlay')?.setAttribute('data-on', String(overlayOn));
    (['pan', 'edit', 'draw'] as const).forEach((t) => {
      buttons.get(t)?.setAttribute('data-on', String(tool === t));
    });
  };

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

  addButton('mode', 'Edit', () => {
    setEditMode(!editMode);
  });
  addButton('pan', 'Pan', () => {
    tool = 'pan';
    refreshToolbar();
  });
  addButton('edit', 'Select/Move', () => {
    tool = 'edit';
    refreshToolbar();
  });
  addButton('draw', 'Draw rect', () => {
    tool = 'draw';
    refreshToolbar();
  });
  addButton('del', 'Delete', () => {
    deleteSelected();
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
  addButton('overlay', 'Overlay', () => {
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

  // ---- overlay graphics
  const g = scene.add.graphics();
  host.worldLayer.add(g);

  const redraw = (): void => {
    g.clear();
    if (!overlayOn) return;
    const lw = 2 / host.zoom;
    const hs = 6 / host.zoom;
    for (const r of host.rects) {
      const sel = selection?.kind === 'rect' && selection.rect === r;
      g.fillStyle(sel ? 0xffeb3b : 0xff3b30, 0.22);
      g.fillRect(r.x1, r.y1, r.x2 - r.x1, r.y2 - r.y1);
      g.lineStyle(lw, sel ? 0xffeb3b : 0xff3b30, 1);
      g.strokeRect(r.x1, r.y1, r.x2 - r.x1, r.y2 - r.y1);
      if (sel && editMode) {
        g.fillStyle(0xffffff, 1);
        for (const [cx, cy] of [
          [r.x1, r.y1],
          [r.x2, r.y1],
          [r.x1, r.y2],
          [r.x2, r.y2],
        ] as const) {
          g.fillRect(cx - hs, cy - hs, hs * 2, hs * 2);
        }
      }
    }
    for (const h of host.hotspots) {
      const sel = selection?.kind === 'hotspot' && selection.def === h;
      const color = h.kind === 'spawn' ? 0x69f0ae : sel ? 0xffeb3b : 0x40c4ff;
      g.fillStyle(color, 0.1);
      g.fillCircle(h.x, h.y, h.radius);
      g.lineStyle(lw, color, 0.9);
      g.strokeCircle(h.x, h.y, h.radius);
      g.fillStyle(color, 1);
      g.fillCircle(h.x, h.y, 4 / host.zoom);
      if (editMode) {
        g.fillRect(h.x + h.radius - hs, h.y - hs, hs * 2, hs * 2);
      }
    }
    if (drag?.kind === 'draw') {
      g.lineStyle(lw, 0xffffff, 1);
      g.strokeRect(
        Math.min(drag.x, drag.x2),
        Math.min(drag.y, drag.y2),
        Math.abs(drag.x2 - drag.x),
        Math.abs(drag.y2 - drag.y),
      );
    }
    // The player's feet box, so collisions can be judged by eye.
    g.lineStyle(lw, 0x76ff03, 1);
    g.strokeRect(host.player.x - FEET_W / 2, host.player.y - FEET_H / 2, FEET_W, FEET_H);
  };

  // ---- pointer editing
  const toWorld = (p: Phaser.Input.Pointer, out: { x: number; y: number }): void => {
    out.x = host.view.x + p.x / S / host.zoom;
    out.y = host.view.y + p.y / S / host.zoom;
  };
  const wp = { x: 0, y: 0 };
  const round = (v: number): number => Math.round(v);

  const hitTest = (x: number, y: number): Drag => {
    const tol = HANDLE_PX / host.zoom;
    if (selection?.kind === 'rect') {
      const r = selection.rect;
      const corners: [Corner, number, number][] = [
        ['nw', r.x1, r.y1],
        ['ne', r.x2, r.y1],
        ['sw', r.x1, r.y2],
        ['se', r.x2, r.y2],
      ];
      for (const [corner, cx, cy] of corners) {
        if (Math.abs(x - cx) <= tol && Math.abs(y - cy) <= tol)
          return { kind: 'corner', rect: r, corner };
      }
    }
    for (let i = host.hotspots.length - 1; i >= 0; i--) {
      const h = host.hotspots[i];
      if (!h) continue;
      if (Math.abs(x - (h.x + h.radius)) <= tol && Math.abs(y - h.y) <= tol) {
        selection = { kind: 'hotspot', def: h };
        return { kind: 'radius', def: h };
      }
    }
    for (let i = host.hotspots.length - 1; i >= 0; i--) {
      const h = host.hotspots[i];
      if (h && Math.hypot(x - h.x, y - h.y) <= tol) {
        selection = { kind: 'hotspot', def: h };
        return { kind: 'move-hotspot', def: h, dx: x - h.x, dy: y - h.y };
      }
    }
    for (let i = host.rects.length - 1; i >= 0; i--) {
      const r = host.rects[i];
      if (r && x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2) {
        selection = { kind: 'rect', rect: r };
        return { kind: 'move-rect', rect: r, dx: x - r.x1, dy: y - r.y1 };
      }
    }
    selection = null;
    return null;
  };

  const onDown = (p: Phaser.Input.Pointer): void => {
    if (!editMode) return;
    toWorld(p, wp);
    if (tool === 'pan') {
      drag = { kind: 'pan', lastX: p.x / S, lastY: p.y / S };
    } else if (tool === 'draw') {
      selection = null;
      drag = { kind: 'draw', x: round(wp.x), y: round(wp.y), x2: round(wp.x), y2: round(wp.y) };
    } else {
      drag = hitTest(wp.x, wp.y) ?? { kind: 'pan', lastX: p.x / S, lastY: p.y / S };
    }
    dirty = true;
  };

  const onMove = (p: Phaser.Input.Pointer): void => {
    if (!editMode || !drag || !p.isDown) return;
    toWorld(p, wp);
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
      case 'move-rect': {
        const w = d.rect.x2 - d.rect.x1;
        const h = d.rect.y2 - d.rect.y1;
        d.rect.x1 = round(wp.x - d.dx);
        d.rect.y1 = round(wp.y - d.dy);
        d.rect.x2 = d.rect.x1 + w;
        d.rect.y2 = d.rect.y1 + h;
        break;
      }
      case 'move-hotspot':
        d.def.x = round(wp.x - d.dx);
        d.def.y = round(wp.y - d.dy);
        host.syncVisuals();
        break;
      case 'radius':
        d.def.radius = Math.max(8, round(Math.hypot(wp.x - d.def.x, wp.y - d.def.y)));
        break;
      case 'corner': {
        const r = d.rect;
        if (d.corner === 'nw' || d.corner === 'sw') r.x1 = round(wp.x);
        else r.x2 = round(wp.x);
        if (d.corner === 'nw' || d.corner === 'ne') r.y1 = round(wp.y);
        else r.y2 = round(wp.y);
        break;
      }
      case 'draw':
        d.x2 = round(wp.x);
        d.y2 = round(wp.y);
        break;
    }
    dirty = true;
  };

  const nextRectName = (): string => {
    let n = host.rects.length + 1;
    while (host.rects.some((r) => r.name === `rect_${n}`)) n++;
    return `rect_${n}`;
  };

  const onUp = (): void => {
    const d = drag;
    drag = null;
    if (!editMode || !d) return;
    if (d.kind === 'draw') {
      const rect: NamedRect = {
        name: nextRectName(),
        x1: Math.min(d.x, d.x2),
        y1: Math.min(d.y, d.y2),
        x2: Math.max(d.x, d.x2),
        y2: Math.max(d.y, d.y2),
      };
      if (rect.x2 - rect.x1 >= 6 && rect.y2 - rect.y1 >= 6) {
        host.rects.push(rect);
        selection = { kind: 'rect', rect };
      }
    }
    if (d.kind === 'corner') {
      const r = d.rect;
      const x1 = Math.min(r.x1, r.x2);
      const x2 = Math.max(r.x1, r.x2);
      const y1 = Math.min(r.y1, r.y2);
      const y2 = Math.max(r.y1, r.y2);
      r.x1 = x1;
      r.x2 = x2;
      r.y1 = y1;
      r.y2 = y2;
    }
    if (d.kind !== 'pan') persist();
    dirty = true;
  };

  function deleteSelected(): void {
    if (selection?.kind !== 'rect') return;
    const i = host.rects.indexOf(selection.rect);
    if (i >= 0) host.rects.splice(i, 1);
    selection = null;
    persist();
    dirty = true;
  }

  const onKey = (e: KeyboardEvent): void => {
    if (editMode && (e.key === 'Delete' || e.key === 'Backspace')) deleteSelected();
  };

  scene.input.on(Phaser.Input.Events.POINTER_DOWN, onDown);
  scene.input.on(Phaser.Input.Events.POINTER_MOVE, onMove);
  scene.input.on(Phaser.Input.Events.POINTER_UP, onUp);
  scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, onUp);
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
      const sel =
        selection?.kind === 'rect'
          ? `${selection.rect.name} [${selection.rect.x1},${selection.rect.y1} ${selection.rect.x2},${selection.rect.y2}]`
          : selection?.kind === 'hotspot'
            ? `${selection.def.id} (${selection.def.x},${selection.def.y}) r${selection.def.radius}`
            : '-';
      info.textContent =
        `player ${Math.round(host.player.x)},${Math.round(host.player.y)}  rs${S}  zoom ${host.zoom.toFixed(2)}\n` +
        `fps ${loop.actualFps.toFixed(0)}  frame ${loop.delta.toFixed(1)} ms  objects ${host.objectCount()}\n` +
        `${editMode ? `EDIT/${tool}` : 'PLAY'}  sel ${sel}`;
    },
  });

  // ---- export
  const buildFiles = (): { name: string; text: string }[] => [
    {
      name: 'hotspots.json',
      text: `${JSON.stringify({ v: 1, hotspots: host.hotspots }, null, 2)}\n`,
    },
    { name: 'collision.json', text: `${JSON.stringify({ v: 1, rects: host.rects }, null, 2)}\n` },
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
    const top = el('div', { class: 'row' });
    const dlAll = el('button', { type: 'button' }, 'Download both');
    dlAll.addEventListener('click', () => {
      files.forEach((f, i) => {
        window.setTimeout(() => {
          download(f.name, f.text);
        }, i * 400);
      });
      status.textContent = 'Downloading hotspots.json and collision.json…';
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
    // Export button = copy + download, as the spec asks; the panel is the fallback if either is blocked.
    void copyAll().then((ok) => {
      status.textContent = ok
        ? 'Copied both files to the clipboard.'
        : 'Clipboard blocked: use the buttons or select the text.';
    });
    files.forEach((f, i) => {
      window.setTimeout(() => {
        download(f.name, f.text);
      }, i * 400);
    });
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
    toolbar.remove();
    info.remove();
    style.remove();
  };
}
