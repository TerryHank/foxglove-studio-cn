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
import PersonFollowPanel from "./PersonFollowPanel";
import BusinessPanel from "./BusinessPanel";
import ConversationPanel from "./ConversationPanel";
import FleetPanel from "./FleetPanel";
import ManualDrivePanel from "./ManualDrivePanel";

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
type AcceptanceRecord = {
  number: string;
  title: string;
  accepted: boolean;
  at: string;
};
type Config = {
  caseNumber?: string;
  initialView?: string;
  records?: Record<string, AcceptanceRecord & { conclusion?: string }>;
};
type LauncherStatus = {
  phase: string;
  case: string;
  busy: boolean;
  message: string;
  log: string;
  maps: string[];
  manual_input_topic?: string;
  selected_database?: string;
};
type LocalizationStatus = {
  ready: boolean;
  reason: string;
  database_path: string;
  mode: string;
  backend: string;
  samples: number;
};

export default function LukaPanel(props: {
  context: PanelExtensionContext;
  selectCase: (number: string) => void;
}): JSX.Element {
  const initial = props.context.initialState as Config;
  if (initial.initialView === "manual") {
    return <ManualDrivePanel context={props.context} />;
  }
  if (initial.initialView === "fleet") {
    return <FleetPanel context={props.context} />;
  }
  if (initial.initialView === "conversation") {
    return <ConversationPanel context={props.context} />;
  }
  if (initial.initialView === "business") {
    return <BusinessPanel context={props.context} />;
  }
  return initial.initialView === "follow" ? (
    <PersonFollowPanel context={props.context} />
  ) : (
    <GeneralLukaPanel {...props} />
  );
}

