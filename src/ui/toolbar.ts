import type { DemoId, MaterialId, ToolMode } from '../shared/types.ts';
import { ToastHost } from './toast.ts';

export interface ToolbarHandlers {
  onDemo: (demo: DemoId) => void;
  onTool: (tool: ToolMode) => void;
  onReset: () => void;
  onPauseToggle?: () => void;
  onTimeScale?: (scale: number) => void;
  onGravity?: (gravityY: number) => void;
  onSave?: () => void;
  onLoad?: () => void;
  onMuteToggle?: () => void;
  onVolume?: (v: number) => void;
  onScreenshot?: () => void;
  /** Palette → spawn + paint (Grok app uses this name) */
  onPaintStyle?: (materialId: MaterialId, color: string) => void;
}

const DEMOS: { id: DemoId; label: string }[] = [
  { id: 'sandbox', label: 'Sandbox' },
  { id: 'tower', label: 'Tower' },
  { id: 'dominoes', label: 'Dominoes' },
  { id: 'newtons-cradle', label: "Newton's Cradle" },
  { id: 'bridge', label: 'Bridge' },
  { id: 'seesaw', label: 'Seesaw' },
  { id: 'catapult', label: 'Catapult' },
  { id: 'ramps', label: 'Ramps' },
  { id: 'chain', label: 'Chain' },
  { id: 'fireworks', label: 'Fireworks' },
  { id: 'gears', label: 'Gears' },
  { id: 'stress', label: 'Stress' },
];

const TOOLS: { id: ToolMode; label: string; key: string }[] = [
  { id: 'grab', label: 'Grab', key: '1' },
  { id: 'spawn-box', label: 'Box', key: '2' },
  { id: 'spawn-circle', label: 'Ball', key: '3' },
  { id: 'pin', label: 'Pin', key: '4' },
  { id: 'delete', label: 'Del', key: '5' },
  { id: 'explode', label: 'Boom', key: '6' },
  { id: 'paint', label: 'Paint', key: '7' },
];

const MATERIALS: { id: MaterialId; label: string; color: string }[] = [
  { id: 'wood', label: 'Wood', color: '#c49a6c' },
  { id: 'metal', label: 'Metal', color: '#c0c8d4' },
  { id: 'neon', label: 'Neon', color: '#5cffb0' },
  { id: 'rubber', label: 'Rubber', color: '#e07070' },
  { id: 'glass', label: 'Glass', color: '#9ad7e8' },
  { id: 'matte', label: 'Matte', color: '#7a8ba3' },
];

const COLORS = [
  '#5cffb0',
  '#6eb5ff',
  '#ff8e6e',
  '#e8d44d',
  '#c79bff',
  '#ff6bcb',
  '#c49a6c',
  '#c0c8d4',
  '#ffffff',
];

/**
 * Lightweight DOM toolbar + HUD. Cursor owns visual polish.
 */
export class Toolbar {
  private root: HTMLElement;
  private fpsEl: HTMLElement;
  private bodyEl: HTMLElement;
  private stateEl: HTMLElement;
  private muteBtn: HTMLButtonElement;
  private volInput: HTMLInputElement;
  readonly toasts: ToastHost;
  private tool: ToolMode = 'grab';
  private demo: DemoId = 'sandbox';
  private handlers: ToolbarHandlers;
  private paused = false;
  private timeScale = 1;
  private gravityY = -9.81;
  private muted = false;
  private materialId: MaterialId = 'wood';
  private color = '#c49a6c';

