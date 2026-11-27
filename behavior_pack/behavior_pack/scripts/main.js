
import { world, system } from "@minecraft/server";

const WUMPLE_ID = "wumple:wumple";
const SLIMEBALL_ID = "minecraft:slime_ball";

const HOSTILE_RADIUS = 8;
const PERCH_HEIGHT = 0.25;
const TEMP_STATE_DURATION = 30;

// Animation state numbers
const STATE = {
    IDLE: 0,
    MOVE: 1,
    NERVOUS: 2,
    HAPPY: 3,
    CONFUSED: 4
};

const temporaryStates = new Map();

function setState(wumple, state) {
    try {
        wumple.setProperty("wumple:state", state);
    } catch (error) {
        console.warn("Could not update Wumple animation state.");
    }
}

function setTemporaryState(wumple, state, duration = TEMP_STATE_DURATION) {
    temporaryStates.set(wumple.id, {
        state,
        expires: system.currentTick + duration
    });

    setState(wumple, state);
}

function getOwner(wumple) {
    const ownerTag = wumple.getTags().find(
        tag => tag.startsWith("wumple_owner:")
    );

    if (!ownerTag) return undefined;

    const ownerId = ownerTag.substring("wumple_owner:".length);

    return world.getAllPlayers().find(
        player => player.id === ownerId
    );
}

// Player interaction
world.afterEvents.playerInteractWithEntity.subscribe(event => {
    const wumple = event.target;
    const player = event.player;

    if (wumple.typeId !== WUMPLE_ID) return;

    // Untamed Wumple
    if (!wumple.hasTag("wumple_tamed")) {
        const inventory = player.getComponent("minecraft:inventory");
        const container = inventory?.container;
        const slotIndex = player.selectedSlotIndex;
        const slot = container?.getSlot(slotIndex);

        // No slimeball: confused animation
        if (!slot || slot.typeId !== SLIMEBALL_ID) {
            setTemporaryState(wumple, STATE.CONFUSED);
            return;
        }

        // Consume one slimeball
        if (slot.amount > 1) {
            slot.amount -= 1;
        } else {
            container.setItem(slotIndex, undefined);
        }

        // Tame Wumple
        wumple.addTag("wumple_tamed");
        wumple.addTag(`wumple_owner:${player.id}`);

        temporaryStates.delete(wumple.id);
        setState(wumple, STATE.HAPPY);

        player.sendMessage("§aWumple trusts you now!");
        return;
    }

    // Only the owner can interact with a tamed Wumple
    const owner = getOwner(wumple);

    if (!owner || owner.id !== player.id) {
        return;
    }

    // Toggle head-sitting
    if (wumple.hasTag("wumple_perched")) {
        wumple.removeTag("wumple_perched");
        setState(wumple, STATE.HAPPY);

        player.sendMessage("§eWumple hopped down!");
    } else {
        wumple.addTag("wumple_perched");
        setState(wumple, STATE.HAPPY);

        player.sendMessage("§aWumple climbed onto your head!");
    }
});

// React when Wumple gets hurt
world.afterEvents.entityHurt.subscribe(event => {
    const wumple = event.hurtEntity;

    if (wumple.typeId !== WUMPLE_ID) return;

    if (wumple.hasTag("wumple_perched")) return;

    setTemporaryState(wumple, STATE.NERVOUS);
});

// Main behavior loop
system.runInterval(() => {
    for (const dimensionId of [
        "overworld",
        "nether",
        "the_end"
    ]) {
        const dimension = world.getDimension(dimensionId);

        const wumples = dimension.getEntities({
            type: WUMPLE_ID
        });

        for (const wumple of wumples) {
            if (!wumple.isValid) continue;

            // Perched Wumple
            if (wumple.hasTag("wumple_perched")) {
                const owner = getOwner(wumple);

                if (!owner || owner.dimension.id !== dimension.id) {
                    wumple.removeTag("wumple_perched");
                    setState(wumple, STATE.HAPPY);
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

                setState(wumple, STATE.HAPPY);
                continue;
            }

            // Temporary animation states
            const temporary = temporaryStates.get(wumple.id);

            if (temporary && system.currentTick < temporary.expires) {
                setState(wumple, temporary.state);
                continue;
            }

            if (temporary) {
                temporaryStates.delete(wumple.id);
            }

            // Nervous when hostile mobs are nearby
            const hostiles = dimension.getEntities({
                location: wumple.location,
                maxDistance: HOSTILE_RADIUS,
                families: ["monster"]
            });

            if (hostiles.length > 0) {
                setState(wumple, STATE.NERVOUS);
                continue;
            }

            // Tamed Wumple stays happy
            if (wumple.hasTag("wumple_tamed")) {
                setState(wumple, STATE.HAPPY);
                continue;
            }

            // Detect movement
            const velocity = wumple.getVelocity();
            const moving =
                Math.abs(velocity.x) > 0.03 ||
                Math.abs(velocity.z) > 0.03;

            if (moving) {
                setState(wumple, STATE.MOVE);
            } else {
                setState(wumple, STATE.IDLE);
            }
        }
    }
}, 5);

