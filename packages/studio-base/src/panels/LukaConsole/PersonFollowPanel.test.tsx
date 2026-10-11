/** @jest-environment jsdom */
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/
import { act, fireEvent, render, screen } from "@testing-library/react";
import { PanelExtensionContext } from "@foxglove/studio";
import PersonFollowPanel from "./PersonFollowPanel";

describe("native person-follow GUI", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  it("renders waiting gates then routes preview buttons without any velocity publisher", async () => {
    const callService = jest.fn().mockResolvedValue({ success: true, message: "ok" });
    const publish = jest.fn(),
      advertise = jest.fn();
    const context = {
      subscribe: jest.fn(),
      unsubscribeAll: jest.fn(),
      watch: jest.fn(),
      callService,
      publish,
      advertise,
    } as unknown as PanelExtensionContext;
    const view = render(<PersonFollowPanel context={context} />);
    expect(screen.getByRole("button", { name: "启动感知预览（算法关闭）" })).toHaveProperty("disabled", true);
    act(() => {
      context.onRender?.(
        {
          currentFrame: [
            {
              topic: "/person_follow/gui/state",
              message: {
                data: JSON.stringify({
                  output_mode: "dry_run",
                  follow_status: "DISABLED",
                  diagnostic: "",
                  production_ready: false,
                  live_verified: false,
                  camera_fresh: true,
                  mot_fresh: false,
                  targets: [],
                  owned_preview: false,
                  error: "",
                }),
              },
            },
          ],
        } as never,
        jest.fn(),
      );
      jest.advanceTimersByTime(250);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "启动感知预览（算法关闭）" }));
    });
    expect(callService).toHaveBeenCalledWith("/person_follow/gui/start_preview", {});
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "启用 dry-run 观察" }));
    });
    expect(callService).toHaveBeenCalledWith("/person_follow/gui/enable_observation", {});
    expect(screen.getByRole("button", { name: "放行底盘跟随（可能运动）" })).toHaveProperty("disabled", true);
    expect(publish).not.toHaveBeenCalled();
    expect(advertise).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(3000));
    expect(screen.getByRole("button", { name: "启用 dry-run 观察" })).toHaveProperty("disabled", true);
    view.unmount();
  });
});

