import * as THREE from 'three';
import { Builder } from '../geom.js';
import { buildFacade } from './facade.js';
import { buildBody } from './body.js';
import { buildInterior } from './interior.js';
import { buildBelfry } from './belfry.js';

export function buildCathedral(scene, mats) {
  const group = new THREE.Group();
  group.name = 'NotreDame';
  const b = new Builder();
  buildFacade(b);
  buildBody(b);
  buildInterior(b, scene, mats);
  buildBelfry(b, scene, mats);
  b.build(mats, group, { name: 'nd' });
  scene.add(group);
  return group;
}
