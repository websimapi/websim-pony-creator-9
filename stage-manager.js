import { state, getSelectedEl, setSelectedEl } from './state.js';
import { STAGE } from './stage-constants.js';
import { applyItemTransform, moveItem, clamp } from './item-transform.js';
import { updateWingCalibration, updateItemCalibration, logCalibrationData, getStageCoordinates, repositionWings } from './calibration.js';
import { replaceFirstItemOfType, spawnItem, deleteItem, clearAll, adjustZForSelected } from './item-factory.js';

// Main stage export
export { STAGE };

export function selectElement(el) {
    const selectedEl = getSelectedEl();
    if (selectedEl === el) return;

    if (selectedEl) {
        selectedEl.classList.remove('selected');
    }
    setSelectedEl(el);
    if (el) {
        el.classList.add('selected');
    }
    // Show/hide transform handle
    if (window.updateTransformHandleForSelection) {
        window.updateTransformHandleForSelection(el);
    }
}

export function flipSelected() {
    const selectedEl = getSelectedEl();
    if (!selectedEl) return;

    const id = selectedEl.dataset.id;
    const itemStruct = state.items.find(i => i.id == id);
    if (!itemStruct) return;

    itemStruct.els.forEach(el => {
        const currentFlip = el.dataset.flip === 'true';
        const newFlip = !currentFlip;
        
        el.dataset.flip = String(newFlip);
    });

    applyItemTransform(itemStruct);
}

// Re-export pieces needed by other modules
export {
    applyItemTransform,
    moveItem,
    updateWingCalibration,
    updateItemCalibration,
    logCalibrationData,
    getStageCoordinates,
    repositionWings,
    replaceFirstItemOfType,
    spawnItem,
    deleteItem,
    clearAll,
    adjustZForSelected,
    clamp
};