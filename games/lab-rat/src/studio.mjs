// The model studio: every model on a turntable, lit well enough to judge the shapes. `?m=` picks one, `?a=` an
// animation pose, `?dark=1` lights it like the game (a dim hemisphere and one warm lamp). window.__studio drives it.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildSkitter, buildTender, buildBulwark, makeHuman, makeSMG, makeWrench, makeHand, bendKnees } from './models.mjs';

const q = new URLSearchParams(location.search);
const r = new THREE.WebGLRenderer({ antialias: true });
r.setPixelRatio(Math.min(devicePixelRatio, 2));
r.setSize(innerWidth, innerHeight);
r.toneMapping = THREE.ACESFilmicToneMapping;
r.toneMappingExposure = 1.1;
r.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(r.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0c0e);
const dark = q.has('dark');
const cam = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.01, 100);
const pm = new THREE.PMREMGenerator(r);
if (!dark) {
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;
}
scene.add(new THREE.HemisphereLight(0xc8d4e0, 0x201c18, dark ? 0.25 : 1.0));
const key = new THREE.DirectionalLight(0xfff0e0, dark ? 0 : 2.2);
key.position.set(3, 5, 4);
scene.add(key);
const lamp = new THREE.PointLight(0xffc890, dark ? 30 : 0, 12, 2);
lamp.position.set(2, 3, 2);
scene.add(lamp);
const floor = new THREE.Mesh(new THREE.CircleGeometry(4, 48), new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.9 }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const MODELS = {
  skitter: () => {
    const p = buildSkitter();
    p.ears.forEach((e) => e.piv.rotation.set(-0.3, 0, -e.side * 0.4));
    return { obj: p.body, p, h: 0.45, d: 1.7 };
  },
  tender: () => {
    const p = buildTender();
    p.body.position.y = 0.3;
    return { obj: p.body, p, h: 1.5, d: 5 };
  },
  bulwark: () => {
    const p = buildBulwark();
    return { obj: p.body, p, h: 1.3, d: 6 };
  },
  okafor: () => {
    const h = makeHuman({ shirt: 0x5a4a6a, pants: 0x262830, skin: 0x5e3b26, hair: 0x0e0b08, coat: true, glasses: true, badge: true });
    return { obj: h.g, p: h, h: 1.0, d: 3.2 };
  },
  soldier: () => {
    const h = makeHuman({ shirt: 0x2a2d30, pants: 0x25282b, skin: 0x8a6a58, soldier: true });
    return { obj: h.g, p: h, h: 1.0, d: 3.2 };
  },
  smg: () => {
    const g = makeSMG({ viewmodel: true });
    g.position.y = 0.5;
    return { obj: g, p: g.userData.parts, h: 0.5, d: 1.1 };
  },
  hands: () => {
    const g = makeSMG({ viewmodel: true });
    const rh = makeHand(1), lh = makeHand(-1, { watch: true });
    g.add(rh.g, lh.g);
    g.position.y = 0.5;
    return { obj: g, p: { rh, lh, ...g.userData.parts }, h: 0.5, d: 1.1 };
  },
  wrench: () => {
    const g = makeWrench();
    g.position.y = 0.5;
    return { obj: g, p: {}, h: 0.5, d: 0.9 };
  }
};

const bar = document.getElementById('bar');
let cur = null, name = q.get('m') ?? 'skitter', yaw = 0.6, pitch = 0.15, zoom = 1, anim = q.get('a') ?? '';
function show(n) {
  if (cur) scene.remove(cur.obj);
  name = n;
  cur = MODELS[n]();
  scene.add(cur.obj);
  for (const b of bar.children) b.classList.toggle('on', b.textContent === n);
}
for (const n of Object.keys(MODELS)) {
  const b = document.createElement('button');
  b.textContent = n;
  b.onclick = () => show(n);
  bar.appendChild(b);
}
show(name);
let drag = null;
addEventListener('pointerdown', (e) => (drag = [e.clientX, e.clientY]));
addEventListener('pointerup', () => (drag = null));
addEventListener('pointermove', (e) => {
  if (!drag) return;
  yaw -= (e.clientX - drag[0]) * 0.01;
  pitch = Math.max(-0.5, Math.min(1.3, pitch + (e.clientY - drag[1]) * 0.01));
  drag = [e.clientX, e.clientY];
});
addEventListener('wheel', (e) => (zoom = Math.max(0.2, Math.min(3, zoom * (1 + e.deltaY * 0.001)))));
addEventListener('resize', () => {
  r.setSize(innerWidth, innerHeight);
  cam.aspect = innerWidth / innerHeight;
  cam.updateProjectionMatrix();
});

