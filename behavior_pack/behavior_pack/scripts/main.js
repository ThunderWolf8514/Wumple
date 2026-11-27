
import { world, system } from "@minecraft/server";

const WUMPLE_ID = "wumple:wumple";
const SLIMEBALL_ID = "minecraft:slime_ball";
const HOSTILE_RADIUS = 8;
const PERCH_HEIGHT = 0.25;

// Store temporary animation states.
const animationStates = new Map();

function setState(wumple, state) {
    try {
        wumple.setProperty("wumple:state", state);
    } catch {
        // Property will be added to the entity definition.
    }
}

// Find the player who owns a Wumple.
function getOwner(wumple) {
    const tags = wumple.getTags();
    const ownerTag = tags.find(tag => tag.startsWith("wumple_owner:"));

    if (!ownerTag) return undefined;

    const ownerId = ownerTag.substring("wumple_owner:".length);

    return world.getAllPlayers().find(player => player.id === ownerId);
}

// Handle player interaction.
world.afterEvents.playerInteractWithEntity.subscribe(event => {
    const wumple = event.target;
    const player = event.player;

    if (wumple.typeId !== WUMPLE_ID) return;

    const inventory = player.getComponent("minecraft:inventory");
    const container = inventory?.container;

    if (!wumple.hasTag("wumple_tamed")) {
        const slot = container?.getSlot(player.selectedSlotIndex);

        if (!slot || slot.typeId !== SLIMEBALL_ID) return;

        // Consume one slimeball.
        if (slot.amount > 1) {
            slot.amount -= 1;
        } else {
            slot.setItem(undefined);
        }

        wumple.addTag("wumple_tamed");
        wumple.addTag(`wumple_owner:${player.id}`);

        setState(wumple, 3);

        player.sendMessage("§aWumple trusts you now!");
        return;
    }

    const owner = getOwner(wumple);

    if (!owner || owner.id !== player.id) {
        player.sendMessage("§7Wumple belongs to someone else!");
        return;
    }

    // Toggle head-sitting.
    if (wumple.hasTag("wumple_perched")) {
        wumple.removeTag("wumple_perched");
        setState(wumple, 0);
        player.sendMessage("§eWumple hopped down!");
    } else {
        wumple.addTag("wumple_perched");
        setState(wumple, 4);
        player.sendMessage("§aWumple climbed onto your head!");
    }
});

// Update Wumples regularly.
system.runInterval(() => {
    for (const dimension of [
        world.getDimension("overworld"),
        world.getDimension("nether"),
        world.getDimension("the_end")
    ]) {
        const wumples = dimension.getEntities({
            type: WUMPLE_ID
        });

        for (const wumple of wumples) {
            if (!wumple.isValid) continue;

            // Head-sitting behavior.
            if (wumple.hasTag("wumple_perched")) {
                const owner = getOwner(wumple);

                if (!owner || owner.dimension.id !== wumple.dimension.id) {
                    wumple.removeTag("wumple_perched");
                    setState(wumple, 0);
                    continue;
                }

                const head = owner.getHeadLocation();

                wumple.teleport({
                    x: head.x,
                    y: head.y + PERCH_HEIGHT,
                    z: head.z
                }, {
                    dimension: owner.dimension,
                    rotation: owner.getRotation()
                });

                continue;
            }

            // Nervous reaction to nearby hostile mobs.
            const hostiles = dimension.getEntities({
                location: wumple.location,
                maxDistance: HOSTILE_RADIUS,
                families: ["monster"]
            });

            if (hostiles.length > 0) {
                setState(wumple, 2);
            } else if (wumple.hasTag("wumple_tamed")) {
                setState(wumple, 3);
            } else {
                setState(wumple, 0);
            }
        }
    }
}, 5);
