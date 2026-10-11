// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/
export type FollowSnapshot = {
  output_mode: string;
  follow_status: string;
  diagnostic: string;
  production_ready: boolean;
  live_verified: boolean;
  camera_fresh: boolean;
  mot_fresh: boolean;
  targets: { track_id: number; confidence: number }[];
  owned_preview: boolean;
  error: string;
};
type ServiceCaller = (name: string, request: Record<string, unknown>) => Promise<unknown>;

export async function checkedService(
  call: ServiceCaller,
  name: string,
  request = {},
): Promise<unknown> {
  const response = (await call(name, request)) as { success?: boolean; message?: string };
  if (response.success === false) {
    throw new Error(response.message ?? "安全门拒绝请求");
  }
  return response;
}

export async function enableAlgorithm(
  call: ServiceCaller,
  state: FollowSnapshot,
  fresh: boolean,
  _acknowledged?: boolean,
): Promise<unknown> {
  if (!fresh || !["dry_run", "nav2_action"].includes(state.output_mode)) {
    throw new Error("当前模式未确认或状态过期");
  }
  if (state.output_mode === "dry_run") {
    return await checkedService(call, "/person_follow/gui/enable_observation");
  }
  if (!state.production_ready || !state.camera_fresh || !state.mot_fresh) {
    throw new Error("动作模式需要实时感知与导航就绪");
  }
  return await checkedService(call, "/person_follow/gui/enable_observation");
}

export async function enableBase(
  call: ServiceCaller,
  state: FollowSnapshot,
  fresh: boolean,
  _acknowledged?: boolean,
): Promise<unknown> {
  if (
    !fresh ||
    !state.camera_fresh ||
    !state.mot_fresh ||
    !state.production_ready ||
    state.output_mode !== "nav2_action" ||
    !state.follow_status.includes("TRACKING:id=") ||
    state.diagnostic.includes("BLOCKED")
  ) {
    throw new Error("需要动作模式、TRACKING、实时导航与感知，再手动放行底盘");
  }
  return await checkedService(call, "/person_follow/gui/enable_base");
}

export function parseSnapshot(data: string): FollowSnapshot {
  const value = JSON.parse(data) as FollowSnapshot;
  if (
    !["unknown", "dry_run", "nav2_action"].includes(value.output_mode) ||
    typeof value.follow_status !== "string" ||
    typeof value.diagnostic !== "string" ||
    typeof value.error !== "string" ||
    [
      value.production_ready,
      value.live_verified,
      value.camera_fresh,
      value.mot_fresh,
      value.owned_preview,
    ].some((v) => typeof v !== "boolean") ||
    !Array.isArray(value.targets) ||
    value.targets.some((t) => !Number.isFinite(t.track_id) || !Number.isFinite(t.confidence))
  ) {
    throw new Error("GUI状态格式错误");
  }
  return value;
}
