/** @jest-environment jsdom */
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.
import { PanelExtensionContext } from "@foxglove/studio";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import FleetPanel from "./FleetPanel";

function fixture() {
  const publish = jest.fn();
  const context = {
    initialState: { initialView: "fleet", operatorLabel: "PC 总调度" },
    subscribe: jest.fn(), watch: jest.fn(), advertise: jest.fn(), unadvertise: jest.fn(),
    publish, saveState: jest.fn(), onRender: undefined,
  } as unknown as PanelExtensionContext;
  const state = {
    version: 2, server_time: 1000, revision: 1, motion_enabled: true, busy: false,
    config: { active: ["robot_113", "robot_104"], selected: "robot_113", leader: "robot_113",
      mode: "independent", spacing: 1.5, names: { robot_113: "198", robot_104: "104" },
      routes: { robot_113: [[0, 1, 0]], robot_104: [[1, 1, 0]] } },
    robots: ["robot_113", "robot_104"].map((id, index) => ({
      id, name: id, active: true, rank: index + 1, online: true, pose: [0, index * 1.5, 0],
      pose_age: .2, health: "READY", ready: false, start_eligible: true, busy: false,
    })),
    mission: { state: "IDLE" }, tasks: {},
  };
  const emit = (value: unknown) => act(() => {
    context.onRender?.({ currentFrame: [{ topic: "/fleet/ui/state", message: { data: JSON.stringify(value) } }] } as never, () => {});
  });
  render(<FleetPanel context={context} />);
  emit(state);
  return { context, state, emit, publish };
}

