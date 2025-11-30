import { state } from './state.js';
import { STAGE } from './stage-manager.js'; // Updated import to match the actual file name
import { applyItemTransform } from './stage-manager.js'; // Updated import to match the actual file name
import { prepareHitmap, getWingSnapDefinition, getSnapDefinition } from './image-utils.js';

export function updateWingCalibration(wingEl) {
    if (!state.currentBasePonySrc) return;

    // Extract filenames for cleaner JSON keys
    const src = wingEl.src;
    const filename = src.substring(src.lastIndexOf('/') + 1);
    const baseFilename = state.currentBasePonySrc.substring(state.currentBasePonySrc.lastIndexOf('/') + 1);

    // Calculate center of the wing element relative to stage
    const rect = wingEl.getBoundingClientRect();
    const stageRect = STAGE.getBoundingClientRect();

    const centerX = rect.left + rect.width / 2 - stageRect.left;
    const centerY = rect.top + rect.height / 2 - stageRect.top;

    // Normalize coordinates against the rendered base pony image
    const ponyImg = document.getElementById('base-pony');
    if (!ponyImg) return;

    // Stage dimensions (responsive)
    const stageW = STAGE.clientWidth || 700;
    const stageH = STAGE.clientHeight || 700;

    // Determine how the pony image is fitted in the stage
    const naturalW = ponyImg.naturalWidth || 1000;
    const naturalH = ponyImg.naturalHeight || 1000;
    const naturalRatio = naturalW / naturalH;
    const stageRatio = stageW / stageH;

    let renderW, renderH, offsetX, offsetY;

    if (naturalRatio > stageRatio) {
        // Landscape fit
        renderW = stageW;
        renderH = stageW / naturalRatio;
        offsetX = 0;
        offsetY = (stageH - renderH) / 2;
    } else {
        // Portrait fit
        renderH = stageH;
        renderW = stageH * naturalRatio;
        offsetY = 0;
        offsetX = (stageW - renderW) / 2;
    }

    // Calculate normalized position (0.0 to 1.0) relative to the image content
    const normX = (centerX - offsetX) / renderW;
    const normY = (centerY - offsetY) / renderH;

    // Store in state
    if (!state.calibrationData[baseFilename]) {
        state.calibrationData[baseFilename] = {};
    }

    // Find the itemStruct to also grab rotation/scale
    const id = wingEl.dataset.id;
    const itemStruct = state.items.find(i => i.id == id);

    state.calibrationData[baseFilename][filename] = {
        x: Number(normX.toFixed(4)),
        y: Number(normY.toFixed(4)),
        rotation: itemStruct ? Number((itemStruct.rotation || 0).toFixed(2)) : 0,
        scale: itemStruct ? Number((itemStruct.scale || 1).toFixed(2)) : 1
    };

    console.log(`Updated calibration for ${baseFilename} -> ${filename}`, state.calibrationData[baseFilename][filename]);
}

export function updateItemCalibration(itemEl) {
    if (!state.currentBasePonySrc) return;

    // Extract filenames for cleaner JSON keys
    const src = itemEl.src;
    const filename = src.substring(src.lastIndexOf('/') + 1);
    const baseFilename = state.currentBasePonySrc.substring(state.currentBasePonySrc.lastIndexOf('/') + 1);

    // Calculate center of the element relative to stage
    const rect = itemEl.getBoundingClientRect();
    const stageRect = STAGE.getBoundingClientRect();

    const centerX = rect.left + rect.width / 2 - stageRect.left;
    const centerY = rect.top + rect.height / 2 - stageRect.top;

    // Normalize coordinates against the rendered base pony image
    const ponyImg = document.getElementById('base-pony');
    if (!ponyImg) return;

    // Stage dimensions (responsive)
    const stageW = STAGE.clientWidth || 700;
    const stageH = STAGE.clientHeight || 700;

    // Determine how the pony image is fitted in the stage
    const naturalW = ponyImg.naturalWidth || 1000;
    const naturalH = ponyImg.naturalHeight || 1000;
    const naturalRatio = naturalW / naturalH;
    const stageRatio = stageW / stageH;

    let renderW, renderH, offsetX, offsetY;

    if (naturalRatio > stageRatio) {
        // Landscape fit
        renderW = stageW;
        renderH = stageW / naturalRatio;
        offsetX = 0;
        offsetY = (stageH - renderH) / 2;
    } else {
        // Portrait fit
        renderH = stageH;
        renderW = stageH * naturalRatio;
        offsetY = 0;
        offsetX = (stageW - renderW) / 2;
    }

    // Calculate normalized position (0.0 to 1.0) relative to the image content
    const normX = (centerX - offsetX) / renderW;
    const normY = (centerY - offsetY) / renderH;

    // Store in state
    if (!state.calibrationData[baseFilename]) {
        state.calibrationData[baseFilename] = {};
    }

    // Find the itemStruct to also grab rotation/scale
    const id = itemEl.dataset.id;
    const itemStruct = state.items.find(i => i.id == id);

    state.calibrationData[baseFilename][filename] = {
        x: Number(normX.toFixed(4)),
        y: Number(normY.toFixed(4)),
        rotation: itemStruct ? Number((itemStruct.rotation || 0).toFixed(2)) : 0,
        scale: itemStruct ? Number((itemStruct.scale || 1).toFixed(2)) : 1
    };

    console.log(`Updated calibration for ${baseFilename} -> ${filename}`, state.calibrationData[baseFilename][filename]);
}

