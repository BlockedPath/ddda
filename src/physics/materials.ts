import type { MaterialId } from '../shared/types.ts';

export interface PhysMaterial {
  density: number;
  friction: number;
  restitution: number;
}

const TABLE: Record<MaterialId, PhysMaterial> = {
  matte: { density: 1.0, friction: 0.5, restitution: 0.2 },
  metal: { density: 2.5, friction: 0.35, restitution: 0.15 },
  glass: { density: 0.8, friction: 0.2, restitution: 0.4 },
  neon: { density: 0.6, friction: 0.4, restitution: 0.55 },
  wood: { density: 0.7, friction: 0.55, restitution: 0.25 },
  rubber: { density: 0.9, friction: 0.9, restitution: 0.75 },
  static: { density: 0, friction: 0.6, restitution: 0.1 },
};

export function materialProps(id: MaterialId): PhysMaterial {
  return TABLE[id] ?? TABLE.matte;
}

export const DEFAULT_COLORS: Partial<Record<MaterialId, string>> = {
  matte: '#7a8ba3',
  metal: '#c0c8d4',
  glass: '#9ad7e8',
  neon: '#5cffb0',
  wood: '#c49a6c',
  rubber: '#e07070',
  static: '#3a4250',
};
