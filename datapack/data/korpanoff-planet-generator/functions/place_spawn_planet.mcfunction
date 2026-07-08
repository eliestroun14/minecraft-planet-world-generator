# Manually assembles the single-entry "spawn_planet" pool (always
# habitable-overworld) at a fixed position, using the same jigsaw assembly
# code natural generation uses — so the embedded anchor jigsaw block's
# final_state resolves correctly (unlike /place template, which pastes the
# raw NBT and would leave a literal jigsaw block sitting in the world).
# Anchor lands at world (0, 64, 0); habitable-overworld's true center is 90
# blocks up in its own local space, and its nearest solid ground to that
# center column is 37 blocks above center — see the y coordinate used below
# and in setworldspawn.
place jigsaw korpanoff-planet-generator:spawn_planet korpanoff-planet-generator:anchor 1 0 64 0

# Force a small guaranteed-solid landing pad instead of trusting the raw
# planet terrain at this exact spot — belt-and-braces against any hidden gap
# or overhang in the source schematic right where the player will land.
fill -1 101 -1 1 101 1 minecraft:grass_block
fill -1 102 -1 1 104 1 minecraft:air

setworldspawn 0 102 0

# Starting kit: elytra + fireworks to get from planet to planet quickly, plus
# basic tools/food/pearls, since a fresh void world offers no other way to
# reach a second planet on foot.
setblock 1 102 0 minecraft:chest{LootTable:"korpanoff-planet-generator:chests/spawn_chest"}

scoreboard players set korp korp_state 1
