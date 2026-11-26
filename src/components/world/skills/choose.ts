// Choosing a pot: store + the robot's one line (with a chip that walks to the first project).
import { useWorld } from "@/store/world";
import { robotMotion, useRobot } from "../robot/robotStore";
import { POT_PROJECTS, POTS } from "./potData";
import { robotSkillLine } from "./skillCopy";

export function choosePot(i: number | null) {
  const w = useWorld.getState();
  w.selectPot(i);
  const pot = i === null ? undefined : POTS[i];
  if (!pot || i === null || !w.character) return;
  const line = robotSkillLine(pot.display, POT_PROJECTS[i]);
  useRobot.getState().say(line.text, line.chip && line.projectId ? [{ label: line.chip, action: { type: "openProject", projectId: line.projectId } }] : []);
  robotMotion.lookAt = [pot.x, pot.z];
  robotMotion.lookUntil = performance.now() / 1000 + 3;
}
