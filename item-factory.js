import { state, getNextId, getWingDefaultFlip, getSelectedEl, setSelectedEl } from './state.js';
import { STAGE } from './stage-manager.js';
import { prepareHitmap, getWingSnapDefinition, getSnapDefinition } from './image-utils.js';
import { applyItemTransform, clamp } from './stage-manager.js';
import { getStageCoordinates, repositionWings } from './stage-manager.js';

export async function replaceFirstItemOfType(type, newSrc) {
    const itemStruct = state.items.find(i => i.type === type);
    if (!itemStruct) return false;

    // Ensure hitmap is ready for new image
    await prepareHitmap(newSrc);

    // Update source for all elements in this item (e.g. wing pair)
    for (const el of itemStruct.els) {
        el.src = newSrc;

        // Re-apply default flip based on the new asset
        if (type === 'wing') {
            const shouldFlip = getWingDefaultFlip(newSrc);
            el.dataset.flip = String(shouldFlip);

            // Preserve any existing translation while updating flip
            const x = parseFloat(el.getAttribute('data-x')) || 0;
            const y = parseFloat(el.getAttribute('data-y')) || 0;

            // Rebuild transform via itemStruct to keep rotation/scale consistent
            applyItemTransform(itemStruct);
        }
    }

    // If this is a wing, reapply snap for the new wing asset
    if (type === 'wing') {
        const ponyImg = document.getElementById('base-pony');
        if (ponyImg) {
            await repositionWings(ponyImg.src);
        }
    }

    return true;
}

export async function spawnItem(src, type, x, y) {
    const id = getNextId();
    // Ensure hitmap is prepared
    await prepareHitmap(src);

    if (type === 'wing') {
        const basePony = document.getElementById('base-pony');
        const snap = await getWingSnapDefinition(basePony.src, src);
        const coords = getStageCoordinates(snap.x, snap.y, snap.ratio);

        createWingPair(
            id,
            src,
            coords.x,
            coords.y,
            typeof snap.rotation === 'number' ? snap.rotation : 0,
            typeof snap.scale === 'number' ? snap.scale : 1
        );
    } else {
        const rect = STAGE.getBoundingClientRect();

        const basePony = document.getElementById('base-pony');
        let stageX;
        let stageY;
        let initialRotation = 0;
        let initialScale = 1;

        if (basePony) {
            const snap = await getSnapDefinition(basePony.src, src);
            if (snap && typeof snap.x === 'number' && typeof snap.y === 'number') {
                const coords = getStageCoordinates(snap.x, snap.y, snap.ratio);
                stageX = coords.x;
                stageY = coords.y;
                initialRotation = typeof snap.rotation === 'number' ? snap.rotation : 0;
                initialScale = typeof snap.scale === 'number' ? snap.scale : 1;
            } else {
                // Fallback: use drop position
                stageX = x - rect.left;
                stageY = y - rect.top;
            }
        } else {
            // Fallback if base pony missing
            stageX = x - rect.left;
            stageY = y - rect.top;
        }

        createSingleItem(id, src, type, stageX, stageY, initialRotation, initialScale);
    }
}

export function deleteItem(id) {
    const itemIndex = state.items.findIndex(i => i.id == id);
    if (itemIndex > -1) {
        const itemStruct = state.items[itemIndex];
        itemStruct.els.forEach(el => el.remove());
        state.items.splice(itemIndex, 1);
    }
}

export function clearAll() {
    state.items.forEach(itemStruct => {
        itemStruct.els.forEach(el => el.remove());
    });
    // Reset array in place or setter
    state.items.length = 0;

    const selectedEl = getSelectedEl();
    if (selectedEl) {
        selectedEl.classList.remove('selected');
        setSelectedEl(null);
    }
}

export function createSingleItem(id, src, type, x, y, initialRotation = 0, initialScale = 1) {
    const el = document.createElement('img');
    el.src = src;
    el.className = `stage-item z-front`;
    el.dataset.id = id;
    el.dataset.type = type;
    el.style.width = '160px';
    el.draggable = false;

    // Apply default flip for pink horn
    if (src.includes('horn.png')) {
        el.dataset.flip = 'true';
        el.style.transform = 'scaleX(-1)';
    }

    el.style.left = (x - 80) + 'px';
    el.style.top = (y - 80) + 'px';

    el.setAttribute('data-x', 0);
    el.setAttribute('data-y', 0);

    const baseZ = 15;
    el.style.zIndex = String(baseZ);

    STAGE.appendChild(el);

    const itemStruct = {
        id,
        type,
        els: [el],
        baseZ,
        zOffset: 0,
        rotation: initialRotation,
        scale: initialScale
    };

    state.items.push(itemStruct);
    applyItemTransform(itemStruct);
}

export function createWingPair(id, src, x, y, initialRotation = 0, initialScale = 1) {
    // Determine default flip per asset using centralized settings
    const shouldFlip = getWingDefaultFlip(src);

    const backEl = document.createElement('img');
    backEl.src = src;
    backEl.className = `stage-item z-back wing-back`;
    backEl.dataset.id = id;
    backEl.dataset.isBack = 'true';
    backEl.dataset.flip = String(shouldFlip);
    backEl.dataset.type = 'wing';
    backEl.style.width = '200px';
    backEl.draggable = false;
    backEl.style.pointerEvents = 'none';

    const frontEl = document.createElement('img');
    frontEl.src = src;
    frontEl.className = `stage-item z-front`;
    frontEl.dataset.id = id;
    frontEl.dataset.isMaster = 'true';
    frontEl.dataset.flip = String(shouldFlip);
    frontEl.dataset.type = 'wing';
    frontEl.style.width = '200px';
    frontEl.draggable = false;

    const w = 200;
    const h = 200;

    const initLeft = (x - w / 2);
    const initTop = (y - h / 2);

    frontEl.style.left = initLeft + 'px';
    frontEl.style.top = initTop + 'px';

    backEl.style.left = (initLeft + 40) + 'px';
    backEl.style.top = (initTop - 20) + 'px';

    backEl.setAttribute('data-x', 0);
    backEl.setAttribute('data-y', 0);
    frontEl.setAttribute('data-x', 0);
    frontEl.setAttribute('data-y', 0);

    const backBaseZ = 5;
    const frontBaseZ = 20;
    frontEl.style.zIndex = String(frontBaseZ);
    backEl.style.zIndex = String(backBaseZ);

    STAGE.appendChild(backEl);
    STAGE.appendChild(frontEl);

    const itemStruct = {
        id,
        type: 'wing',
        els: [frontEl, backEl],
        baseZ: 15,
        zOffset: 0,
        rotation: initialRotation,
        scale: initialScale
    };
    state.items.push(itemStruct);
    applyItemTransform(itemStruct);
}

export function adjustZForSelected(delta) {
    const selectedEl = getSelectedEl();
    if (!selectedEl) return;

    const id = selectedEl.dataset.id;
    const itemStruct = state.items.find(i => i.id == id);
    if (!itemStruct) return;

    const newOffset = clamp(
        (itemStruct.zOffset || 0) + delta,
        -10,
        10
    );
    itemStruct.zOffset = newOffset;

    if (itemStruct.type === 'wing') {
        itemStruct.els.forEach(el => {
            const isBack = el.dataset.isBack === 'true';
            const baseZ = isBack ? 5 : 20;
            const finalZ = baseZ + newOffset;
            el.style.zIndex = String(finalZ);
        });
    } else {
        const baseZ = itemStruct.baseZ || 15;
        const finalZ = baseZ + newOffset;

        itemStruct.els.forEach(el => {
            el.style.zIndex = String(finalZ);
        });
    }
}