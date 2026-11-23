// A ship's running lights, and the sun on her hull seen from far off: what she is in the dark.
//
// Up close you see her hull. A few kilometres out she is a handful of lamps: red to port, green to starboard, white
// astern, a red beacon pulsing on her back and white strobes that double-flash above and below her. Further out the
// steady lamps are too faint to see and she is the strobe alone, a blink among the stars, and the sun on her hull
// (`glint`): a point the colour of the sun, bright when the sun is behind you and dark when she is between you and it,
// fading as she shrinks until she is one more star, then not even that. That is how you lose your carrier.
//
// Every lamp is a point drawn in screen pixels (one draw for all of a ship's lamps), sized by distance but never under
// `MIN_PX`, and as bright as a lamp of its kind would look from there: brightness falls as (reach / distance)², so a
// strobe (`reach` 2.4 km) is seen from many kilometres and a steady lamp (450 m) only near. Past `FAR` a point is
// drawn on the line of sight at `FAR`, inside the camera's far plane, at the brightness it has at its real distance.
//
// Where each lamp goes is found on the real hull: rays from outside onto her hull meshes (`C.hull`, the Blender hull or
// the lofted one) at her widest section (the side lamps), astern, and above and below her middle (the strobes and the
// beacon). A ship over 100 m long has a second pair of side lamps and strobes at her bow and stern too.
//
//   new Beacons(P, { sun })   P: a built ship (layout.mjs `buildCarrier`), after its hull is loaded
//   beacons.on                false: dark (a ship on her cradle)
//   beacons.frame(t, camera, renderer)

import * as THREE from 'three';

/** The lamps' kinds: colour, the size of the glow (metres), how far it reads at full strength (m), how it blinks. */
const KIND = {
  port: { color: '#ff2a1c', size: 0.9, reach: 450, blink: 0 },
  starboard: { color: '#2bff5a', size: 0.9, reach: 450, blink: 0 },
  stern: { color: '#fff2d8', size: 0.8, reach: 380, blink: 0 },
  strobe: { color: '#f4f8ff', size: 2.6, reach: 2400, blink: 1 },
  beacon: { color: '#ff3a26', size: 1.4, reach: 900, blink: 2 }
};
/** The smallest a lamp is drawn, in pixels (at a pixel ratio of 1). */
const MIN_PX = 2.2;
/** Points further than this are drawn on their line of sight at this distance (the camera's far plane is 20 km). */
const FAR = 15000;
/** The faintest a lamp is drawn before it is gone (0 to 1). */
const FLOOR = 0.012;

const _r = new THREE.Raycaster();
const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _n = new THREE.Vector3();

