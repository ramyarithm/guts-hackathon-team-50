// Dev-only harness. Not imported by src/index.ts and not part of the CORE integration.

import { createG1Adapter } from "./index";
import type { Button, ControlLabels, MinigameAdapter } from "./types";

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`harness: missing #${id}`);
  return el;
}

const root = $("minigame-root");
const btnLeft = $("btn-left") as HTMLButtonElement;
const btnRight = $("btn-right") as HTMLButtonElement;
const btnNew = $("btn-new") as HTMLButtonElement;
const statusEl = $("status");
const logEl = $("log");

let adapter: MinigameAdapter | null = null;
let instance = 0;

function log(message: string): void {
  const time = new Date().toLocaleTimeString();
  const line = document.createElement("div");
  line.textContent = `[${time}] ${message}`;
  logEl.prepend(line);
  console.log(`[G1 harness] ${message}`);
}

function setLabels(labels: ControlLabels): void {
  btnLeft.textContent = `LEFT: ${labels.left}`;
  btnRight.textContent = `RIGHT: ${labels.right}`;
  log(`setControlLabels(${JSON.stringify(labels)})`);
}

function send(button: Button): void {
  adapter?.handleInput(button);
}

function newInstance(): void {
  if (adapter) {
    adapter.dispose();
    log(`dispose() called on instance ${instance}`);
  }
  instance += 1;
  const runId = `dev-run-${Date.now()}`;
  statusEl.textContent = `Instance ${instance} running (runId ${runId}, stageId C1)`;
  statusEl.classList.remove("done");

  adapter = createG1Adapter();
  const thisInstance = instance;
  adapter.startMinigame({
    gameId: "G1",
    stageId: "C1",
    runId,
    setControlLabels: setLabels,
    onComplete: () => {
      statusEl.textContent = `onComplete fired for instance ${thisInstance} (runId ${runId})`;
      statusEl.classList.add("done");
      log(`onComplete() fired for instance ${thisInstance}`);
    },
  });
  log(`startMinigame() on instance ${instance}`);
  const canvasCount = root.querySelectorAll("canvas").length;
  log(`canvases in #minigame-root: ${canvasCount}`);
}

btnLeft.addEventListener("click", () => send("LEFT"));
btnRight.addEventListener("click", () => send("RIGHT"));
btnNew.addEventListener("click", newInstance);

window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  const key = e.key.toLowerCase();
  if (key === "arrowleft" || key === "a") {
    e.preventDefault();
    send("LEFT");
  } else if (key === "arrowright" || key === "d") {
    e.preventDefault();
    send("RIGHT");
  }
});

newInstance();
