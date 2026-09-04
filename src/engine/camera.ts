/**
 * The camera: where the view is, in Sigma's normalised space (github#58, step 3.1).
 *
 * Ported from sigma 3.0.2 (MIT). (0.5, 0.5) is the centre of the custom bbox, `ratio` is how
 * many framed units a viewport unit shows -- smaller is closer -- and `angle` is always 0:
 * rotation was off in the page and the field only survives because every state the suite
 * writes carries it. Three behaviours the page leans on are kept exactly:
 *
 * - `validateState` DROPS x AND y WHILE PANNING IS OFF. That is why page.js's fit() switches
 *   panning on for the flight home and off again in the callback -- with panning off, a state
 *   that carries x and y applies only its ratio (github#4).
 * - `updated` fires on every change, including each frame of an animate, and only when the
 *   state actually changed. page.js's camAtRest logic reads it that way.
 * - `animate` interrupted by another animate calls the interrupted one's callback at once,
 *   which is what lets fit()'s callback re-lock panning even when a wheel notch cuts in.
 *
 * Timers go through the window the view lives in, never the global: a popout window in
 * Obsidian has its own requestAnimationFrame, and the obsidianmd lint rule says so.
 */

import { Emitter } from "./emitter";
import type { Camera as CameraApi, CameraState } from "./types";
import { easings, type EasingName } from "./viewport";

export interface AnimateOptions {
  duration?: number;
  easing?: EasingName;
}

const ANIMATE_DEFAULTS: Required<AnimateOptions> = { easing: "quadraticInOut", duration: 150 };

export class Camera extends Emitter<{ updated: CameraState }> implements CameraApi {
  x = 0.5;
  y = 0.5;
  ratio = 1;
  readonly angle = 0;

  minRatio: number | null = null;
  maxRatio: number | null = null;
  enabledZooming = true;
  enabledPanning = true;

  private previousState: CameraState;
  private nextFrame: number | null = null;
  private animationCallback: (() => void) | undefined;

  constructor(private readonly win: Window) {
    super();
    this.previousState = this.getState();
  }

  getState(): CameraState {
    return { x: this.x, y: this.y, angle: this.angle, ratio: this.ratio };
  }

  hasState(state: CameraState): boolean {
    return this.x === state.x && this.y === state.y && this.ratio === state.ratio && this.angle === state.angle;
  }

  /** The state before the last setState -- what the captor's release inertia extrapolates from. */
  getPreviousState(): CameraState {
    const s = this.previousState;
    return { x: s.x, y: s.y, angle: s.angle, ratio: s.ratio };
  }

  getBoundedRatio(ratio: number): number {
    let r = ratio;
    if (typeof this.minRatio === "number") r = Math.max(r, this.minRatio);
    if (typeof this.maxRatio === "number") r = Math.min(r, this.maxRatio);
    return r;
  }

  /** What of a requested state is allowed to apply: x/y only while panning, ratio clamped. */
  validateState(state: Partial<CameraState>): Partial<CameraState> {
    const valid: Partial<CameraState> = {};
    if (this.enabledPanning && typeof state.x === "number") valid.x = state.x;
    if (this.enabledPanning && typeof state.y === "number") valid.y = state.y;
    if (this.enabledZooming && typeof state.ratio === "number") valid.ratio = this.getBoundedRatio(state.ratio);
    return valid;
  }

  setState(state: Partial<CameraState>): this {
    this.previousState = this.getState();
    const valid = this.validateState(state);
    if (typeof valid.x === "number") this.x = valid.x;
    if (typeof valid.y === "number") this.y = valid.y;
    if (typeof valid.ratio === "number") this.ratio = valid.ratio;
    if (!this.hasState(this.previousState)) this.emit("updated", this.getState());
    return this;
  }

  animate(state: Partial<CameraState>, opts: AnimateOptions = {}, done?: () => void): void {
    const options = { ...ANIMATE_DEFAULTS, ...opts };
    const valid = this.validateState(state);
    const easing = easings[options.easing];
    const start = Date.now();
    const initial = this.getState();

    const step = (): void => {
      const t = (Date.now() - start) / options.duration;
      if (t >= 1) {
        this.nextFrame = null;
        this.setState(valid);
        if (this.animationCallback) {
          const cb = this.animationCallback;
          this.animationCallback = undefined;
          cb();
        }
        return;
      }
      const k = easing(t);
      const next: Partial<CameraState> = {};
      if (typeof valid.x === "number") next.x = initial.x + (valid.x - initial.x) * k;
      if (typeof valid.y === "number") next.y = initial.y + (valid.y - initial.y) * k;
      if (typeof valid.ratio === "number") next.ratio = initial.ratio + (valid.ratio - initial.ratio) * k;
      this.setState(next);
      this.nextFrame = this.win.requestAnimationFrame(step);
    };

    if (this.nextFrame !== null) {
      this.win.cancelAnimationFrame(this.nextFrame);
      // The interrupted animation's callback runs now, as Sigma's did: a landing that never
      // comes would leave page.js's fit() waiting to re-lock panning.
      if (this.animationCallback) this.animationCallback();
      this.nextFrame = this.win.requestAnimationFrame(step);
    } else {
      step();
    }
    this.animationCallback = done;
  }
}