export function logCalibrationData() {
    console.log("=== WING CALIBRATION DATA ===");
    const debug = {
        calibrationData: state.calibrationData,
        items: state.items.map(item => {
            const masterEl = item.els.find(e => e.dataset.isMaster === 'true') || item.els[0];
            const src = masterEl ? masterEl.src : null;
            return {
                id: item.id,
                type: item.type,
                src,
                rotation: item.rotation || 0,
                scale: item.scale || 1,
                flip: masterEl ? masterEl.dataset.flip === 'true' : false
            };
        })
    };
    const data = JSON.stringify(debug, null, 2);
    console.log(data);
    navigator.clipboard.writeText(data).then(() => {
        alert("Debug JSON (positions/transforms) copied to clipboard!");
    }).catch(err => {
        alert("Debug JSON logged to console.");
        console.error("Failed to copy to clipboard:", err);
    });
}

export function getStageCoordinates(normX, normY, naturalRatio) {
    // Stage dimensions (responsive)
    const stageW = STAGE.clientWidth || 700;
    const stageH = STAGE.clientHeight || 700;
    const stageRatio = stageW / stageH;

    // The image is fit with object-fit: contain inside the stage
    // Determine the actual rendered dimensions of the image
    let renderW, renderH, offsetX, offsetY;

    if (naturalRatio > stageRatio) {
        // Image is wider than stage (landscape) - fit to width
        renderW = stageW;
        renderH = stageW / naturalRatio;
        offsetX = 0;
        offsetY = (stageH - renderH) / 2;
    } else {
        // Image is taller than stage (portrait) - fit to height
        renderH = stageH;
        renderW = stageH * naturalRatio;
        offsetY = 0;
        offsetX = (stageW - renderW) / 2;
    }

    return {
        x: offsetX + (normX * renderW),
        y: offsetY + (normY * renderH)
    };
}

export async function repositionWings(basePonySrc) {
    const wings = state.items.filter(i => i.type === 'wing');
    if (wings.length === 0) return;

    wings.forEach(async wingItem => {
        const frontEl = wingItem.els.find(el => el.dataset.isMaster === 'true');
        const backEl = wingItem.els.find(el => el.dataset.isBack === 'true');
        const wingElForSrc = frontEl || backEl;
        if (!wingElForSrc) return;

        const snap = await getWingSnapDefinition(basePonySrc, wingElForSrc.src);
        const coords = getStageCoordinates(snap.x, snap.y, snap.ratio);

        const x = coords.x;
        const y = coords.y;

        if (frontEl) {
            const w = 200; // Hardcoded width in createWingPair
            const h = 200;
            const left = x - w / 2;
            const top = y - h / 2;

            frontEl.style.left = left + 'px';
            frontEl.style.top = top + 'px';
            frontEl.setAttribute('data-x', 0);
            frontEl.setAttribute('data-y', 0);
        }

        if (backEl) {
            const w = 200;
            const h = 200;
            const left = x - w / 2 + 40;
            const top = y - h / 2 - 20;

            backEl.style.left = left + 'px';
            backEl.style.top = top + 'px';
            backEl.setAttribute('data-x', 0);
            backEl.setAttribute('data-y', 0);
        }

        // Apply calibrated rotation/scale if present
        wingItem.rotation = typeof snap.rotation === 'number' ? snap.rotation : 0;
        wingItem.scale = typeof snap.scale === 'number' ? snap.scale : 1;

        // Apply shared transform for both elements
        applyItemTransform(wingItem);
    });
}