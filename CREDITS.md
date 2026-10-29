# Credits

## Elevation data

The global grids are public domain. The live Earth tiles combine sources that ask for attribution, listed below. Please keep crediting the teams who made them.

| World | Dataset | Credit |
|---|---|---|
| Earth (offline grid) | ETOPO 2022 Global Relief Model, 60 arc-second surface elevation | NOAA National Centers for Environmental Information (NCEI) |
| Moon | LOLA Gridded Data Records LDEM_64 and LDEM_1024 | NASA Lunar Reconnaissance Orbiter, LOLA Science Team (NASA GSFC); PDS Geosciences Node |
| Mars | MOLA Mission Experiment Gridded Data Record (MEGDR) | NASA Mars Global Surveyor, MOLA Science Team (NASA GSFC); PDS Geosciences Node |
| Mercury | Mercury MESSENGER Global DEM v2, 665 m (Becker et al. 2016) | USGS Astrogeology Science Center; NASA / JHUAPL / Carnegie Institution of Washington, MESSENGER MDIS |
| Ceres | Dawn FC2 HAMO global DTM (CE_HAMO_G_00N_180E_EQU_DTM) | Preusker et al., German Aerospace Center (DLR); NASA Dawn; PDS Small Bodies Node |
| Vesta | Dawn FC2 HAMO SPG global DTM (VE_HAMO_G_00N_330E_EQU_DTM, PDS DWNVSPG_2; Preusker et al.) | German Aerospace Center (DLR); NASA Dawn; PDS Small Bodies Node |
| Venus | Venus Magellan Global Topography, 4641 m | USGS Astrogeology Science Center; NASA / JPL Magellan radar altimetry |
| Pluto | Pluto New Horizons Global DEM, 300 m (Schenk et al.) | USGS Astrogeology Science Center; NASA / JHUAPL / SwRI New Horizons LORRI and MVIC |

The Moon, Mars and Ceres data was obtained through the elevation tiles mirrored by the [galaxy-3d](https://github.com/Addey34/galaxy-3d) project, whose records list these datasets as public domain. The data was re-encoded into Terrain Press's own tile format; no galaxy-3d code is used.

Globe images are shaded relief rendered from the same elevation data.

### Earth detail when online

For small places on Earth, the browser loads [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (Mapzen, now hosted by the Linux Foundation and Amazon's Registry of Open Data) directly from Amazon. Unlike the other datasets, some of their sources ask for attribution:

- SRTM (NASA, USGS), GMTED2010 (USGS), ETOPO1 (NOAA), NED / 3DEP (USGS)
- EU-DEM (produced using Copernicus data and information funded by the European Union)
- ArcticDEM (Polar Geospatial Center, NSF), Canadian Digital Elevation Model (Natural Resources Canada, Open Government Licence – Canada)
- LINZ (Land Information New Zealand, CC BY 4.0), Geoscience Australia (CC BY 4.0), Mexico INEGI, Norway Kartverket (CC BY 4.0), UK Environment Agency (Open Government Licence)

The full list is in [tilezen/joerd's attribution notes](https://github.com/tilezen/joerd/blob/master/docs/attribution.md). Terrain Press smooths away the odd false spike these tiles have where gaps in the radar data were filled.

## Software bundled in `site/`

| Component | Version | Licence | File |
|---|---|---|---|
| [three.js](https://threejs.org) and OrbitControls | r128 | MIT | [LICENSES/three.js-MIT.txt](LICENSES/three.js-MIT.txt) |
| [Bootstrap](https://getbootstrap.com) (CSS, trimmed and inlined) | 5.3.3 | MIT | [LICENSES/bootstrap-MIT.txt](LICENSES/bootstrap-MIT.txt) |
| [poly2tri.js](https://github.com/r3mi/poly2tri.js) | 1.5.0 | BSD 3-Clause | [LICENSES/poly2tri-BSD-3-Clause.txt](LICENSES/poly2tri-BSD-3-Clause.txt) |
| [Clipper](http://www.angusj.com/delphi/clipper.php) (clipper-lib) | 6.4.2 | Boost Software License 1.0 | [LICENSES/clipper-BSL-1.0.txt](LICENSES/clipper-BSL-1.0.txt) |
| [jsPDF](https://github.com/parallax/jsPDF) (print guide) | 2.5.1 | MIT | [LICENSES/jspdf-MIT.txt](LICENSES/jspdf-MIT.txt) |

## Fonts

The three lettering styles are glyph-outline subsets converted from these fonts. Under the SIL Open Font License 1.1 they're distributed as modified versions, under the names "TerrainPress Rounded / Geometric / Technical", and remain under the OFL.

| Style | Based on | Copyright | File |
|---|---|---|---|
| Space age | Audiowide | © 2012 Brian J. Bonislawsky DBA Astigmatic (AOETI), Reserved Font Name "Audiowide" | [LICENSES/font-Audiowide-OFL-1.1.txt](LICENSES/font-Audiowide-OFL-1.1.txt) |
| Apollo plaque | Jost | © 2020 The Jost Project Authors | [LICENSES/font-Jost-OFL-1.1.txt](LICENSES/font-Jost-OFL-1.1.txt) |
| Technical | Orbitron | © 2018 The Orbitron Project Authors | [LICENSES/font-Orbitron-OFL-1.1.txt](LICENSES/font-Orbitron-OFL-1.1.txt) |
| Engraved piece numbers (digits) and poster text | DejaVu Sans Mono and DejaVu Sans Mono Bold | © 2003 Bitstream, Inc. (Bitstream Vera); DejaVu changes are in the public domain | [LICENSES/font-DejaVuSansMono-Bitstream-Vera.txt](LICENSES/font-DejaVuSansMono-Bitstream-Vera.txt) |

## Trademarks

NASA, USGS and DLR are named only to credit their data. Terrain Press is not affiliated with or endorsed by them.
