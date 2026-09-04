/**
 * The mouse captor: DOM pointer events to the renderer's own (github#58, step 3.5).
 *
 * Ported from sigma 3.0.2's MouseCaptor (MIT), minus what the page never used: touch, and the
 * default double-click zoom (page.js prevents it on every double click and calls fit()
 * instead, so it never happened). What stays is exactly the gesture grammar the page and the
 * suite were written against:
 *
 * - a CLICK is a click only if fewer than `draggedEventsTolerance` (3) moves happened while
 *   the button was down; two clicks inside `doubleClickTimeout` (300 ms) are a double click and
 *   not two clicks;
 * - DRAG-TO-PAN moves the camera by the framed-graph distance the pointer travelled, then on
 *   release glides on by `inertiaRatio` (3) times the last step over `inertiaDuration` (200 ms,
 *   quadraticOut); the drag is tracked on the DOCUMENT, so a pointer that leaves the stage
 *   mid-drag keeps panning, which is what `mousemovebody` is for;
 * - the WHEEL zooms toward the pointer by `zoomingRatio` per notch over `zoomDuration`
 *   (quadraticOut), and notches in the same direction closer than a fifth of that are dropped
 *   so a fast scroll does not queue a dozen tweens;
 * - a listener that calls `preventDefault()` on the payload stops the pan or the zoom for that
 *   event. page.js does it in its node drag and on double click.
 *
 * Every timer is the window's the view lives in.
 */

import type { Camera } from "./camera";
import { Emitter } from "./emitter";
import type { CameraState, MouseCaptor as MouseCaptorApi, MouseCoords, Point } from "./types";

/** The payload with the flag the captor reads back after emitting. */
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

/** What the captor needs from the renderer, and nothing more. */
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

function getPosition(e: MouseEvent, dom: HTMLElement): Point {
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

function getWheelDelta(e: WheelEvent): number {
  return (e.deltaY * -3) / 360;
}

export class MouseCaptor extends Emitter<CaptorEvents> implements MouseCaptorApi {
  draggedEvents = 0;
  isMoving = false;
  currentWheelDirection = 0;

  private lastMouseX: number | null = null;
  private lastMouseY: number | null = null;
  private isMouseDown = false;
  private movingTimeout: number | null = null;
  private clicks = 0;
  private doubleClickTimeout: number | null = null;
  private lastWheelTriggerTime: number | null = null;
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
    // No click after a drag.
    if (this.draggedEvents < DRAGGED_EVENTS_TOLERANCE) this.emit("click", getMouseCoords(e, this.container));
  };

  private readonly handleRightClick = (e: MouseEvent): void => {
    this.emit("rightClick", getMouseCoords(e, this.container));
  };

  private readonly handleDown = (e: MouseEvent): void => {
    // Only the left button starts a drag.
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
    const previous = camera.getPreviousState();
    if (this.isMoving) {
      camera.animate({
        x: cameraState.x + INERTIA_RATIO * (cameraState.x - previous.x),
        y: cameraState.y + INERTIA_RATIO * (cameraState.y - previous.y),
      }, { duration: INERTIA_DURATION, easing: "quadraticOut" });
    } else if (this.lastMouseX !== x || this.lastMouseY !== y) {
      camera.setState({ x: cameraState.x, y: cameraState.y });
    }
    this.isMoving = false;
    // The drag count is cleared a tick later, so the click this same release fires can still
    // see that it followed a drag.
    this.win.setTimeout(() => {
      this.draggedEvents = 0;
    }, 0);
    this.emit("mouseup", getMouseCoords(e, this.container));
  };

  private readonly handleMove = (e: MouseEvent): void => {
    const coords = getMouseCoords(e, this.container);
    // Always, so a drag that left the stage can still be followed.
    this.emit("mousemovebody", coords);
    // Only over the stage itself, so nothing gets hovered from outside it.
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
      const camera = this.host.getCamera();
      const { x: eX, y: eY } = getPosition(e, this.container);
      const lastMouse = this.host.viewportToFramedGraph({ x: this.lastMouseX ?? eX, y: this.lastMouseY ?? eY });
      const mouse = this.host.viewportToFramedGraph({ x: eX, y: eY });
      const cameraState = camera.getState();
      camera.setState({ x: cameraState.x + (lastMouse.x - mouse.x), y: cameraState.y + (lastMouse.y - mouse.y) });
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
    // Against a clamp there is nothing to do, and the page may scroll.
    if (currentRatio === newRatio) return;
    e.preventDefault();
    e.stopPropagation();
    // Notches too close together in the same direction are dropped.
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
    if (this.movingTimeout !== null) this.win.clearTimeout(this.movingTimeout);
    if (this.doubleClickTimeout !== null) this.win.clearTimeout(this.doubleClickTimeout);
    this.removeAllListeners();
  }

  private handleDoubleClick(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    // Emitted, and that is all: the default zoom-on-double-click is not here, because the
    // page prevented it on every double click and fit() instead.
    this.emit("doubleClick", getMouseCoords(e, this.container));
  }
}
