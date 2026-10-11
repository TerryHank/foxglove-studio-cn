/** @jest-environment jsdom */
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/
import { act, fireEvent, render, screen } from "@testing-library/react";

import { PanelExtensionContext } from "@foxglove/studio";

import BusinessPanel from "./BusinessPanel";

describe("native business transport", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    Object.defineProperty(crypto, "randomUUID", {
      configurable: true,
      value: jest.fn(() => "test-id"),
    });
  });
  afterEach(() => jest.useRealTimers());
  it("sends only on an explicit click, correlates receipts, and disables on stale state", () => {
    const publish = jest.fn();
    const context = {
      advertise: jest.fn(),
      unadvertise: jest.fn(),
      watch: jest.fn(),
      subscribe: jest.fn(),
      unsubscribeAll: jest.fn(),
      publish,
    } as unknown as PanelExtensionContext;
    const view = render(<BusinessPanel context={context} />);
    expect(publish).not.toHaveBeenCalled();
    act(() => {
      context.onRender?.(
        {
          currentFrame: [
            {
              topic: "/luka/ui/state",
              message: {
                data: JSON.stringify({
                  epoch: "epoch-one",
                  lease_at: 100,
                  backend: "ready",
                  generation: 12,
                  motion_enabled: false,
                  operations: [
                    {
                      id: "capabilities",
                      category: "业务能力",
                      label: "刷新已安装能力",
                      method: "GET",
                      example: {},
                    },
                  ],
                  capabilities: [],
                }),
              },
            },
          ],
        } as never,
        jest.fn(),
      );
      jest.advanceTimersByTime(200);
    });
    fireEvent.click(screen.getByRole("button", { name: "读取" }));
    const request = JSON.parse((publish.mock.calls[0]?.[1] as { data: string }).data);
    expect(request).toMatchObject({
      operation: "capabilities",
      epoch: "epoch-one",
      lease_at: 100,
      body: {},
    });
    act(() => {
      context.onRender?.(
        {
          currentFrame: [
            {
              topic: "/luka/ui/result",
              message: {
                data: JSON.stringify({
                  id: request.id,
                  client: request.client,
                  phase: "response",
                  code: 200,
                  result: { message: "真实结果" },
                }),
              },
            },
          ],
        } as never,
        jest.fn(),
      );
    });
    expect(screen.getByText(/真实结果/)).toBeTruthy();
    act(() => { jest.advanceTimersByTime(3000); });
    expect(screen.getByRole("button", { name: "读取" })).toHaveProperty("disabled", true);
    expect(publish).toHaveBeenCalledTimes(1);
    view.unmount();
  });
});
