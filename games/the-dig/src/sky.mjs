// The sky, Minecraft's way: a blue that pales to the horizon (where the fog takes the same colour), a square sun,
// and a flat layer of blocky clouds drifting overhead. Underground it all dims to black.
import * as THREE from 'three';
import { rng } from './noise.mjs';

export const CLOUD_Y = 112;
const CLOUD_PX = 12; // blocks per pixel of the cloud map, as in Minecraft
const CLOUD_SIZE = 64;

// Colours here go to the screen as written (sRGB), like the chunks' own lighting.
export const raw = (hex) => new THREE.Color().setHex(typeof hex === 'string' ? parseInt(hex.replace('#', ''), 16) : hex, THREE.NoColorSpace);

export class Sky {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.renderOrder = -10;
    scene.add(this.group);
    this.top = raw(0x7ba4ff);
    this.horizon = raw(0xc4dcff);

    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(400, 24, 12),
      new THREE.ShaderMaterial({
        uniforms: { top: { value: this.top }, horizon: { value: this.horizon }, dim: { value: 0 } },
        vertexShader: `varying vec3 vDir;
          void main() { vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
        fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform float dim; varying vec3 vDir;
          void main() { float t = clamp(vDir.y * 2.4, 0.0, 1.0); vec3 c = mix(horizon, top, pow(t, 0.6));
            gl_FragColor = vec4(c * (1.0 - dim), 1.0); }`,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false
      })
    );
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    this.group.add(this.dome);

    // The sun: a white-gold square with a soft square glow, added to the sky.
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d');
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 32; x++) {
        const d = Math.max(Math.abs(x - 15.5), Math.abs(y - 15.5));
        const a = d < 6 ? 1 : Math.max(0, 1 - (d - 6) / 10) * 0.35;
        g.fillStyle = `rgba(255, ${d < 6 ? 250 : 236}, ${d < 6 ? 220 : 170}, ${a})`;
        g.fillRect(x, y, 1, 1);
      }
    const sunTex = new THREE.CanvasTexture(c);
    sunTex.magFilter = THREE.NearestFilter;
    sunTex.colorSpace = THREE.SRGBColorSpace;
    this.sun = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 90),
      new THREE.MeshBasicMaterial({ map: sunTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })
    );
    this.sun.renderOrder = -9;
    this.sun.frustumCulled = false;
    this.sunDir = new THREE.Vector3(0.45, 0.72, -0.53).normalize();
    this.group.add(this.sun);

    // The clouds: one flat sheet under the camera, its pattern pinned to the world and drifting east.
    const map = this.cloudMap();
    this.clouds = new THREE.Mesh(
      new THREE.PlaneGeometry(CLOUD_SIZE * CLOUD_PX * 1.2, CLOUD_SIZE * CLOUD_PX * 1.2).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({
        uniforms: { map: { value: map }, drift: { value: 0 }, horizon: { value: this.horizon }, dim: { value: 0 }, reach: { value: 380 } },
        vertexShader: `varying vec2 vUv; varying float vDist; uniform float drift;
          void main() { vec4 w = modelMatrix * vec4(position, 1.0); vUv = (w.xz + vec2(drift, 0.0)) / ${(CLOUD_SIZE * CLOUD_PX).toFixed(1)};
            vDist = length(w.xz - cameraPosition.xz); gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: `uniform sampler2D map; uniform vec3 horizon; uniform float dim; uniform float reach; varying vec2 vUv; varying float vDist;
          void main() { if (texture2D(map, vUv).a < 0.5) discard; float f = smoothstep(reach * 0.45, reach, vDist);
            vec3 c = mix(vec3(0.97, 0.98, 1.0), horizon, f) * (1.0 - dim); gl_FragColor = vec4(c, 0.82 * (1.0 - f)); }`,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    );
    this.clouds.frustumCulled = false;
    this.clouds.renderOrder = -8;
    this.group.add(this.clouds);
  }

  cloudMap() {
    const r = rng(1234);
    const N = CLOUD_SIZE;
    let f = new Float32Array(N * N).map(() => r());
    for (let p = 0; p < 3; p++) {
      const n = new Float32Array(N * N);
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          const at = (dx, dy) => f[((x + dx + N) % N) + ((y + dy + N) % N) * N];
          n[x + y * N] = (at(0, 0) * 2 + at(1, 0) + at(-1, 0) + at(0, 1) + at(0, -1)) / 6;
        }
      f = n;
    }
    const sorted = [...f].sort((a, b) => a - b);
    const cut = sorted[Math.floor(N * N * 0.66)];
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const g = c.getContext('2d');
    const img = g.createImageData(N, N);
    for (let i = 0; i < N * N; i++) img.data.set([255, 255, 255, f[i] > cut ? 255 : 0], i * 4);
    g.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    // Crisp blocks up close; blended far off, so the distant edges don't sparkle.
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  // top, horizon: raw colours; dim: 0 open sky … 1 black; open: draw the sun and clouds at all.
  set(top, horizon, dim, open = true) {
    this.top.copy(top);
    this.horizon.copy(horizon);
    this.dome.material.uniforms.dim.value = dim;
    this.clouds.material.uniforms.dim.value = dim;
    this.sun.visible = open && dim < 0.95;
    this.clouds.visible = open && dim < 0.95;
  }

  update(camera, t) {
    const p = camera.position;
    this.dome.position.copy(p);
    this.sun.position.copy(p).addScaledVector(this.sunDir, 360);
    this.sun.lookAt(p);
    this.clouds.position.set(p.x, CLOUD_Y, p.z);
    this.clouds.material.uniforms.drift.value = -t * 1.2;
  }
}
