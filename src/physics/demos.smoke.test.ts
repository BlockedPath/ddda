/**
 * Headless smoke: load every demo, step 2s, assert no NaNs / empty scenes.
 * Run: npx vitest run src/physics/demos.smoke.test.ts
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createPhysicsWorld, type PhysicsWorld } from './world.ts';
import { DEMO_IDS } from './demos.ts';

describe('demo smoke', () => {
  let world: PhysicsWorld;

  beforeAll(async () => {
    world = await createPhysicsWorld();
  }, 30_000);

  for (const demo of DEMO_IDS) {
    it(`loads and steps: ${demo}`, () => {
      world.loadDemo(demo);
      let snap = world.peek();
      expect(snap.bodies.length).toBeGreaterThan(0);

      for (let i = 0; i < 120; i++) {
        snap = world.step(1 / 60);
      }

      expect(snap.bodies.length).toBeGreaterThan(0);
      for (const b of snap.bodies) {
        expect(Number.isFinite(b.x)).toBe(true);
        expect(Number.isFinite(b.y)).toBe(true);
        expect(Number.isFinite(b.angle)).toBe(true);
        expect(Number.isFinite(b.vx)).toBe(true);
        expect(Number.isFinite(b.vy)).toBe(true);
        // Bodies should stay in a reasonable world box
        expect(Math.abs(b.x)).toBeLessThan(40);
        expect(b.y).toBeGreaterThan(-5);
        expect(b.y).toBeLessThan(40);
      }
    });
  }

  it('fireworks produces bursts within a few seconds', () => {
    world.loadDemo('fireworks');
    let bursts = 0;
    for (let i = 0; i < 180; i++) {
      const snap = world.step(1 / 60);
      bursts += snap.bursts.length;
    }
    expect(bursts).toBeGreaterThan(0);
  });

  it('gears motor keeps drive gear spinning', () => {
    world.loadDemo('gears');
    // Settle contact
    for (let i = 0; i < 30; i++) world.step(1 / 60);
    let maxAbsOmega = 0;
    for (let i = 0; i < 90; i++) {
      const snap = world.step(1 / 60);
      for (const b of snap.bodies) {
        if (b.visualHint === 'motor' || b.visualHint === 'gear') {
          maxAbsOmega = Math.max(maxAbsOmega, Math.abs(b.omega));
        }
      }
    }
    expect(maxAbsOmega).toBeGreaterThan(0.3);
  });
});
