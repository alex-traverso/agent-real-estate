import type { Transition, Variants } from "motion/react";

/**
 * The panel's motion vocabulary. Three springs, one stagger — anything that
 * moves picks from here rather than inventing its own timing, so the whole
 * product settles at the same rate.
 *
 * Springs, not fixed-duration easings: a spring animates from wherever the
 * element currently is, so a transition can be interrupted and redirected
 * without the visible jump a keyframe animation produces. `bounce: 0` is
 * critically damped — no overshoot — and is the default, because overshoot on
 * something that merely appeared (a menu, a toast) reads as wrong. Bounce is
 * reserved for motion that followed a real gesture.
 */

/** Default for everything: appears, dismisses, layout shifts, hovers. */
export const springDefault: Transition = {
  type: "spring",
  bounce: 0,
  duration: 0.4,
};

/** Only after a gesture carried momentum — a dragged sheet, a flicked card. */
export const springMomentum: Transition = {
  type: "spring",
  bounce: 0.2,
  duration: 0.4,
};

/** Sheets and drawers: slightly faster, a trace of bounce on arrival. */
export const springSheet: Transition = {
  type: "spring",
  bounce: 0.15,
  duration: 0.3,
};

/** Reduced-motion equivalent: cross-fade, never travel. */
export const fadeOnly: Transition = {
  duration: 0.15,
  ease: "easeOut",
};

/** Delay between siblings in a staggered reveal, in seconds. */
export const REVEAL_STAGGER = 0.035;

/** How far a revealing element travels, in pixels. */
export const REVEAL_DISTANCE = 8;

/**
 * Variants for a list or grid whose children reveal in sequence. Pass
 * `reduced` from `useReducedMotion()` so the travel and the stagger both
 * collapse when the user has asked for less motion.
 */
export function revealVariants(reduced: boolean): {
  container: Variants;
  item: Variants;
} {
  return {
    container: {
      hidden: {},
      visible: {
        transition: { staggerChildren: reduced ? 0 : REVEAL_STAGGER },
      },
    },
    item: {
      hidden: { opacity: 0, y: reduced ? 0 : REVEAL_DISTANCE },
      visible: {
        opacity: 1,
        y: 0,
        transition: reduced ? fadeOnly : springDefault,
      },
    },
  };
}
