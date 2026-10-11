// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.
import { PanelExtensionContext } from "@foxglove/studio";
import { useLayoutEffect, useRef } from "react";

import { initFleetPanel } from "./fleetPanelController";

export default function FleetPanel({ context }: { context: PanelExtensionContext }): JSX.Element {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!root.current) {
      return;
    }
    return initFleetPanel(context, root.current);
  }, [context]);
  return <div ref={root} style={{ height: "100%", overflow: "hidden" }} />;
}