export class Beacons {
  /** `P`: a built ship. `sun`: the scene's DirectionalLight (its colour and its direction, for the glint). */
  constructor(P, { sun = null } = {}) {
    this.P = P;
    this.sun = sun;
    this.on = true;
    const L = P.L;
    const lamps = this.place(P);
    this.lamps = lamps;
    const n = lamps.length;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), reach = new Float32Array(n), blink = new Float32Array(n), phase = new Float32Array(n);
    const c = new THREE.Color();
    lamps.forEach((l, i) => {
      const K = KIND[l.kind];
      pos.set(l.at, i * 3);
      c.set(K.color);
      col.set([c.r, c.g, c.b], i * 3);
      size[i] = K.size * (l.big ? 2.2 : 1);
      reach[i] = K.reach * (l.big ? 1.8 : 1);
      blink[i] = K.blink;
      phase[i] = l.phase ?? 0;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('size', new THREE.BufferAttribute(size, 1));
    g.setAttribute('reach', new THREE.BufferAttribute(reach, 1));
    g.setAttribute('blink', new THREE.BufferAttribute(blink, 1));
    g.setAttribute('phase', new THREE.BufferAttribute(phase, 1));
    this.uniforms = { uTime: { value: 0 }, uPx: { value: 500 }, uScale: { value: 1 }, uOn: { value: 1 } };
    this.points = new THREE.Points(g, lampMaterial(this.uniforms));
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.points.name = 'running-lights';
    P.frame.add(this.points);

    // The glint: the sun on her hull, at her centre of mass, as big as she is long.
    const gg = new THREE.BufferGeometry();
    const com = L.com ?? [0, 0, 0];
    gg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(com), 3));
    this.glintU = { uPx: { value: 500 }, uScale: { value: 1 }, uLen: { value: L.length ?? 30 }, uSun: { value: new THREE.Vector3(0.6, 0.8, 0.3).normalize() }, uSunCol: { value: new THREE.Color('#fff4e0') } };
    this.glint = new THREE.Points(gg, glintMaterial(this.glintU));
    this.glint.frustumCulled = false;
    this.glint.renderOrder = 4;
    this.glint.name = 'glint';
    P.frame.add(this.glint);
  }

  /** Where her lamps go, in her frame: rays onto her hull. */
  place(P) {
    const L = P.L;
    const meshes = (P.hull ?? []).filter((m) => m.isMesh);
    P.obj.updateMatrixWorld(true);
    const inv = P.frame.matrixWorld.clone().invert();
    const secs = L.hull?.main ?? [];
    const widest = secs.reduce((a, s) => (s.w > (a?.w ?? 0) ? s : a), null) ?? { z: 0, w: 10, h: 6, y: 0 };
    const zs = secs.map((s) => s.z);
    const z0 = Math.min(...zs, -L.length / 2), z1 = Math.max(...zs, L.length / 2);
    const R = Math.max(200, L.length * 2);
    const big = L.length > 100;
    const off = big ? 1.6 : 0.35; // stood off the skin, so the hull never cuts the point in half
    /** The first hit of a ray from `from` along `dir` (both in her frame), stood off along the surface; or `fallback`. */
    const hit = (from, dir, fallback) => {
      if (meshes.length) {
        _o.set(...from).applyMatrix4(P.frame.matrixWorld);
        _d.set(...dir).transformDirection(P.frame.matrixWorld);
        _r.set(_o, _d);
        _r.far = R * 2;
        const h = _r.intersectObjects(meshes, false)[0];
        if (h) {
          const p = h.point.clone().applyMatrix4(inv);
          _n.set(...dir).negate();
          return [p.x + _n.x * off, p.y + _n.y * off, p.z + _n.z * off];
        }
      }
      return fallback;
    };
    const y = widest.y ?? 0, h2 = widest.h / 2, w2 = widest.w / 2;
    const lamps = [];
    const side = (z, sy, extra = {}) => {
      lamps.push({ kind: 'port', at: hit([-R, sy, z], [1, 0, 0], [-w2 - off, sy, z]), ...extra });
      lamps.push({ kind: 'starboard', at: hit([R, sy, z], [-1, 0, 0], [w2 + off, sy, z]), ...extra });
    };
    side(widest.z, y);
    lamps.push({ kind: 'stern', at: hit([0, y + h2 * 0.45, R], [0, 0, -1], [0, y + h2 * 0.45, z1 + off]) });
    const zm = (z0 + z1) / 2;
    lamps.push({ kind: 'strobe', at: hit([0, R, zm], [0, -1, 0], [0, y + h2 + off, zm]), phase: 0 });
    lamps.push({ kind: 'strobe', at: hit([0, -R, zm], [0, 1, 0], [0, y - h2 - off, zm]), phase: 0 });
    const zb = zm + (z0 - zm) * 0.35;
    lamps.push({ kind: 'beacon', at: hit([0, R, zb], [0, -1, 0], [0, y + h2 + off, zb]), phase: 0.3 });
    if (big) {
      // A long ship shows her length: a pair of side lamps and a strobe at each end, the ends flashing out of step.
      const bow = secs.find((s) => s.z === z0) ?? widest, stern = secs.find((s) => s.z === z1) ?? widest;
      const zb2 = z0 + (z1 - z0) * 0.08, zs2 = z1 - (z1 - z0) * 0.08;
      side(zb2, bow.y ?? 0, { big: false });
      side(zs2, stern.y ?? 0, { big: false });
      lamps.push({ kind: 'strobe', at: hit([0, R, zb2], [0, -1, 0], [0, (bow.y ?? 0) + bow.h / 2 + off, zb2]), phase: 0.75, big: true });
      lamps.push({ kind: 'strobe', at: hit([0, R, zs2], [0, -1, 0], [0, (stern.y ?? 0) + stern.h / 2 + off, zs2]), phase: 0.75, big: true });
      lamps.push({ kind: 'beacon', at: hit([0, -R, zm + 20], [0, 1, 0], [0, y - h2 - off, zm + 20]), phase: 0.8, big: true });
      for (const l of lamps) if (l.kind === 'strobe' && l.phase === 0) l.big = true;
    }
    return lamps;
  }

  /** Each frame, after the camera is placed. */
  frame(t, camera, renderer) {
    const px = renderer.domElement.height / renderer.getPixelRatio() / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    const u = this.uniforms;
    u.uTime.value = t;
    u.uPx.value = px;
    u.uScale.value = renderer.getPixelRatio();
    u.uOn.value = this.on ? 1 : 0;
    this.points.visible = this.on;
    const g = this.glintU;
    g.uPx.value = px;
    g.uScale.value = renderer.getPixelRatio();
    if (this.sun) {
      g.uSun.value.copy(this.sun.position).normalize();
      g.uSunCol.value.copy(this.sun.color);
    }
  }
}

