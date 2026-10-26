# Brand asset sources

## allied-battle-lab.png

- Asset: Allied Battle Lab construction-menu cameo from the original Command & Conquer: Red Alert 2, used for the Model Comparison Bench sidebar entry.
- Source page: https://cncnz.com/games/red-alert-2/allied-structures/ (Battle Lab).
- Original file: https://cncnz.com/wp-content/uploads/2018/04/ra2_techicon.png
- Retrieved: 2026-10-22.
- Dimensions: 60 × 48 pixels, RGB PNG, 2,517 bytes. The downloaded PNG is retained without alteration; it was not redrawn, recolored, cropped, or rescaled.
- SHA-256: `0f72349e1703c12a87cfc2358cbb4c16cb15e076e245857af556e93a299e3f74`.

The original game artwork belongs to its respective rights holders, Westwood Studios / Electronic Arts. The application source-code license does not grant rights to this third-party asset. This is original-game construction-menu artwork, not an AI-generated image or a modification's replacement icon.

## allied-service-depot.png

- Asset: Allied Service Depot construction-menu cameo from Command & Conquer: Red Alert 2.
- Source page: https://cncnz.com/games/red-alert-2/allied-structures/
- Original file: https://cncnz.com/wp-content/uploads/2018/04/ra2_fixicon.png
- Retrieved: 2026-10-21.
- Dimensions: 60 × 48 pixels. The downloaded PNG is retained without alteration.
- SHA-256: `8ef46732de68239e400ca8ed017ea7b3e1dbe50d370689274e30f9f1d039f6a6`.

The original game artwork belongs to its respective rights holders, Westwood Studios / Electronic Arts. It is not original AI Product Factory artwork, and the application source-code license does not grant rights to this third-party asset. This asset is used for the requested Deconstruction Desk icon; the existing factory app mark is retained separately.

## allied-service-depot-model.png

- Purpose: standalone isometric building model for the Deconstruction Desk page title. The sidebar continues to use the original construction-menu cameo above.
- Method: built-in `image_gen` image editing, transparent-background output, on 2026-10-21.
- Building reference: https://moegirl.icu/盟军维修厂 (image attributed to the Red Alert 2 Allied Service Depot; original image at https://box.moegirl.icu/media/RA2-%E7%9B%9F%E5%86%9B%E7%BB%B4%E4%BF%AE%E5%8E%82.png).
- Style reference: existing `app.png`, retained without modification.
- Output: 1254 × 1254 RGBA PNG, 1,119,341 bytes.
- SHA-256: `629234548b5eb9230977d1ff56bc18098e93c0d12003511ad104455e11e3d309`.

This image is an AI-prepared interpretation of the referenced game building with the landscape removed. It is not an unmodified original game sprite. Rights to the underlying game design remain with the respective rights holders.

Final built-in prompt:

```text
Use case: background-extraction / style-transfer. Asset type: transparent isometric game-building icon for a desktop application's Deconstruction Desk page. Image 1 is ONLY the established application icon style/composition reference: a complete freestanding Red Alert 2 building with crisp retro pixel-art details, isometric three-quarter view, centered on transparent canvas, no badge or surrounding scene. Preserve Image 1 itself unchanged; do not reproduce that Soviet factory. Image 2 is the subject and edit target: the ORIGINAL Red Alert 2 ALLIED SERVICE DEPOT, with its yellow-orange maintenance crane on the left/back, dark gray tall machinery support, low round dark grated repair pad in the front/right, yellow-black hazard-stripe rim and small blue-gray wheel stops. Keep this exact recognizable Allied Service Depot structure and its original isometric orientation, proportions, components and colors. Remove ALL surrounding grass and landscape from Image 2; retain only the complete maintenance building and repair platform with a small contact shadow. Make one polished standalone model-like sprite, using the same crisp retro pixel-art treatment and transparent-background presentation as Image 1. Increase the subject size so the complete building occupies approximately 85% of a square canvas, with an even small transparent margin, no clipped machinery or platform. Preserve fine original game-sprite character; do not turn it into a modern glossy 3D render or vector illustration. Text: none. No text ribbon, no SERVICE DEPOT caption, no icon border, no black rectangle, no ground tile, no extra vehicles, no workers, no Soviet symbols, no additional building, no scenery. Output one transparent RGBA PNG.
```

## allied-battle-lab-model.png

- Purpose: complete idle Allied Battle Lab building sprite beside the Model Comparison Bench page title, using classic Red Alert 2 artwork rather than the construction-menu cameo.
- Source assets: `ggtech.shp` and `ggtech_a.shp` from the existing original-game resource archive https://stdres.wangerhuoda.cn/build-gen.mix; `unittem.pal` from https://stdres.wangerhuoda.cn/ui.mix. The local resource archives were previously checked against their source manifest CRC32 values.
- Art configuration: `art.ini` from https://stdres.wangerhuoda.cn/ini.mix, sections `[GATECH]` (`ActiveAnim=GATECH_A`, `NewTheater=yes`) and `[GATECH_A]` (`Start=1`). The temperate-theater images are the `ggtech` filenames.
- Compositing: building frame 0 plus active-animation frame 1 at their unchanged 346 × 300 logical-canvas coordinates. Their original paired shadow frames are 3 and 25; the shadow mask is represented as black at alpha 128. No shadow geometry was invented.
- Palette: original indexed `unittem.pal`, with only player-remap indices 16–31 mapped to `rules.ini` `[Colors]` `DarkBlue=153,214,212` (HSV), the game's blue player color.
- Processing: lossless SHP decoding and layer compositing, then transparency-only cropping from `[128, 4, 340, 217]`; no scaling, stretching, new drawing, AI generation, or MOD replacement graphics. The original shadow footprint is retained.
- Prepared: 2026-10-22.
- Output: 212 × 213 pixels, RGBA PNG, 14,156 bytes.
- Output SHA-256: `24f32aaf8171402edd689d206e0257484027e3c29559bffe4ed71c89ac000828`.
- Input SHA-256 values: `ggtech.shp` = `99a8e1c0e036018aa77b6ff488827ddba82287b64a9ed8d3fdb9b1372acbc256`; `ggtech_a.shp` = `9310912b6c3911e62c6d652872a6182c579d3bc7c0c7d50a541e183274291e31`; `unittem.pal` = `ed785e62eed291480f3198dd44f6b656ebe3a9b75e9f641944d710abc6bde3e3`.

This PNG is a decoded and composited view of the original game pixels, not an unchanged file shipped with the game. The underlying artwork belongs to Westwood Studios / Electronic Arts.
