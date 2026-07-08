# Catches any player who hasn't been placed on the spawn planet yet — covers
# the very first join (vanilla's own spawn search finds nothing in a void and
# would otherwise let the player fall forever) and is a safety net for any
# other case where the player ends up untagged.
execute as @a[tag=!korpanoff_spawned] at @s run function korpanoff-planet-generator:welcome
