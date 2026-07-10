import type { DemoId, MaterialId, ToolMode } from './shared/types.ts';
import { EventBus } from './shared/events.ts';
import { createPhysicsWorld, type PhysicsWorld } from './physics/world.ts';
import { downloadScene } from './physics/serialize.ts';
import { RenderScene } from './render/scene.ts';
import { Toolbar } from './ui/toolbar.ts';
import { SfxBus } from './audio/sfx.ts';

export class App {
  private root: HTMLElement;
  private physics!: PhysicsWorld;
  private render!: RenderScene;
  private toolbar!: Toolbar;
  private sfx = new SfxBus();
  private bus = new EventBus();
  private tool: ToolMode = 'grab';
  private demo: DemoId = 'sandbox';
  private grabbing = false;
  private painting = false;
  private lastT = performance.now();
  private fps = 60;
  private fpsAccum = 0;
  private fpsFrames = 0;
  private running = false;
  private orbiting = false;
  private lastPointer = { x: 0, y: 0 };
  /** Active palette for paint tool + spawn (Cursor HUD drives this) */
  private paintMaterial: MaterialId = 'wood';
  private paintColor = '#c49a6c';

  constructor(root: HTMLElement) {
    this.root = root;
  }

  async start(): Promise<void> {
    this.root.innerHTML = '';
    this.root.className = 'app-root';

    const viewport = document.createElement('div');
    viewport.className = 'viewport';
    this.root.appendChild(viewport);

    const uiLayer = document.createElement('div');
    uiLayer.className = 'ui-layer';
    this.root.appendChild(uiLayer);

    this.render = new RenderScene(viewport);
    this.physics = await createPhysicsWorld();

    this.toolbar = new Toolbar(uiLayer, {
      onDemo: (d) => {
        this.demo = d;
        this.physics.loadDemo(d);
        this.bus.emit({ type: 'demo-changed', demo: d });
      },
      onTool: (t) => {
        this.tool = t;
        this.toolbar.setTool(t);
        this.render.setTool(t);
        this.bus.emit({ type: 'tool-changed', tool: t });
      },
      onReset: () => this.physics.loadDemo(this.demo),
      onPauseToggle: () => {
        this.physics.setPaused(!this.physics.isPaused());
        this.toolbar.setPaused(this.physics.isPaused());
      },
      onTimeScale: (scale) => {
        this.physics.setTimeScale(scale);
        this.toolbar.setTimeScale(scale);
      },
      onGravity: (g) => {
        this.physics.setGravity(g);
        this.toolbar.setGravity(g);
      },
      onSave: () => {
        const scene = this.physics.exportScene(this.demo);
        downloadScene(scene, `ddda-${this.demo}.json`);
        this.toolbar.toast('Scene saved', 'ok');
      },
      onLoad: () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json,.json';
        input.onchange = async () => {
          const file = input.files?.[0];
          if (!file) return;
          await this.loadSceneFile(file);
        };
        input.click();
      },
      onMuteToggle: () => {
        this.sfx.setEnabled(!this.sfx.isEnabled());
        this.toolbar.setMuted(!this.sfx.isEnabled());
        this.toolbar.toast(
          this.sfx.isEnabled() ? 'SFX on' : 'SFX muted',
          'info',
        );
      },
      onVolume: (v) => {
        this.sfx.setVolume(v);
        this.toolbar.setVolume(v);
      },
      onScreenshot: () => {
        const ok = this.render.captureScreenshot(
          `ddda-${this.demo}-${Date.now()}.png`,
        );
        this.toolbar.toast(
          ok ? 'Screenshot saved' : 'Screenshot failed',
          ok ? 'ok' : 'err',
        );
      },
      onPaintStyle: (materialId, color) => {
        this.paintMaterial = materialId;
        this.paintColor = color;
        this.render.setGhostAppearance(materialId, color);
      },
    });

