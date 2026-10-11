// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/
import { Alert, Button, Stack, Typography } from "@mui/material";
import { useLayoutEffect, useRef, useState } from "react";
import { PanelExtensionContext } from "@foxglove/studio";
import ThemeProvider from "@foxglove/studio-base/theme/ThemeProvider";
import {
  checkedService,
  enableAlgorithm,
  enableBase,
  FollowSnapshot,
  parseSnapshot,
} from "./followControl";

const EMPTY: FollowSnapshot = {
  output_mode: "unknown",
  follow_status: "DISABLED",
  diagnostic: "等待GUI服务与预览链",
  production_ready: false,
  live_verified: false,
  camera_fresh: false,
  mot_fresh: false,
  targets: [],
  owned_preview: false,
  error: "",
};

export default function PersonFollowPanel({
  context,
}: {
  context: PanelExtensionContext;
}): JSX.Element {
  const [state, setState] = useState<FollowSnapshot>(EMPTY);
  const [fresh, setFresh] = useState(false);
  const [dark, setDark] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("先启动预览。请求成功不等于完成；观察图像、状态与里程计。");
  const [done, setDone] = useState<() => void>(() => () => {});
  const received = useRef(-Infinity);
  const epoch = useRef(0);
  useLayoutEffect(() => {
    context.subscribe([{ topic: "/person_follow/gui/state" }]);
    context.watch("currentFrame");
    context.watch("colorScheme");
    context.onRender = (render, renderDone) => {
      setDone(() => renderDone);
      setDark(render.colorScheme === "dark");
      for (const event of render.currentFrame ?? []) {
        if (event.topic !== "/person_follow/gui/state") {
          continue;
        }
        try {
          setState(parseSnapshot(String((event.message as { data?: string }).data)));
          received.current = performance.now();
        } catch {
          received.current = -Infinity;
          setResult("GUI状态格式错误，保持禁止启用");
        }
      }
    };
    const timer = setInterval(() => setFresh(performance.now() - received.current < 2500), 200);
    return () => {
      clearInterval(timer);
      context.onRender = undefined;
      context.unsubscribeAll();
    };
  }, [context]);
  useLayoutEffect(() => {
    done();
  }, [done]);
  async function call(name: string, request: Record<string, unknown>) {
    if (!context.callService) {
      throw new Error("数据源不支持ROS服务");
    }
    return await context.callService(name, request);
  }
  async function run(action: () => Promise<unknown>, stop = false) {
    const generation = stop ? ++epoch.current : epoch.current;
    setBusy(true);
    try {
      const reply = await action();
      if (generation === epoch.current) {
        setResult(JSON.stringify(reply) ?? "请求已发送");
      }
    } catch (error) {
      if (generation === epoch.current) {
        setResult(String(error));
      }
    } finally {
      if (generation === epoch.current) {
        setBusy(false);
      }
    }
  }
  const blocked = !fresh || context.callService == undefined;
  return (
    <ThemeProvider isDark={dark}>
      <Stack spacing={1.5} sx={{ height: "100%", overflow: "auto", p: 1.5 }}>
        <Typography variant="h6">人体跟随实验</Typography>
        <Alert severity={!fresh || state.error ? "warning" : "info"}>
          {!fresh
            ? "等待机器人GUI服务；暂不允许启用"
            : `模式：${
                state.output_mode === "dry_run"
                  ? "不动轮观察"
                  : state.output_mode === "nav2_action"
                  ? "动作模式"
                  : "等待启动"
              } · ${state.follow_status}`}
        </Alert>
        <Typography>
          相机：{state.camera_fresh ? "新鲜" : "等待"} · MOT：{state.mot_fresh ? "新鲜" : "等待"} ·
          导航运行条件：{state.production_ready ? "接口就绪" : "未就绪"}
        </Typography>
        <Typography>
          人体：
          {state.targets.length
            ? state.targets.map((t) => `ID ${t.track_id}（${t.confidence.toFixed(2)}）`).join("，")
            : "当前没有新鲜人体目标"}
        </Typography>
        <Typography sx={{ overflowWrap: "anywhere" }}>诊断：{state.diagnostic}</Typography>
        {state.error && <Alert severity="error">{state.error}</Alert>}
        <Typography variant="subtitle1">① 图像与不动轮观察</Typography>
        <Button
          variant="contained"
          disabled={blocked || busy}
          onClick={() => void run(() => checkedService(call, "/person_follow/gui/start_preview"))}
        >
          启动感知预览（算法关闭）
        </Button>
        <Button
          variant="outlined"
          disabled={blocked || busy || state.output_mode !== "dry_run"}
          onClick={() => void run(() => enableAlgorithm(call, state, fresh, false))}
        >
          启用 dry-run 观察
        </Button>
        <Typography variant="caption">
          相机前2–3m缓慢移动，先看人框、ID与深度。没有生产地图/TF时，候选目标会被阻止。
        </Typography>
        <Typography variant="subtitle1">② 当前基础导航与定位</Typography>
        <Button
          variant="outlined"
          disabled={blocked || busy}
          onClick={() => void run(() => checkedService(call, "/person_follow/gui/prepare_base"))}
        >
          准备基础栈（关闭运动许可）
        </Button>
        <Typography variant="caption">
          复用当前SLAM/Nav2；核对地图和初始定位，不启动自动旋转定位。
        </Typography>
        <Typography variant="subtitle1">③ 操作者实车实验</Typography>
        <Button
          variant="outlined"
          disabled={blocked || busy || !state.production_ready}
          onClick={() =>
            void run(() =>
              checkedService(call, "/person_follow/gui/prepare_action_mode", { data: true }),
            )
          }
        >
          切换动作模式（算法仍关闭）
        </Button>
        <Button
          variant="outlined"
          disabled={
            blocked ||
            busy ||
            !state.production_ready ||
            !state.camera_fresh ||
            !state.mot_fresh ||
            state.output_mode !== "nav2_action"
          }
          onClick={() => void run(() => enableAlgorithm(call, state, fresh))}
        >
          启用动作模式跟随算法
        </Button>
        <Button
          color="warning"
          variant="contained"
          disabled={
            blocked ||
            busy ||
            !state.production_ready ||
            !state.camera_fresh ||
            !state.mot_fresh ||
            state.output_mode !== "nav2_action" ||
            !state.follow_status.includes("TRACKING:id=") ||
            state.diagnostic.includes("BLOCKED")
          }
          onClick={() => void run(() => enableBase(call, state, fresh))}
        >
          放行底盘跟随（可能运动）
        </Button>
        <Typography variant="caption">
          先算法TRACKING，再手动放行；丢人或运行数据过期会关闭许可，恢复后须重新手动放行。
        </Typography>
        <Button
          color="error"
          variant="contained"
          disabled={context.callService == undefined}
          onClick={() => {
            void run(() => checkedService(call, "/person_follow/gui/stop"), true);
          }}
        >
          停止跟随并关闭底盘许可
        </Button>
        <Button
          variant="outlined"
          disabled={blocked || busy}
          onClick={() => void run(() => checkedService(call, "/person_follow/gui/close_preview"))}
        >
          关闭本界面预览链
        </Button>
        <Typography sx={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>{result}</Typography>
        <Typography variant="caption">
          停止后以实测轮速确认。人脸匹配不授权指定身份跟随；本页不发布速度。
        </Typography>
      </Stack>
    </ThemeProvider>
  );
}