  constructor(container: HTMLElement, handlers: ToolbarHandlers) {
    this.handlers = handlers;
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="hud-top">
        <div class="brand">
          <span class="brand-mark">◈</span>
          <span class="brand-name">DDDA</span>
          <span class="brand-sub">Physics Lab</span>
        </div>
        <div class="demo-row" data-demos></div>
        <div class="stats">
          <span data-fps>–– FPS</span>
          <span data-bodies>0 bodies</span>
          <span data-state class="state-pill">LIVE · 1× · g−9.8</span>
        </div>
      </div>
      <div class="hud-bottom">
        <div class="tool-row" data-tools></div>
        <div class="palette-row" data-palette>
          <span class="palette-label">Mat</span>
          <div class="mat-swatches" data-mats></div>
          <span class="palette-label">Hue</span>
          <div class="color-swatches" data-colors></div>
        </div>
        <div class="control-row">
          <button type="button" class="btn ctrl" data-pause title="Space">❚❚ Pause</button>
          <div class="speed-group" role="group" aria-label="Time scale">
            <button type="button" class="btn ctrl" data-slow title=",">½×</button>
            <button type="button" class="btn ctrl active" data-norm title="1×">1×</button>
            <button type="button" class="btn ctrl" data-fast title=".">2×</button>
          </div>
          <label class="grav-label" title="Gravity">
            <span class="grav-icon">g</span>
            <input type="range" data-grav min="-20" max="0" step="0.5" value="-9.81" />
            <span class="grav-val" data-grav-val>−9.8</span>
          </label>
          <div class="io-group" role="group" aria-label="Scene">
            <button type="button" class="btn ctrl icon-btn" data-save title="Save scene JSON">
              <span class="ico" aria-hidden="true">⇩</span> Save
            </button>
            <button type="button" class="btn ctrl icon-btn" data-load title="Load scene JSON">
              <span class="ico" aria-hidden="true">⇧</span> Load
            </button>
            <button type="button" class="btn ctrl icon-btn" data-shot title="Screenshot PNG">
              <span class="ico" aria-hidden="true">📷</span> Shot
            </button>
          </div>
          <div class="audio-group" role="group" aria-label="Audio">
            <button type="button" class="btn ctrl icon-btn" data-mute title="Toggle SFX">
              <span class="ico mute-ico" aria-hidden="true">🔊</span>
            </button>
            <label class="vol-label" title="Volume">
              <input type="range" data-vol min="0" max="1" step="0.05" value="0.22" />
            </label>
          </div>
          <button type="button" class="btn ctrl danger" data-reset title="R">Reset</button>
        </div>
        <p class="hint">LMB · 1–7 tools · Paint recolors · Palette for spawn · Space pause · Drop JSON · Shot · RMB orbit</p>
      </div>
      <div class="drop-veil" data-drop-veil hidden>
        <span>Drop scene JSON to load</span>
      </div>
    `;
    container.appendChild(this.root);
    this.toasts = new ToastHost(this.root);

    this.fpsEl = this.root.querySelector('[data-fps]')!;
    this.bodyEl = this.root.querySelector('[data-bodies]')!;
    this.stateEl = this.root.querySelector('[data-state]')!;
    this.muteBtn = this.root.querySelector('[data-mute]')!;
    this.volInput = this.root.querySelector('[data-vol]')!;

    const demoRow = this.root.querySelector('[data-demos]')!;
    for (const d of DEMOS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn chip' + (d.id === this.demo ? ' active' : '');
      btn.textContent = d.label;
      btn.dataset.demo = d.id;
      btn.addEventListener('click', () => {
        this.setDemo(d.id);
        this.handlers.onDemo(d.id);
      });
      demoRow.appendChild(btn);
    }

    const toolRow = this.root.querySelector('[data-tools]')!;
    for (const t of TOOLS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn tool' + (t.id === this.tool ? ' active' : '');
      btn.innerHTML = `<kbd>${t.key}</kbd> ${t.label}`;
      btn.dataset.tool = t.id;
      btn.addEventListener('click', () => {
        this.setTool(t.id);
        this.handlers.onTool(t.id);
      });
      toolRow.appendChild(btn);
    }

    const matRow = this.root.querySelector('[data-mats]')!;
    for (const m of MATERIALS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className =
        'swatch mat-swatch' + (m.id === this.materialId ? ' active' : '');
      btn.title = m.label;
      btn.dataset.mat = m.id;
      btn.style.setProperty('--swatch', m.color);
      btn.textContent = m.label.slice(0, 1);
      btn.addEventListener('click', () => {
        this.setMaterial(m.id, m.color);
      });
      matRow.appendChild(btn);
    }

    const colorRow = this.root.querySelector('[data-colors]')!;
    for (const c of COLORS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className =
        'swatch color-swatch' + (c === this.color ? ' active' : '');
      btn.title = c;
      btn.dataset.color = c;
      btn.style.setProperty('--swatch', c);
      btn.addEventListener('click', () => {
        this.setColor(c);
      });
      colorRow.appendChild(btn);
    }

    this.root.querySelector('[data-reset]')!.addEventListener('click', () => {
      this.handlers.onReset();
    });
    this.root.querySelector('[data-save]')!.addEventListener('click', () => {
      this.handlers.onSave?.();
    });
    this.root.querySelector('[data-load]')!.addEventListener('click', () => {
      this.handlers.onLoad?.();
    });
    this.root.querySelector('[data-shot]')!.addEventListener('click', () => {
      this.handlers.onScreenshot?.();
    });
    this.muteBtn.addEventListener('click', () => {
      this.handlers.onMuteToggle?.();
    });
    this.volInput.addEventListener('input', () => {
      this.handlers.onVolume?.(Number(this.volInput.value));
    });
    this.root.querySelector('[data-pause]')!.addEventListener('click', () => {
      this.handlers.onPauseToggle?.();
    });
    this.root.querySelector('[data-slow]')!.addEventListener('click', () => {
      this.handlers.onTimeScale?.(0.25);
      this.setTimeScale(0.25);
    });
    this.root.querySelector('[data-norm]')!.addEventListener('click', () => {
      this.handlers.onTimeScale?.(1);
      this.setTimeScale(1);
    });
    this.root.querySelector('[data-fast]')!.addEventListener('click', () => {
      this.handlers.onTimeScale?.(2);
      this.setTimeScale(2);
    });
    const grav = this.root.querySelector('[data-grav]') as HTMLInputElement;
    grav.addEventListener('input', () => {
      const g = Number(grav.value);
      this.handlers.onGravity?.(g);
      this.setGravity(g);
    });

    window.addEventListener('keydown', (e) => {
      const map: Record<string, ToolMode> = {
        '1': 'grab',
        '2': 'spawn-box',
        '3': 'spawn-circle',
        '4': 'pin',
        '5': 'delete',
        '6': 'explode',
        '7': 'paint',
      };
      if (map[e.key]) {
        this.setTool(map[e.key]);
        this.handlers.onTool(map[e.key]);
      }
      if (e.key === 'r' || e.key === 'R') this.handlers.onReset();
    });

    this.refreshStatePill();
    this.refreshMuteUi();
    this.emitAppearance();
  }

  getAppearance(): { materialId: MaterialId; color: string } {
    return { materialId: this.materialId, color: this.color };
  }

  private setMaterial(id: MaterialId, defaultColor: string): void {
    this.materialId = id;
    this.color = defaultColor;
    this.root.querySelectorAll('[data-mat]').forEach((el) => {
      el.classList.toggle('active', (el as HTMLElement).dataset.mat === id);
    });
    this.root.querySelectorAll('[data-color]').forEach((el) => {
      el.classList.toggle(
        'active',
        (el as HTMLElement).dataset.color === this.color,
      );
    });
    this.emitAppearance();
  }

  private setColor(color: string): void {
    this.color = color;
    this.root.querySelectorAll('[data-color]').forEach((el) => {
      el.classList.toggle('active', (el as HTMLElement).dataset.color === color);
    });
    this.emitAppearance();
  }

  private emitAppearance(): void {
    this.handlers.onPaintStyle?.(this.materialId, this.color);
  }

  toast(message: string, kind: 'ok' | 'info' | 'err' = 'ok'): void {
    this.toasts.show(message, kind);
  }

  setDropActive(on: boolean): void {
    const veil = this.root.querySelector('[data-drop-veil]') as HTMLElement;
    veil.hidden = !on;
    this.root.classList.toggle('is-dropping', on);
  }

  setTool(tool: ToolMode): void {
    this.tool = tool;
    this.root.querySelectorAll('[data-tool]').forEach((el) => {
      el.classList.toggle('active', (el as HTMLElement).dataset.tool === tool);
    });
    this.root.classList.toggle('is-paint', tool === 'paint');
  }

  setDemo(demo: DemoId): void {
    this.demo = demo;
    this.root.querySelectorAll('[data-demo]').forEach((el) => {
      el.classList.toggle('active', (el as HTMLElement).dataset.demo === demo);
    });
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    const btn = this.root.querySelector('[data-pause]') as HTMLButtonElement;
    btn.textContent = paused ? '▶ Resume' : '❚❚ Pause';
    btn.classList.toggle('active', paused);
    this.root.classList.toggle('is-paused', paused);
    this.refreshStatePill();
  }

  setTimeScale(scale: number): void {
    this.timeScale = scale;
    const slow = this.root.querySelector('[data-slow]');
    const norm = this.root.querySelector('[data-norm]');
    const fast = this.root.querySelector('[data-fast]');
    slow?.classList.toggle('active', scale < 0.9);
    norm?.classList.toggle('active', scale >= 0.9 && scale <= 1.1);
    fast?.classList.toggle('active', scale > 1.1);
    this.root.classList.toggle('is-slowmo', scale < 0.9 && !this.paused);
    this.refreshStatePill();
  }

  setGravity(g: number): void {
    this.gravityY = g;
    const input = this.root.querySelector('[data-grav]') as HTMLInputElement;
    if (input && Number(input.value) !== g) input.value = String(g);
    const val = this.root.querySelector('[data-grav-val]');
    if (val) val.textContent = g.toFixed(1);
    this.refreshStatePill();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.refreshMuteUi();
  }

  setVolume(v: number): void {
    if (Math.abs(Number(this.volInput.value) - v) > 0.001) {
      this.volInput.value = String(v);
    }
  }

  private refreshMuteUi(): void {
    const ico = this.muteBtn.querySelector('.mute-ico');
    if (ico) ico.textContent = this.muted ? '🔇' : '🔊';
    this.muteBtn.classList.toggle('active', this.muted);
    this.muteBtn.title = this.muted ? 'Unmute SFX' : 'Mute SFX';
    this.volInput.disabled = this.muted;
    this.root.classList.toggle('is-muted', this.muted);
  }

  private refreshStatePill(): void {
    const mode = this.paused ? 'PAUSED' : 'LIVE';
    const scaleLabel =
      Math.abs(this.timeScale - 1) < 0.01
        ? '1×'
        : this.timeScale < 1
          ? `${this.timeScale}×`
          : `${this.timeScale}×`;
    this.stateEl.textContent = `${mode} · ${scaleLabel} · g${this.gravityY.toFixed(1)}`;
    this.stateEl.classList.toggle('paused', this.paused);
    this.stateEl.classList.toggle('slowmo', !this.paused && this.timeScale < 0.9);
  }

  updateStats(
    fps: number,
    bodyCount: number,
    extra?: { paused: boolean; timeScale: number; gravityY: number },
  ): void {
    this.fpsEl.textContent = `${Math.round(fps)} FPS`;
    this.bodyEl.textContent = `${bodyCount} bodies`;
    if (extra) {
      this.setPaused(extra.paused);
      this.setTimeScale(extra.timeScale);
      this.setGravity(extra.gravityY);
    }
  }

  getTool(): ToolMode {
    return this.tool;
  }
}
