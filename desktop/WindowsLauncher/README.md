# Windows launcher

This small .NET launcher embeds the complete standalone web application in one Windows x64 executable. When opened, it extracts the versioned application files under the current user's local application-data directory and opens `index.html` in the default browser.

Build it from the repository root with:

```text
pnpm build:windows
```

The command creates `release/windows/2D-LC-Bounding-Gradient.exe`. The executable is self-contained; end users do not need .NET, Node.js, pnpm, MATLAB, or accompanying application files.

The generated `AppBundle.zip`, `bin/`, and `obj/` paths are build artifacts and are intentionally excluded from Git.

The build script runs the executable with `--verify` after publishing to confirm that the embedded bundle contains its HTML, JavaScript, and CSS entry files. Public releases should be Authenticode-signed; local builds are unsigned and may trigger a Windows SmartScreen warning.
