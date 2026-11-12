// What the crosshair is on, Minecraft's way: a thin dark outline round the block, and cracks spreading over it as
// the pick works (ten stages, multiplied onto the block so they darken whatever it is made of).
import * as THREE from 'three';
import { paintCracks } from './blocks.mjs';

export class Selection {
  constructor(scene) {
    this.box = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)),
      new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, fog: false })
    );
    this.box.visible = false;
    scene.add(this.box);
    this.stages = paintCracks();
    this.crackMat = new THREE.ShaderMaterial({
      uniforms: { map: { value: this.stages[0] } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform sampler2D map; varying vec2 vUv; void main(){ gl_FragColor = texture2D(map, vUv); }',
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -4,
      blending: THREE.CustomBlending,
      blendSrc: THREE.DstColorFactor,
      blendDst: THREE.SrcColorFactor
    });
    this.crack = new THREE.Mesh(new THREE.BoxGeometry(1.002, 1.002, 1.002), this.crackMat);
    this.crack.visible = false;
    scene.add(this.crack);
  }

  // target: a raycast hit (or null); progress: 0–1 of the dig.
  update(target, progress = 0) {
    this.box.visible = !!target;
    if (target) this.box.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5);
    this.crack.visible = !!target && progress > 0;
    if (this.crack.visible) {
      this.crack.position.copy(this.box.position);
      this.crackMat.uniforms.map.value = this.stages[Math.min(9, Math.floor(progress * 10))];
    }
  }
}
