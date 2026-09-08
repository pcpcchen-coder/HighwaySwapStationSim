HighwaySwapSim Verification presentation source

This bundle rebuilds the 16-slide presentation from frozen, embedded evidence.
It does not rerun the simulator or its independent oracle; those sources remain in the project repository.

Files
- HighwaySwapSim_validation_report.mjs: single JavaScript ES module with embedded frozen presentation data.
- NotoSansCJKtc-Regular.otf: Traditional Chinese rendering font.
- Noto-OFL.txt: font's official SIL Open Font License.
- HighwaySwapSim_Verification_QA.txt: final review log.

Run inside the Codex primary runtime:
1. Extract all files to one writable folder.
2. Create node_modules symlink to CODEX_PRIMARY_RUNTIME_NODE_MODULES.
3. Set RUNTIME_NODE=CODEX_PRIMARY_RUNTIME_NODE, RUNTIME_NODE_MODULES=CODEX_PRIMARY_RUNTIME_NODE_MODULES, and RUNTIME_BIN_DIR=CODEX_PRIMARY_RUNTIME_ROOT/dependencies/bin/override.
4. Run the module with CODEX_PRIMARY_RUNTIME_NODE.
5. Output is HighwaySwapSim_Verification.pptx beside the module, with local renders and layout inspection files.

Font provenance
https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/TraditionalChinese/NotoSansCJKtc-Regular.otf
License: https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/LICENSE
Retrieved 2026-09-08.

Evidence anchors
Report SHA256 9eaaac66465b9b0f72710b8393e7148c9fc54fe29564f894c8039de15b8f32e0
Model source manifest SHA256 141d3ff769965122547d1d835a7b715111a8b257073e6583332d7016b2691b27

Repository copy: presentation-source.mjs. The full source ZIP with the font was delivered with the PPT. To reproduce from GitHub only, place the official NotoSansCJKtc-Regular.otf and Noto-OFL.txt beside this module using the provenance URLs above. The module embeds frozen evidence, so it never reads mutable live simulation results.
