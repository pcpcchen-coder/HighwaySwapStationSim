# Restore point: before SST-versus-PCS chart (2026-09-19)

User explicitly requested a durable restore point before this change.

- Application: HighwaySwapSim 0.8.0, single-bus first phase.
- GitHub backup branch (created before edits): `restore/pre-sst-pcs-chart-2026-09-19`.
- GitHub commit: `b9405adbb78801ebb5ff4eaa0982e7cab631fdf8`.
- Local / Sites source commit: `1e255904706287946d98ebc4a07a890ae1ed73d2`; annotated local tag has the same restore name.
- Both commits have tree `fce5d73529e6cbd2f59cd42eb3e129abaf4dacfc`.
- Saved Site version: 16, `appgprj_6a9f5dd4eccc81918de0c7b3d1eb04f9~appgver_bca4975fc1a0819184da9249c96e7c06` (source verified before editing).
- Offline file: `HighwaySwapSim-0.8.0-offline.html`, Library file `libfile_0788bc02f75c8191a995eb9003329905`, version 4. Future replacement must preserve this file's version history.

If the user requests “回到這次修改前”: restore this saved Site version using the site's current audience; restore offline version 4; restore source from the backup branch through a new forward commit, preserving subsequent history. Verify the chosen target with the user only if “this change” becomes ambiguous. No runtime access tokens belong in this document.

The previous chart was cumulative `revenueCNY - gridCostCNY`, labelled 累計能源後貢獻. The comparison section used transformer + AC/DC as its reference. These are intentionally replaced by a same-delivery SST versus transformer + PCS conversion-cost comparison.
