// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { useEffect, useRef, useState } from "react";

import {
  useMessagePipelineGetter,
  useMessagePipelineSubscribe,
} from "@foxglove/studio-base/components/MessagePipeline";
import { useCurrentLayoutActions } from "@foxglove/studio-base/context/CurrentLayoutContext";
import { LayoutData } from "@foxglove/studio-base/context/CurrentLayoutContext/actions";
import { usePlayerSelection } from "@foxglove/studio-base/context/PlayerSelectionContext";

// The desktop's opt-in loopback API exposes visualization only, never ROS writes.
export function DemoControlAdapter(): null {
  const [enabled] = useState(
    () => new URLSearchParams(window.location.search).get("demoControl") === "true",
  );
  const { getCurrentLayoutState, setCurrentLayout } = useCurrentLayoutActions();
  const getPipeline = useMessagePipelineGetter();
  const subscribe = useMessagePipelineSubscribe();
  const feedback = useRef<Record<string, unknown>>({});
  const feedbackPlayerId = useRef("");
  const { selectSource } = usePlayerSelection();

  useEffect(() => {
    if (!enabled) {
      return;
    }
    return subscribe(({ playerState }) => {
      if (feedbackPlayerId.current !== playerState.playerId) {
        feedback.current = {};
        feedbackPlayerId.current = playerState.playerId;
      }
      for (const message of playerState.activeData?.messages ?? []) {
        if (message.topic === "/imu/data" || message.topic === "/wheel/odom") {
          feedback.current[message.topic] = {
            receiveTime: message.receiveTime,
            message: message.message,
          };
        }
      }
    });
  }, [enabled, subscribe]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const host = window as Window & { foxgloveDemoControl?: unknown };
    host.foxgloveDemoControl = {
      layout: () => getCurrentLayoutState().selectedLayout,
      setLayout: (name: string, data: LayoutData) => {
        setCurrentLayout({ name, data });
        return { name, panelIds: Object.keys(data.configById) };
      },
      connect: (url: string) => {
        selectSource("foxglove-websocket", { type: "connection", params: { url } });
        return { url };
      },
      status: () => {
        const { playerState, subscriptions } = getPipeline();
        const data = playerState.activeData;
        return {
          layoutName: getCurrentLayoutState().selectedLayout?.name,
          presence: playerState.presence,
          source: playerState.name,
          totalBytesReceived: data?.totalBytesReceived ?? 0,
          topics: data?.topics,
          topicStats: data ? Object.fromEntries(data.topicStats) : {},
          motionFeedback: feedback.current,
          subscriptions: subscriptions.map((s) => s.topic),
          problems: playerState.problems,
        };
      },
    };
    return () => {
      delete host.foxgloveDemoControl;
    };
  }, [enabled, getCurrentLayoutState, setCurrentLayout, getPipeline, selectSource]);

  return ReactNull;
}