describe("native fleet console", () => {
  it("round-trips Chinese requests through the real ROS2 CDR codec and unlocks on acknowledgment", async () => {
    const { publish, emit, state } = fixture();
    const { MessageWriter, MessageReader } = await import("@foxglove/rosmsg2-serialization");
    const definitions = [{ name: "std_msgs/String", definitions: [
      { name: "data", type: "string", isArray: false, isComplex: false },
    ] }];
    const writer = new MessageWriter(definitions);
    const reader = new MessageReader<{ data: string }>(definitions);
    let request: { id: string; op: string; source: string; names: Record<string, string> } | undefined;
    publish.mockImplementation((_topic: string, message: { data: string }) => {
      expect(/[^\x00-\x7f]/.test(message.data)).toBe(false);
      const received = reader.readMessage(writer.writeMessage(message));
      expect(received.data).toBe(message.data);
      request = JSON.parse(received.data);
    });
    const name = "领车🚗 café";
    fireEvent.change(screen.getByTestId("fleet-name-robot_113"), { target: { value: name } });
    await waitFor(() => expect(request).toBeDefined());
    expect(request!.source).toBe("PC 总调度");
    expect(request!.op).toBe("configure");
    expect(request!.names.robot_113).toBe(name);
    expect((screen.getByTestId("fleet-clearAll") as HTMLButtonElement).disabled).toBe(true);
    emit({ ...state, revision: 2, config: { ...state.config, names: request!.names },
      ack: { id: request!.id, ok: true, message: "已保存" } });
    await waitFor(() => expect((screen.getByTestId("fleet-clearAll") as HTMLButtonElement).disabled).toBe(false));
  });

  it("clears both routes in one configuration request and discards the draft after success", async () => {
    const { publish, emit, state } = fixture();
    fireEvent.change(screen.getByTestId("fleet-route"), { target: { value: "9, 9, 0" } });
    fireEvent.click(screen.getByTestId("fleet-clearAll"));
    await waitFor(() => expect(publish).toHaveBeenCalledTimes(1));
    const request = JSON.parse((publish.mock.calls[0]![1] as { data: string }).data);
    expect(request.op).toBe("configure");
    expect(request.routes).toEqual({ robot_113: [], robot_104: [] });
    emit({ ...state, revision: 2, config: { ...state.config, routes: request.routes },
      ack: { id: request.id, ok: true, message: "已清空" } });
    await waitFor(() => expect((screen.getByTestId("fleet-route") as HTMLTextAreaElement).value).toBe(""));
    fireEvent.click(screen.getByTestId("fleet-save"));
    await act(async () => { await Promise.resolve(); });
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it("allows clearing inactive cars and the follower in leader mode", () => {
    const { emit, state } = fixture();
    emit({ ...state, revision: 2, config: { ...state.config, mode: "leader", selected: "robot_104" } });
    expect((screen.getByTestId("fleet-clear") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("fleet-clearAll") as HTMLButtonElement).disabled).toBe(false);
    emit({ ...state, revision: 3, config: { ...state.config, active: [], selected: null },
      robots: state.robots.map(r => ({ ...r, active: false })) });
    expect((screen.getByTestId("fleet-clearAll") as HTMLButtonElement).disabled).toBe(false);
  });

  it("blocks clearing while a fleet or vehicle task is active", () => {
    const { emit, state } = fixture();
    emit({ ...state, busy: true });
    expect((screen.getByTestId("fleet-clearAll") as HTMLButtonElement).disabled).toBe(true);
    emit({ ...state, robots: state.robots.map(r => ({ ...r, busy: r.id === "robot_104" })) });
    expect((screen.getByTestId("fleet-clearAll") as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps the draft if the backend rejects clearing", async () => {
    const { publish, emit, state } = fixture();
    fireEvent.change(screen.getByTestId("fleet-route"), { target: { value: "9, 9, 0" } });
    fireEvent.click(screen.getByTestId("fleet-clearAll"));
    await waitFor(() => expect(publish).toHaveBeenCalledTimes(1));
    const request = JSON.parse((publish.mock.calls[0]![1] as { data: string }).data);
    emit({ ...state, ack: { id: request.id, ok: false, message: "配置已变化" } });
    await waitFor(() => expect(screen.getByTestId("fleet-status").textContent).toBe("配置已变化"));
    expect((screen.getByTestId("fleet-route") as HTMLTextAreaElement).value).toBe("9, 9, 0");
  });

  it("opening the console publishes no robot command", () => {
    const { publish } = fixture();
    expect(publish).not.toHaveBeenCalled();
    // Admission eligibility is distinct from the FLEET permission granted after Start.
    expect((screen.getByTestId("fleet-start") as HTMLButtonElement).disabled).toBe(false);
  });

  it("uses coordinator time rather than the workstation wall clock", async () => {
    const { publish } = fixture();
    fireEvent.click(screen.getByTestId("fleet-arm"));
    await waitFor(() => expect(publish).toHaveBeenCalledTimes(1));
    const [topic, message] = publish.mock.calls[0] as [string, { data: string }];
    const request = JSON.parse(message.data) as { op: string; created_at: number; enabled: boolean };
    expect(topic).toBe("/fleet/ui/command");
    expect(request.op).toBe("motion");
    expect(request.created_at).toBeGreaterThanOrEqual(1000);
    expect(request.created_at).toBeLessThan(1010);
    expect(request.enabled).toBe(false);
  });

  it("Stop cancels a pending start even if the preview succeeds later", async () => {
    const { publish, emit, state } = fixture();
    fireEvent.click(screen.getByTestId("fleet-startAll"));
    await waitFor(() => expect(publish).toHaveBeenCalledTimes(1));
    const preview = JSON.parse((publish.mock.calls[0]![1] as { data: string }).data) as { id: string };
    expect((screen.getByTestId("fleet-stopAll") as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByTestId("fleet-stopAll"));
    await waitFor(() => expect(publish).toHaveBeenCalledTimes(2));
    emit({ ...state, ack: { id: preview.id, ok: true, message: "preview complete" } });
    await act(async () => { await Promise.resolve(); });
    const operations = publish.mock.calls.map((call) => JSON.parse((call[1] as { data: string }).data).op as string);
    expect(operations).toEqual(["preview_all", "stop_all"]);
  });
});
