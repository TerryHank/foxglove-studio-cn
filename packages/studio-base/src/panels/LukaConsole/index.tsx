// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/
import { useMemo } from "react";
import ReactDOM from "react-dom";
import { useCrash } from "@foxglove/hooks";
import { PanelExtensionContext } from "@foxglove/studio";
import { CaptureErrorBoundary } from "@foxglove/studio-base/components/CaptureErrorBoundary";
import Panel from "@foxglove/studio-base/components/Panel";
import { PanelExtensionAdapter } from "@foxglove/studio-base/components/PanelExtensionAdapter";
import { SaveConfig } from "@foxglove/studio-base/types/panels";
import LukaPanel from "./LukaPanel";

function initPanel(crash: ReturnType<typeof useCrash>, context: PanelExtensionContext) {
  // eslint-disable-next-line react/no-deprecated
  ReactDOM.render(
    <CaptureErrorBoundary onError={crash}>
      <LukaPanel context={context} />
    </CaptureErrorBoundary>,
    context.panelElement,
  );
  // eslint-disable-next-line react/no-deprecated
  return () => ReactDOM.unmountComponentAtNode(context.panelElement);
}
function LukaConsole(props: { config: unknown; saveConfig: SaveConfig<unknown> }) {
  const crash = useCrash();
  const init = useMemo(() => initPanel.bind(undefined, crash), [crash]);
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
    defaultConfig: { caseNumber: "03" },
  }),
);
