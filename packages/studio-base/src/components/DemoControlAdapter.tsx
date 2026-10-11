// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { get, set } from "idb-keyval";
import { useContext, useEffect, useRef, useState } from "react";
import { ExtensionPanelRegistration } from "@foxglove/studio";

import {
  useMessagePipelineGetter,
  useMessagePipelineSubscribe,
} from "@foxglove/studio-base/components/MessagePipeline";
import { useCurrentLayoutActions } from "@foxglove/studio-base/context/CurrentLayoutContext";
import { LayoutData } from "@foxglove/studio-base/context/CurrentLayoutContext/actions";
import { usePlayerSelection } from "@foxglove/studio-base/context/PlayerSelectionContext";
import { ExtensionCatalogContext, useExtensionCatalog } from "@foxglove/studio-base/context/ExtensionCatalogContext";
import { ExtensionInfo } from "@foxglove/studio-base/types/Extensions";

const JOINT_EXTENSION_KEY = "local-joint-state-publisher-0.1.0";
const JOINT_EXTENSION_HASH = "3c1ba8195e31809939c89ce73320cdc47147f012f41b050029f6aae4dabc7c93";

async function loadJointExtension(bytes: Uint8Array): Promise<{ info: ExtensionInfo; registration: ExtensionPanelRegistration }> {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  if (Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("") !== JOINT_EXTENSION_HASH) {
    throw new Error("Joint State Publisher release hash mismatch");
  }
  const files = new Map<string, string>();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = view.getUint32(bytes.length - 6, true);
  while (offset + 46 <= bytes.length && view.getUint32(offset, true) === 0x02014b50) {
    const method = view.getUint16(offset + 10, true);
    const size = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const local = view.getUint32(offset + 42, true);
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    if (method !== 0) { throw new Error("Expected the verified stored ZIP release"); }
    if (name === "package.json" || name === "dist/extension.js") {
      files.set(name, new TextDecoder().decode(bytes.subarray(start, start + size)));
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  const manifest = JSON.parse(files.get("package.json")!);
  const qualifiedName = `${manifest.publisher}.${manifest.name}`;
  const info: ExtensionInfo = { ...manifest, id: qualifiedName, qualifiedName, namespace: "local" };
  const module = { exports: {} as { activate: (context: { registerPanel: (panel: ExtensionPanelRegistration) => void }) => void } };
  // Execute only the hash-verified community extension, using its standard CommonJS entry point.
  new Function("module", files.get("dist/extension.js")!)(module);
  let registration: ExtensionPanelRegistration | undefined;
  module.exports.activate({ registerPanel: (panel) => { registration = panel; } });
  if (registration?.name !== "Joint State Publisher") { throw new Error("Joint panel registration missing"); }
  return { info, registration };
}

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
  const extensionCatalog = useContext(ExtensionCatalogContext);
  const installedExtensions = useExtensionCatalog((catalog) => catalog.installedExtensions);
  const installedPanels = useExtensionCatalog((catalog) => catalog.installedPanels);
  const registerJointExtension = async (bytes: Uint8Array) => {
    const { info, registration } = await loadJointExtension(bytes);
    extensionCatalog.setState({
      installedExtensions: [info],
      installedPanels: { [info.qualifiedName]: { extensionName: info.qualifiedName, extensionNamespace: "local", registration } },
    });
    return info;
  };
  const restoreStarted = useRef(false);
  useEffect(() => {
    if (restoreStarted.current) { return; }
    restoreStarted.current = true;
    void get<Uint8Array>(JOINT_EXTENSION_KEY).then(async (bytes) => {
      if (bytes) { await registerJointExtension(bytes); }
    }).catch((error: unknown) => { console.error("Joint extension restore failed", error); });
  }, []);

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
      installJointStatePublisher: async (base64: string) => {
        const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
        const info = await registerJointExtension(bytes);
        await set(JOINT_EXTENSION_KEY, bytes);
        return info;
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
          installedExtensions,
          installedExtensionPanels: Object.keys(installedPanels ?? {}),
        };
      },
    };
    return () => {
      delete host.foxgloveDemoControl;
    };
  }, [enabled, getCurrentLayoutState, setCurrentLayout, getPipeline, selectSource, installedExtensions, installedPanels]);

  return ReactNull;
}