function pose(t) {
  const p = cur.p;
  if (name === 'skitter') {
    const open = anim === 'windup' ? 1 : 0.15 + Math.sin(t * 3) * 0.1;
    p.jaws.forEach((j) => (j.rotation.x = 0.3 - open * 0.95));
    const alert = anim === 'windup' || anim === 'hunt' ? 1 : 0;
    p.ears.forEach((e) => e.piv.rotation.set(-0.55 + alert * 0.75 + Math.sin(t * 37 + e.side) * 0.03 * alert, 0, -e.side * (0.35 + alert * 0.3)));
    p.legs.forEach((L) => {
      const ph = t * 8 + (L.row + (L.side > 0 ? 1 : 0)) * Math.PI;
      L.hip.rotation.y = anim === 'walk' ? Math.sin(ph) * 0.45 : 0;
      L.hip.rotation.x = anim === 'walk' ? Math.max(0, Math.cos(ph)) * 0.35 : 0;
    });
  }
  if (name === 'tender') {
    for (const td of p.tendrils) {
      td.piv.rotation.x = Math.sin(t * 1.2 + td.ph) * 0.25;
      td.piv.rotation.z = Math.cos(t * 0.9 + td.ph) * 0.2;
    }
    const tend = anim === 'tend' ? 1 : 0;
    for (const a of p.arms) {
      a.sh.rotation.set(-0.35 - tend * 0.7 + Math.sin(t + a.side) * 0.05, 0, a.side * (0.25 - tend * 0.12));
      a.el.rotation.set(-0.5 - tend * 0.5 + Math.sin(t * 1.3 + a.side) * 0.08, 0, 0);
      a.fingers.forEach((f, i) => (f.rotation.x = 0.3 + Math.sin(t * 2 + i) * 0.15));
    }
    for (const rt of p.roots) rt.piv.rotation.z = Math.sin(t * 1.5 + rt.ph) * 0.12;
  }
  if (name === 'bulwark') {
    p.sac.scale.setScalar(1 + Math.sin(t * 2.2) * 0.04);
    p.jaw.rotation.x = anim === 'roar' ? 0.5 : 0.05;
  }
  if ((name === 'okafor' || name === 'soldier') && anim === 'walk') {
    p.legs[0].rotation.x = Math.sin(t * 6) * 0.6;
    p.legs[1].rotation.x = -Math.sin(t * 6) * 0.6;
    bendKnees(p);
  }
  if (name === 'okafor' && anim === 'crouch') {
    p.body.position.y = -0.36;
    p.legs[0].rotation.x = -1.1;
    p.legs[1].rotation.x = -0.9;
    bendKnees(p, 1);
  }
}

const clock = new THREE.Clock();
function frame() {
  const t = clock.getElapsedTime();
  if (!drag && !q.has('still')) yaw += 0.004;
  pose(t);
  const d = cur.d * zoom;
  cam.position.set(Math.sin(yaw) * Math.cos(pitch) * d, cur.h + Math.sin(pitch) * d, Math.cos(yaw) * Math.cos(pitch) * d);
  cam.lookAt(0, cur.h, 0);
  r.render(scene, cam);
  requestAnimationFrame(frame);
}
frame();
window.__studio = {
  show,
  set: (o) => Object.assign(window.__studioState ??= {}, o),
  view: (y, p, z) => ((yaw = y), (pitch = p), (zoom = z ?? zoom)),
  anim: (a) => (anim = a),
  get cur() {
    return cur;
  },
  render: () => r.render(scene, cam)
};
