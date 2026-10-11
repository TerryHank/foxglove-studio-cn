// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/
import { Alert, Button, Stack, TextField, Typography } from "@mui/material";
import { useLayoutEffect, useRef, useState } from "react";

import { ros1 } from "@foxglove/rosmsg-msgs-common";
import { PanelExtensionContext } from "@foxglove/studio";
import ThemeProvider from "@foxglove/studio-base/theme/ThemeProvider";

const TOPICS = ["/voice/recognized_text", "/xiaozhi/answer", "/xiaozhi/status"];
export default function ConversationPanel({
  context,
}: {
  context: PanelExtensionContext;
}): JSX.Element {
  const [lines, setLines] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [status, setStatus] = useState("等待语音会话");
  const [fresh, setFresh] = useState(false);
  const [dark, setDark] = useState(false);
  const [done, setDone] = useState<() => void>(() => () => {});
  const received = useRef(-Infinity);
  const seen = useRef(new Set<string>());
  useLayoutEffect(() => {
    for (const topic of ["/llm_command", "/voice/control"]) {
      context.advertise?.(topic, "std_msgs/String", {
        datatypes: new Map([["std_msgs/String", ros1["std_msgs/String"]]]),
      });
    }
    context.subscribe(TOPICS.map((topic) => ({ topic })));
    context.watch("currentFrame");
    context.watch("colorScheme");
    context.onRender = (render, renderDone) => {
      setDone(() => renderDone);
      setDark(render.colorScheme === "dark");
      for (const event of render.currentFrame ?? []) {
        const value = String((event.message as { data?: string }).data ?? "");
        if (event.topic === "/xiaozhi/status") {
          received.current = performance.now();
          setStatus(value);
          continue;
        }
        const key = `${event.topic}:${event.receiveTime.sec}:${event.receiveTime.nsec}`;
        if (seen.current.has(key)) {
          continue;
        }
        seen.current.add(key);
        if (seen.current.size > 200) {
          seen.current.delete(seen.current.values().next().value as string);
        }
        setLines((old) =>
          [...old, `${event.topic === "/xiaozhi/answer" ? "露卡" : "识别"}：${value}`].slice(-30),
        );
      }
    };
    const timer = setInterval(() => {
      setFresh(performance.now() - received.current < 2500);
    }, 200);
    return () => {
      clearInterval(timer);
      context.onRender = undefined;
      context.unsubscribeAll();
      for (const topic of ["/llm_command", "/voice/control"]) {
        context.unadvertise?.(topic);
      }
    };
  }, [context]);
  useLayoutEffect(() => {
    done();
  }, [done]);
  function publish(topic: string, value: string) {
    try {
      context.publish?.(topic, { data: value });
    } catch (error) {
      setLines((old) => [...old, String(error)].slice(-30));
    }
  }
  return (
    <ThemeProvider isDark={dark}>
      <Stack spacing={1} style={{ height: "100%", overflow: "auto", padding: 12 }}>
        <Alert severity={fresh ? "info" : "warning"}>
          {fresh ? "语音会话在线" : "等待新鲜语音状态"}
        </Alert>
        <TextField
          label="对露卡说"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
          }}
          inputProps={{ maxLength: 200 }}
        />
        <Stack direction="row" spacing={1}>
          <Button
            disabled={!fresh || !text.trim() || context.publish == undefined}
            onClick={() => {
              publish("/llm_command", text.trim());
              setLines((old) => [...old, `输入：${text.trim()}`].slice(-30));
              setText("");
            }}
          >
            发送
          </Button>
          <Button
            disabled={context.publish == undefined}
            onClick={() => {
              publish("/voice/control", "interrupt");
            }}
          >
            打断回答
          </Button>
          <Button
            disabled={context.publish == undefined}
            onClick={() => {
              publish("/voice/control", "cancel");
            }}
          >
            取消所属任务
          </Button>
        </Stack>
        <Typography style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
          {lines.join("\n") || "等待识别文本与露卡回答"}
        </Typography>
        <details>
          <summary>后端与任务状态</summary>
          <Typography component="pre" style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>
            {status}
          </Typography>
        </details>
      </Stack>
    </ThemeProvider>
  );
}
