// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

export type Direction = "forward" | "back" | "left" | "right" | "ccw" | "cw";
export const COMMAND_TOPIC = "/nx/web_teleop_cmd_vel";
export function twist(direction?: Direction): Record<string, unknown> {
  return {
    linear: {
      x: direction === "forward" ? 0.1 : direction === "back" ? -0.1 : 0,
      y: direction === "left" ? 0.1 : direction === "right" ? -0.1 : 0,
      z: 0,
    },
    angular: { x: 0, y: 0, z: direction === "ccw" ? 0.2 : direction === "cw" ? -0.2 : 0 },
  };
}

// Publish only while the operator holds a button. No persisted armed state.
export class HoldControl {
  private timer?: ReturnType<typeof setInterval>;
  private startedAt = 0;
  constructor(
    private readonly publish: (message: Record<string, unknown>) => void,
    private readonly ready: () => boolean,
    private readonly clock: () => number = () => performance.now(),
  ) {}

  start(direction: Direction): boolean {
    this.stop();
    if (!this.ready()) {
      return false;
    }
    this.startedAt = this.clock();
    this.publish(twist(direction));
    this.timer = setInterval(() => {
      // A lost release event cannot cause indefinite driving.
      if (!this.ready() || this.clock() - this.startedAt >= 2000) {
        this.stop();
      } else {
        this.publish(twist(direction));
      }
    }, 100);
    return true;
  }

  stop(): void {
    if (this.timer != undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
      this.publish(twist());
    }
  }
}
