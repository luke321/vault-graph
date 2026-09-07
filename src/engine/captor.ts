// github#58

import type { Camera } from "./camera";
import { Emitter } from "./emitter";
import type { CameraState, MouseCaptor as MouseCaptorApi, MouseCoords, Point } from "./types";

export interface Coords extends MouseCoords {
  defaultPrevented: boolean;
}

export interface WheelCoords extends Coords {
  delta: number;
}

export interface CaptorEvents {
  click: Coords;
  rightClick: Coords;
  doubleClick: Coords;
  mousedown: Coords;
  mouseup: Coords;
  mousemove: Coords;
  mousemovebody: Coords;
  mouseleave: Coords;
  mouseenter: Coords;
  wheel: WheelCoords;
}

export interface CaptorHost {
  getCamera(): Camera;
  viewportToFramedGraph(p: Point): Point;
  getViewportZoomedState(viewportTarget: Point, newRatio: number): CameraState;
  readonly zoomingRatio: number;
  readonly zoomDuration: number;
}

const DOUBLE_CLICK_TIMEOUT = 300;
const DRAG_TIMEOUT = 100;
const DRAGGED_EVENTS_TOLERANCE = 3;
const INERTIA_DURATION = 200;
const INERTIA_RATIO = 3;
// github#73
const TOUCH_TAP_SLOP_PX = 10;

function getPosition(e: { clientX: number; clientY: number }, dom: HTMLElement): Point {
  const bbox = dom.getBoundingClientRect();
  return { x: e.clientX - bbox.left, y: e.clientY - bbox.top };
}

function getMouseCoords(e: MouseEvent, dom: HTMLElement): Coords {
  const res: Coords = {
    ...getPosition(e, dom),
    defaultPrevented: false,
    preventDefault: () => {
      res.defaultPrevented = true;
    },
    original: e,
  };
  return res;
}

// github#73
function getTouchCoords(e: TouchEvent, at: Point): Coords {
  const res: Coords = {
    ...at,
    defaultPrevented: false,
    fat: true,
    preventDefault: () => {
      res.defaultPrevented = true;
    },
    original: e,
  };
  return res;
}

// github#73
function touchPoints(e: TouchEvent, dom: HTMLElement): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < e.touches.length && i < 2; i++) out.push(getPosition(e.touches[i], dom));
  return out;
}

const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const spread = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

function getWheelDelta(e: WheelEvent): number {
  return (e.deltaY * -3) / 360;
}

export class MouseCaptor extends Emitter<CaptorEvents> implements MouseCaptorApi {
  private draggedEvents = 0;
  private isMoving = false;
  private currentWheelDirection = 0;
  private lastMouseX: number | null = null;
  private lastMouseY: number | null = null;
  private isMouseDown = false;
  private movingTimeout: number | null = null;
  private clicks = 0;
  private doubleClickTimeout: number | null = null;
  private lastWheelTriggerTime: number | null = null;
  // github#73
  private touchStart: Point | null = null;
  private lastTouch: Point | null = null;
  private touchMoved = false;
  private pinchSpread: number | null = null;
  private pinchRatio = 1;
  private taps = 0;
  private tapTimeout: number | null = null;
  private readonly doc: Document;

  private readonly handleClick = (e: MouseEvent): void => {
    this.clicks++;
    if (this.clicks === 2) {
      this.clicks = 0;
      if (this.doubleClickTimeout !== null) {
        this.win.clearTimeout(this.doubleClickTimeout);
        this.doubleClickTimeout = null;
      }
      this.handleDoubleClick(e);
      return;
    }
    this.doubleClickTimeout = this.win.setTimeout(() => {
      this.clicks = 0;
      this.doubleClickTimeout = null;
    }, DOUBLE_CLICK_TIMEOUT);
    if (this.draggedEvents < DRAGGED_EVENTS_TOLERANCE) this.emit("click", getMouseCoords(e, this.container));
  };

  private readonly handleRightClick = (e: MouseEvent): void => {
    this.emit("rightClick", getMouseCoords(e, this.container));
  };

  private readonly handleDown = (e: MouseEvent): void => {
    if (e.button === 0) {
      const { x, y } = getPosition(e, this.container);
      this.lastMouseX = x;
      this.lastMouseY = y;
      this.draggedEvents = 0;
      this.isMouseDown = true;
    }
    this.emit("mousedown", getMouseCoords(e, this.container));
  };

  private readonly handleUp = (e: MouseEvent): void => {
    if (!this.isMouseDown) return;
    const camera = this.host.getCamera();
    this.isMouseDown = false;
    if (this.movingTimeout !== null) {
      this.win.clearTimeout(this.movingTimeout);
      this.movingTimeout = null;
    }
    const { x, y } = getPosition(e, this.container);
    const cameraState = camera.getState();
    if (this.isMoving) {
      this.glide();
    } else if (this.lastMouseX !== x || this.lastMouseY !== y) {
      camera.setState({ x: cameraState.x, y: cameraState.y });
    }
    this.isMoving = false;
    this.win.setTimeout(() => {
      this.draggedEvents = 0;
    }, 0);
    this.emit("mouseup", getMouseCoords(e, this.container));
  };

