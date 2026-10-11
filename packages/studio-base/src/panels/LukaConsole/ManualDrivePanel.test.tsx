/** @jest-environment jsdom */
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/
import { act, fireEvent, render, screen } from "@testing-library/react";
import { PanelExtensionContext } from "@foxglove/studio";
import ManualDrivePanel from "./ManualDrivePanel";

jest.mock("../Teleop/DirectionalPad", () => ({
  __esModule: true,
  DirectionalPadAction: { UP: 0, DOWN: 1, LEFT: 2, RIGHT: 3 },
  default: ({ disabled, onAction }: { disabled: boolean; onAction: (action?: number) => void }) => (
    <button disabled={disabled} onMouseDown={() => onAction(0)} onMouseUp={() => onAction()}>
      方向盘前进
    </button>
  ),
}));

test("manual panel holds beyond two seconds, stops on release and blocks stale state", async () => {
  jest.useFakeTimers();
  const publish = jest.fn(),
    callService = jest.fn().mockResolvedValue({ success: true });
  const context = {
    publish,
    callService,
    advertise: jest.fn(),
    unadvertise: jest.fn(),
    subscribe: jest.fn(),
    unsubscribeAll: jest.fn(),
    watch: jest.fn(),
  } as unknown as PanelExtensionContext;
  const view = render(<ManualDrivePanel context={context} />);
  const update = (enabled: boolean) =>
    act(() => {
      context.onRender?.(
        {
          currentFrame: [
            {
              topic: "/luka/manual/state",
              message: { data: JSON.stringify({ ready: true, enabled, reason: "ready" }) },
            },
          ],
        } as never,
        jest.fn(),
      );
      jest.advanceTimersByTime(100);
    });
  expect(screen.getByRole("button", { name: "方向盘前进" })).toHaveProperty("disabled", true);
  update(false);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "启用手动方向控制" })));
  expect(callService).toHaveBeenCalledWith("/luka/manual/enable", { data: true });
  expect(publish).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "方向盘前进" })).toHaveProperty("disabled", true);
  update(true);
  expect(screen.getByRole("button", { name: "方向盘前进" })).toHaveProperty("disabled", false);
  act(() => fireEvent.mouseDown(screen.getByRole("button", { name: "方向盘前进" })));
  expect(publish).toHaveBeenLastCalledWith("/cmd_vel", {
    linear: { x: 0.1, y: 0, z: 0 },
    angular: { x: 0, y: 0, z: 0 },
  });
  for (let i = 0; i < 55; i++) update(true);
  expect(publish.mock.calls.length).toBeGreaterThan(40);
  expect(publish.mock.calls.at(-1)?.[1].linear.x).toBe(0.1);
  act(() => fireEvent.mouseUp(screen.getByRole("button", { name: "方向盘前进" })));
  expect(publish.mock.calls.at(-1)?.[1].linear.x).toBe(0);
  act(() => fireEvent.mouseDown(screen.getByRole("button", { name: "方向盘前进" })));
  act(() => jest.advanceTimersByTime(700));
  expect(publish.mock.calls.at(-1)?.[1].linear.x).toBe(0);
  expect(screen.getByRole("button", { name: "方向盘前进" })).toHaveProperty("disabled", true);
  view.unmount();
  jest.useRealTimers();
});
