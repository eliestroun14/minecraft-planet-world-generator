# Runs every time the datapack (re)loads. Guarded by a scoreboard flag so the
# guaranteed spawn planet is only ever assembled once per world, not
# re-stacked on every /reload or server restart.
scoreboard objectives add korp_state dummy
execute unless score korp korp_state matches 1 run function korpanoff-planet-generator:place_spawn_planet
