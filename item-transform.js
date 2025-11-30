import { state } from './state.js';
import { STAGE } from './stage-constants.js';

// Helper to apply translation + rotation + scale (+ flip) to all elements of an item
export function applyItemTransform(itemStruct) {
    const rotation = itemStruct.rotation || 0;
    const scale = itemStruct.scale || 1;

    itemStruct.els.forEach(el => {
        const x = parseFloat(el.getAttribute('data-x')) || 0;
        const y = parseFloat(el.getAttribute('data-y')) || 0;
        const flip = el.dataset.flip === 'true';

        const sx = flip ? -scale : scale;
        const sy = scale;

        let transform = `translate(${x}px, ${y}px) rotate(${rotation}deg) scale(${sx}, ${sy})`;
        el.style.transform = transform;
    });
}

// Expose core transform function for other modules (e.g. rotation handle)
if (typeof window !== 'undefined') {
    window._applyItemTransformCore = applyItemTransform;
}

export function moveItem(id, dx, dy) {
    const itemStruct = state.items.find(i => i.id == id);
    if (!itemStruct) return;

    itemStruct.els.forEach(el => {
        const currentX = parseFloat(el.getAttribute('data-x')) || 0;
        const currentY = parseFloat(el.getAttribute('data-y')) || 0;
        
        const newX = currentX + dx;
        const newY = currentY + dy;
        
        el.setAttribute('data-x', newX);
        el.setAttribute('data-y', newY);
    });

    applyItemTransform(itemStruct);
}

export function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

