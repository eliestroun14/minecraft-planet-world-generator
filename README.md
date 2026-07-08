# Korpanoff Planet Generator

A Minecraft 1.20.1 world type — selectable from the "World Type" menu right
next to "Superflat" — that generates an empty (void) world seeded with
"planets": large floating spherical structures scattered around as you
explore, each one randomly drawn from a pool of pre-generated variants
(rocky/barren or habitable/vegetated, with their own rock bands, ores, trees,
flowers and passive-mob spawners).

Alongside the planets, the same void world also scatters rarer bonus
structures converted from found schematics — currently an enormous
**Iron Mammoth** (523×253×338 blocks) — using the exact same jigsaw
conversion pipeline, just registered as its own structure/structure_set so it
spawns far less often and doesn't collide with planet placement.

It's built entirely as a **data pack**, using Minecraft's native jigsaw
structure system — the same mechanism vanilla uses to place villages,
mansions and ancient cities. No Forge/Fabric mod, no server plugin.

## How it works

- The world type is a `minecraft:flat` generator on the `minecraft:the_void`
  biome — a genuinely empty world.
- A custom jigsaw `structure` (`korpanoff-planet-generator:planet`) is
  registered to float at a fixed height, ignoring terrain entirely
  (`terrain_adaptation: "none"`), and is placed via `random_spread` at a
  configurable spacing across the world.
- Each time the structure generates, Minecraft picks one variant at random
  from `worldgen/template_pool/planets.json` — a weighted list of `.nbt`
  structure templates, one per pre-generated planet.
- On world creation, a `functions/init.mcfunction` (hooked via the vanilla
  `#minecraft:load` function tag) manually assembles a fixed, guaranteed
  `habitable-overworld` planet at world (0, 64, 0) using `/place jigsaw`
  (the same jigsaw-assembly code natural generation uses, so the anchor's
  `final_state` still resolves correctly) — so the player never spawns over
  the void waiting for a random planet to happen to generate nearby.
  `functions/tick.mcfunction` (via `#minecraft:tick`) then catches every
  player who hasn't been teleported yet and drops them onto it.

## Where the planets come from

The `.nbt` structure templates in `datapack/data/korpanoff-planet-generator/structures/`
are converted from `.schem` (Sponge Schematic) files using
`tools/schem-to-structure.js`. Those `.schem` files are themselves produced
by a separate tool — a headless JavaScript reimplementation of a procedural
planet-generator datapack (rotating a virtual entity through yaw/pitch,
stamping concentric spherical shells via caret-relative `fill` commands) —
not included in this repo. `schem-to-structure.js` only needs a valid Sponge
Schematic v2 `.schem` file as input, so it works with schematics from any
source, not just that specific generator.

Note the folder is `structures/` (plural) — Minecraft renamed most datapack
folders to singular in 1.21+ (`structures` → `structure`, `functions` →
`function`, etc.), but 1.20.1 still uses the older plural convention.

**Centering fix**: a jigsaw structure's starting piece is anchored by its
north-west corner unless the piece contains a named jigsaw block, in which
case *that* block's position becomes the anchor instead. For a symmetric
piece this large, corner-anchoring meant large chunks of the sphere fell
outside the game's generation reach and got silently truncated on 2-3 faces.
`schem-to-structure.js` fixes this automatically: it embeds a
`minecraft:jigsaw` block (named `korpanoff-planet-generator:anchor`, pool
`minecraft:empty` so it never actually tries to connect anywhere) at the
exact geometric center of every converted structure, with `final_state` set
back to whatever block was really there (so it's invisible in the finished
planet). `worldgen/structure/planet.json`'s `start_jigsaw_name` matches this
name, telling Minecraft to anchor placement at the center instead of a corner.

To add more planets to the pool:
```
node tools/schem-to-structure.js path/to/new-planet.schem datapack/data/korpanoff-planet-generator/structures/new-planet.nbt
```
then add an entry to `worldgen/template_pool/planets.json` pointing at it —
or just re-run `node tools/convert-all.js` to batch-convert everything in the
schematic generator's output folder and regenerate the whole pool at once.

