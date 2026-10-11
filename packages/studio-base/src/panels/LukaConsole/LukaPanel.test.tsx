/** @jest-environment jsdom */
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/
import { act, fireEvent, render, screen } from "@testing-library/react";
import { PanelExtensionContext } from "@foxglove/studio";
import LukaPanel from "./LukaPanel";
import guide from "./guide.json";

describe("contract acceptance GUI", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("waits for fresh manager state, routes start/stop and records only a selected boolean", async () => {
    const callService = jest.fn().mockResolvedValue({ success: true });
    const publish = jest.fn(),
      saveState = jest.fn(),
      selectCase = jest.fn();
    const context = {
      initialState: { caseNumber: "03" },
      subscribe: jest.fn(),
      unsubscribeAll: jest.fn(),
      watch: jest.fn(),
      advertise: jest.fn(),
      unadvertise: jest.fn(),
      callService,
      publish,
      saveState,
    } as unknown as PanelExtensionContext;
    const view = render(<LukaPanel context={context} selectCase={selectCase} />);
    expect(screen.getByTestId("contract-requirement").textContent?.trim()).toBe(
      guide.find((item) => item.number === "03")?.requirement,
    );
    expect(screen.getByRole("button", { name: "开始案例" })).toHaveProperty("disabled", true);
    act(() => {
      context.onRender?.(
        {
          currentFrame: [
            {
              topic: "/contract_demo/gui/status",
              message: {
                data: JSON.stringify({
                  phase: "idle",
                  case: "",
                  busy: false,
                  message: "ready",
                  log: "完整中文日志：已停车",
                  maps: [],
                }),
              },
            },
          ],
        } as never,
        jest.fn(),
      );
      jest.advanceTimersByTime(100);
    });
    const logDisclosure = screen.getByText("运行日志").closest("details");
    expect(logDisclosure).toHaveProperty("open", false);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "开始案例" })));
    expect(callService).toHaveBeenCalledWith("/contract_demo/gui/start/case_03", {});
    fireEvent.click(screen.getByLabelText("融合EKF（自动准备轮里程计）"));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "开始案例" })));
    expect(callService).toHaveBeenCalledWith("/contract_demo/gui/start/case_03_ekf", {});
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "停止案例" })));
    expect(callService).toHaveBeenCalledWith("/contract_demo/gui/stop", {});
    expect(publish).not.toHaveBeenCalled();
    expect(saveState).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("操作者")).toBeNull();
    expect(screen.queryByLabelText("实测值／证据文件／异常与未覆盖项")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "记录" }));
    expect(saveState.mock.calls[0]?.[0].records["03"].accepted).toBe(false);
    fireEvent.click(screen.getByLabelText("已验收"));
    fireEvent.click(screen.getByRole("button", { name: "记录" }));
    expect(saveState.mock.calls[1]?.[0].records["03"].accepted).toBe(true);
    expect(Object.keys(saveState.mock.calls[1]?.[0].records["03"]).sort()).toEqual([
      "accepted",
      "at",
      "number",
      "title",
    ]);
    fireEvent.mouseDown(screen.getAllByRole("combobox")[0]!);
    fireEvent.click(screen.getByRole("option", { name: "01 STM32与通信协议" }));
    expect(selectCase).toHaveBeenCalledWith("01");
    fireEvent.click(screen.getByRole("button", { name: "持续建图（09）" }));
    expect(selectCase).toHaveBeenCalledWith("09");
    fireEvent.click(screen.getByRole("button", { name: "已有地图定位（10）" }));
    expect(selectCase).toHaveBeenCalledWith("10");
    expect(callService).not.toHaveBeenCalledWith("/contract_demo/gui/start/case_09", {});
    expect(callService).not.toHaveBeenCalledWith("/contract_demo/gui/start/case_10", {});
    act(() => jest.advanceTimersByTime(2100));
    expect(screen.getByRole("button", { name: "开始案例" })).toHaveProperty("disabled", true);
    view.unmount();
  });

  it("starts at case01 by default and displays its original contract description", async () => {
    const callService = jest.fn().mockResolvedValue({ success: true });
    const context = {
      initialState: {},
      subscribe: jest.fn(),
      unsubscribeAll: jest.fn(),
      watch: jest.fn(),
      advertise: jest.fn(),
      unadvertise: jest.fn(),
      publish: jest.fn(),
      callService,
    } as unknown as PanelExtensionContext;
    const view = render(<LukaPanel context={context} selectCase={jest.fn()} />);
    expect(screen.getByTestId("contract-requirement").textContent?.trim()).toBe(
      guide[0]?.requirement,
    );
    act(() => {
      context.onRender?.(
        {
          currentFrame: [
            {
              topic: "/contract_demo/gui/status",
              message: {
                data: JSON.stringify({
                  phase: "idle",
                  case: "",
                  busy: false,
                  message: "ready",
                  log: "",
                  maps: [],
                }),
              },
            },
          ],
        } as never,
        jest.fn(),
      );
      jest.advanceTimersByTime(100);
    });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "开始案例" })));
    expect(callService).toHaveBeenCalledWith("/contract_demo/gui/start/case_01", {});
    expect(context.publish).not.toHaveBeenCalled();
    view.unmount();
  });

  it("case01 directly publishes a turn cmd_vel without requiring lidar samples", () => {
    const originalPointerEvent = window.PointerEvent;
    window.PointerEvent = MouseEvent as typeof PointerEvent;
    const publish = jest.fn();
    const context = {
      initialState: { caseNumber: "01" },
      subscribe: jest.fn(),
      unsubscribeAll: jest.fn(),
      watch: jest.fn(),
      advertise: jest.fn(),
      unadvertise: jest.fn(),
      publish,
      callService: jest.fn(),
    } as unknown as PanelExtensionContext;
    const view = render(<LukaPanel context={context} selectCase={jest.fn()} />);
    act(() => {
      context.onRender?.(
        {
          currentFrame: [
            {
              topic: "/contract_demo/gui/status",
              message: {
                data: JSON.stringify({
                  phase: "running",
                  case: "01",
                  manual_input_topic: "/cmd_vel",
                  busy: false,
                  message: "ready",
                  log: "",
                  maps: [],
                }),
              },
            },
            { topic: "/nx/web_teleop_status", message: { data: "已停车" } },
            { topic: "/wheel/odom", message: {} },
          ],
        } as never,
        jest.fn(),
      );
      jest.advanceTimersByTime(100);
    });
    fireEvent.click(screen.getByLabelText("启用本次方向操作"));
    const turn = screen.getByRole("button", { name: "↶ 左转" });
    turn.setPointerCapture = jest.fn();
    fireEvent.pointerDown(turn, { button: 0, pointerId: 1 });
    expect(publish).toHaveBeenCalledWith("/cmd_vel", {
      linear: { x: 0, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: 0.2 },
    });
    fireEvent.pointerUp(turn);
    expect(publish).toHaveBeenLastCalledWith("/cmd_vel", {
      linear: { x: 0, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: 0 },
    });
    view.unmount();
    window.PointerEvent = originalPointerEvent;
  });

  it("blocks navigation until fresh initial localization is verified and exposes static verification", async () => {
    const callService = jest.fn().mockResolvedValue({ success: true });
    const context = {
      initialState: { caseNumber: "12" },
      subscribe: jest.fn(),
      unsubscribeAll: jest.fn(),
      watch: jest.fn(),
      advertise: jest.fn(),
      unadvertise: jest.fn(),
      publish: jest.fn(),
      callService,
    } as unknown as PanelExtensionContext;
    const view = render(<LukaPanel context={context} selectCase={jest.fn()} />);
    const sendState = (ready?: boolean) =>
      act(() => {
        context.onRender?.(
          {
            currentFrame: [
              {
                topic: "/contract_demo/gui/status",
                message: {
                  data: JSON.stringify({
                    phase: "running",
                    case: "12",
                    busy: false,
                    message: "ready",
                    log: "",
                    maps: [],
                  }),
                },
              },
              ...(ready == undefined
                ? []
                : [
                    {
                      topic: "/localization/initial_status",
                      message: {
                        data: JSON.stringify({ ready, reason: "scan_matches_map", samples: 3 }),
                      },
                    },
                  ]),
            ],
          } as never,
          jest.fn(),
        );
        jest.advanceTimersByTime(100);
      });
    sendState(false);
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "执行暂存导航目标" })),
    );
    expect(callService).not.toHaveBeenCalledWith("/contract_demo/send_goal", {});
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "复核初始定位" })));
    expect(callService).toHaveBeenCalledWith("/localization/validate_initial", {});
    sendState(true);
    expect(screen.getByText("RTAB-Map初始定位已验证")).toBeTruthy();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "执行暂存导航目标" })),
    );
    expect(callService).toHaveBeenCalledWith("/contract_demo/send_goal", {});
    callService.mockClear();
    act(() => jest.advanceTimersByTime(1100));
    sendState();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "执行暂存导航目标" })),
    );
    expect(callService).not.toHaveBeenCalledWith("/contract_demo/send_goal", {});
    expect(context.publish).not.toHaveBeenCalled();
    view.unmount();
  });
});
