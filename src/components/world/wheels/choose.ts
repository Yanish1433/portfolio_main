// Choosing a wheel: store + the robot's one line (with a chip that walks to the first project).
import { useWorld } from "@/store/world";
import { robotMotion, useRobot } from "../robot/robotStore";
import { WHEEL_PROJECTS, WHEELS } from "./wheelData";
import { robotGroupLine } from "./wheelCopy";
import { plainGroup } from "./wheelLayout";

export function chooseWheel(i: number | null) {
  const w = useWorld.getState();
  w.selectWheel(i);
  const wheel = i === null ? undefined : WHEELS[i];
  if (!wheel || i === null || !w.character) return;
  const line = robotGroupLine(plainGroup(wheel.category, wheel.groupLabel).plain, WHEEL_PROJECTS[i]);
  useRobot.getState().say(line.text, line.chip && line.projectId ? [{ label: line.chip, action: { type: "openProject", projectId: line.projectId } }] : []);
  robotMotion.lookAt = [wheel.x, wheel.z];
  robotMotion.lookUntil = performance.now() / 1000 + 3;
}
