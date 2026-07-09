const fs = require('fs');
const path = require('path');
const { convert } = require('./schem-to-structure');

const srcDir = 'C:\\Users\\elies\\Downloads\\sauvegardeDATAPACK\\minecraft-planet-schematic-generator\\outputs';
const dstDir = path.join(__dirname, '..', 'datapack', 'data', 'korpanoff-planet-generator', 'structures');
const poolDir = path.join(__dirname, '..', 'datapack', 'data', 'korpanoff-planet-generator', 'worldgen', 'template_pool');

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

// Rebuild each category's weighted template_pool (rocky-planets.json,
// habitable-planets.json, ring-planets.json — see worldgen/structure/*-planet.json
// and worldgen/structure_set/*-planets.json, one independently /locate-able
// structure per category) from whatever matching .nbt files exist in
// structures/, not just the ones just converted, so re-running this after
// manually adding/removing a file still produces a correct, complete pool.
const categories = { rocky: [], habitable: [], ring: [] };
const allNames = fs.readdirSync(dstDir)
  .filter((f) => f.endsWith('.nbt') && f !== 'iron-mammoth.nbt')
  .map((f) => f.replace(/\.nbt$/, ''))
  .sort();
for (const name of allNames) {
  const prefix = name.split('-')[0];
  if (categories[prefix]) categories[prefix].push(name);
}

for (const [category, names] of Object.entries(categories)) {
  const pool = {
    fallback: 'minecraft:empty',
    elements: names.map((name) => ({
      weight: 1,
      element: {
        element_type: 'minecraft:single_pool_element',
        location: `korpanoff-planet-generator:${name}`,
        projection: 'rigid',
        processors: 'minecraft:empty',
      },
    })),
  };
  const poolPath = path.join(poolDir, `${category}-planets.json`);
  fs.writeFileSync(poolPath, JSON.stringify(pool, null, 2) + '\n');
  console.log(`Wrote ${poolPath} with ${names.length} weighted entries.`);
}
