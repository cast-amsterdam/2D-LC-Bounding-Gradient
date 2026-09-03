=== 2D-LC Bounding Gradient ===
Contributors: bg2dlc
Tags: chromatography, 2d-lc, scientific, elementor
Requires at least: 6.3
Tested up to: 6.8
Requires PHP: 7.4
Stable tag: 1.0.16
License: GPLv2 or later

Runs 2D-LC bounding-gradient calculations locally in each visitor's browser. No chromatogram data is uploaded.
Includes the MixTest workbook and a Load example button for trying the complete workflow immediately.
This tool accompanies the submitted manuscript "Rapid Development of Mobile Phase Composition Programs for Comprehensive Two-Dimensional Liquid Chromatography" by Tijmen S. Bos, Dwight R. Stoll, and Bob W.J. Pirok.

== Installation ==

1. Upload and activate the plugin.
2. Add [bg2dlc_app] to an Elementor Shortcode widget or any WordPress page.
3. Optionally set max_file_mb and max_cells shortcode attributes.

== Workbook format ==

The first worksheet must use row 1 (from B1) for strictly increasing 1D retention times in minutes and column A (from A2) for strictly increasing 2D retention times in minutes. The interior rectangle from B2 onward must contain one finite numeric signal intensity for every time combination. A1 may be empty or contain a label. Do not use blank, merged, text, NaN, or infinite cells inside the numeric matrix.

== Privacy ==

The plugin has no server calculation endpoint, telemetry, or runtime CDN dependencies. Files remain in browser memory.
