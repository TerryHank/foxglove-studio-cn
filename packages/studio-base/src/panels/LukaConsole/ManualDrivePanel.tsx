// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/
import { Alert, Button, Stack, Typography } from "@mui/material";
import { useLayoutEffect, useRef, useState } from "react";
import { ros1 } from "@foxglove/rosmsg-msgs-common";
import { PanelExtensionContext } from "@foxglove/studio";
import ThemeProvider from "@foxglove/studio-base/theme/ThemeProvider";
import { Direction, HoldControl } from "./holdControl";
import DirectionalPad, { DirectionalPadAction } from "../Teleop/DirectionalPad";

type State = { ready: boolean; enabled: boolean; reason: string };
const directions: Record<DirectionalPadAction, Direction> = {
  [DirectionalPadAction.UP]: "forward",
  [DirectionalPadAction.DOWN]: "back",
  [DirectionalPadAction.LEFT]: "ccw",
  [DirectionalPadAction.RIGHT]: "cw",
};

export default function ManualDrivePanel({
  context,
}: {
  context: PanelExtensionContext;
}): JSX.Element {
  const latest = useRef<State>({ ready: false, enabled: false, reason: "等待底盘连接" });
  const received = useRef(-Infinity);
  const armed = useRef(false);
  const permissionRequest = useRef(0);
  const control = useRef<HoldControl>();
  const [state, setState] = useState(latest.current);
  const [fresh, setFresh] = useState(false);
  const [dark, setDark] = useState(false);
  const [result, setResult] = useState("");
  const [done, setDone] = useState<() => void>(() => () => {});
  useLayoutEffect(() => {
    const held = new HoldControl(
      (message) => {
        try {
          context.publish?.("/cmd_vel", message);
        } catch (error) {
          received.current = -Infinity;
          setResult(String(error));
        }
      },
      () =>
        armed.current &&
        latest.current.ready &&
        latest.current.enabled &&
        performance.now() - received.current < 600 &&
        context.publish != undefined,
      () => performance.now(),
      Number.POSITIVE_INFINITY,
    );
    control.current = held;
    context.advertise?.("/cmd_vel", "geometry_msgs/Twist", {
      datatypes: new Map([
        ["geometry_msgs/Vector3", ros1["geometry_msgs/Vector3"]],
        ["geometry_msgs/Twist", ros1["geometry_msgs/Twist"]],
      ]),
    });
    context.subscribe([{ topic: "/luka/manual/state" }]);
    context.watch("currentFrame");
    context.watch("colorScheme");
    context.onRender = (render, renderDone) => {
      setDone(() => renderDone);
      setDark(render.colorScheme === "dark");
      for (const event of render.currentFrame ?? []) {
        if (event.topic !== "/luka/manual/state") continue;
        try {
          const value = JSON.parse(String((event.message as { data?: string }).data)) as State;
          if (
            typeof value.ready !== "boolean" ||
            typeof value.enabled !== "boolean" ||
            typeof value.reason !== "string"
          )
            throw new Error("invalid state");
          latest.current = value;
          received.current = performance.now();
          setState(value);
        } catch {
          received.current = -Infinity;
        }
      }
    };
    const timer = setInterval(() => {
      const valid = performance.now() - received.current < 600;
      setFresh(valid);
      if (!valid || !latest.current.ready) armed.current = false;
      if (!valid || !latest.current.ready || !latest.current.enabled) held.stop();
    }, 100);
    const stop = () => held.stop();
    window.addEventListener("blur", stop);
    window.addEventListener("mouseup", stop);
    document.addEventListener("visibilitychange", stop);
    return () => {
      clearInterval(timer);
      held.stop();
      window.removeEventListener("blur", stop);
      window.removeEventListener("mouseup", stop);
      document.removeEventListener("visibilitychange", stop);
      context.onRender = undefined;
      context.unsubscribeAll();
      context.unadvertise?.("/cmd_vel");
    };
  }, [context]);
  useLayoutEffect(() => {
    done();
  }, [done]);
  async function enable(data: boolean) {
    control.current?.stop();
    armed.current = false;
    const request = ++permissionRequest.current;
    try {
      if (!context.callService) throw new Error("数据源尚未连接ROS服务");
      const reply = (await context.callService("/luka/manual/enable", { data })) as {
        success?: boolean;
        message?: string;
      };
      if (reply.success !== true) throw new Error(reply.message ?? "底盘拒绝启用");
      if (request !== permissionRequest.current) return;
      armed.current = data;
      setResult(reply.message ?? "请求完成，等待底盘状态");
    } catch (error) {
      setResult(String(error));
    }
  }
  return (
    <ThemeProvider isDark={dark}>
      <Stack spacing={1} sx={{ p: 1.5, height: "100%", overflow: "auto" }}>
        <Typography variant="h6">远程操纵（RTAB-Map 建图）</Typography>
        <Alert severity={fresh && state.ready ? "info" : "warning"}>
          {!fresh
            ? "底盘未连接或状态过期"
            : state.reason + (state.enabled ? " · 手控已启用" : " · 手控未启用")}
        </Alert>
        <Stack direction="row" alignItems="center" gap={2}>
          <div style={{ width: 200, height: 200, flexShrink: 0 }}>
            <DirectionalPad
              disabled={!fresh || !state.ready || !state.enabled || !armed.current}
              onAction={(action) => {
                if (action == undefined) control.current?.stop();
                else control.current?.start(directions[action]);
              }}
              onEmergencyStop={() => void enable(false)}
            />
          </div>
          <Stack spacing={1} sx={{ flex: 1 }}>
            <Button
              variant="outlined"
              disabled={!fresh || !state.ready || context.callService == undefined}
              onClick={() => void enable(true)}
            >
              启用手动方向控制
            </Button>
            <Button
              color="error"
              variant="contained"
              disabled={context.callService == undefined}
              onClick={() => void enable(false)}
            >
              停止并关闭手控许可
            </Button>
            <Typography variant="caption">
              上下前进/后退，左右旋转。持续按住就持续移动，松开立即停止；0.10 m/s、0.20 rad/s。
              中心红钮关闭手控许可。保留底盘反馈、避障和超时保护。
            </Typography>
            <Typography sx={{ overflowWrap: "anywhere" }}>{result}</Typography>
          </Stack>
        </Stack>
      </Stack>
    </ThemeProvider>
  );
}
