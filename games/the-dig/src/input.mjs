// Keyboard + mouse and touch, turned into one set of intents the game reads each frame.
//
// The phone (landscape) shows as little as it can:
//   always: a small hotbar (top centre), Jump (bottom right), the pulse above it (round 7), the menu button (top right)
//   beside Jump, two buttons named for what is in hand (ACTIONS): the pick's Dig + Torch, rubble's Place + Dig, the
//   multitool's Fire + Aim, the hook's Fire; Use when you look at something usable
//   gestures: the left half is a floating move stick (push it to the rim to run); the right half only looks
//   in the menu: craft, the trophy case, sound, help
// The play-tester on the phone, 2026-11-02: round 1 dug on a thumb held still on the view and placed a torch on a quick tap,
// and auto-jumped at a step. The tap missed (a thumb drifts, a frame stalls), a button beside Fire "would make more
// sense", and the auto-jump did not clear the step: "Just keep the jump button bottom right, no auto jumping".
// Per item in hand: [the big button, the small one]. A press runs the action; dig and fire last while it is held.
export const ACTIONS = {
  pick: [{ act: 'dig', label: 'Dig' }, { act: 'torch', label: 'Flare' }],
  rubble: [{ act: 'place', label: 'Place' }, { act: 'dig', label: 'Dig' }],
  gun: [{ act: 'fire', label: 'Fire' }, { act: 'aim', label: 'Aim' }],
  hook: [{ act: 'fire', label: 'Fire' }, null]
};

export const touchDevice = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