    this.toolbar.setVolume(this.sfx.getVolume());
    this.toolbar.setMuted(!this.sfx.isEnabled());
    const look = this.toolbar.getAppearance();
    this.paintMaterial = look.materialId;
    this.paintColor = look.color;
    this.render.setGhostAppearance(this.paintMaterial, this.paintColor);
    this.bindInput();
    this.bindDropLoad(viewport);
    this.render.setTool(this.tool);
    this.running = true;
    this.lastT = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  private bindInput(): void {
    const canvas = this.render.getCanvas();

    canvas.addEventListener('pointerdown', (e) => {
      if (e.button === 2) {
        this.orbiting = true;
        this.lastPointer = { x: e.clientX, y: e.clientY };
        return;
      }
      if (e.button !== 0) return;

      const world = this.render.presentation.screenToWorld(
        e.clientX,
        e.clientY,
        canvas,
      );
      if (!world) return;

      if (this.tool === 'grab') {
        this.grabbing = true;
        this.physics.setPointerGrab(world.x, world.y);
        canvas.setPointerCapture(e.pointerId);
      } else if (this.tool === 'spawn-box') {
        this.physics.spawn({
          kind: 'box',
          x: world.x,
          y: world.y,
          halfW: 0.4,
          halfH: 0.4,
          materialId: this.paintMaterial === 'static' ? 'wood' : this.paintMaterial,
          color: this.paintColor,
        });
      } else if (this.tool === 'spawn-circle') {
        this.physics.spawn({
          kind: 'circle',
          x: world.x,
          y: world.y,
          radius: 0.4,
          materialId: this.paintMaterial === 'static' ? 'neon' : this.paintMaterial,
          color: this.paintColor,
        });
      } else if (this.tool === 'pin') {
        if (this.physics.pinAt(world.x, world.y)) this.sfx.pin();
      } else if (this.tool === 'delete') {
        const id = this.physics.pickBody(world.x, world.y);
        if (id) this.physics.remove(id);
      } else if (this.tool === 'paint') {
        this.painting = true;
        this.paintAt(world.x, world.y);
        canvas.setPointerCapture(e.pointerId);
      } else if (this.tool === 'explode') {
        if (this.demo === 'fireworks') {
          // Extra aerial shell under cursor
          this.physics.launchShell(world.x, Math.max(1.2, world.y));
          this.sfx.pin();
        } else {
          this.explodeAt(world.x, world.y);
          this.render.boomAt(world.x, world.y, false);
          this.sfx.boom();
        }
      }
    });

    canvas.addEventListener('pointermove', (e) => {
      if (this.orbiting) {
        const dx = e.clientX - this.lastPointer.x;
        const dy = e.clientY - this.lastPointer.y;
        this.render.presentation.orbit(-dx * 0.005, -dy * 0.005);
        this.lastPointer = { x: e.clientX, y: e.clientY };
        return;
      }

      const world = this.render.presentation.screenToWorld(
        e.clientX,
        e.clientY,
        canvas,
      );

      if (
        this.tool === 'spawn-box' ||
        this.tool === 'spawn-circle' ||
        this.tool === 'paint'
      ) {
        if (world) this.render.setGhostWorld(world.x, world.y);
        else this.render.setGhostWorld(null, null);
      } else {
        this.render.setGhostWorld(null, null);
      }

      if (this.painting && world) {
        this.paintAt(world.x, world.y);
        return;
      }

      if (!this.grabbing) return;
      if (world) this.physics.setPointerGrab(world.x, world.y);
    });

    canvas.addEventListener('pointerleave', () => {
      this.render.setGhostWorld(null, null);
    });

    const endGrab = (e: PointerEvent) => {
      if (e.button === 2) this.orbiting = false;
      if (this.grabbing) {
        this.grabbing = false;
        this.physics.releasePointerGrab();
      }
      this.painting = false;
    };
    canvas.addEventListener('pointerup', endGrab);
    canvas.addEventListener('pointercancel', endGrab);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.render.presentation.zoom(e.deltaY * 0.01);
      },
      { passive: false },
    );

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        this.physics.setPaused(!this.physics.isPaused());
        this.toolbar.setPaused(this.physics.isPaused());
      }
      if (e.key === ',' || e.key === '<') {
        const next = Math.max(0.1, this.physics.getTimeScale() / 2);
        this.physics.setTimeScale(next);
        this.toolbar.setTimeScale(next);
      }
      if (e.key === '.' || e.key === '>') {
        const next = Math.min(2, this.physics.getTimeScale() * 2);
        this.physics.setTimeScale(next);
        this.toolbar.setTimeScale(next);
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const snap = this.physics.peek();
        if (snap.activeBodyId) this.physics.remove(snap.activeBodyId);
      }
    });
  }

  private async loadSceneFile(file: File): Promise<void> {
    try {
      const text = await file.text();
      const scene = JSON.parse(text);
      this.physics.loadScene(scene);
      this.toolbar.setGravity(scene.gravityY ?? -9.81);
      if (scene.demo) this.toolbar.setDemo(scene.demo);
      this.demo = scene.demo ?? this.demo;
      this.toolbar.toast(`Loaded ${file.name}`, 'ok');
    } catch (err) {
      console.error('Failed to load scene', err);
      this.toolbar.toast('Failed to load scene', 'err');
    }
  }

  private bindDropLoad(viewport: HTMLElement): void {
    let depth = 0;
    const onDragEnter = (e: DragEvent) => {
      e.preventDefault();
      depth++;
      this.toolbar.setDropActive(true);
    };
    const onDragLeave = (e: DragEvent) => {
      e.preventDefault();
      depth = Math.max(0, depth - 1);
      if (depth === 0) this.toolbar.setDropActive(false);
    };
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      depth = 0;
      this.toolbar.setDropActive(false);
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      if (!file.name.endsWith('.json') && file.type !== 'application/json') {
        this.toolbar.toast('Drop a .json scene file', 'err');
        return;
      }
      await this.loadSceneFile(file);
    };
    viewport.addEventListener('dragenter', onDragEnter);
    viewport.addEventListener('dragleave', onDragLeave);
    viewport.addEventListener('dragover', onDragOver);
    viewport.addEventListener('drop', onDrop);
  }

  private paintAt(x: number, y: number): void {
    const id = this.physics.pickBody(x, y, true);
    if (!id) return;
    const ok = this.physics.setBodyAppearance(id, {
      materialId: this.paintMaterial,
      color: this.paintColor,
    });
    if (ok) this.sfx.pin();
  }

  private explodeAt(x: number, y: number): void {
    const snap = this.physics.peek();
    for (const b of snap.bodies) {
      if (b.bodyType !== 'dynamic') continue;
      const dx = b.x - x;
      const dy = b.y - y;
      const d = Math.hypot(dx, dy) || 0.01;
      if (d > 6) continue;
      const force = 40 * (1 - d / 6);
      this.physics.applyImpulse(b.id, (dx / d) * force, (dy / d) * force + 8);
    }
  }

  private frame(now: number): void {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;

    const snap = this.physics.step(dt);
    this.render.applySnapshot(snap, dt);

    if (snap.contacts.length) {
      this.bus.emit({ type: 'contacts', contacts: snap.contacts });
      for (const c of snap.contacts) {
        if (c.impulse > 1.2) this.sfx.impact(c.impulse);
      }
    }
    // VFX for bursts is handled in RenderScene; SFX here
    if (snap.bursts.length) {
      for (let i = 0; i < snap.bursts.length; i++) this.sfx.boom();
    }

    this.fpsAccum += dt;
    this.fpsFrames++;
    if (this.fpsAccum >= 0.5) {
      this.fps = this.fpsFrames / this.fpsAccum;
      this.fpsAccum = 0;
      this.fpsFrames = 0;
      this.toolbar.updateStats(this.fps, snap.bodies.length, {
        paused: snap.paused,
        timeScale: snap.timeScale,
        gravityY: snap.gravityY,
      });
      this.bus.emit({
        type: 'fps',
        fps: this.fps,
        bodyCount: snap.bodies.length,
      });
    }

    requestAnimationFrame((t) => this.frame(t));
  }
}
