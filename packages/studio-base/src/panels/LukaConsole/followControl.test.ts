// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/
import { enableAlgorithm, enableBase, FollowSnapshot } from "./followControl";

const state: FollowSnapshot = {
  output_mode: "nav2_action", follow_status: "TRACKING:id=7", diagnostic: "TRACKING",
  production_ready: true, live_verified: false, camera_fresh: true, mot_fresh: true,
  targets: [{ track_id: 7, confidence: 0.9 }], owned_preview: true, error: "",
};
test("manual action buttons do not require an acceptance record", async () => {
  const call = jest.fn().mockResolvedValue({ success: true });
  await enableAlgorithm(call, state, true);
  await enableBase(call, state, true);
  expect(call.mock.calls).toEqual([
    ["/person_follow/gui/enable_observation", {}],
    ["/person_follow/gui/enable_base", {}],
  ]);
});
test("stale state or lost target still blocks manual release", async () => {
  const call = jest.fn();
  await expect(enableBase(call, state, false)).rejects.toThrow();
  await expect(enableBase(call, { ...state, mot_fresh: false }, true)).rejects.toThrow();
  await expect(enableBase(call, { ...state, follow_status: "LOST" }, true)).rejects.toThrow();
  expect(call).not.toHaveBeenCalled();
});