function GeneralLukaPanel({
  context,
  selectCase,
}: {
  context: PanelExtensionContext;
  selectCase: (number: string) => void;
}): JSX.Element {
  const config = context.initialState as Config;
  const [number] = useState(config.caseNumber ?? "01");
  const directManual = number === "01" || number === "02";
  const commandTopic = directManual ? "/cmd_vel" : COMMAND_TOPIC;
  const requiredInputs = directManual ? INPUTS.slice(0, 2) : INPUTS;
  const [tab, setTab] = useState(config.initialView === "guide" ? "guide" : "controls");
  const [dark, setDark] = useState(false);
  const [armed, setArmed] = useState(false);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("等待底盘状态、编码器和双雷达");
  const [lastBlocked, setLastBlocked] = useState("");
  const [result, setResult] = useState("按钮请求成功不等于任务完成；看左侧实测状态。");
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("你好，这是机器人语音演示。");
  const [withEkf, setWithEkf] = useState(false);
  const [databasePath, setDatabasePath] = useState("");
  const [launcher, setLauncher] = useState<LauncherStatus>();
  const [launcherOnline, setLauncherOnline] = useState(false);
  const [localization, setLocalization] = useState<LocalizationStatus>();
  const [localizationFresh, setLocalizationFresh] = useState(false);
  const localizationAt = useRef(-Infinity);
  const localizationRef = useRef<LocalizationStatus>();
  const launcherRef = useRef<LauncherStatus>();
  const launcherAt = useRef(-Infinity);
  const [records, setRecords] = useState<Record<string, AcceptanceRecord>>(() =>
    Object.fromEntries(
      Object.entries(config.records ?? {}).map(([key, record]) => [
        key,
        {
          number: record.number ?? key,
          title: record.title,
          accepted: record.accepted ?? record.conclusion === "通过",
          at: record.at,
        },
      ]),
    ),
  );
  const [accepted, setAccepted] = useState(records[number]?.accepted ?? false);
  const [renderDone, setRenderDone] = useState<() => void>(() => () => {});
  const samples = useRef(new Map<string, number>());
  const gate = useRef("");
  const armRef = useRef(false);
  const fresh = () =>
    performance.now() - launcherAt.current < 2000 &&
    launcherRef.current?.phase === "running" &&
    launcherRef.current.case === number &&
    (!directManual || launcherRef.current.manual_input_topic === "/cmd_vel") &&
    requiredInputs.every(
      (topic) => performance.now() - (samples.current.get(topic) ?? -Infinity) < 600,
    ) &&
    !/暂停|过期|障碍/.test(gate.current);
  const controlRef = useRef<HoldControl>();
  useLayoutEffect(() => {
    const publish = (message: Record<string, unknown>) => {
      try {
        context.publish?.(commandTopic, message);
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
    context.advertise?.(commandTopic, "geometry_msgs/Twist", {
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
    context.subscribe(
      [...requiredInputs, "/contract_demo/gui/status", "/localization/initial_status"].map(
        (topic) => ({ topic }),
      ),
    );
    context.watch("currentFrame");
    context.watch("colorScheme");
    context.onRender = (state, done) => {
      setRenderDone(() => done);
      setDark(state.colorScheme === "dark");
      for (const event of state.currentFrame ?? []) {
        if (event.topic === "/localization/initial_status") {
          try {
            const info = JSON.parse((event.message as { data: string }).data) as LocalizationStatus;
            if (typeof info.ready === "boolean") {
              setLocalization(info);
              localizationAt.current = performance.now();
              localizationRef.current = info;
            } else {
              localizationAt.current = -Infinity;
            }
          } catch {
            localizationAt.current = -Infinity;
          }
        }
        if (event.topic === "/contract_demo/gui/status") {
          try {
            const next = JSON.parse((event.message as { data: string }).data) as LauncherStatus;
            if (typeof next.phase === "string" && Array.isArray(next.maps)) {
              launcherRef.current = next;
              launcherAt.current = performance.now();
              setLauncher(next);
              setDatabasePath((current) => current || next.selected_database || "");
            }
          } catch {
            /* Malformed status never permits motion. */
          }
        }
        samples.current.set(event.topic, performance.now());
        if (event.topic === INPUTS[0]) {
          gate.current = String((event.message as { data?: string }).data ?? "");
          setStatus(gate.current);
          if (/障碍/.test(gate.current)) {
            setLastBlocked(gate.current);
          } else if (gate.current === "行驶中") {
            setLastBlocked("");
          }
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
      setLauncherOnline(performance.now() - launcherAt.current < 2000);
      setLocalizationFresh(performance.now() - localizationAt.current < 1000);
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
      for (const topic of [commandTopic, ...STRINGS, ...EMPTY]) {
        context.unadvertise?.(topic);
      }
    };
  }, [context]);
  useLayoutEffect(() => {
    renderDone();
  }, [renderDone]);
  const item = guide.find((row) => row.number === number) ?? guide[0]!;
  async function service(name: string, request: Record<string, unknown> = {}) {
    if (
      (name === "/contract_demo/send_goal" ||
        (name === "/nx/navigation_enable" && request.data === true)) &&
      !(
        performance.now() - launcherAt.current < 2000 &&
        launcherRef.current?.phase === "running" &&
        launcherRef.current.case === number
      )
    ) {
      throw new Error("先开始当前案例，等待GUI状态新鲜且正在运行");
    }
    if (
      (name === "/contract_demo/send_goal" ||
        (name === "/nx/navigation_enable" && request.data === true)) &&
      !(performance.now() - localizationAt.current < 1000 && localizationRef.current?.ready)
    ) {
      throw new Error("已有地图初始定位尚未验证；请先设置初始位姿并等待定位验证通过");
    }
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
  function button(label: string, action: () => Promise<unknown>, disabled = false) {
    const stop = [
      "暂停底盘",
      "取消导航",
      "取消返航",
      "暂停巡航",
      "停止巡航",
      "暂停任务",
      "取消任务",
      "停止案例",
    ].includes(label);
    return (
      <Button
        key={label}
        variant="outlined"
        disabled={disabled || (busy && !stop)}
        onClick={() => void run(action)}
      >
        {label}
      </Button>
    );
  }
  const motionCases = ["12", "13", "14", "15", "17", "24"];
  return (
    <ThemeProvider isDark={dark}>
      <Stack spacing={1.5} sx={{ height: "100%", overflow: "auto", p: 1.5 }}>
        <Typography variant="h6">Luka 原生操作与验收</Typography>
        <Stack direction="row" flexWrap="wrap" gap={1}>
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
            sx={{ minWidth: 180, maxWidth: "100%", flex: "1 1 200px" }}
            value={number}
            onChange={(event) => {
              controlRef.current?.stop();
              armRef.current = false;
              selectCase(event.target.value);
            }}
          >
            {guide.map((row) => (
              <MenuItem key={row.number} value={row.number}>
                {row.number} {row.title}
              </MenuItem>
            ))}
          </Select>
        </Stack>
        <Typography variant="subtitle2">原合同描述（{item.clause}）</Typography>
        <Typography
          data-testid="contract-requirement"
          sx={{ whiteSpace: "pre-wrap", maxHeight: 160, overflow: "auto", flexShrink: 0 }}
        >
          {item.requirement}
        </Typography>
        <Alert
          severity={!launcherOnline ? "warning" : launcher?.phase === "error" ? "error" : "info"}
        >
          {launcherOnline
            ? `运行案例：${launcher?.case || "无"} · ${launcher?.phase} · ${launcher?.message}`
            : "连接机器人后等待GUI管理器；没有新鲜状态时不可启动"}
        </Alert>
        <Typography variant="subtitle2">
          地图模式：
          {launcher?.case === "09"
            ? "持续建图"
            : ["10", "11"].includes(launcher?.case ?? "")
            ? "已有地图定位"
            : "以当前运行地图为准"}
        </Typography>
        <Stack direction="row" flexWrap="wrap" gap={1}>
          <Button
            variant={number === "09" ? "contained" : "outlined"}
            onClick={() => {
              controlRef.current?.stop();
              armRef.current = false;
              selectCase("09");
            }}
          >
            持续建图（09）
          </Button>
          <Button
            variant={["10", "11"].includes(number) ? "contained" : "outlined"}
            onClick={() => {
              controlRef.current?.stop();
              armRef.current = false;
              selectCase("10");
            }}
          >
            已有地图定位（10）
          </Button>
        </Stack>
        <Typography variant="caption">
          切换运行模式：先停止当前案例并等待确认，再选模式、开始案例。已有地图定位可从下方地图列表选择文件，并在3D中设置初始位姿。
        </Typography>
        {["08", "09", "10", "11", "20", ...motionCases].includes(number) && (
          <>
            <Alert severity={localizationFresh && localization?.ready ? "success" : "warning"}>
              {localizationFresh && localization?.ready
                ? "RTAB-Map初始定位已验证"
                : "RTAB-Map定位尚未验证，导航许可关闭"}
              {localizationFresh && (
                <Typography variant="caption" display="block">
                  {localization?.reason}
                </Typography>
              )}
            </Alert>
            <Typography variant="caption">
              在 3D 右侧发布工具中选择“位姿估计”，在当前地图上从车的位置拖向车头方向。
              等待“RTAB-Map初始定位已验证”后再开始导航。重设位姿会立即撤销导航许可。
            </Typography>
            {button("复核初始定位", () => service("/localization/validate_initial"))}
          </>
        )}
        {number === "03" && (
          <FormControlLabel
            label="融合EKF（自动准备轮里程计）"
            control={<Checkbox checked={withEkf} onChange={(_e, checked) => setWithEkf(checked)} />}
          />
        )}
        {["10", "11"].includes(number) && (
          <Select
            size="small"
            value={databasePath}
            onChange={(event) => setDatabasePath(event.target.value)}
          >
            <MenuItem value="">请选择已保存的 RTAB-Map .db 数据库</MenuItem>
            {Array.from(new Set([databasePath, ...(launcher?.maps ?? [])]))
              .filter(Boolean)
              .map((path) => (
                <MenuItem key={path} value={path}>
                  {path}
                </MenuItem>
              ))}
          </Select>
        )}
        <Stack direction="row" gap={1}>
          {button(
            "开始案例",
            async () => {
              if (["10", "11"].includes(number)) {
                const configured = (await service("/contract_demo_launcher/set_parameters", {
                  parameters: [
                    {
                      name: "database_path",
                      value: {
                        type: 4,
                        string_value: databasePath,
                        bool_value: false,
                        integer_value: 0,
                        double_value: 0,
                        byte_array_value: [],
                        bool_array_value: [],
                        integer_array_value: [],
                        double_array_value: [],
                        string_array_value: [],
                      },
                    },
                  ],
                })) as { results?: { successful: boolean; reason: string }[] };
                if (!configured.results?.every((value) => value.successful)) {
                  throw new Error(
                    configured.results?.map((value) => value.reason).join("; ") ?? "地图参数未确认",
                  );
                }
              }
              return await service(
                `/contract_demo/gui/start/case_${number === "03" && withEkf ? "03_ekf" : number}`,
              );
            },
            !launcherOnline ||
              (["10", "11"].includes(number) && !databasePath) ||
              launcher?.busy === true ||
              item.profile === "missing" ||
              item.profile === "service",
          )}
          {button("停止案例", async () => {
            controlRef.current?.stop();
            armRef.current = false;
            setArmed(false);
            return await service("/contract_demo/gui/stop");
          })}
        </Stack>
        {launcher?.log && (
          <details>
            <summary>运行日志</summary>
            <Typography
              component="pre"
              sx={{ maxHeight: 160, overflow: "auto", whiteSpace: "pre-wrap", fontSize: 12 }}
            >
              {launcher.log}
            </Typography>
          </details>
        )}
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
              {ready
                ? status
                : directManual
                ? "等待新鲜底盘状态和编码器；方向键禁用"
                : "等待新鲜底盘状态、轮速和双雷达；方向键禁用"}
            </Alert>
            {directManual && (
              <Typography variant="caption">
                底盘独立手动验收：/cmd_vel；没有雷达碰撞保护，请由操作者观察周围。
              </Typography>
            )}
            {lastBlocked && (
              <Alert severity="warning">上次方向操作被安全门拦截：{lastBlocked}</Alert>
            )}
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
              button("保存 RTAB-Map 数据库（不发运动目标）", () =>
                service("/contract_demo/save_map"),
              )}
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
        <FormControlLabel
          label="已验收"
          control={
            <Checkbox checked={accepted} onChange={(_event, checked) => setAccepted(checked)} />
          }
        />
        <Stack direction="row" gap={1}>
          <Button
            onClick={() => {
              const next = {
                ...records,
                [number]: {
                  number,
                  title: item.title,
                  accepted,
                  at: new Date().toISOString(),
                },
              };
              setRecords(next);
              context.saveState({ ...config, caseNumber: number, records: next });
              setResult(`${number} 已记录：${accepted ? "已验收" : "未验收"}`);
            }}
          >
            记录
          </Button>
          <Button
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([JSON.stringify(records, undefined, 2) ?? "{}"], {
                  type: "application/json",
                }),
              );
              const link = document.createElement("a");
              link.href = url;
              link.download = "Luka_合同验收记录.json";
              link.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            导出全部记录
          </Button>
        </Stack>
        <Typography variant="caption">
          ws://192.168.3.150:8765 · 原生 ROS 发布／服务调用 · 请求成功不等于验收通过
        </Typography>
      </Stack>
    </ThemeProvider>
  );
}
