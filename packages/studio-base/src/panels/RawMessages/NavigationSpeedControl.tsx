import { useEffect, useRef, useState } from "react";

import {
  useMessagePipeline,
  type MessagePipelineContext,
} from "@foxglove/studio-base/components/MessagePipeline";

const selectCallService = (context: MessagePipelineContext) => context.callService;
const selectConnected = (context: MessagePipelineContext) =>
  context.playerState.presence === "PRESENT" &&
  context.playerState.capabilities.includes("callServices");

const servicePrefix = "/omnifleet_t2/nav2/";
const minimumSpeed = 0.3;
const maximumSpeed = 2;
const fields = {
  hot_dwb: ["linear_speed", "max_vel_x"],
  rpp: ["rpp_desired_linear_vel", "desired_linear_vel"],
  mppi: ["mppi_vx_max", "vx_max"],
} as const;

type CallService = MessagePipelineContext["callService"];
type SpeedConfig = { field: string; value: number };
type SavedConfig = {
  algorithms: { local: { current: keyof typeof fields } };
  saved: Record<string, Record<string, number>>;
};

function parseSpeedConfig(data: SavedConfig): SpeedConfig {
  const selected = data.algorithms.local.current;
  const binding = fields[selected];
  if (!binding) {
    throw new Error("当前控制器没有速度调节入口");
  }
  const [field, parameter] = binding;
  const value = data.saved[field]?.[parameter];
  if (value == undefined || !Number.isFinite(value)) {
    throw new Error("无法读取导航速度");
  }
  return { field, value };
}

async function request(call: CallService, service: string, payload: unknown): Promise<unknown> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      call(servicePrefix + service, payload),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("导航参数服务超时")), 12000);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

async function readSpeed(call: CallService): Promise<SpeedConfig> {
  const response = (await request(call, "read_saved", {})) as { success: boolean; message: string };
  if (!response.success) {
    throw new Error(response.message);
  }
  return parseSpeedConfig(JSON.parse(response.message) as SavedConfig);
}

export function NavigationSpeedControl(): JSX.Element {
  const call = useMessagePipeline(selectCallService);
  const connected = useMessagePipeline(selectConnected);
  const [config, setConfig] = useState<SpeedConfig>();
  const [draft, setDraft] = useState<number>();
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const inFlight = useRef(false);
  const generation = useRef(0);

  useEffect(() => {
    const current = ++generation.current;
    let retry: ReturnType<typeof setTimeout> | undefined;
    setConfig(undefined);
    setDraft(undefined);
    setSaving(false);
    inFlight.current = false;
    setStatus(connected ? "读取中…" : "等待连接");
    async function refresh(): Promise<void> {
      try {
        const next = await readSpeed(call);
        if (generation.current === current) {
          setConfig(next);
          setStatus("");
        }
      } catch {
        if (generation.current === current) {
          setStatus("速度服务暂不可用");
          retry = setTimeout(() => void refresh(), 2500);
        }
      }
    }
    if (connected) {
      void refresh();
    }
    return () => {
      ++generation.current;
      clearTimeout(retry);
    };
  }, [call, connected]);

  async function commit(value: number): Promise<void> {
    if (!connected || !config || inFlight.current || !Number.isFinite(value)) {
      return;
    }
    if (Math.abs(value - config.value) < 1e-6) {
      setDraft(undefined);
      return;
    }
    const current = generation.current;
    inFlight.current = true;
    setSaving(true);
    setStatus("保存中…");
    try {
      const latest = await readSpeed(call);
      if (generation.current !== current) {
        return;
      }
      if (latest.field !== config.field) {
        setConfig(latest);
        setStatus("导航配置已更新，请重新调节");
        return;
      }
      const response = (await request(call, "save_parameters", {
        parameters: [{ name: config.field, value: { type: 3, double_value: value } }],
      })) as { results?: { successful: boolean; reason: string }[] };
      const result = response.results?.[0];
      if (!result?.successful) {
        throw new Error(result?.reason ?? "没有保存确认");
      }
      const receipt = JSON.parse(result.reason) as SavedConfig & { runtime_confirmed?: boolean };
      if (generation.current === current) {
        setConfig(parseSpeedConfig(receipt));
        setStatus(receipt.runtime_confirmed ? "已应用" : "已保存，运行中未确认");
      }
    } catch {
      if (generation.current === current) {
        setStatus("保存未确认");
        try {
          const latest = await readSpeed(call);
          if (generation.current === current) {
            setConfig(latest);
          }
        } catch {
          // Keep the last known value when the service is unavailable.
        }
      }
    } finally {
      if (generation.current === current) {
        inFlight.current = false;
        setSaving(false);
        setDraft(undefined);
      }
    }
  }

  const shown = draft ?? config?.value;
  return (
    <div style={{ padding: "4px 16px 8px" }}>
      <label style={{ display: "flex", flexDirection: "column" }}>
        <span
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            fontSize: 13,
          }}
        >
          <span>导航速度</span>
          <strong style={{ fontVariantNumeric: "tabular-nums" }}>
            {shown == undefined ? "—" : `${shown.toFixed(2)} m/s`}
          </strong>
        </span>
        <input
          aria-label="导航速度"
          type="range"
          min={minimumSpeed}
          max={maximumSpeed}
          step={0.01}
          value={shown ?? minimumSpeed}
          disabled={!connected || !config || saving}
          style={{ width: "100%", height: 30, margin: 0, accentColor: "#a692f8" }}
          onChange={(event) => setDraft(event.currentTarget.valueAsNumber)}
          onPointerUp={(event) => void commit(event.currentTarget.valueAsNumber)}
          onPointerCancel={() => setDraft(undefined)}
          onKeyUp={(event) => {
            if (
              [
                "ArrowLeft",
                "ArrowRight",
                "ArrowUp",
                "ArrowDown",
                "Home",
                "End",
                "PageUp",
                "PageDown",
              ].includes(event.key)
            ) {
              void commit(event.currentTarget.valueAsNumber);
            }
          }}
        />
      </label>
      <div role="status" style={{ fontSize: 10, minHeight: 12, opacity: 0.8 }}>
        {status}
      </div>
    </div>
  );
}