export function makeInput(canvas, ui) {
  const I = {
    move: { x: 0, z: 0 }, look: { x: 0, y: 0 }, jump: false, sprint: false,
    primary: false, primaryDown: false, primaryUp: false, place: false, aim: false, use: false, pulse: false,
    slot: null, wheel: 0, craft: false, trophies: false, menu: false, hand: 'pick',
    locked: false, touch: touchDevice
  };
  const keys = new Set();

  // ── keyboard + mouse ──
  addEventListener('keydown', (e) => {
    if (ui.typing()) return;
    keys.add(e.code);
    if (e.code === 'KeyE') I.use = true;
    if (e.code === 'KeyF') I.place = 'torch';
    if (e.code === 'KeyC') I.craft = true;
    if (e.code === 'KeyQ') I.cycle = true;
    if (e.code === 'KeyT' || e.code === 'Tab') {
      I.trophies = true;
      e.preventDefault();
    }
    if (/^Digit[1-4]$/.test(e.code)) I.slot = Number(e.code.slice(5)) - 1;
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  canvas.addEventListener('mousedown', (e) => {
    if (touchDevice) return;
    if (!I.locked) {
      canvas.requestPointerLock?.();
      return;
    }
    if (e.button === 0) {
      I.primary = true;
      I.primaryDown = true;
      I.downAt = performance.now();
    }
    if (e.button === 2) {
      I.place = 'held';
      I.aim = true;
    }
  });
  addEventListener('mouseup', (e) => {
    if (e.button === 0 && I.primary) {
      I.primary = false;
      I.primaryUp = true;
      I.upAt = performance.now();
    }
    if (e.button === 2) I.aim = false;
  });
  addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('mousemove', (e) => {
    if (!I.locked) return;
    I.look.x += e.movementX * 0.0022;
    I.look.y += e.movementY * 0.0022;
  });
  addEventListener('wheel', (e) => {
    if (I.locked) I.wheel += Math.sign(e.deltaY);
  });
  document.addEventListener('pointerlockchange', () => {
    I.locked = document.pointerLockElement === canvas;
    if (!I.locked) {
      I.primary = false;
      I.aim = false;
      keys.clear();
    }
    ui.lockChanged(I.locked);
  });

  // ── touch ──
  const stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
  const looker = { id: null, x: 0, y: 0 };
  const R = 56;
  if (touchDevice) {
    const zone = ui.touchZone;
    zone.addEventListener('touchstart', (e) => {
      ui.unlockAudio();
      for (const t of e.changedTouches) {
        if (t.clientX < innerWidth * 0.42 && stick.id === null) {
          Object.assign(stick, { id: t.identifier, ox: t.clientX, oy: t.clientY, x: 0, y: 0 });
          ui.stick(true, t.clientX, t.clientY, 0, 0);
        } else if (looker.id === null) {
          Object.assign(looker, { id: t.identifier, x: t.clientX, y: t.clientY });
        }
      }
      e.preventDefault();
    }, { passive: false });
    zone.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stick.id) {
          let dx = t.clientX - stick.ox, dy = t.clientY - stick.oy;
          const d = Math.hypot(dx, dy);
          if (d > R) {
            // Drag the stick's origin along, so the thumb never runs off it.
            stick.ox += (dx / d) * (d - R);
            stick.oy += (dy / d) * (d - R);
            dx = t.clientX - stick.ox;
            dy = t.clientY - stick.oy;
          }
          stick.x = dx / R;
          stick.y = dy / R;
          ui.stick(true, stick.ox, stick.oy, dx, dy);
        } else if (t.identifier === looker.id) {
          const dx = t.clientX - looker.x, dy = t.clientY - looker.y;
          I.look.x += dx * 0.0055;
          I.look.y += dy * 0.0055;
          looker.x = t.clientX;
          looker.y = t.clientY;
        }
      }
      e.preventDefault();
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stick.id) {
          stick.id = null;
          stick.x = stick.y = 0;
          ui.stick(false);
        } else if (t.identifier === looker.id) {
          looker.id = null;
        }
      }
      e.preventDefault();
    };
    zone.addEventListener('touchend', end, { passive: false });
    zone.addEventListener('touchcancel', end, { passive: false });

    // The few buttons. Each is held, not clicked, so a thumb can keep it down.
    const hold = (el, on, off) => {
      el.addEventListener('touchstart', (e) => {
        ui.unlockAudio();
        on(e.changedTouches[0]);
        e.preventDefault();
        e.stopPropagation();
      }, { passive: false });
      const up = (e) => {
        off?.();
        e.preventDefault();
        e.stopPropagation();
      };
      el.addEventListener('touchend', up, { passive: false });
      el.addEventListener('touchcancel', up, { passive: false });
    };
    hold(ui.buttons.jump, () => (I.jump = true), () => (I.jump = false));
    // The action is chosen when the thumb goes down, so the hand changing under a held button still lets go of it.
    // A held Dig or Fire also looks: dragging the thumb off the button turns the view, as the right half does (the play-tester,
    // 2026-11-02: "It's hard to clear blocks when holding 'dig' fixes the view").
    const action = (el, i) => {
      let held = null;
      const drag = { id: null, x: 0, y: 0 };
      el.addEventListener('touchmove', (e) => {
        for (const t of e.changedTouches) {
          if (t.identifier !== drag.id) continue;
          I.look.x += (t.clientX - drag.x) * 0.0055;
          I.look.y += (t.clientY - drag.y) * 0.0055;
          drag.x = t.clientX;
          drag.y = t.clientY;
        }
        e.preventDefault();
        e.stopPropagation();
      }, { passive: false });
      hold(el, (t) => {
        held = ACTIONS[I.hand]?.[i]?.act ?? null;
        Object.assign(drag, held === 'dig' || held === 'fire' ? { id: t.identifier, x: t.clientX, y: t.clientY } : { id: null });
        if (held === 'dig' || held === 'fire') {
          I.primary = true;
          I.primaryDown = true;
          I.downAt = performance.now();
        } else if (held === 'place') I.place = 'hand';
        else if (held === 'torch') I.place = 'torch';
        else if (held === 'aim') I.aimToggle = !I.aimToggle;
      }, () => {
        if (held === 'dig' || held === 'fire') {
          I.primary = false;
          I.primaryUp = true;
          I.upAt = performance.now();
        }
        held = null;
        drag.id = null;
      });
    };
    action(ui.buttons.fire, 0);
    action(ui.buttons.aim, 1);
    hold(ui.buttons.use, () => (I.use = true));
    // The pulse (round 7): held about a second, then let go to send; there whatever is in hand.
    hold(ui.buttons.pulse, () => (I.pulse = true), () => (I.pulse = false));
  }

  I.frame = (weaponInHand, handId) => {
    I.hand = handId;
    // Called once a frame before the game reads the intents.
    if (touchDevice) {
      I.move.x = stick.x;
      I.move.z = -stick.y;
      const mag = Math.hypot(stick.x, stick.y);
      I.sprint = mag > 0.95;
      if (mag > 1) {
        I.move.x /= mag;
        I.move.z /= mag;
      }
      I.aim = !!I.aimToggle && weaponInHand === 'gun';
    } else {
      I.move.x = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
      I.move.z = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
      I.jump = keys.has('Space');
      I.pulse = keys.has('KeyR');
      I.sprint = keys.has('ShiftLeft') || keys.has('ShiftRight') || keys.has('ControlLeft');
    }
  };
  I.consume = () => {
    I.look.x = I.look.y = 0;
    I.primaryDown = I.primaryUp = false;
    I.place = false;
    I.use = false;
    I.slot = null;
    I.wheel = 0;
    I.craft = I.trophies = I.menu = I.cycle = false;
  };
  I.release = () => {
    I.primary = false;
    I.aim = false;
    I.aimToggle = false;
    looker.id = null;
    stick.id = null;
    stick.x = stick.y = 0;
    ui.stick(false);
  };
  return I;
}
