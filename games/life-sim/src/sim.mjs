// One Sim: a body from a character template, its animation mixer, walking a path, and using things in the flat.
// With `freeWill` on, an idle Sim picks something to do on its own after a few seconds (The Sims' "free will").
import * as THREE from 'three';
import { Face } from './face.mjs';

const TURN_SPEED = 8;
let nextId = 1;

// A soft dark disc under each Sim, instead of drawing every body again into the sun's shadow map.
let blobGeo, blobMat;
function blob() {
  if (!blobGeo) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 4, 32, 32, 31);
    grad.addColorStop(0, 'rgba(0,0,0,0.45)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    blobGeo = new THREE.PlaneGeometry(0.9, 0.9).rotateX(-Math.PI / 2);
    blobMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
  }
  const m = new THREE.Mesh(blobGeo, blobMat);
  m.matrixAutoUpdate = false;
  return m;
}

export class Sim {
  constructor(body, home, { shadowMap = false } = {}) {
    this.id = nextId++;
    this.body = body;
    this.home = home;
    this.group = new THREE.Group();
    this.group.rotation.order = 'YXZ';
    this.group.add(body.outer);
    body.outer.traverse((o) => {
      if (o.isMesh) o.castShadow = shadowMap;
    });
    this.blob = shadowMap ? null : blob();
    this.mixer = new THREE.AnimationMixer(body.outer);
    this.actions = Object.fromEntries(Object.entries(body.clips).map(([n, c]) => [n, this.mixer.clipAction(c)]));
    this.walkSpeed = body.clips.Walk_Loop.userData.speed || 1.1;
    // The walk to use (game/life.mjs: a slow one when tired or sad); its speed comes with it.
    this.walkClip = 'Walk_Loop';
    this.face = new Face(body.outer, body.faceTable);
    this.head = body.outer.getObjectByName('ls_head');
    // Set from the Faces panel for your Sim; otherwise the face follows what the Sim is doing.
    this.moodOverride = null;
    this.talkOverride = false;
    this.talkTimer = 0;
    this.state = 'idle';
    this.path = [];
    this.idleFor = 0;
    this.freeWill = false;
    this.current = null;
    this.onDone = null;
    this.mixer.addEventListener('finished', () => {
      const done = this.onDone;
      this.onDone = null;
      done?.();
    });
    this.play('Idle_Loop', { fade: 0 });
  }

  get position() {
    return this.group.position;
  }

  play(name, { once = false, fade = 0.25, timeScale = 1, then = null } = {}) {
    // A clip still loading (mocap.mjs loads most in the background): stand for a moment instead.
    if (!this.actions[name] && this.body.clips[name]) this.actions[name] = this.mixer.clipAction(this.body.clips[name]);
    if (!this.actions[name]) {
      this.play('Idle_Loop', { fade });
      this.onDone = null;
      this.standIn = once ? { left: 2, then } : null;
      return;
    }
    this.standIn = null;
    const next = this.actions[name];
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.timeScale = timeScale;
    next.enabled = true;
    if (this.current && this.current !== next && fade > 0) next.crossFadeFrom(this.current, fade, false).play();
    else {
      if (this.current && this.current !== next) this.current.stop();
      next.play();
    }
    this.current = next;
    this.onDone = then;
  }

  // Walk somewhere (getting up first if sitting or lying), then run `then`.
  goTo(point, then = null) {
    this.leave(() => this.walk(point, then));
  }

  walk(point, then) {
    this.path = this.home.grid.path(this.position, point);
    this.afterWalk = then;
    this.state = 'walk';
    const clip = this.body.clips[this.walkClip] ? this.walkClip : 'Walk_Loop';
    this.walkSpeed = this.body.clips[clip].userData.speed || 1.1;
    this.play(clip, { fade: 0.2 });
  }

