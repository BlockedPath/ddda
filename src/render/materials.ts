import * as THREE from 'three';
import type { MaterialId } from '../shared/types.ts';

const cache = new Map<string, THREE.MeshStandardMaterial>();

export function getBodyMaterial(
  materialId: MaterialId,
  colorHex?: string,
): THREE.MeshStandardMaterial {
  const key = `${materialId}:${colorHex ?? ''}`;
  let m = cache.get(key);
  if (m) return m;

  const color = new THREE.Color(colorHex ?? '#8899aa');
  const params: THREE.MeshStandardMaterialParameters = {
    color,
    roughness: 0.55,
    metalness: 0.1,
    envMapIntensity: 0.55,
  };

  switch (materialId) {
    case 'metal':
      params.roughness = 0.28;
      params.metalness = 0.78;
      params.envMapIntensity = 0.85;
      break;
    case 'glass':
      params.roughness = 0.12;
      params.metalness = 0.0;
      params.transparent = true;
      params.opacity = 0.5;
      params.envMapIntensity = 0.9;
      params.depthWrite = false;
      break;
    case 'neon':
      // Soft glow without washing out shape (bloom + high emissive was "fuzzy")
      params.roughness = 0.4;
      params.metalness = 0.12;
      params.emissive = color.clone().multiplyScalar(0.28);
      params.emissiveIntensity = 0.45;
      params.envMapIntensity = 0.25;
      break;
    case 'wood':
      params.roughness = 0.82;
      params.metalness = 0.0;
      params.envMapIntensity = 0.35;
      break;
    case 'rubber':
      params.roughness = 0.95;
      params.metalness = 0.0;
      params.envMapIntensity = 0.25;
      break;
    case 'static':
      params.roughness = 0.88;
      params.metalness = 0.08;
      params.color = new THREE.Color(colorHex ?? '#3a4250');
      params.envMapIntensity = 0.45;
      break;
    case 'matte':
    default:
      params.roughness = 0.62;
      params.metalness = 0.05;
      break;
  }

  m = new THREE.MeshStandardMaterial(params);
  cache.set(key, m);
  return m;
}

export function sleepingTint(
  mat: THREE.MeshStandardMaterial,
  sleeping: boolean,
): void {
  mat.opacity = mat.transparent ? (sleeping ? 0.4 : 0.55) : 1;
  if (!mat.transparent) {
    mat.color.offsetHSL(0, 0, sleeping ? -0.05 : 0);
  }
}
