import { processBasePony } from './image-utils.js';
import { setupPaletteInteractions, setupStageInteractions } from './interaction-handlers.js';
import { clearAll, adjustZForSelected, flipSelected, replaceFirstItemOfType, spawnItem, STAGE, repositionWings, logCalibrationData } from './stage-manager.js';
import { state } from './state.js';

// Configuration
const BASE_PONY_SRC = '/base_pony_white.png';

// Setup Delete Zone
const DELETE_ZONE = document.createElement('div');
DELETE_ZONE.id = 'delete-zone';
DELETE_ZONE.innerHTML = '🗑️';
document.getElementById('stage-container').appendChild(DELETE_ZONE);

// Initialize
async function init() {
    const ponyImg = document.getElementById('base-pony');

    // Create a single transform handle used for rotation/scale of the selected element
    const transformHandle = document.createElement('div');
    transformHandle.id = 'transform-handle';
    transformHandle.style.position = 'absolute';
    transformHandle.style.width = '32px';
    transformHandle.style.height = '32px';
    transformHandle.style.borderRadius = '50%';
    transformHandle.style.background = 'rgba(255,255,255,0.9)';
    transformHandle.style.boxShadow = '0 2px 6px rgba(0,0,0,0.25)';
    transformHandle.style.display = 'none';
    transformHandle.style.justifyContent = 'center';
    transformHandle.style.alignItems = 'center';
    transformHandle.style.fontSize = '18px';
    transformHandle.style.cursor = 'grab';
    transformHandle.style.touchAction = 'none';
    transformHandle.textContent = '⟳';
    document.getElementById('stage-container').appendChild(transformHandle);

    let handleState = {
        active: false,
        itemId: null,
        startAngle: 0,
        startRotation: 0,
        startDist: 0,
        startScale: 1,
        centerX: 0,
        centerY: 0
    };

    function positionHandleForElement(el) {
        if (!el) {
            transformHandle.style.display = 'none';
            return;
        }
        const rect = el.getBoundingClientRect();
        const stageRect = STAGE.getBoundingClientRect();
        const handleSize = 32;
        const left = rect.right - stageRect.left - handleSize / 2;
        const top = rect.top - stageRect.top - handleSize / 2;
        transformHandle.style.left = `${left}px`;
        transformHandle.style.top = `${top}px`;
        transformHandle.style.display = 'flex';
    }

    window.updateTransformHandleForSelection = function(el) {
        positionHandleForElement(el);
    };

    transformHandle.addEventListener('pointerdown', (e) => {
        const selectedEl = state.selectedEl;
        if (!selectedEl) return;
        const itemId = selectedEl.dataset.id;
        const itemStruct = state.items.find(i => i.id == itemId);
        if (!itemStruct) return;

        e.preventDefault();
        transformHandle.setPointerCapture(e.pointerId);
        transformHandle.style.cursor = 'grabbing';

        const rect = selectedEl.getBoundingClientRect();
        handleState.centerX = rect.left + rect.width / 2;
        handleState.centerY = rect.top + rect.height / 2;

        const dx = e.clientX - handleState.centerX;
        const dy = e.clientY - handleState.centerY;
        handleState.startDist = Math.max(Math.hypot(dx, dy), 10);
        handleState.startAngle = Math.atan2(dy, dx);
        handleState.startRotation = itemStruct.rotation || 0;
        handleState.startScale = itemStruct.scale || 1;
        handleState.itemId = itemId;
        handleState.active = true;
    });

    transformHandle.addEventListener('pointermove', (e) => {
        if (!handleState.active) return;
        const itemStruct = state.items.find(i => i.id == handleState.itemId);
        if (!itemStruct) return;

        const dx = e.clientX - handleState.centerX;
        const dy = e.clientY - handleState.centerY;
        const dist = Math.max(Math.hypot(dx, dy), 10);
        const angle = Math.atan2(dy, dx);
        const deltaAngle = angle - handleState.startAngle;

        const degrees = handleState.startRotation + (deltaAngle * 180 / Math.PI);
        let scale = handleState.startScale * (dist / handleState.startDist);
        scale = Math.max(0.4, Math.min(2.5, scale));

        itemStruct.rotation = degrees;
        itemStruct.scale = scale;

        // Use shared helper via global function
        if (window.applyItemTransformForHandle) {
            window.applyItemTransformForHandle(itemStruct);
        } else {
            // Fallback: minimal transform
            itemStruct.els.forEach(el => {
                const x = parseFloat(el.getAttribute('data-x')) || 0;
                const y = parseFloat(el.getAttribute('data-y')) || 0;
                const flip = el.dataset.flip === 'true';
                const sx = flip ? -scale : scale;
                const sy = scale;
                el.style.transform = `translate(${x}px, ${y}px) rotate(${degrees}deg) scale(${sx}, ${sy})`;
            });
        }

        const selectedEl = state.selectedEl;
        if (selectedEl) {
            positionHandleForElement(selectedEl);
        }
    });

    transformHandle.addEventListener('pointerup', (e) => {
        handleState.active = false;
        handleState.itemId = null;
        transformHandle.releasePointerCapture(e.pointerId);
        transformHandle.style.cursor = 'grab';
    });

    const loadBase = async (src) => {
        state.currentBasePonySrc = src;
        try {
            const processedPonyUrl = await processBasePony(src);
            ponyImg.src = processedPonyUrl;
            // Recalculate wing positions for new base
            await repositionWings(processedPonyUrl);
        } catch (e) {
            console.error('Pony processing failed, using original image:', e);
            ponyImg.src = src;
            await repositionWings(src);
        }
    };

    // Initial load
    await loadBase(BASE_PONY_SRC);

    // Setup interactions for drag/drop items
    setupPaletteInteractions();
    setupStageInteractions();

    // Setup Tabs
    const tabs = document.querySelectorAll('.tab-btn');
    const categories = document.querySelectorAll('.palette-category');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Deactivate all
            tabs.forEach(t => t.classList.remove('active'));
            categories.forEach(c => c.classList.remove('active'));

            // Activate selected
            tab.classList.add('active');
            const catId = `cat-${tab.dataset.category}`;
            document.getElementById(catId).classList.add('active');
        });
    });

    // Setup clicks for base switchers (Switch Horse)
    const baseItems = document.querySelectorAll('.palette-item[data-type="base"]');
    baseItems.forEach(item => {
        item.addEventListener('click', () => {
            baseItems.forEach(i => i.style.borderColor = 'transparent');
            item.style.borderColor = 'var(--accent)';
            loadBase(item.getAttribute('src'));
        });
    });

    // Setup clicks for accessories (Switch/Spawn)
    const accessoryItems = document.querySelectorAll('.palette-item:not([data-type="base"])');
    accessoryItems.forEach(item => {
        item.addEventListener('click', async () => {
            if (item.dataset.isDragging) return;

            const type = item.dataset.type;
            const src = item.src;
            
            // Visual feedback
            item.style.transform = 'scale(0.9)';
            setTimeout(() => item.style.transform = '', 100);

            // Logic: 
            // Wings: Try to replace first. If not found, spawn.
            // Horns/Marks: Always spawn (allow multiple, unique positions).
            let replaced = false;

            if (type === 'wing') {
                replaced = await replaceFirstItemOfType(type, src);
            }

            if (!replaced) {
                // Spawn at center of stage
                const rect = STAGE.getBoundingClientRect();
                const cx = rect.left + rect.width / 2;
                const cy = rect.top + rect.height / 2;
                
                // Add some random offset so they don't stack perfectly
                const offset = (Math.random() - 0.5) * 20;
                
                await spawnItem(src, type, cx + offset, cy + offset);
            }
        });
    });

    document.getElementById('clear-btn').addEventListener('click', clearAll);

    document.getElementById('z-up').addEventListener('click', () => adjustZForSelected(1));
    document.getElementById('z-down').addEventListener('click', () => adjustZForSelected(-1));
    document.getElementById('flip-btn').addEventListener('click', flipSelected);
    
    const devBtn = document.getElementById('dev-log-btn');
    if (devBtn) {
        devBtn.addEventListener('click', logCalibrationData);
    }

    // Expose helper for transform handle to reuse core transform logic
    window.applyItemTransformForHandle = function(itemStruct) {
        // This function is implemented in stage-manager via applyItemTransform,
        // but we can't import it here directly, so it is exposed on window in that file.
        if (typeof window._applyItemTransformCore === 'function') {
            window._applyItemTransformCore(itemStruct);
        }
    };
}

init();