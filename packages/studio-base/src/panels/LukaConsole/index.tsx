// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/
import { useCallback, useMemo } from "react";
import ReactDOM from "react-dom";
import { useCrash } from "@foxglove/hooks";
import { PanelExtensionContext } from "@foxglove/studio";
import { CaptureErrorBoundary } from "@foxglove/studio-base/components/CaptureErrorBoundary";
import Panel from "@foxglove/studio-base/components/Panel";
import { PanelExtensionAdapter } from "@foxglove/studio-base/components/PanelExtensionAdapter";
import { SaveConfig } from "@foxglove/studio-base/types/panels";
import { useCurrentLayoutActions } from "@foxglove/studio-base/context/CurrentLayoutContext";
import { LayoutData } from "@foxglove/studio-base/context/CurrentLayoutContext/actions";
import LukaPanel from "./LukaPanel";
import presets from "./presets.json";
import guide from "./guide.json";

function initPanel(
  crash: ReturnType<typeof useCrash>,
  selectCase: (number: string) => void,
  context: PanelExtensionContext,
) {
  // eslint-disable-next-line react/no-deprecated
  ReactDOM.render(
    <CaptureErrorBoundary onError={crash}>
      <LukaPanel context={context} selectCase={selectCase} />
    </CaptureErrorBoundary>,
    context.panelElement,
  );
  // eslint-disable-next-line react/no-deprecated
  return () => ReactDOM.unmountComponentAtNode(context.panelElement);
}
function LukaConsole(props: { config: unknown; saveConfig: SaveConfig<unknown> }) {
  const crash = useCrash();
  const { getCurrentLayoutState, setCurrentLayout } = useCurrentLayoutActions();
  const selectCase = useCallback(
    (number: string) => {
      const serialized = JSON.stringify((presets as Record<string, unknown>)[number]);
      if (!serialized) {
        return;
      }
      const data = JSON.parse(serialized) as LayoutData;
      const old = getCurrentLayoutState().selectedLayout?.data?.configById ?? {};
      const previous = Object.entries(old).find(
        ([key, value]) =>
          key.startsWith("LukaConsole!") && (value as { records?: unknown }).records != undefined,
      )?.[1] as { records?: unknown } | undefined;
      const panel = Object.entries(data.configById).find(([key]) => key.startsWith("LukaConsole!"));
      if (panel) {
        Object.assign(panel[1], { records: previous?.records ?? {} });
      }
      if (
        Object.values(old).some(
          (value) => (value as { initialView?: string }).initialView === "business",
        )
      ) {
        data.configById["LukaConsole!business"] = { initialView: "business" };
        data.layout = {
          direction: "row",
          first: data.layout!,
          second: "LukaConsole!business",
          splitPercentage: 72,
        };
      }
      if (
        Object.values(old).some(
          (value) => (value as { initialView?: string }).initialView === "conversation",
        )
      ) {
        data.configById["LukaConsole!conversation"] = { initialView: "conversation" };
        data.layout = {
          direction: "column",
          first: data.layout!,
          second: "LukaConsole!conversation",
          splitPercentage: 78,
        };
      }
      setCurrentLayout({
        name: `合同验收 ${number} · ${guide.find((row) => row.number === number)?.title ?? ""}`,
        data,
      });
    },
    [getCurrentLayoutState, setCurrentLayout],
  );
  const init = useMemo(() => initPanel.bind(undefined, crash, selectCase), [crash, selectCase]);
  const config = props.config as { caseNumber?: string; initialView?: string };
  return (
    <PanelExtensionAdapter
      key={`${config.caseNumber}:${config.initialView}`}
      {...props}
      initPanel={init}
      highestSupportedConfigVersion={1}
    />
  );
}
export default Panel(
  Object.assign(LukaConsole, {
    panelType: "LukaConsole",
    defaultConfig: { caseNumber: "01" },
  }),
);