  private readonly handleMove = (e: MouseEvent): void => {
    const coords = getMouseCoords(e, this.container);
    this.emit("mousemovebody", coords);
    if (e.target === this.container || e.composedPath()[0] === this.container) this.emit("mousemove", coords);
    if (coords.defaultPrevented) return;

    if (this.isMouseDown) {
      this.isMoving = true;
      this.draggedEvents++;
      if (this.movingTimeout !== null) this.win.clearTimeout(this.movingTimeout);
      this.movingTimeout = this.win.setTimeout(() => {
        this.movingTimeout = null;
        this.isMoving = false;
      }, DRAG_TIMEOUT);
      const { x: eX, y: eY } = getPosition(e, this.container);
      this.panFrom({ x: this.lastMouseX ?? eX, y: this.lastMouseY ?? eY }, { x: eX, y: eY });
      this.lastMouseX = eX;
      this.lastMouseY = eY;
      e.preventDefault();
      e.stopPropagation();
    }
  };

  private readonly handleLeave = (e: MouseEvent): void => {
    this.emit("mouseleave", getMouseCoords(e, this.container));
  };

  private readonly handleEnter = (e: MouseEvent): void => {
    this.emit("mouseenter", getMouseCoords(e, this.container));
  };

  private readonly handleWheel = (e: WheelEvent): void => {
    const camera = this.host.getCamera();
    if (!camera.enabledZooming) return;
    const delta = getWheelDelta(e);
    if (!delta) return;
    const coords: WheelCoords = { ...getMouseCoords(e, this.container), delta };
    this.emit("wheel", coords);
    if (coords.defaultPrevented) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const currentRatio = camera.getState().ratio;
    const ratioDiff = delta > 0 ? 1 / this.host.zoomingRatio : this.host.zoomingRatio;
    const newRatio = camera.getBoundedRatio(currentRatio * ratioDiff);
    const wheelDirection = delta > 0 ? 1 : -1;
    const now = Date.now();
    if (currentRatio === newRatio) return;
    e.preventDefault();
    e.stopPropagation();
    if (this.currentWheelDirection === wheelDirection && this.lastWheelTriggerTime !== null &&
        now - this.lastWheelTriggerTime < this.host.zoomDuration / 5) {
      return;
    }
    camera.animate(
      this.host.getViewportZoomedState(getPosition(e, this.container), newRatio),
      { easing: "quadraticOut", duration: this.host.zoomDuration },
      () => {
        this.currentWheelDirection = 0;
      },
    );
    this.currentWheelDirection = wheelDirection;
    this.lastWheelTriggerTime = now;
  };

  /* ------------------------------------------------------------------ touch
   * github#73, design/0013
   */

  private readonly handleTouchStart = (e: TouchEvent): void => {
    e.preventDefault();
    const pts = touchPoints(e, this.container);
    if (!pts.length) return;
    this.touchMoved = false;
    this.touchStart = pts[0];
    this.lastTouch = pts[0];
    if (pts.length > 1) {
      this.pinchSpread = spread(pts[0], pts[1]);
      this.pinchRatio = this.host.getCamera().getState().ratio;
    } else {
      this.pinchSpread = null;
    }
  };

  private readonly handleTouchMove = (e: TouchEvent): void => {
    e.preventDefault();
    const pts = touchPoints(e, this.container);
    if (!pts.length) return;

    if (pts.length > 1) {
      const now = spread(pts[0], pts[1]);
      if (this.pinchSpread === null || this.pinchSpread <= 0) {
        this.pinchSpread = now;
        this.pinchRatio = this.host.getCamera().getState().ratio;
      } else if (now > 0) {
        this.touchMoved = true;
        this.zoomAbout(midpoint(pts[0], pts[1]), this.pinchRatio * (this.pinchSpread / now));
      }
      this.lastTouch = midpoint(pts[0], pts[1]);
      return;
    }

    // design/0013
    if (this.pinchSpread !== null) {
      this.pinchSpread = null;
      this.lastTouch = pts[0];
      return;
    }

    const prev = this.lastTouch ?? pts[0];
    if (this.touchStart && spread(this.touchStart, pts[0]) > TOUCH_TAP_SLOP_PX) this.touchMoved = true;
    this.panFrom(prev, pts[0]);
    this.lastTouch = pts[0];
    this.isMoving = true;
    if (this.movingTimeout !== null) this.win.clearTimeout(this.movingTimeout);
    this.movingTimeout = this.win.setTimeout(() => {
      this.movingTimeout = null;
      this.isMoving = false;
    }, DRAG_TIMEOUT);
  };

