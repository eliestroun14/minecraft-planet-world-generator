#!/usr/bin/env node
'use strict';

// Converts a Sponge Schematic v2 (.schem) file into Minecraft's native
// structure-template NBT format (.nbt), the format read by
// `worldgen/template_pool` single_pool_element `location` references.
//
// Usage: node schem-to-structure.js <input.schem> <output.nbt>
//
// Only needs a valid Sponge Schematic v2 file as input — does not depend on
// any other tool/project, so it can convert schematics from any source.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const nbt = require('prismarine-nbt');

const DATA_VERSION_1_20_1 = 3465;

function decodeVarInts(unsignedBytes) {
  const out = [];
  let i = 0;
  while (i < unsignedBytes.length) {
    let result = 0;
    let shift = 0;
    let b;
    do {
      b = unsignedBytes[i++];
      result |= (b & 0x7f) << shift;
      shift += 7;
    } while (b & 0x80);
    out.push(result);
  }
  return out;
}

// "minecraft:water[level=8]" -> { Name: "minecraft:water", Properties: { level: "8" } }
function parseBlockId(blockId) {
  const bracket = blockId.indexOf('[');
  if (bracket === -1) return { Name: blockId };
  const name = blockId.slice(0, bracket);
  const propsStr = blockId.slice(bracket + 1, blockId.lastIndexOf(']'));
  const properties = {};
  for (const pair of propsStr.split(',')) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    properties[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  return { Name: name, Properties: properties };
}

function readSchematic(inPath) {
  const buf = zlib.gunzipSync(fs.readFileSync(inPath));
  // noArraySizeCheck: prismarine-nbt otherwise rejects very large byte/int
  // arrays ("array size is abnormally large, not reading: N") — needed for
  // schematics well beyond planet-sized (e.g. iron-mammoth at 523x253x338).
  const parsed = nbt.parseUncompressed(buf, 'big', { noArraySizeCheck: true });
  const v = parsed.value;

  const width = v.Width.value;
  const height = v.Height.value;
  const length = v.Length.value;
  const sourceDataVersion = v.DataVersion ? v.DataVersion.value : DATA_VERSION_1_20_1;

  const idToBlock = {};
  for (const [blockId, entry] of Object.entries(v.Palette.value)) idToBlock[entry.value] = blockId;

  const rawBytes = v.BlockData.value.map((b) => (b < 0 ? b + 256 : b));
  const indices = decodeVarInts(rawBytes);

  const blockEntitiesByPos = new Map();
  for (const be of v.BlockEntities.value.value || []) {
    const pos = be.Pos.value; // intArray tag: .value is the plain [x,y,z] array directly
    blockEntitiesByPos.set(pos.join(','), be);
  }

  return { width, height, length, idToBlock, indices, blockEntitiesByPos, sourceDataVersion };
}

// Minecraft anchors a jigsaw single_pool_element's STARTING piece by its
// north-west (min) corner unless the piece contains a jigsaw block matching
// `start_jigsaw_name` — in which case THAT block's position becomes the
// anchor instead. Without this, a large symmetric piece like a planet gets
// "anchored" at one corner, and whatever falls outside the generation
// system's reach from that corner (not the piece's true center) never
// places — the exact asymmetric truncation observed in testing. Embedding a
// jigsaw block at the piece's geometric center, with `final_state` set back
// to whatever block naturally belongs there, fixes the anchor without any
// visible/functional side effect (it never needs to actually connect to
// anything further, so its own `pool` points at the built-in empty pool).
const ANCHOR_JIGSAW_NAME = 'korpanoff-planet-generator:anchor';

// Blocks that need a valid support block beneath them, or the game treats
// their placement as invalid and pops them off as a dropped item entity the
// moment the chunk loads/ticks. Source schematics happily store these
// floating (e.g. a flower over a block that got edited away later), but
// pasting them as-is floods the chunk with item entities on load — enough of
// them can crash weaker clients. We omit any such block lacking real support
// instead of writing it, same as we already omit air.
const NEEDS_SOLID_SUPPORT = new Set([
  'minecraft:short_grass', 'minecraft:grass', 'minecraft:fern', 'minecraft:dead_bush',
  'minecraft:dandelion', 'minecraft:poppy', 'minecraft:blue_orchid', 'minecraft:allium',
  'minecraft:azure_bluet', 'minecraft:red_tulip', 'minecraft:orange_tulip', 'minecraft:white_tulip',
  'minecraft:pink_tulip', 'minecraft:oxeye_daisy', 'minecraft:cornflower', 'minecraft:lily_of_the_valley',
  'minecraft:wither_rose', 'minecraft:sugar_cane', 'minecraft:bamboo', 'minecraft:bamboo_sapling',
  'minecraft:brown_mushroom', 'minecraft:red_mushroom',
  'minecraft:oak_sapling', 'minecraft:spruce_sapling', 'minecraft:birch_sapling', 'minecraft:jungle_sapling',
  'minecraft:acacia_sapling', 'minecraft:dark_oak_sapling', 'minecraft:mangrove_propagule', 'minecraft:cherry_sapling',
  'minecraft:azalea', 'minecraft:flowering_azalea',
  'minecraft:tall_grass', 'minecraft:large_fern', 'minecraft:sunflower', 'minecraft:lilac', 'minecraft:rose_bush', 'minecraft:peony',
]);

// The upper half of these double-tall plants only needs its own lower half
// directly beneath it (not a solid block) — special-cased below so we don't
// mistake a perfectly valid upper half for an unsupported one.
const DOUBLE_TALL_PLANTS = new Set(['minecraft:tall_grass', 'minecraft:large_fern', 'minecraft:sunflower', 'minecraft:lilac', 'minecraft:rose_bush', 'minecraft:peony']);

// Anything not solid enough to hold up a plant placed on top of it.
// Deliberately coarse — not a full match of Minecraft's actual sturdiness
// rules — but covers the floating-plant cases these schematics contain.
const NON_SOLID_SUPPORT = new Set([
  'minecraft:air', 'minecraft:cave_air', 'minecraft:void_air', 'minecraft:water', 'minecraft:lava',
  'minecraft:torch', 'minecraft:wall_torch', 'minecraft:soul_torch', 'minecraft:soul_wall_torch',
  'minecraft:redstone_torch', 'minecraft:redstone_wall_torch', 'minecraft:vine', 'minecraft:ladder',
  'minecraft:snow', 'minecraft:diamond_block', 'minecraft:emerald_block',
  ...NEEDS_SOLID_SUPPORT,
]);

function baseName(blockId) {
  const bracket = blockId.indexOf('[');
  return bracket === -1 ? blockId : blockId.slice(0, bracket);
}

// Bottom-up scan flagging every plant/foliage block that would pop off in
// game for lacking real support, so buildStructureNbt can omit them.
function findUnsupportedPlants({ width, height, length, idToBlock, indices }) {
  const removed = new Set();
  const rowSize = length * width;

  const effectiveAt = (x, y, z) => {
    if (x < 0 || y < 0 || z < 0 || x >= width || y >= height || z >= length) return 'minecraft:air';
    const blockId = idToBlock[indices[y * rowSize + z * width + x]];
    if (blockId === 'minecraft:diamond_block' || blockId === 'minecraft:emerald_block') return 'minecraft:air';
    return blockId;
  };

  for (let y = 0; y < height; y++) {
    for (let z = 0; z < length; z++) {
      for (let x = 0; x < width; x++) {
        const blockId = effectiveAt(x, y, z);
        const bn = baseName(blockId);
        if (!NEEDS_SOLID_SUPPORT.has(bn)) continue;

        const belowId = effectiveAt(x, y - 1, z);
        const belowBn = baseName(belowId);
        const belowKey = `${x},${y - 1},${z}`;

        let supported;
        if (DOUBLE_TALL_PLANTS.has(bn) && parseBlockId(blockId).Properties?.half === 'upper') {
          supported = belowBn === bn && !removed.has(belowKey);
        } else {
          supported = !NON_SOLID_SUPPORT.has(belowBn) && !removed.has(belowKey);
        }
        if (!supported) removed.add(`${x},${y},${z}`);
      }
    }
  }
  return removed;
}

function buildStructureNbt({ width, height, length, idToBlock, indices, blockEntitiesByPos, sourceDataVersion }) {
  const palette = new Map(); // blockId string -> new compact index
  const blocks = [];
  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);
  const centerZ = Math.floor(length / 2);
  const unsupportedPlants = findUnsupportedPlants({ width, height, length, idToBlock, indices });

  let i = 0;
  let droppedPlants = 0;
  for (let y = 0; y < height; y++) {
    for (let z = 0; z < length; z++) {
      for (let x = 0; x < width; x++) {
        let blockId = idToBlock[indices[i]];
        i++;
        const isAnchor = x === centerX && y === centerY && z === centerZ;
        const isUnsupportedPlant = unsupportedPlants.has(`${x},${y},${z}`);
        if (isUnsupportedPlant) droppedPlants++;
        // WorldEdit corner markers are scaffolding from the schematic
        // generator, not planet content — treat exactly like air (omit).
        if (!isAnchor && (blockId === 'minecraft:diamond_block' || blockId === 'minecraft:emerald_block')) continue;
        // structure_void semantics: air just needs omitting — UNLESS it's the
        // anchor cell, since skipping it here would silently drop the centered
        // jigsaw anchor block for any piece whose exact geometric center is air
        // (common for hollow/asymmetric structures), reverting to corner-anchor
        // truncation.
        if (!isAnchor && blockId === 'minecraft:air') continue;
        if (!isAnchor && isUnsupportedPlant) continue;

        const paletteBlockId = isAnchor ? 'minecraft:jigsaw' : blockId;
        if (!palette.has(paletteBlockId)) palette.set(paletteBlockId, palette.size);
        const stateIndex = palette.get(paletteBlockId);

        // Minecraft's native structure format wants `pos` as a plain
        // TAG_List<TAG_Int> (3 entries), NOT a TAG_IntArray like Sponge's
        // schematic format uses for its own Pos/BlockEntities fields.
        const blockEntry = {
          pos: { type: 'list', value: { type: 'int', value: [x, y, z] } },
          state: { type: 'int', value: stateIndex },
        };

        if (isAnchor) {
          // If the block that really belongs at the center would itself have
          // been dropped as an unsupported plant, revert to air instead of
          // resurrecting it via final_state.
          const finalState = isUnsupportedPlant ? 'minecraft:air' : blockId;
          blockEntry.nbt = {
            type: 'compound',
            value: {
              id: { type: 'string', value: 'minecraft:jigsaw' },
              name: { type: 'string', value: ANCHOR_JIGSAW_NAME },
              target: { type: 'string', value: ANCHOR_JIGSAW_NAME },
              pool: { type: 'string', value: 'minecraft:empty' },
              joint: { type: 'string', value: 'rigid' },
              final_state: { type: 'string', value: finalState },
            },
          };
        } else {
          const be = blockEntitiesByPos.get(`${x},${y},${z}`);
          if (be && be.SpawnData) {
            blockEntry.nbt = {
              type: 'compound',
              value: {
                id: { type: 'string', value: be.Id.value },
                SpawnData: be.SpawnData,
              },
            };
          }
        }
        blocks.push(blockEntry);
      }
    }
  }

  const paletteList = [];
  for (const [blockId] of palette) {
    if (blockId === 'minecraft:jigsaw') {
      paletteList.push({
        Name: { type: 'string', value: 'minecraft:jigsaw' },
        Properties: { type: 'compound', value: { orientation: { type: 'string', value: 'up_south' } } },
      });
      continue;
    }
    const { Name, Properties } = parseBlockId(blockId);
    const entry = { Name: { type: 'string', value: Name } };
    if (Properties && Object.keys(Properties).length) {
      const propsValue = {};
      for (const [k, val] of Object.entries(Properties)) propsValue[k] = { type: 'string', value: val };
      entry.Properties = { type: 'compound', value: propsValue };
    }
    paletteList.push(entry);
  }

  const result = {
    type: 'compound',
    name: '',
    value: {
      // Preserve the SOURCE schematic's DataVersion rather than claiming
      // it's already 1.20.1-native — Minecraft's own DataFixerUpper migrates
      // old block states/ids on load as long as this field is honest about
      // where the data actually came from.
      DataVersion: { type: 'int', value: sourceDataVersion || DATA_VERSION_1_20_1 },
      size: { type: 'list', value: { type: 'int', value: [width, height, length] } },
      palette: { type: 'list', value: { type: 'compound', value: paletteList } },
      blocks: { type: 'list', value: { type: 'compound', value: blocks } },
      entities: { type: 'list', value: { type: 'compound', value: [] } },
    },
  };
  result.droppedPlants = droppedPlants;
  return result;
}

function convert(inPath, outPath) {
  const schem = readSchematic(inPath);
  const structureNbt = buildStructureNbt(schem);
  const buf = nbt.writeUncompressed(structureNbt, 'big');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, zlib.gzipSync(buf));

  const nonAirBlocks = structureNbt.value.blocks.value.value.length;
  const paletteSize = structureNbt.value.palette.value.value.length;
  return {
    width: schem.width,
    height: schem.height,
    length: schem.length,
    nonAirBlocks,
    paletteSize,
    droppedPlants: structureNbt.droppedPlants || 0,
  };
}

function main() {
  const [inPath, outPath] = process.argv.slice(2);
  if (!inPath || !outPath) {
    console.error('Usage: node schem-to-structure.js <input.schem> <output.nbt>');
    process.exit(1);
  }
  const info = convert(inPath, outPath);
  console.log(`Wrote ${outPath}: ${info.width}x${info.height}x${info.length}, ${info.nonAirBlocks} blocks, ${info.paletteSize} block types, ${info.droppedPlants} unsupported plants dropped.`);
}

if (require.main === module) main();
module.exports = { convert };
