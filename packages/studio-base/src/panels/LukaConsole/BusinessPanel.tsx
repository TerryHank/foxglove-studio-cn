// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/
import { Alert, Button, MenuItem, Select, Stack, TextField, Typography } from "@mui/material";
import { useLayoutEffect, useRef, useState } from "react";

import { ros1 } from "@foxglove/rosmsg-msgs-common";
import { PanelExtensionContext } from "@foxglove/studio";
import ThemeProvider from "@foxglove/studio-base/theme/ThemeProvider";

type Operation = {
  id: string;
  category: string;
  label: string;
  method: string;
  example: Record<string, unknown>;
  motion: boolean;
};
type Capability = {
  name: string;
  description: string;
  ready: boolean;
  reason?: string;
  motion: boolean;
  input_schema: { properties?: Record<string, { type?: string; description?: string }> };
};
type State = {
  epoch: string;
  backend: string;
  generation: number;
  lease_at: number;
  motion_enabled: boolean;
  operations: Operation[];
  capabilities: Capability[];
};
const TOPIC = "/luka/ui/request";

export default function BusinessPanel({
  context,
}: {
  context: PanelExtensionContext;
}): JSX.Element {
  const [state, setState] = useState<State>();
  const [fresh, setFresh] = useState(false);
  const [dark, setDark] = useState(false);
  const [category, setCategory] = useState("业务能力");
  const [selected, setSelected] = useState("capabilities");
  const [tool, setTool] = useState("");
  const [body, setBody] = useState("{}");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string>();
  const [result, setResult] = useState("等待业务后端。提交成功与任务完成分别显示。");
  const received = useRef(-Infinity);
  const client = useRef(crypto.randomUUID());
  const epoch = useRef("");
  const requestId = useRef<string>();
  const [done, setDone] = useState<() => void>(() => () => {});
  useLayoutEffect(() => {
    context.advertise?.(TOPIC, "std_msgs/String", {
      datatypes: new Map([["std_msgs/String", ros1["std_msgs/String"]]]),
    });
    context.subscribe(["/luka/ui/state", "/luka/ui/result"].map((topic) => ({ topic })));
    context.watch("currentFrame");
    context.watch("colorScheme");
    context.onRender = (render, renderDone) => {
      setDone(() => renderDone);
      setDark(render.colorScheme === "dark");
      for (const event of render.currentFrame ?? []) {
        try {
          const data = JSON.parse((event.message as { data: string }).data) as State & {
            client?: string;
            id?: string;
            phase?: string;
          };
          if (event.topic === "/luka/ui/state") {
            if (
              !Array.isArray(data.operations) ||
              !Array.isArray(data.capabilities) ||
              typeof data.epoch !== "string"
            ) {
              throw new Error("业务状态格式错误");
            }
            if (epoch.current && epoch.current !== data.epoch) {
              setPending(undefined);
              requestId.current = undefined;
              setResult("后端已重启；旧请求结果需核对，不自动重发。");
            }
            epoch.current = data.epoch;
            setState(data);
            received.current = performance.now();
          } else if (data.client === client.current && data.id === requestId.current) {
            setResult(JSON.stringify(data, undefined, 2) ?? "{}");
            if (data.phase !== "submitted") {
              setPending(undefined);
            }
          }
        } catch {
          if (event.topic === "/luka/ui/state") {
            received.current = -Infinity;
          }
        }
      }
    };
    const timer = setInterval(() => {
      setFresh(performance.now() - received.current < 2500);
    }, 200);
    return () => {
      clearInterval(timer);
      context.onRender = undefined;
      context.unsubscribeAll();
      context.unadvertise?.(TOPIC);
    };
  }, [context]);
  useLayoutEffect(() => {
    done();
  }, [done]);
  const operation = state?.operations.find((row) => row.id === selected);
  const capability = state?.capabilities.find((row) => row.name === tool);
  const enabled = fresh && state?.backend === "ready" && context.publish != undefined;
  const blocked = operation?.motion === true && state?.motion_enabled !== true;
  const stop = ["nav_stop", "follow_stop", "patrol_write_stop", "cancel_task"].includes(selected);
  let form: Record<string, unknown> = {};
  try {
    form = JSON.parse(body) as Record<string, unknown>;
  } catch {
    /* Submit validates the raw editor. */
  }
  const fields: Record<string, { type?: string; description?: string }> =
    selected === "execute"
      ? capability?.input_schema.properties ?? {}
      : Object.fromEntries(
          Object.entries(operation?.example ?? {}).map(([name, value]) => [
            name,
            { type: Array.isArray(value) ? "array" : typeof value },
          ]),
        );
  function field(name: string, value: unknown) {
    setBody(JSON.stringify({ ...form, [name]: value }, undefined, 2) ?? "{}");
  }
  function select(row: Operation) {
    setDrafts({});
    setSelected(row.id);
    setBody(JSON.stringify(row.example, undefined, 2) ?? "{}");
  }
  function submit() {
    try {
      if (
        !enabled ||
        !operation ||
        (pending != undefined && operation.method !== "GET" && !stop) ||
        blocked
      ) {
        throw new Error("状态过期、请求未完成或运动许可关闭");
      }
      let parameters: unknown = JSON.parse(body);
      if (parameters == undefined || Array.isArray(parameters) || typeof parameters !== "object") {
        throw new Error("参数必须是JSON对象");
      }
      if (selected === "execute") {
        if (capability?.ready !== true) {
          throw new Error(capability?.reason ?? "请选择已就绪能力");
        }
        parameters = {
          tool,
          arguments: parameters,
          source: "foxglove",
          generation: state.generation,
          task_id: `foxglove-${client.current}`,
          operation_id: crypto.randomUUID(),
        };
      }
      const id = crypto.randomUUID();
      requestId.current = id;
      setPending(id);
      setResult("已提交，等待回执。不会自动重发；任务是否完成见回执状态及实测反馈。");
      context.publish?.(TOPIC, {
        data: JSON.stringify({
          id,
          client: client.current,
          epoch: state.epoch,
          lease_at: state.lease_at,
          operation: selected,
          body: parameters,
        }),
      });
      if (
        selected.includes("login") ||
        selected.includes("register") ||
        selected.includes("network/connect")
      ) {
        setBody("{}");
      }
    } catch (error) {
      setPending(undefined);
      setResult(String(error));
    }
  }
  return (
    <ThemeProvider isDark={dark}>
      <Stack spacing={1.5} style={{ height: "100%", overflow: "auto", padding: 12 }}>
        <Typography variant="h6">露卡 · 统一业务控制</Typography>
        <Alert severity={enabled ? "info" : "warning"}>
          {enabled ? "业务后端在线 · Foxglove 原生入口" : "等待新鲜业务状态，操作禁用"}
          {" · "}
          {state?.motion_enabled === true ? "仍须通过执行器安全门" : "生产业务运动许可关闭"}
        </Alert>
        <Select
          size="small"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            const row = state?.operations.find((item) => item.category === e.target.value);
            if (row) {
              select(row);
            }
          }}
        >
          {Array.from(
            new Set([category, ...(state?.operations.map((row) => row.category) ?? [])]),
          ).map((name) => (
            <MenuItem key={name} value={name}>
              {name}
            </MenuItem>
          ))}
        </Select>
        <Select
          size="small"
          value={selected}
          onChange={(e) => {
            const row = state?.operations.find((item) => item.id === e.target.value);
            if (row) {
              select(row);
            }
          }}
        >
          {(
            state?.operations.filter((row) => row.category === category) ?? [
              { id: "capabilities", label: "刷新已安装能力", method: "GET" },
            ]
          ).map((row) => (
            <MenuItem key={row.id} value={row.id}>
              {row.label}
            </MenuItem>
          ))}
        </Select>
        {selected === "execute" && (
          <>
            <Select
              size="small"
              value={tool}
              displayEmpty
              onChange={(e) => {
                setTool(e.target.value);
                setDrafts({});
                setBody("{}");
              }}
            >
              <MenuItem value="">选择动态发现的业务能力</MenuItem>
              {state?.capabilities.map((row) => (
                <MenuItem key={row.name} value={row.name}>
                  {row.description} · {row.ready ? "就绪" : row.reason ?? "未就绪"}
                </MenuItem>
              ))}
            </Select>
          </>
        )}
        {Object.entries(fields).map(([name, schema]) => {
          const value = form[name];
          if (schema.type === "boolean") {
            return (
              <Select
                key={name}
                value={String(value ?? false)}
                onChange={(e) => {
                  field(name, e.target.value === "true");
                }}
              >
                <MenuItem value="false">{name}：否</MenuItem>
                <MenuItem value="true">{name}：是</MenuItem>
              </Select>
            );
          }
          const structured = schema.type === "object" || schema.type === "array";
          return (
            <TextField
              key={name}
              label={schema.description ?? name}
              type={
                /password|secret|pairing_code/i.test(name)
                  ? "password"
                  : schema.type === "number" || schema.type === "integer"
                  ? "number"
                  : "text"
              }
              multiline={structured}
              minRows={structured ? 2 : undefined}
              value={
                structured
                  ? drafts[name] ?? JSON.stringify(value ?? (schema.type === "array" ? [] : {}))
                  : String(value ?? "")
              }
              onChange={(e) => {
                if (structured) {
                  setDrafts((previous) => ({ ...previous, [name]: e.target.value }));
                  try {
                    field(name, JSON.parse(e.target.value));
                  } catch {
                    /* Preserve the draft while editing. */
                  }
                } else {
                  field(
                    name,
                    schema.type === "number" || schema.type === "integer"
                      ? Number(e.target.value)
                      : e.target.value,
                  );
                }
              }}
            />
          );
        })}
        {!Object.keys(fields).some((name) => /password|secret|pairing_code/i.test(name)) && (
          <details>
            <summary>高级参数 / 能力契约</summary>
            <Typography component="pre" style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>
              {JSON.stringify(capability?.input_schema ?? operation?.example ?? {}, undefined, 2)}
            </Typography>
            <TextField
              label="操作参数 JSON（不保存在布局）"
              value={body}
              multiline
              minRows={3}
              onChange={(e) => {
                setBody(e.target.value);
              }}
            />
          </details>
        )}
        <Typography variant="caption">
          读取房间/路线后可编辑回执中的 data，以当前 revision 保存。地图和实时图像在左侧原生面板。
          未实现的电梯、自主建图等仅显示待办，不表示已恢复。
        </Typography>
        <Button
          variant="contained"
          disabled={
            !enabled ||
            (pending != undefined && operation?.method !== "GET" && !stop) ||
            blocked ||
            Object.values(drafts).some((value) => {
              try {
                JSON.parse(value);
                return false;
              } catch {
                return true;
              }
            }) ||
            (selected === "execute" && capability?.ready !== true)
          }
          onClick={submit}
        >
          {stop
            ? "取消 / 停止"
            : operation?.method === "GET"
            ? "读取"
            : pending
            ? "等待操作回执"
            : "提交操作"}
        </Button>
        {pending && (
          <Alert severity="warning">若连接中断，核对任务状态后再操作，不重复发送动作。</Alert>
        )}
        <Typography
          component="pre"
          style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 12 }}
        >
          {result}
        </Typography>
      </Stack>
    </ThemeProvider>
  );
}
