const fs = require('fs');
const path = require('path');
const { convert } = require('./schem-to-structure');

const srcDir = 'C:\\Users\\elies\\Downloads\\sauvegardeDATAPACK\\minecraft-planet-schematic-generator\\outputs';
const dstDir = path.join(__dirname, '..', 'datapack', 'data', 'korpanoff-planet-generator', 'structures');

const files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.schem'));
const converted = [];
for (const f of files) {
  const name = f.replace(/\.schem$/, '');
  const outPath = path.join(dstDir, `${name}.nbt`);
  const info = convert(path.join(srcDir, f), outPath);
  console.log(`${name}: ${info.width}x${info.height}x${info.length}, ${info.nonAirBlocks} blocks, ${info.droppedPlants} unsupported plants dropped`);
  converted.push(name);
}

console.log(`\nConverted ${converted.length} structures.`);

// Build the full weighted template_pool referencing all converted planets.
const elements = converted.map((name) => ({
  weight: 1,
  element: {
    element_type: 'minecraft:single_pool_element',
    location: `korpanoff-planet-generator:${name}`,
    projection: 'rigid',
    processors: 'minecraft:empty',
  },
}));

const pool = { fallback: 'minecraft:empty', elements };
const poolPath = path.join(__dirname, '..', 'datapack', 'data', 'korpanoff-planet-generator', 'worldgen', 'template_pool', 'planets.json');
fs.writeFileSync(poolPath, JSON.stringify(pool, null, 2) + '\n');
console.log(`Wrote ${poolPath} with ${elements.length} weighted entries.`);
