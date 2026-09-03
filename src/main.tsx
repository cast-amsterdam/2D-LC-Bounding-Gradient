import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

function mount(element: HTMLElement) {
  if (element.dataset.bg2dlcMounted === "true") return;
  element.dataset.bg2dlcMounted = "true";
  const maxFileMb = Number(element.dataset.maxFileMb || 50);
  const maxCells = Number(element.dataset.maxCells || 2_000_000);
  createRoot(element).render(<App assetBase={element.dataset.assetsBase || "./brand/"} exampleUrl={element.dataset.exampleUrl || "./example/MixTest.xlsx"} limits={{ maxFileMb, maxCells }} />);
}

function mountAll() { document.querySelectorAll<HTMLElement>("[data-bg2dlc-app]").forEach(mount); }
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountAll); else mountAll();
new MutationObserver(mountAll).observe(document.documentElement, { childList: true, subtree: true });
