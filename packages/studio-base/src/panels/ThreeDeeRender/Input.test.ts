/** @jest-environment jsdom */
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import * as THREE from "three";

import { Input } from "./Input";

describe("3D touch publishing", () => {
  let canvas: HTMLCanvasElement;
  let input: Input;
  let clicked: jest.Mock;

  function touch(type: string, points: number[][], changed = points) {
    const event = new Event(type, { cancelable: true });
    const touches = (values: number[][]) =>
      values.map(([clientX, clientY]) => ({ clientX, clientY }));
    Object.defineProperties(event, {
      touches: { value: touches(points) },
      changedTouches: { value: touches(changed) },
    });
    canvas.dispatchEvent(event);
  }

  beforeEach(() => {
    const parent = document.createElement("div");
    canvas = document.createElement("canvas");
    parent.appendChild(canvas);
    document.body.appendChild(parent);
    jest.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 100,
      y: 50,
      left: 100,
      top: 50,
      right: 500,
      bottom: 450,
      width: 400,
      height: 400,
      toJSON: () => ({}),
    });
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.z = 10;
    camera.updateMatrixWorld();
    input = new Input(canvas, () => camera);
    input.canvasSize.set(400, 400);
    clicked = jest.fn();
    input.on("click", clicked);
  });

  afterEach(() => {
    input.dispose();
    document.body.replaceChildren();
  });

  it("publishes one tap at canvas-relative and world coordinates", () => {
    expect(input.canvasSize).toEqual(new THREE.Vector2(400, 400));
    touch("touchstart", [[300, 250]]);
    touch("touchend", [], [[300, 250]]);
    expect(clicked).toHaveBeenCalledTimes(1);
    const [cursor, point] = clicked.mock.calls[0]!;
    expect(cursor).toEqual(new THREE.Vector2(200, 200));
    expect(point.x).toBeCloseTo(0);
    expect(point.y).toBeCloseTo(0);
    expect(point.z).toBeCloseTo(0);
    canvas.dispatchEvent(new MouseEvent("click", { clientX: 300, clientY: 250 }));
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it("accepts the small finger movement of a tap", () => {
    touch("touchstart", [[300, 250]]);
    touch("touchmove", [[304, 253]]);
    touch("touchend", [], [[304, 253]]);
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it("does not publish a drag even when the finger returns to its start", () => {
    touch("touchstart", [[300, 250]]);
    touch("touchmove", [[330, 250]]);
    touch("touchmove", [[300, 250]]);
    touch("touchend", [], [[300, 250]]);
    expect(clicked).not.toHaveBeenCalled();
  });

  it("does not publish a two-finger gesture", () => {
    touch("touchstart", [[300, 250]]);
    touch("touchstart", [
      [300, 250],
      [320, 270],
    ]);
    touch("touchend", [[300, 250]], [[320, 270]]);
    touch("touchend", [], [[300, 250]]);
    expect(clicked).not.toHaveBeenCalled();
  });

  it("clears a cancelled touch and accepts the next tap", () => {
    touch("touchstart", [[300, 250]]);
    touch("touchcancel", []);
    touch("touchend", [], [[300, 250]]);
    expect(clicked).not.toHaveBeenCalled();
    touch("touchstart", [[300, 250]]);
    touch("touchend", [], [[300, 250]]);
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it("preserves mouse clicks", () => {
    canvas.dispatchEvent(new MouseEvent("mousedown", { clientX: 300, clientY: 250 }));
    canvas.dispatchEvent(new MouseEvent("mouseup", { clientX: 300, clientY: 250 }));
    canvas.dispatchEvent(new MouseEvent("click", { clientX: 300, clientY: 250 }));
    expect(clicked).toHaveBeenCalledTimes(1);
  });
});
