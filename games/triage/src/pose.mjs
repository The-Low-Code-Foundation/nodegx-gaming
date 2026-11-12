// Procedural posing on top of the clips, rig-agnostic: turn a bone so the bone after it points where we want, in world
// space. Used for the infected's limp arms, the crawl (arms reaching and pulling), the head that tracks the officer, and
// the wriggle of one with no limbs left. Call after the mixer has run for the frame.
import * as THREE from 'three';

const a = new THREE.Vector3(), b = new THREE.Vector3(), cur = new THREE.Vector3(), want = new THREE.Vector3();
const qDelta = new THREE.Quaternion(), qBone = new THREE.Quaternion(), qParent = new THREE.Quaternion(), qLocal = new THREE.Quaternion();

// Turn `bone` so the direction from it to `child` becomes `dir` (world), by `weight` (0..1). Updates the world matrices
// below `bone` so a second call on the child sees the new pose.
export function aimBone(bone, child, dir, weight = 1) {
  if (!bone || !child || !bone.parent) return;
  bone.getWorldPosition(a);
  child.getWorldPosition(b);
  cur.subVectors(b, a);
  if (cur.lengthSq() < 1e-10) return;
  cur.normalize();
  want.copy(dir).normalize();
  qDelta.setFromUnitVectors(cur, want);
  bone.getWorldQuaternion(qBone);
  bone.parent.getWorldQuaternion(qParent);
  qLocal.copy(qParent).invert().multiply(qDelta.multiply(qBone));
  bone.quaternion.slerp(qLocal, weight);
  bone.updateMatrixWorld(true);
}

// Two bones (upper arm, forearm) so the hand lands on `target` (world), the elbow bending towards `pole` (a direction).
export function reach(upper, lower, hand, target, pole, weight = 1) {
  if (!upper || !lower || !hand) return;
  const s = upper.getWorldPosition(new THREE.Vector3());
  const e = lower.getWorldPosition(new THREE.Vector3());
  const h = hand.getWorldPosition(new THREE.Vector3());
  const l1 = s.distanceTo(e), l2 = e.distanceTo(h);
  const to = new THREE.Vector3().subVectors(target, s);
  const d = Math.min(to.length(), (l1 + l2) * 0.98);
  to.normalize();
  // The elbow: on the circle where the two bones meet, on the pole's side.
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const up = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  const side = pole.clone().addScaledVector(to, -pole.dot(to));
  if (side.lengthSq() < 1e-6) side.set(0, 1, 0).addScaledVector(to, -to.y);
  side.normalize();
  const elbow = s.clone().addScaledVector(to, along).addScaledVector(side, up);
  aimBone(upper, lower, elbow.clone().sub(s), weight);
  const e2 = lower.getWorldPosition(new THREE.Vector3());
  aimBone(lower, hand, s.clone().addScaledVector(to, d).sub(e2), weight);
}