const POINT_VERT = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  // Drawn on the line of sight no further than FAR, so a far lamp is inside the far plane.
  vec4 farClamp(vec4 mv, out float dist) {
    dist = length(mv.xyz);
    if (dist > ${FAR.toFixed(1)}) mv.xyz *= ${FAR.toFixed(1)} / dist;
    return mv;
  }
`;

function lampMaterial(uniforms) {
  return new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      ${POINT_VERT}
      attribute float size, reach, blink, phase;
      attribute vec3 color;
      uniform float uTime, uPx, uScale, uOn;
      varying vec3 vColor;
      varying float vGlow;
      void main() {
        float dist;
        vec4 mv = farClamp(modelViewMatrix * vec4(position, 1.0), dist);
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
        // Its blink: steady (0); a strobe's double flash every 1.4 s (1); a beacon's slow red pulse (2).
        float on = 1.0, flare = 1.0;
        if (blink > 0.5 && blink < 1.5) {
          float t = mod(uTime + phase * 1.4, 1.4);
          on = (t < 0.05 || (t > 0.17 && t < 0.22)) ? 1.0 : 0.0;
          flare = 2.4;
        } else if (blink > 1.5) {
          on = pow(max(0.0, sin((uTime + phase) * 6.2831 * 0.85)), 4.0);
          flare = 1.6;
        }
        float bright = clamp(reach * reach / max(dist * dist, 1.0), 0.0, 1.0);
        float px = size * uPx / max(dist, 0.1);
        // Bigger than the lamp itself: the glow round it (and a strobe's flash lights the air round it, as it seems).
        gl_PointSize = max(px * 3.0, ${MIN_PX.toFixed(1)}) * flare * uScale;
        vGlow = on * uOn * bright;
        if (vGlow < ${FLOOR}) gl_PointSize = 0.0;
        vColor = color;
      }`,
    fragmentShader: /* glsl */ `
      #include <logdepthbuf_pars_fragment>
      varying vec3 vColor;
      varying float vGlow;
      void main() {
        #include <logdepthbuf_fragment>
        vec2 c = gl_PointCoord - 0.5;
        float r2 = dot(c, c) * 4.0;
        // A hot core and a soft halo.
        float a = exp(-r2 * 14.0) * 1.6 + exp(-r2 * 3.5) * 0.35;
        if (a * vGlow < 0.004) discard;
        gl_FragColor = vec4(vColor * a * vGlow * 2.2, 1.0);
      }`
  });
}

function glintMaterial(uniforms) {
  return new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      ${POINT_VERT}
      uniform float uPx, uScale, uLen;
      uniform vec3 uSun;
      uniform vec3 uSunCol;
      varying vec3 vColor;
      void main() {
        float dist;
        vec4 mv = farClamp(modelViewMatrix * vec4(position, 1.0), dist);
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
        // How long she is on the screen: the glint takes over as she shrinks under about ten pixels.
        float px = uLen * uPx / max(dist, 0.1);
        float show = 1.0 - smoothstep(4.0, 12.0, px);
        // Lit from behind you (full) or from behind her (her dark side to you: a thin rim).
        float phase = 0.5 + 0.5 * dot(uSun, normalize(cameraPosition - (modelMatrix * vec4(position, 1.0)).xyz));
        float lit = 0.08 + 0.92 * phase * phase;
        // A sunlit body's light falls with the area it covers: under two pixels it dims as it shrinks.
        float fade = clamp(px / 2.0, 0.0, 1.0);
        fade *= fade;
        gl_PointSize = max(min(px, 12.0), 2.0) * uScale;
        vColor = uSunCol * 0.85 * lit * show * max(fade, 0.0);
        if (dot(vColor, vec3(1.0)) < 0.01) gl_PointSize = 0.0;
      }`,
    fragmentShader: /* glsl */ `
      #include <logdepthbuf_pars_fragment>
      varying vec3 vColor;
      void main() {
        #include <logdepthbuf_fragment>
        vec2 c = gl_PointCoord - 0.5;
        float a = exp(-dot(c, c) * 4.0 * 5.0);
        if (a < 0.02) discard;
        gl_FragColor = vec4(vColor * a, 1.0);
      }`
  });
}