  // Reserve the thing now (so nobody else heads for it), get up from the last one, then go and use it.
  // `how` (game/life.mjs): the game directs it — `how.clip` plays until the game calls finish(), and `how.started()`
  // runs when the Sim gets there and begins. Without it, the spike's own timing and moods.
  use(item, how = null) {
    if (item.user && item.user !== this) return false;
    if (item === this.using && !how) return true;
    item.user = this;
    this.leave(() => {
      this.how = how;
      this.using = item;
      item.user = this;
      this.label = item.use.label;
      this.walk(item.spot, () => this.turnTo(item.facing, () => this.perform(item)));
    });
    return true;
  }

  // The face that goes with an activity: chores neutral, treats and dancing happy, a meeting means talking.
  feel(item) {
    const label = item?.use?.label ?? '';
    const r = Math.random();
    this.chatty = /Meeting|bench|Relax|Watch TV/.test(label);
    this.face.mood =
      item?.use?.act === 'sleep' ? 'asleep'
      : item?.use?.act === 'dance' || /flowers|ducks|snack|Eat/.test(label) ? 'happy'
      : /Work|papers|file/i.test(label) ? (r < 0.15 ? 'sleepy' : r < 0.25 ? 'angry' : 'neutral')
      : r < 0.45 ? 'happy' : r < 0.55 ? 'surprised' : r < 0.65 ? 'sad' : 'neutral';
  }

  perform(item) {
    const how = this.how;
    const act = how?.act ?? item.use.act;
    this.state = act;
    if (how) {
      if (act === 'sit') this.play('Sitting_Enter', { once: true, fade: 0.15, then: () => this.play(how.clip ?? 'Sitting_Idle_Loop', { fade: 0.3 }) });
      else if (act === 'sleep') this.lieDown(item);
      else this.play(how.clip ?? (act === 'dance' ? 'Dance_Loop' : 'Interact'), { fade: 0.3 });
      how.started?.();
      return;
    }
    this.feel(item);
    if (act === 'sit') this.play('Sitting_Enter', { once: true, fade: 0.15, then: () => this.play('Sitting_Idle_Loop', { fade: 0.3 }) });
    else if (act === 'sleep') this.lieDown(item);
    else if (act === 'dance') this.play('Dance_Loop', { fade: 0.3 });
    else if (act === 'pickup') this.play('PickUp_Table', { once: true, then: () => this.finish() });
    else this.play('Interact', { once: true, then: () => this.play('Interact', { once: true, fade: 0.1, then: () => this.finish() }) });
  }