  private readonly handleTouchEnd = (e: TouchEvent): void => {
    e.preventDefault();
    if (e.touches.length) {
      // design/0013
      const pts = touchPoints(e, this.container);
      this.lastTouch = pts.length > 1 ? midpoint(pts[0], pts[1]) : (pts[0] ?? this.lastTouch);
      this.pinchSpread = pts.length > 1 ? spread(pts[0], pts[1]) : null;
      if (pts.length > 1) this.pinchRatio = this.host.getCamera().getState().ratio;
      return;
    }

    const at = this.lastTouch;
    const moved = this.touchMoved;
    this.touchStart = null;
    this.lastTouch = null;
    this.pinchSpread = null;
    this.touchMoved = false;

    if (this.movingTimeout !== null) {
      this.win.clearTimeout(this.movingTimeout);
      this.movingTimeout = null;
    }
    if (this.isMoving) {
      this.isMoving = false;
      this.glide();
      return;
    }
    this.isMoving = false;
    if (moved || !at) return;

    this.taps++;
    if (this.taps === 2) {
      this.taps = 0;
      if (this.tapTimeout !== null) {
        this.win.clearTimeout(this.tapTimeout);
        this.tapTimeout = null;
      }
      this.emit("doubleClick", getTouchCoords(e, at));
      return;
    }
    this.tapTimeout = this.win.setTimeout(() => {
      this.taps = 0;
      this.tapTimeout = null;
    }, DOUBLE_CLICK_TIMEOUT);
    this.emit("click", getTouchCoords(e, at));
  };

  private readonly handleTouchCancel = (): void => {
    this.touchStart = null;
    this.lastTouch = null;
    this.pinchSpread = null;
    this.touchMoved = false;
    this.isMoving = false;
    if (this.movingTimeout !== null) {
      this.win.clearTimeout(this.movingTimeout);
      this.movingTimeout = null;
    }
  };

  constructor(
    private readonly container: HTMLElement,
    private readonly host: CaptorHost,
    private readonly win: Window,
  ) {
    super();
    this.doc = container.ownerDocument;
    container.addEventListener("click", this.handleClick);
    container.addEventListener("contextmenu", this.handleRightClick);
    container.addEventListener("mousedown", this.handleDown);
    container.addEventListener("wheel", this.handleWheel);
    container.addEventListener("mouseleave", this.handleLeave);
    container.addEventListener("mouseenter", this.handleEnter);
    this.doc.addEventListener("mousemove", this.handleMove);
    this.doc.addEventListener("mouseup", this.handleUp);
    // github#73 -- non-passive: every handler preventDefaults
    container.addEventListener("touchstart", this.handleTouchStart, { passive: false });
    container.addEventListener("touchmove", this.handleTouchMove, { passive: false });
    container.addEventListener("touchend", this.handleTouchEnd, { passive: false });
    container.addEventListener("touchcancel", this.handleTouchCancel);
  }

  kill(): void {
    const c = this.container;
    c.removeEventListener("click", this.handleClick);
    c.removeEventListener("contextmenu", this.handleRightClick);
    c.removeEventListener("mousedown", this.handleDown);
    c.removeEventListener("wheel", this.handleWheel);
    c.removeEventListener("mouseleave", this.handleLeave);
    c.removeEventListener("mouseenter", this.handleEnter);
    this.doc.removeEventListener("mousemove", this.handleMove);
    this.doc.removeEventListener("mouseup", this.handleUp);
    // github#73
    c.removeEventListener("touchstart", this.handleTouchStart);
    c.removeEventListener("touchmove", this.handleTouchMove);
    c.removeEventListener("touchend", this.handleTouchEnd);
    c.removeEventListener("touchcancel", this.handleTouchCancel);
    if (this.movingTimeout !== null) this.win.clearTimeout(this.movingTimeout);
    if (this.doubleClickTimeout !== null) this.win.clearTimeout(this.doubleClickTimeout);
    if (this.tapTimeout !== null) this.win.clearTimeout(this.tapTimeout);
    this.removeAllListeners();
  }

  private handleDoubleClick(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.emit("doubleClick", getMouseCoords(e, this.container));
  }

  /* -------------------------------------------------------- shared motion */

  private panFrom(prev: Point, next: Point): void {
    const camera = this.host.getCamera();
    const from = this.host.viewportToFramedGraph(prev);
    const to = this.host.viewportToFramedGraph(next);
    const state = camera.getState();
    camera.setState({ x: state.x + (from.x - to.x), y: state.y + (from.y - to.y) });
  }

  private glide(): void {
    const camera = this.host.getCamera();
    const state = camera.getState();
    const previous = camera.getPreviousState();
    camera.animate({
      x: state.x + INERTIA_RATIO * (state.x - previous.x),
      y: state.y + INERTIA_RATIO * (state.y - previous.y),
    }, { duration: INERTIA_DURATION, easing: "quadraticOut" });
  }

  private zoomAbout(target: Point, ratio: number): void {
    const camera = this.host.getCamera();
    if (!camera.enabledZooming) return;
    const bounded = camera.getBoundedRatio(ratio);
    if (bounded === camera.getState().ratio) return;
    camera.setState(this.host.getViewportZoomedState(target, bounded));
  }
}
