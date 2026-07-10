import type { BodyDef, BodySnapshot, DemoId, JointSnapshot } from '../shared/types.ts';

/** Portable scene format for save/load (v1). */
export interface SceneFile {
  version: 1;
  label?: string;
  demo?: DemoId;
  gravityY: number;
  bodies: BodyDef[];
  /** Revolute pins: body index + world anchor */
  pins: { bodyIndex: number; x: number; y: number }[];
  /** Distance ropes between body indices */
  ropes: {
    a: number;
    b: number;
    ax: number;
    ay: number;
    bx: number;
    by: number;
    length?: number;
  }[];
}

export function snapshotToScene(
  bodies: BodySnapshot[],
  joints: JointSnapshot[],
  gravityY: number,
  demo?: DemoId,
): SceneFile {
  const idToIndex = new Map<string, number>();
  const defs: BodyDef[] = [];

  bodies.forEach((b, i) => {
    idToIndex.set(b.id, i);
    defs.push({
      kind: b.kind,
      x: b.x,
      y: b.y,
      angle: b.angle,
      halfW: b.halfW,
      halfH: b.halfH,
      radius: b.radius,
      halfHeight: b.halfHeight,
      vertices: b.vertices,
      zDepth: b.zDepth,
      materialId: b.materialId,
      color: b.color,
      bodyType: b.bodyType,
    });
  });

  const pins: SceneFile['pins'] = [];
  const ropes: SceneFile['ropes'] = [];

  for (const j of joints) {
    const ai = idToIndex.get(j.bodyA);
    if (ai === undefined) continue;
    if (j.kind === 'revolute' && (j.bodyB === null || j.bodyB.startsWith('ground'))) {
      pins.push({ bodyIndex: ai, x: j.anchorA[0], y: j.anchorA[1] });
    } else if (j.kind === 'distance' && j.bodyB) {
      const bi = idToIndex.get(j.bodyB);
      if (bi === undefined) continue;
      ropes.push({
        a: ai,
        b: bi,
        ax: j.anchorA[0],
        ay: j.anchorA[1],
        bx: j.anchorB[0],
        by: j.anchorB[1],
      });
    } else if (j.kind === 'revolute' && j.bodyB) {
      // Treat body-body revolute as pin at midpoint for approximate reload
      pins.push({ bodyIndex: ai, x: j.anchorA[0], y: j.anchorA[1] });
    }
  }

  return {
    version: 1,
    demo,
    gravityY,
    bodies: defs,
    pins,
    ropes,
  };
}

export function downloadScene(scene: SceneFile, filename = 'ddda-scene.json'): void {
  const blob = new Blob([JSON.stringify(scene, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
