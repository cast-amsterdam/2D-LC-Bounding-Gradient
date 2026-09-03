# 2D-LC Bounding Gradient

A browser-based companion tool for developing mobile-phase composition programs for comprehensive two-dimensional liquid chromatography (LC×LC). It reproduces the workflow of the original MATLAB app without requiring MATLAB for end users.

The application runs locally in the visitor's browser, supports both full-in-fraction (FiF) and Shifting Gradient workflows, and can be used as a standalone page or installed as a WordPress plugin.

## Associated manuscript

This tool accompanies the submitted manuscript:

> Tijmen S. Bos, Dwight R. Stoll, and Bob W.J. Pirok, “Rapid Development of Mobile Phase Composition Programs for Comprehensive Two-Dimensional Liquid Chromatography.” Submitted manuscript.

Publication details can be added here when they become available.

## Features

- Entirely browser-local XLSX parsing and scientific calculation.
- FiF and Shifting Gradient methods.
- Automatic signal-region detection using normalization, a power-of-1.5 transform, 256-bin Otsu thresholding, and convex hulls.
- Editable and draggable chromatogram regions of interest.
- Optimized first- and second-dimension gradient tables.
- Predicted 2D chromatograms using MATLAB-calibrated interpolation behavior.
- JET heatmaps with robust display contrast for Shifting Gradient predictions.
- CSV export for optimized programs and full-resolution prediction data.
- Clipboard PNG export containing the plot, axes, title, legend, and caption.
- Responsive dark scientific interface with no runtime CDN or API dependency.
- WordPress shortcode integration and support for multiple app instances.

## Privacy and source-code visibility

All workbook parsing and calculations run inside a browser Web Worker. Input data remains in browser memory and is not uploaded, persisted, or sent to telemetry services.

The production JavaScript is minified and source maps are omitted. This offers only casual obscurity: code downloaded to and executed by a browser can always be inspected by a technically skilled visitor. Keeping the algorithm genuinely secret would require moving the calculation to a controlled server.

## XLSX input format

The first worksheet must be a rectangular matrix:

|   | A | B | C | D |
|---|---:|---:|---:|---:|
| 1 | optional label | 1.0 | 2.0 | 3.0 |
| 2 | 0.001 | 12543 | 13120 | 12886 |
| 3 | 0.003 | 12701 | 18492 | 13774 |
| 4 | 0.005 | 12481 | 14635 | 12992 |

- Row 1 from B1 onward contains strictly increasing first-dimension retention times in minutes.
- Column A from A2 downward contains strictly increasing second-dimension retention times in minutes.
- B2 onward contains one finite numeric signal intensity for every time combination.
- A1 may be empty or contain a label.
- Blank, merged, text, `NaN`, or infinite cells are not allowed inside the numeric matrix.

Default limits are 50 MB per workbook and 2,000,000 intensity cells. WordPress administrators can change these limits through shortcode attributes.

## Requirements

- Node.js 22 or a Vite-compatible Node.js 20 release.
- pnpm 9 or newer.
- A current desktop version of Chrome, Edge, Firefox, or Safari.
- MATLAB is **not** required to build or run the web app. MATLAB R2026a is needed only to regenerate the reference fixtures under `tests/matlab/`.
- The .NET 10 SDK is needed only to build the optional self-contained Windows executable; end users do not need .NET.

## Development

Install the locked dependencies:

```bash
pnpm install --frozen-lockfile
```

Start the local development page:

```bash
pnpm dev
```

Then open the local URL printed by Vite.

Run the type checker and test suite:

```bash
pnpm typecheck
pnpm test
```

Create every release artifact:

```bash
pnpm build
```

This recreates `release/` with:

- `standalone/` — a self-contained local demo.
- `bg2dlc-app.zip` — the installable WordPress plugin.
- `github/bg2dlc-bounding-gradient/` — a clean GitHub source tree.
- `github-web-upload/` — source contents arranged for direct drag-and-drop into GitHub's web uploader.
- `bg2dlc-github-source.zip` — the same GitHub source tree as a ZIP archive.

To additionally build the self-contained Windows x64 executable, run:

```bash
pnpm build:windows
```

This also creates `windows/2D-LC-Bounding-Gradient.exe` and includes a copy under the GitHub-ready source folder.

## Standalone use

After `pnpm build`, open `release/standalone/index.html`. The example workbook is embedded in the page so the **Load example** action also works when the app is opened through a `file://` URL.

## Windows executable

For non-technical Windows users, distribute `release/windows/2D-LC-Bounding-Gradient.exe`. It contains the complete standalone application and opens it in the user's default browser. No installation, Node.js, pnpm, MATLAB, .NET runtime, or accompanying files are required.

On first launch, the executable extracts its embedded static files into a versioned directory under `%LOCALAPPDATA%\2D-LC Bounding Gradient\`. No chromatogram data is stored there; uploaded workbooks remain in browser memory.

For GitHub, the executable is best published as a GitHub Release asset. The included Windows CI job also produces it as a downloadable workflow artifact.

The locally generated executable is not digitally signed. Windows may therefore show an “Unknown publisher” or SmartScreen warning. For public distribution, sign the final executable with an Authenticode certificate before attaching it to a GitHub Release.

## WordPress and Elementor

1. Build the project or use `release/bg2dlc-app.zip`.
2. In WordPress, choose **Plugins → Add New → Upload Plugin**.
3. Upload the ZIP and activate **2D-LC Bounding Gradient**.
4. Add an Elementor **Shortcode** widget containing:

```text
[bg2dlc_app]
```

Optional administrator-controlled limits:

```text
[bg2dlc_app max_file_mb="50" max_cells="2000000"]
```

Plugin assets are enqueued only when the shortcode is rendered. Calculations never silently downsample scientific data; only heatmap display data may be peak-preserving downsampled.

## Repository structure

```text
src/                 React UI, Web Worker, calculations, plotting, and tests
public/              Institutional logos and the MixTest example workbook
tests/fixtures/       MATLAB-calibrated numerical reference fixtures
tests/matlab/         Optional MATLAB fixture-generation scripts
wordpress/            WordPress shortcode wrapper and plugin metadata
scripts/package.mjs   Standalone, plugin, and GitHub-source packager
desktop/              Source for the optional self-contained Windows launcher
```

## Numerical verification

The automated suite covers XLSX extraction, validation, time transformations, Otsu thresholding, convex hulls, polygon masks, interpolation, ROI behavior, gradient generation, CSV formatting, and PNG clipboard composition. MixTest integration results are compared with MATLAB R2026a reference fixtures for both FiF and Shifting Gradient workflows.

Run the checks before publishing changes:

```bash
pnpm typecheck
pnpm test
pnpm build
```

## Licensing

No project license has been selected yet. Under default copyright rules, the authors retain all rights. Choose and add an explicit license before inviting third-party reuse or contributions. Bundled dependencies retain their own licenses; see `THIRD-PARTY-NOTICES.txt`.

Institutional names and logos may be subject to separate trademark and brand-use requirements.