`schem-to-structure.js` works on **any** Sponge Schematic v2 `.schem` file,
not just planets — that's how the Iron Mammoth bonus structure above was
added: converted the same way, then wired up with its own
`worldgen/structure`, `worldgen/structure_set` and `worldgen/template_pool`
(see `iron-mammoth.json`/`mammoths.json`) instead of being mixed into the
planet pool, since it's a very different scale and rarity than the planets.
It also preserves the **source schematic's own `DataVersion`** in the output
`.nbt` (rather than stamping it as already-1.20.1-native), so Minecraft's own
data fixers correctly migrate any older block states/ids at load time — this
matters for schematics captured on older Minecraft versions (the Iron
Mammoth's source was DataVersion 2584).

**A note on truly huge pieces**: vanilla jigsaw structures cap how far a
piece may extend from its anchor point (128 blocks with
`terrain_adaptation: "none"`). Our planets (181 blocks across, ~90 from
center) fit comfortably under that cap once corner-anchoring was fixed. The
Iron Mammoth does not — at 523 blocks wide, half its width alone is over
260 blocks from center, so `iron-mammoth.json` sets
`max_distance_from_center: 300` and actually relies on the **Huge Structure
Blocks** mod (see below) to lift the vanilla cap for real, unlike the
planets, which never needed it.

**Floating-plant cleanup**: source schematics often capture plants/foliage
(tall grass, flowers, saplings, sugar cane, mushrooms...) sitting on blocks
that no longer exist underneath by the time the schematic was taken, or over
gaps in the design entirely. Minecraft doesn't validate that at paste time,
but the first time the chunk ticks it does, and every one of those blocks
pops off as a dropped item entity simultaneously — on a busy planet that can
be tens of thousands of entities appearing at once, enough to crash weaker
clients. `schem-to-structure.js` now pre-checks every plant/foliage block
against the block actually beneath it (post-conversion, so removed
scaffolding markers correctly count as air) and simply omits any that
wouldn't have real support, exactly like it already omits air. Re-running the
converter on the existing planets dropped as many as ~23,000 such blocks from
a single habitable planet.

## Installing

1. Download the latest `korpanoff-planet-generator-datapack.zip` from
   [Releases](../../releases), or copy the `datapack/` folder yourself, into
   your world's (or server's) `datapacks/` folder — or, when creating a
   **new** world, click "More Options" → "Data Packs" on the Create World
   screen and add it there before generating.
2. On the Create World screen, open the "World Type" selector — "Planets"
   should now appear in the list.

Building the zip yourself after making changes: `tools/build-zip.ps1`
(PowerShell; re-zips `datapack/` from scratch).

## Spawn & starting gear

Planets are scattered too far apart to reach on foot, so the guaranteed spawn
planet also gets a chest (`loot_tables/chests/spawn_chest.json`) placed right
next to the landing point, containing an elytra, two stacks of firework
rockets, ender pearls, food, basic iron tools and torches — enough to start
gliding from planet to planet immediately instead of being stranded.

## Known limitations

- **Variety comes entirely from how many planets are in the pool**, not from
  randomizing materials at generation time in-game. Minecraft's native
  structure processors only support independent per-block substitution (which
  produces a "noisy" speckled look), not the coherent per-band material choice
  (one whole rock layer = one consistent material) that makes these planets
  look intentional. Getting true in-game procedural variety with coherent
  regions would require a custom Java structure processor (a real mod) — out
  of scope for this project. The practical lever for more variety is simply
  generating more planets offline and adding them to the pool.
- **Water/lava doesn't flow.** Structure placement never triggers a fluid
  tick, so lakes appear exactly as captured (a filled, static block) instead
  of naturally spreading at the edges. Purely cosmetic — doesn't affect
  generation correctness. Fixable with the optional
  [Fluid Tick Structure Processor](https://modrinth.com/mod/fluid-tick-structure-processor)
  mod below, if you want flowing water.

## Optional companion mods

- **[Fluid Tick Structure Processor](https://modrinth.com/mod/fluid-tick-structure-processor)** —
  schedules a fluid tick for every water/lava block right after a structure
  places, so lakes actually flow instead of sitting frozen in their captured
  shape. Purely cosmetic, not required.
- **Huge Structure Blocks** — was originally tried during development to lift
  vanilla's hardcoded 128-block jigsaw placement limit, and turned out to be
  unnecessary *for the planets*: the real cause of their truncation was the
  corner-vs-center anchoring issue described above, not the 128-block cap
  itself. However, it **is required for the Iron Mammoth** bonus structure —
  at 523 blocks wide, its half-width genuinely exceeds the vanilla cap even
  once perfectly centered, so this mod is what actually lets it generate at
  full size instead of vanilla silently clipping it around 128 blocks from
  center. Planets don't need it; the Iron Mammoth does.
- **[Jade](https://modrinth.com/mod/jade)** — tooltip UI showing block/entity
  info on hover. Pure client-side QoL, nothing in this datapack needs any
  special handling for it to work correctly.
- **[Corpse](https://modrinth.com/mod/corpse)** — turns death drops into a
  retrievable corpse entity instead of loose items. No datapack-side
  conflicts expected — it only touches death handling, not world generation
  or loot tables — but worth confirming in-game once installed, especially
  that a corpse spawned mid-flight above a planet lands somewhere the player
  can actually reach (a void death could otherwise drop the corpse itself
  toward the kill plane).

## Credits

Originally inspired by the "IJA Minecraft Planet Generator" datapack
(in-game, command-based planet generation) — this project takes a
completely different approach (offline generation + native world-gen
structures) and shares no code with it.

## License

MIT — see [LICENSE](LICENSE).
