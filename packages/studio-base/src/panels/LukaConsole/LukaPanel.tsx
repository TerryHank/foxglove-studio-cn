// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/
import {
  Alert,
  Button,
  Checkbox,
  FormControlLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useLayoutEffect, useRef, useState } from "react";
import { ros1 } from "@foxglove/rosmsg-msgs-common";
import { PanelExtensionContext } from "@foxglove/studio";
import ThemeProvider from "@foxglove/studio-base/theme/ThemeProvider";
import guide from "./guide.json";
import { COMMAND_TOPIC, Direction, HoldControl } from "./holdControl";

const INPUTS = ["/nx/web_teleop_status", "/wheel/odom", "/scan", "/scan_low_filtered"];
const STRINGS = ["/voice/tts_text", "/patrol/save_route", "/patrol/load_route"];
const EMPTY = [
  "/home/set_current",
  "/home/go",
  "/home/cancel",
  "/patrol/clear",
  "/patrol/start_once",
  "/patrol/pause",
  "/patrol/resume",
  "/patrol/stop",
];
const DIRECTIONS: [Direction, string][] = [
  ["forward", "↑ 前进"],
  ["back", "↓ 后退"],
  ["left", "← 横移"],
  ["right", "→ 横移"],
  ["ccw", "↶ 左转"],
  ["cw", "↷ 右转"],
];

