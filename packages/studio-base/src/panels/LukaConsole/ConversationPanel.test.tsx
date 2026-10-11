/** @jest-environment jsdom */
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/
import { act, fireEvent, render, screen } from "@testing-library/react";

import { PanelExtensionContext } from "@foxglove/studio";

import ConversationPanel from "./ConversationPanel";

it("shows recognition and answers, sends only explicit text, and retains existing cancel interfaces", () => {
  jest.useFakeTimers();
  const publish = jest.fn();
  const context = { advertise: jest.fn(), unadvertise: jest.fn(), watch: jest.fn(),
    subscribe: jest.fn(), unsubscribeAll: jest.fn(), publish } as unknown as PanelExtensionContext;
  const view = render(<ConversationPanel context={context} />);
  expect(publish).not.toHaveBeenCalled();
  act(() => {
    context.onRender?.({ currentFrame: [
      { topic: "/xiaozhi/status", message: { data: "ready" }, receiveTime: { sec: 1, nsec: 0 } },
      { topic: "/voice/recognized_text", message: { data: "你好" }, receiveTime: { sec: 2, nsec: 0 } },
      { topic: "/xiaozhi/answer", message: { data: "我是露卡" }, receiveTime: { sec: 3, nsec: 0 } },
    ] } as never, jest.fn());
    jest.advanceTimersByTime(200);
  });
  expect(screen.getByText(/识别：你好/)).toBeTruthy();
  expect(screen.getByText(/露卡：我是露卡/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("对露卡说"), { target: { value: " 查询音乐状态 " } });
  fireEvent.click(screen.getByRole("button", { name: "发送" }));
  expect(publish).toHaveBeenCalledWith("/llm_command", { data: "查询音乐状态" });
  fireEvent.click(screen.getByRole("button", { name: "打断回答" }));
  expect(publish).toHaveBeenCalledWith("/voice/control", { data: "interrupt" });
  fireEvent.click(screen.getByRole("button", { name: "取消所属任务" }));
  expect(publish).toHaveBeenCalledWith("/voice/control", { data: "cancel" });
  act(() => { jest.advanceTimersByTime(3000); });
  expect(screen.getByRole("button", { name: "发送" })).toHaveProperty("disabled", true);
  view.unmount();jest.useRealTimers();
});