  // No sleeping clip in the free library: lie the standing idle down on the mattress, slowed to breathing.
  // The body's up runs to the headboard, its face to the ceiling.
  lieDown(item) {
    const { head, feet, top } = item.bed;
    const faceUp = new THREE.Vector3(0, 1, 0);
    const left = new THREE.Vector3().crossVectors(head, faceUp);
    this.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(left, head, faceUp));
    this.group.position.copy(feet).setY(top * 0.78 + 0.1);
    this.settleHair();
    this.play('Idle_Loop', { fade: 0, timeScale: 0.35 });
  }

  // Something done where the Sim stands (a phone call, a stretch): up from the last thing first. game/life.mjs ends
  // it with finish().
  doHere(clip, started) {
    this.leave(() => {
      this.state = 'self';
      this.play(clip, { fade: 0.3 });
      started?.();
    });
  }

  finish() {
    this.chatty = false;
    this.release();
    this.state = 'idle';
    this.idleFor = 0;
    this.play('Idle_Loop', { fade: 0.3 });
  }

  release() {
    if (this.using?.user === this) this.using.user = null;
    this.using = null;
    this.label = null;
    this.how = null;
  }

  // Get up from whatever the Sim is doing, then `then`.
  leave(then) {
    const was = this.state;
    if (was === 'sit') {
      this.state = 'standing-up';
      this.play('Sitting_Exit', { once: true, fade: 0.15, then: () => (this.release(), then()) });
    } else if (was === 'sleep') {
      this.group.rotation.set(0, this.using.facing, 0);
      this.group.position.copy(this.using.spot);
      this.settleHair();
      this.release();
      then();
    } else if (was === 'standing-up') {
      const prev = this.onDone;
      this.onDone = () => (prev?.(), then());
    } else {
      this.release();
      then();
    }
  }

  // Takes the Sim out of the world. A clone frees its own (recoloured) materials; shared geometry stays with the base.
  dispose() {
    this.release();
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.body.outer);
    this.group.removeFromParent();
    this.blob?.removeFromParent();
    for (const m of this.body.own ?? []) m.dispose();
  }

  // A VRM's hair is springs: after the body jumps (lying down, getting up) they whip unless reset where it landed.
  settleHair() {
    if (!this.body.vrm?.springBoneManager) return;
    this.group.updateMatrixWorld(true);
    this.body.vrm.springBoneManager.reset();
  }

  turnTo(angle, then) {
    this.state = 'turn';
    this.turnGoal = angle;
    this.afterTurn = then;
  }

  update(dt, sims) {
    this.mixer.update(dt);
    if (this.standIn && (this.standIn.left -= dt) <= 0) {
      const then = this.standIn.then;
      this.standIn = null;
      then?.();
    }
    if (this.state === 'walk') {
      const target = this.path[0];
      if (!target) {
        this.state = 'arrived';
        this.play('Idle_Loop', { fade: 0.2 });
        const then = this.afterWalk;
        this.afterWalk = null;
        if (then) then();
        else this.state = 'idle';
      } else {
        const to = target.clone().sub(this.position).setY(0);
        const dist = to.length();
        const step = this.walkSpeed * dt;
        this.faceToward(Math.atan2(to.x, to.z), dt);
        if (dist <= step) {
          this.position.copy(target).setY(0);
          this.path.shift();
        } else this.position.addScaledVector(to.normalize(), step);
      }
    } else if (this.state === 'turn') {
      if (this.faceToward(this.turnGoal, dt)) {
        this.state = 'acting';
        const then = this.afterTurn;
        this.afterTurn = null;
        then?.();
      }
    } else if (this.state === 'idle' && this.freeWill) {
      this.idleFor += dt;
      if (this.idleFor > 2 + (this.id % 3)) this.wander(sims);
    } else if (this.freeWill && ['sit', 'dance', 'sleep'].includes(this.state)) {
      this.idleFor += dt;
      if (this.idleFor > 6 + (this.id % 4)) this.wander(sims);
    }
    this.body.vrm?.update(dt);
    // The face after vrm.update(): three-vrm resets the expression morphs it owns every frame.
    if (this.moodOverride) this.face.mood = this.moodOverride;
    if (this.talkOverride) this.face.talking = true;
    else if (this.chatty && this.state !== 'walk') {
      this.talkTimer -= dt;
      if (this.talkTimer <= 0) (this.face.talking = !this.face.talking), (this.talkTimer = 1.5 + Math.random() * 2.5);
    } else this.face.talking = false;
    this.face.update(dt);
    if (this.blob) {
      this.blob.visible = this.group.visible && this.state !== 'sleep';
      this.blob.position.set(this.position.x, 0.012, this.position.z);
      this.blob.updateMatrix();
    }
  }

  // Free will, version zero: something nobody is using, or a free spot on the floor.
  wander() {
    this.idleFor = 0;
    const free = this.home.items.filter((i) => i.use && !i.user);
    if (free.length && Math.random() < 0.7) {
      this.use(free[Math.floor(Math.random() * free.length)]);
      return;
    }
    const { w, d } = this.home.bounds;
    for (let i = 0; i < 20; i++) {
      const p = new THREE.Vector3((Math.random() - 0.5) * (w - 1), 0, (Math.random() - 0.5) * (d - 1));
      if (this.home.grid.free(p)) return this.goTo(p, () => this.finish());
    }
  }

  // Turns toward `angle`; true once facing it.
  faceToward(angle, dt) {
    let d = angle - this.group.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const step = TURN_SPEED * dt;
    if (Math.abs(d) <= step) {
      this.group.rotation.y = angle;
      return true;
    }
    this.group.rotation.y += Math.sign(d) * step;
    return false;
  }
}