export default function LukaPanel({ context }: { context: PanelExtensionContext }): JSX.Element {
  const config = context.initialState as { caseNumber?: string; initialView?: string };
  const [number, setNumber] = useState(config.caseNumber ?? "03");
  const [tab, setTab] = useState(config.initialView === "guide" ? "guide" : "controls");
  const [dark, setDark] = useState(false);
  const [armed, setArmed] = useState(false);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("等待底盘状态、编码器和双雷达");
  const [result, setResult] = useState("按钮请求成功不等于任务完成；看左侧实测状态。");
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("你好，这是机器人语音演示。");
  const [renderDone, setRenderDone] = useState<() => void>(() => () => {});
  const samples = useRef(new Map<string, number>());
  const gate = useRef("");
  const armRef = useRef(false);
  const fresh = () =>
    INPUTS.every((topic) => performance.now() - (samples.current.get(topic) ?? -Infinity) < 600) &&
    !/暂停|过期|障碍/.test(gate.current);
  const controlRef = useRef<HoldControl>();
  useLayoutEffect(() => {
    const publish = (message: Record<string, unknown>) => {
      try {
        context.publish?.(COMMAND_TOPIC, message);
      } catch (error) {
        armRef.current = false;
        setArmed(false);
        setResult(String(error));
      }
    };
    const control = new HoldControl(
      publish,
      () => armRef.current && fresh() && context.publish != undefined,
    );
    controlRef.current = control;
    context.advertise?.(COMMAND_TOPIC, "geometry_msgs/Twist", {
      datatypes: new Map([
        ["geometry_msgs/Vector3", ros1["geometry_msgs/Vector3"]],
        ["geometry_msgs/Twist", ros1["geometry_msgs/Twist"]],
      ]),
    });
    for (const topic of STRINGS) {
      context.advertise?.(topic, "std_msgs/String", {
        datatypes: new Map([["std_msgs/String", ros1["std_msgs/String"]]]),
      });
    }
    for (const topic of EMPTY) {
      context.advertise?.(topic, "std_msgs/Empty", {
        datatypes: new Map([["std_msgs/Empty", ros1["std_msgs/Empty"]]]),
      });
    }
    context.subscribe(INPUTS.map((topic) => ({ topic })));
    context.watch("currentFrame");
    context.watch("colorScheme");
    context.onRender = (state, done) => {
      setRenderDone(() => done);
      setDark(state.colorScheme === "dark");
      for (const event of state.currentFrame ?? []) {
        samples.current.set(event.topic, performance.now());
        if (event.topic === INPUTS[0]) {
          gate.current = String((event.message as { data?: string }).data ?? "");
          setStatus(gate.current);
        }
      }
    };
    const stop = () => {
      control.stop();
      armRef.current = false;
      setArmed(false);
    };
    const release = () => control.stop();
    const hidden = () => {
      if (document.hidden) {
        stop();
      }
    };
    window.addEventListener("blur", stop);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", stop);
    document.addEventListener("visibilitychange", hidden);
    const timer = setInterval(() => {
      const next = fresh();
      setReady(next);
      if (!next) {
        stop();
      }
    }, 100);
    return () => {
      stop();
      clearInterval(timer);
      window.removeEventListener("blur", stop);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", stop);
      document.removeEventListener("visibilitychange", hidden);
      context.onRender = undefined;
      context.unsubscribeAll();
      for (const topic of [COMMAND_TOPIC, ...STRINGS, ...EMPTY]) {
        context.unadvertise?.(topic);
      }
    };
  }, [context]);
  useLayoutEffect(() => {
    renderDone();
  }, [renderDone]);
  const item = guide.find((row) => row.number === number) ?? guide[0]!;
  async function service(name: string, request: Record<string, unknown> = {}) {
    if (!context.callService) {
      throw new Error("数据源不支持 ROS 服务调用");
    }
    const response = (await context.callService(name, request)) as {
      success?: boolean;
      message?: string;
    };
    if (response.success === false) {
      throw new Error(response.message ?? "安全门拒绝请求");
    }
    return response;
  }
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      setResult(JSON.stringify(await action()) ?? "请求已发送");
    } catch (error) {
      setResult(String(error));
    } finally {
      setBusy(false);
    }
  }
  async function command(topic: string, data?: string, motion = false) {
    if (!context.publish) {
      throw new Error("数据源不支持 ROS 发布");
    }
    if (motion) {
      await service("/nx/navigation_enable", { data: true });
    }
    context.publish(topic, data == undefined ? {} : { data });
    return { message: "请求已发送；查看任务反馈和实测里程计" };
  }
  function button(label: string, action: () => Promise<unknown>) {
    const stop = [
      "暂停底盘",
      "取消导航",
      "取消返航",
      "暂停巡航",
      "停止巡航",
      "暂停任务",
      "取消任务",
    ].includes(label);
    return (
      <Button
        key={label}
        variant="outlined"
        disabled={busy && !stop}
        onClick={() => void run(action)}
      >
        {label}
      </Button>
    );
  }
  const motionCases = ["11", "12", "13", "14", "15", "17", "24"];
  return (
    <ThemeProvider isDark={dark}>
      <Stack spacing={1.5} sx={{ height: "100%", overflow: "auto", p: 1.5 }}>
        <Typography variant="h6">Luka 原生操作与验收</Typography>
        <Stack direction="row" spacing={1}>
          <Button onClick={() => setTab("controls")}>原生控制</Button>
          <Button
            onClick={() => {
              controlRef.current?.stop();
              setTab("guide");
            }}
          >
            本案例步骤
          </Button>
          <Select
            size="small"
            value={number}
            onChange={(event) => {
              controlRef.current?.stop();
              setNumber(event.target.value);
              context.saveState({ caseNumber: event.target.value });
            }}
          >
            {guide.map((row) => (
              <MenuItem key={row.number} value={row.number}>
                {row.number} {row.title}
              </MenuItem>
            ))}
          </Select>
        </Stack>
        {tab === "guide" ? (
          <>
            <Typography variant="h6">
              {item.number} {item.title}
            </Typography>
            <Alert severity="warning">{item.status}；尚未验收</Alert>
            <Typography sx={{ whiteSpace: "pre-wrap" }}>{item.action}</Typography>
            <Typography>观察与证据：{item.observation}</Typography>
            <Typography>整项通过条件／缺口：{item.criterion}</Typography>
            <Typography>代码限制：{item.limitation}</Typography>
          </>
        ) : (
          <>
            <Alert severity={ready ? "info" : "warning"}>
              {ready ? status : "等待新鲜底盘状态、轮速和双雷达；方向键禁用"}
            </Alert>
            <FormControlLabel
              label="启用本次方向操作"
              control={
                <Checkbox
                  checked={armed}
                  disabled={!ready || context.publish == undefined}
                  onChange={(_e, checked) => {
                    controlRef.current?.stop();
                    armRef.current = checked;
                    setArmed(checked);
                  }}
                />
              }
            />
            <Stack direction="row" flexWrap="wrap" gap={1}>
              {DIRECTIONS.map(([direction, label]) => (
                <Button
                  key={direction}
                  variant="contained"
                  disabled={!ready || !armed}
                  sx={{ touchAction: "none" }}
                  onPointerDown={(event) => {
                    if (event.button !== 0) {
                      return;
                    }
                    event.currentTarget.setPointerCapture(event.pointerId);
                    controlRef.current?.start(direction);
                  }}
                  onPointerUp={() => controlRef.current?.stop()}
                  onPointerCancel={() => controlRef.current?.stop()}
                  onLostPointerCapture={() => controlRef.current?.stop()}
                  onPointerLeave={() => controlRef.current?.stop()}
                >
                  {label}
                </Button>
              ))}
            </Stack>
            <Typography variant="caption">
              按住移动，松开停止；0.10 m/s、0.20 rad/s，最长 2
              秒，需松开再按。手动接管取消导航/跟随。
            </Typography>
            {button("暂停底盘", async () => {
              controlRef.current?.stop();
              armRef.current = false;
              setArmed(false);
              return await service("/base_control/pause_now");
            })}
            {button("解除底盘暂停", () => service("/base_control/resume_now"))}
            {["09", "10"].includes(number) &&
              button("保存当前 SLAM 地图（新文件）", () => service("/contract_demo/save_map"))}
            {motionCases.includes(number) && (
              <>
                <Typography>
                  3D“发布位姿估计” →
                  /initialpose，核验扫描与地图重合。“发布位姿”暂存目标，随后点击：
                </Typography>
                {button("执行暂存导航目标", () => service("/contract_demo/send_goal"))}
                {button("取消导航", () => service("/contract_demo/cancel_goal"))}
              </>
            )}
            {["14", "17", "24"].includes(number) && (
              <>
                <Typography>软件 Home（不等于充电桩）</Typography>
                <Stack direction="row" flexWrap="wrap" gap={1}>
                  {button("记录当前 Home", () => command("/home/set_current"))}
                  {button("软件返航", () => command("/home/go", undefined, true))}
                  {button("取消返航", async () => {
                    const sent = await command("/home/cancel");
                    await service("/nx/navigation_enable", { data: false });
                    return sent;
                  })}
                </Stack>
              </>
            )}
            {number === "14" && (
              <>
                <Typography>
                  将 3D 发布位姿话题改为 /patrol/add_pose
                  加点；随后巡航一圈。保存/读回使用本次演示路线文件。
                </Typography>
                <Stack direction="row" flexWrap="wrap" gap={1}>
                  {button("清空路线", () => command("/patrol/clear"))}
                  {button("巡航一圈", () => command("/patrol/start_once", undefined, true))}
                  {button("暂停巡航", () => command("/patrol/pause"))}
                  {button("恢复巡航", () => command("/patrol/resume", undefined, true))}
                  {button("停止巡航", async () => {
                    const sent = await command("/patrol/stop");
                    await service("/nx/navigation_enable", { data: false });
                    return sent;
                  })}
                  {button("保存路线", () =>
                    command(
                      "/patrol/save_route",
                      "/home/sunrise/luka_data/recordings/contract_demo/business/demo_route.yaml",
                    ),
                  )}
                  {button("读取路线", () =>
                    command(
                      "/patrol/load_route",
                      "/home/sunrise/luka_data/recordings/contract_demo/business/demo_route.yaml",
                    ),
                  )}
                </Stack>
              </>
            )}
            {number === "24" && (
              <Stack direction="row" gap={1}>
                {button("暂停任务", () => service("/hotel/mission/pause_now"))}
                {button("恢复任务", async () => {
                  await service("/nx/navigation_enable", { data: true });
                  return await service("/hotel/mission/resume_now");
                })}
                {button("取消任务", () => service("/hotel/mission/cancel_now"))}
              </Stack>
            )}
            {number === "20" && (
              <>
                <TextField
                  label="播报测试文字（不是声源导航命令）"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                />
                {button("播报文字", () => command("/voice/tts_text", text))}
              </>
            )}
            <Typography sx={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>
              {result}
            </Typography>
          </>
        )}
        <Typography variant="caption">
          ws://192.168.3.150:8765 · 原生 ROS 发布／服务调用 · 请求成功不等于验收通过
        </Typography>
      </Stack>
    </ThemeProvider>
  );
}
