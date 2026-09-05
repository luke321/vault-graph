// github#58, github#4

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

  kill(): void {
    if (this.nextFrame !== null) this.win.cancelAnimationFrame(this.nextFrame);
    this.nextFrame = null;
    this.animationCallback = undefined;
    this.removeAllListeners();
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
      if (this.animationCallback) this.animationCallback();
      this.nextFrame = this.win.requestAnimationFrame(step);
    } else {
      step();
    }
    this.animationCallback = done;
  }
}
