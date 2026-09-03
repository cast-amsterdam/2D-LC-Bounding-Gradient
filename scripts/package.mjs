import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { strToU8, zipSync } from "fflate";
import packageJson from "../package.json" with { type: "json" };

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const release = join(root, "release");
const plugin = join(release, "bg2dlc-app");
const standalone = join(release, "standalone");
const githubSource = join(release, "github", "bg2dlc-bounding-gradient");
const githubWebUpload = join(release, "github-web-upload");
const sourceAssets = join(root, "public", "brand");
const sourceExample = join(root, "public", "example", "MixTest.xlsx");
const buildWindows = process.argv.includes("--windows");
if (buildWindows && process.platform !== "win32") throw new Error("build:windows must be run on Windows so the generated executable can be verified.");

const readTree = async (directory, rootDirectory, prefix = "") => {
  const entries = {};
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const absolute = join(directory, item.name);
    const key = relative(rootDirectory, absolute).replaceAll("\\", "/");
    if (item.isDirectory()) {
      Object.assign(entries, await readTree(absolute, rootDirectory, prefix));
    } else {
      entries[prefix ? `${prefix}/${key}` : key] = new Uint8Array(await readFile(absolute));
    }
  }
  return entries;
};

await rm(release, { recursive: true, force: true });
await mkdir(join(plugin, "assets", "brand"), { recursive: true });
await mkdir(join(plugin, "assets", "example"), { recursive: true });
await mkdir(join(standalone, "assets"), { recursive: true });
await mkdir(join(standalone, "brand"), { recursive: true });
await mkdir(join(standalone, "example"), { recursive: true });
await mkdir(githubSource, { recursive: true });

await cp(join(root, "dist", "assets"), join(plugin, "assets"), { recursive: true });
await cp(join(root, "dist", "assets"), join(standalone, "assets"), { recursive: true });
await cp(join(root, "wordpress", "bg2dlc-app.php"), join(plugin, "bg2dlc-app.php"));
await cp(join(root, "wordpress", "readme.txt"), join(plugin, "readme.txt"));
await cp(join(root, "wordpress", "THIRD-PARTY-NOTICES.txt"), join(plugin, "THIRD-PARTY-NOTICES.txt"));

for (const name of ["uvalogo_regular_d_en.svg", "CAST logo.svg", "Logo_vector - light filled.svg"]) {
  await cp(join(sourceAssets, name), join(plugin, "assets", "brand", name));
  await cp(join(sourceAssets, name), join(standalone, "brand", name));
}
await cp(sourceExample, join(plugin, "assets", "example", "MixTest.xlsx"));
await cp(sourceExample, join(standalone, "example", "MixTest.xlsx"));
const exampleDataUrl = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${Buffer.from(await readFile(sourceExample)).toString("base64")}`;

const demoHtml = `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="Local 2D-LC bounding-gradient calculation and visualization.">
<title>2D-LC Bounding Gradient</title><link rel="stylesheet" href="./assets/bg2dlc.css?v=${packageJson.version}"></head>
<body style="margin:0;background:#07070d"><div data-bg2dlc-app data-assets-base="./brand/" data-example-url="${exampleDataUrl}" data-max-file-mb="50" data-max-cells="2000000"></div>
<script src="./assets/bg2dlc.js?v=${packageJson.version}" defer></script></body></html>`;
await writeFile(join(standalone, "index.html"), demoHtml);

let windowsExecutable;
if (buildWindows) {
  const launcherDirectory = join(root, "desktop", "WindowsLauncher");
  const appBundle = zipSync(await readTree(standalone, standalone), { level: 9 });
  await writeFile(join(launcherDirectory, "AppBundle.zip"), appBundle);
  const windowsOutput = join(release, "windows");
  await mkdir(windowsOutput, { recursive: true });
  const publish = spawnSync("dotnet", [
    "publish", join(launcherDirectory, "WindowsLauncher.csproj"),
    "--configuration", "Release",
    "--runtime", "win-x64",
    "--self-contained", "true",
    "--output", windowsOutput,
    `-p:Version=${packageJson.version}`,
  ], { cwd: root, stdio: "inherit", windowsHide: true });
  if (publish.status !== 0) throw new Error(`Windows executable build failed with exit code ${publish.status ?? "unknown"}.`);
  windowsExecutable = join(windowsOutput, "2D-LC-Bounding-Gradient.exe");
  const verification = spawnSync(windowsExecutable, ["--verify"], { cwd: root, stdio: "inherit", windowsHide: true });
  if (verification.status !== 0) throw new Error(`Windows executable verification failed with exit code ${verification.status ?? "unknown"}.`);
}

for (const name of [
  ".github", ".gitignore", ".npmrc", "README.md", "THIRD-PARTY-NOTICES.txt",
  "index.html", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.json", "vite.config.mjs",
  "public", "scripts", "src", "tests", "wordpress",
]) {
  await cp(join(root, name), join(githubSource, name), { recursive: true });
}
const launcherSource = join(githubSource, "desktop", "WindowsLauncher");
await mkdir(launcherSource, { recursive: true });
for (const name of ["Program.cs", "README.md", "WindowsLauncher.csproj"]) {
  await cp(join(root, "desktop", "WindowsLauncher", name), join(launcherSource, name));
}
// GitHub's browser uploader should receive these contents directly. Keep
// generated binaries out because the web form has a much lower per-file limit
// than GitHub Releases.
await cp(githubSource, githubWebUpload, { recursive: true });
if (windowsExecutable) {
  const githubWindows = join(githubSource, "windows");
  await mkdir(githubWindows, { recursive: true });
  await cp(windowsExecutable, join(githubWindows, "2D-LC-Bounding-Gradient.exe"));
}

const zip = zipSync(await readTree(plugin, plugin, "bg2dlc-app"), { level: 9 });
await writeFile(join(release, "bg2dlc-app.zip"), zip);
const githubZip = zipSync(await readTree(githubSource, githubSource, "bg2dlc-bounding-gradient"), { level: 9 });
await writeFile(join(release, "bg2dlc-github-source.zip"), githubZip);
await writeFile(join(release, "GITHUB-WEB-UPLOAD-INSTRUCTIONS.txt"), strToU8(
  "Open the github-web-upload folder, select every file and folder inside it, and drag the selected contents into the GitHub upload box. Do not upload the containing folder or a ZIP. Commit the files to main. Then create a GitHub Release and attach windows/2D-LC-Bounding-Gradient.exe from the release output; the code-upload form cannot accept that generated executable.\n"
));
await writeFile(join(release, "INSTALL.txt"), strToU8(
  "Install bg2dlc-app.zip in WordPress under Plugins > Add New > Upload Plugin. Activate it, then add [bg2dlc_app] with an Elementor Shortcode widget. Optional limits: [bg2dlc_app max_file_mb=50 max_cells=2000000].\n"
));
