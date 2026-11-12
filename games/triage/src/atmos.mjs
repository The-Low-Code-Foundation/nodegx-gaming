// The air (round 4). Playtest: "keep improving our little shooting sandbox to try to get the look as atmospheric and
// scary as possible." What hangs in the hospital's air and what the shots do to it:
// - dust drifting in the torch beam (points lit only inside the beam's cone, a shader);
// - the beam itself, faint, brighter as gun smoke fills the room (world.haze, raised by every shot, settling slowly);
// - the fog thickening and greying with that smoke;
// - plaster dust shaken down from the ceiling tiles by a big shot;
// - a ceiling panel hanging off its wires, sparking now and then (a crackle, a flash) in the sandbox.
// Nothing here is cover or is shot: it is all look. `lite` (the drive) keeps the fog and the smoke, drops the rest.
import * as THREE from 'three';
import { WALL_H } from './level.mjs';
import { toWorld } from './map.mjs';

const MOTES = 700, BOX = new THREE.Vector3(14, 3.2, 14);
const FALL = 240;

export class Atmos {
  constructor(world, { lite = false } = {}) {
    this.world = world;
    this.lite = lite;
    this.t = 0;
    const scene = world.scene;
    this.fogBase = { near: scene.fog.near, far: scene.fog.far, color: scene.fog.color.clone() };
    this.smokeColor = new THREE.Color(0x2b2e31);
    if (lite) return;

    // Dust in the beam.
    const pos = new Float32Array(MOTES * 3), seed = new Float32Array(MOTES);
    for (let i = 0; i < MOTES; i++) {
      pos[i * 3] = Math.random() * BOX.x;
      pos[i * 3 + 1] = Math.random() * BOX.y;
      pos[i * 3 + 2] = Math.random() * BOX.z;
      seed[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    this.moteU = {
      uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uBox: { value: BOX.clone() },
      uTorch: { value: new THREE.Vector3() }, uDir: { value: new THREE.Vector3(0, 0, 1) }, uOn: { value: 1 }, uHaze: { value: 0 }
    };
    const motes = new THREE.Points(
      geo,
      new THREE.ShaderMaterial({
        uniforms: this.moteU,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: `
          attribute float seed;
          uniform float uTime; uniform vec3 uCenter, uBox, uTorch, uDir; uniform float uOn, uHaze;
          varying float vA;
          void main() {
            vec3 p = position + vec3(sin(uTime * 0.11 + seed * 40.0), -uTime * (0.015 + seed * 0.02) + sin(uTime * 0.3 + seed * 9.0) * 0.1, cos(uTime * 0.09 + seed * 31.0)) * 0.6;
            p.y = mod(p.y, uBox.y);
            vec2 h = uBox.xz * 0.5;
            p.xz = uCenter.xz + mod(p.xz - uCenter.xz + h, uBox.xz) - h;
            vec3 to = p - uTorch;
            float d = length(to);
            float inBeam = smoothstep(0.84, 0.965, dot(to / max(d, 0.001), uDir)) * smoothstep(13.0, 3.0, d) * smoothstep(0.35, 1.2, d);
            vA = (inBeam * uOn * (0.55 + uHaze * 0.6) + 0.025) * (0.4 + seed * 0.6);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = clamp((0.9 + seed * 1.6) * 60.0 / -mv.z, 1.0, 6.0);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `
          varying float vA;
          void main() {
            vec2 c = gl_PointCoord - 0.5;
            float a = smoothstep(0.5, 0.0, length(c)) * vA;
            gl_FragColor = vec4(vec3(1.0, 0.95, 0.85) * a, a);
          }`
      })
    );
    motes.frustumCulled = false;
    scene.add(motes);
    this.motes = motes;

    // The beam: a cone out of the torch, brightest along its middle, fading with distance and at the root.
    const L = 11;
    const cone = new THREE.ConeGeometry(Math.tan(0.5) * L, L, 28, 1, true);
    cone.translate(0, -L / 2, 0);
    cone.rotateX(-Math.PI / 2);
    this.beamU = { uHaze: { value: 0 }, uOn: { value: 1 }, uLen: { value: L } };
    this.beam = new THREE.Mesh(
      cone,
      new THREE.ShaderMaterial({
        uniforms: this.beamU,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        vertexShader: `
          varying float vAlong; varying vec3 vN; varying vec3 vView;
          void main() {
            vAlong = position.z;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vN = normalize(normalMatrix * normal);
            vView = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `
          uniform float uHaze, uOn, uLen;
          varying float vAlong; varying vec3 vN; varying vec3 vView;
          void main() {
            float edge = pow(abs(dot(vN, vView)), 2.0);
            float a = edge * smoothstep(0.4, 2.5, vAlong) * smoothstep(uLen, uLen * 0.25, vAlong) * (0.012 + uHaze * 0.07) * uOn;
            gl_FragColor = vec4(vec3(1.0, 0.95, 0.84) * a, a);
          }`
      })
    );
    this.beam.frustumCulled = false;
    scene.add(this.beam);

    // Plaster dust falling from the ceiling.
    const fpos = new Float32Array(FALL * 3).fill(-100);
    const fgeo = new THREE.BufferGeometry();
    fgeo.setAttribute('position', new THREE.BufferAttribute(fpos, 3));
    this.fall = new THREE.Points(fgeo, new THREE.PointsMaterial({ color: 0x9d988c, size: 0.025, transparent: true, opacity: 0.75, depthWrite: false }));
    this.fall.frustumCulled = false;
    scene.add(this.fall);
    this.fallV = new Float32Array(FALL * 3);
    this.fallNext = 0;

    // The sandbox's broken light: a panel hanging off its wires over the hall, and its sparks.
    if (world.sandbox) {
      const at = toWorld(13, 10);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.03, 0.6), new THREE.MeshPhongMaterial({ color: 0x8a8f8c, emissive: 0x101010, shininess: 60 }));
      const hinge = new THREE.Group();
      hinge.position.set(at.x - 0.6, WALL_H - 0.02, at.z);
      panel.position.set(0.6, 0, 0);
      hinge.add(panel);
      hinge.rotation.z = -0.9;
      const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.9, 4), new THREE.MeshBasicMaterial({ color: 0x111111 }));
      wire.position.set(at.x + 0.1, WALL_H - 0.45, at.z + 0.1);
      wire.rotation.z = 0.3;
      scene.add(hinge, wire);
      this.hang = { hinge, at: new THREE.Vector3(at.x + 0.15, WALL_H - 0.9, at.z + 0.1), next: 3 };
      this.sparkLight = new THREE.PointLight(0xffd9a0, 0, 7, 2);
      this.sparkLight.position.copy(this.hang.at);
      scene.add(this.sparkLight);
      const spos = new Float32Array(60 * 3).fill(-100);
      const sgeo = new THREE.BufferGeometry();
      sgeo.setAttribute('position', new THREE.BufferAttribute(spos, 3));
      this.sparks = new THREE.Points(sgeo, new THREE.PointsMaterial({ color: 0xffe2a8, size: 0.04, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      this.sparks.frustumCulled = false;
      scene.add(this.sparks);
      this.sparkV = new Float32Array(60 * 3);
      this.sparkLife = new Float32Array(60);
    }
  }

  // A shot: big ones shake dust out of the ceiling tiles over her.
  shot(size) {
    if (this.lite || Math.random() > 0.3 * size) return;
    const p = this.world.player.pos;
    const a = Math.random() * Math.PI * 2, r = 1 + Math.random() * 3.5;
    const cx = p.x + Math.sin(a) * r, cz = p.z + Math.cos(a) * r;
    const P = this.fall.geometry.attributes.position.array;
    for (let i = 0; i < 26; i++) {
      const k = this.fallNext;
      this.fallNext = (this.fallNext + 1) % FALL;
      P[k * 3] = cx + (Math.random() - 0.5) * 0.5;
      P[k * 3 + 1] = WALL_H - 0.02 - Math.random() * 0.05;
      P[k * 3 + 2] = cz + (Math.random() - 0.5) * 0.5;
      this.fallV[k * 3] = (Math.random() - 0.5) * 0.15;
      this.fallV[k * 3 + 1] = -Math.random() * 0.6 - i * 0.03;
      this.fallV[k * 3 + 2] = (Math.random() - 0.5) * 0.15;
    }
  }

  update(dt) {
    this.t += dt;
    const w = this.world, scene = w.scene, haze = w.haze ?? 0;
    // Smoke in the air: the fog closes in and greys.
    scene.fog.near = this.fogBase.near * (1 - haze * 0.65);
    scene.fog.far = this.fogBase.far * (1 - haze * 0.4);
    scene.fog.color.copy(this.fogBase.color).lerp(this.smokeColor, haze * 0.7);
    if (this.lite) return;
    const p = w.player;
    const torch = p.torch;
    const on = p.torchOn && torch.visible ? 1 : 0;
    const dir = new THREE.Vector3().subVectors(p.torchTarget.position, torch.position).normalize();
    const U = this.moteU;
    U.uTime.value = this.t;
    U.uCenter.value.copy(w.camera.position);
    U.uTorch.value.copy(torch.position);
    U.uDir.value.copy(dir);
    U.uOn.value = on;
    U.uHaze.value = haze;
    this.beam.position.copy(torch.position);
    this.beam.lookAt(torch.position.clone().add(dir));
    this.beamU.uOn.value = on;
    this.beamU.uHaze.value = haze;
    this.beam.visible = !!on;
    // The falling dust: slow, drifting, gone at the floor.
    const P = this.fall.geometry.attributes.position.array, V = this.fallV;
    for (let i = 0; i < FALL; i++) {
      if (P[i * 3 + 1] < -50) continue;
      V[i * 3 + 1] = Math.max(-0.9, V[i * 3 + 1] - 1.2 * dt);
      P[i * 3] += V[i * 3] * dt;
      P[i * 3 + 1] += V[i * 3 + 1] * dt;
      P[i * 3 + 2] += V[i * 3 + 2] * dt;
      if (P[i * 3 + 1] < 0.01) P[i * 3 + 1] = -100;
    }
    this.fall.geometry.attributes.position.needsUpdate = true;
    // The hanging panel: it sways, and every few seconds it shorts.
    const h = this.hang;
    if (h) {
      h.hinge.rotation.z = -0.9 + Math.sin(this.t * 0.8) * 0.04;
      h.next -= dt;
      this.sparkLight.intensity *= Math.exp(-dt * 30);
      if (h.next <= 0) {
        h.next = Math.random() < 0.3 ? 0.15 + Math.random() * 0.2 : 2.5 + Math.random() * 6;
        this.sparkLight.intensity = 9 + Math.random() * 8;
        w.audio?.play('zap', h.at);
        const S = this.sparks.geometry.attributes.position.array;
        for (let i = 0; i < 60; i++) {
          if (this.sparkLife[i] > 0 && Math.random() < 0.6) continue;
          S[i * 3] = h.at.x;
          S[i * 3 + 1] = h.at.y;
          S[i * 3 + 2] = h.at.z;
          this.sparkV[i * 3] = (Math.random() - 0.5) * 2.2;
          this.sparkV[i * 3 + 1] = Math.random() * 1.2 - 0.3;
          this.sparkV[i * 3 + 2] = (Math.random() - 0.5) * 2.2;
          this.sparkLife[i] = 0.4 + Math.random() * 0.8;
        }
      }
      const S = this.sparks.geometry.attributes.position.array, SV = this.sparkV;
      for (let i = 0; i < 60; i++) {
        if (this.sparkLife[i] <= 0) continue;
        this.sparkLife[i] -= dt;
        SV[i * 3 + 1] -= 9.8 * dt;
        S[i * 3] += SV[i * 3] * dt;
        S[i * 3 + 1] += SV[i * 3 + 1] * dt;
        S[i * 3 + 2] += SV[i * 3 + 2] * dt;
        if (S[i * 3 + 1] < 0.01) ((S[i * 3 + 1] = 0.01), (SV[i * 3 + 1] *= -0.3), (SV[i * 3] *= 0.5), (SV[i * 3 + 2] *= 0.5));
        if (this.sparkLife[i] <= 0) S[i * 3 + 1] = -100;
      }
      this.sparks.geometry.attributes.position.needsUpdate = true;
    }
  }
}
