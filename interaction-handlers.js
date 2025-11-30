import interact from 'interactjs';
import { isOpaqueAtElement, getTopItemAt } from './image-utils.js';
import { spawnItem, selectElement, deleteItem, moveItem, updateItemCalibration, applyItemTransform } from './stage-manager.js';
import { getWingDefaultFlip, state } from './state.js';

export function setupPaletteInteractions() {
    // Only make items draggable if they are NOT base types
    interact('.palette-item:not([data-type="base"])').draggable({
        inertia: true,
        startAxis: 'y',
        lockAxis: false,
        listeners: {
            start(event) {
                const source = event.target;
                const type = source.dataset.type;
                const src = source.src;

                // Determine input type to apply offset for visibility on touch
                const pointerType = event.pointerType || 'mouse';
                const isTouch = pointerType !== 'mouse';
                const yOffset = isTouch ? 80 : 0;

                const ghostContainer = document.createElement('div');
                ghostContainer.className = 'stage-item'; // Re-use class for consistency
                ghostContainer.style.position = 'fixed';
                ghostContainer.style.pointerEvents = 'none';
                ghostContainer.style.zIndex = '999';
                ghostContainer.style.left = event.clientX + 'px';
                ghostContainer.style.top = (event.clientY - yOffset) + 'px';
                ghostContainer.style.transform = 'translate(-50%, -50%)'; // Center
                ghostContainer.style.display = 'flex';
                ghostContainer.style.justifyContent = 'center';
                ghostContainer.style.alignItems = 'center';

                if (type === 'wing') {
                    // Create visual pair for dragging
                    const w = 200;
                    const h = 200;
                    ghostContainer.style.width = w + 'px';
                    ghostContainer.style.height = h + 'px';

                    const back = document.createElement('img');
                    back.src = src;
                    back.style.position = 'absolute';
                    back.style.width = '100%';
                    back.style.height = '100%';
                    back.style.left = '40px';
                    back.style.top = '-20px';
                    back.style.filter = 'brightness(0.8)';
                    
                    const front = document.createElement('img');
                    front.src = src;
                    front.style.position = 'absolute';
                    front.style.width = '100%';
                    front.style.height = '100%';
                    front.style.left = '0';
                    front.style.top = '0';

                    // Use centralized default flip for wings
                    const shouldFlip = getWingDefaultFlip(src);
                    if (shouldFlip) {
                        front.style.transform = 'scaleX(-1)';
                        back.style.transform = 'scaleX(-1)';
                    }

                    ghostContainer.appendChild(back);
                    ghostContainer.appendChild(front);
                } else {
                    const img = document.createElement('img');
                    img.src = src;
                    img.style.width = '160px';
                    img.style.height = 'auto';

                    if (src.includes('horn.png')) {
                        img.style.transform = 'scaleX(-1)';
                    }
                    ghostContainer.appendChild(img);
                }

                document.body.appendChild(ghostContainer);

                event.interaction.data = {
                    type,
                    src,
                    ghost: ghostContainer,
                    yOffset
                };
            },
            move(event) {
                const data = event.interaction.data;
                if (!data || !data.ghost) return;
                
                // Flag as dragging to prevent click handler
                event.target.dataset.isDragging = 'true';

                const yOffset = data.yOffset || 0;
                const ghost = data.ghost;
                ghost.style.left = event.clientX + 'px';
                ghost.style.top = (event.clientY - yOffset) + 'px';
            },
            async end(event) {
                const data = event.interaction.data;
                // Clear immediately to prevent race condition with next start()
                event.interaction.data = null;

                if (data && data.ghost) {
                    const yOffset = data.yOffset || 0;
                    
                    // We drop where the ghost center was
                    const dropX = event.clientX;
                    const dropY = event.clientY - yOffset;

                    const paletteRect = document.getElementById('palette').getBoundingClientRect();
                    
                    // Remove ghost immediately
                    data.ghost.remove();

                    // Allow dropping anywhere in the game area (above palette)
                    if (dropY < paletteRect.top) {
                        try {
                            // Convert client coordinates to stage coordinates is handled inside spawnItem slightly,
                            // but spawnItem expects absolute page coordinates or similar?
                            // spawnItem logic:
                            // const stageX = x - rect.left;
                            // So passing clientX/clientY is correct for spawnItem as implemented.
                            await spawnItem(data.src, data.type, dropX, dropY);
                        } catch (e) {
                            console.error("Spawn failed", e);
                        }
                    }
                }

                // Clear drag flag after a short delay
                setTimeout(() => {
                    if (event.target) delete event.target.dataset.isDragging;
                }, 50);
            }
        }
    });
}

function isCenterOverlapping(zoneRect, itemRect) {
    const cx = itemRect.left + (itemRect.width / 2);
    const cy = itemRect.top + (itemRect.height / 2);

    return (
        cx >= zoneRect.left &&
        cx <= zoneRect.right &&
        cy >= zoneRect.top &&
        cy <= zoneRect.bottom
    );
}

export function setupStageInteractions() {
    const DELETE_ZONE = document.getElementById('delete-zone');

    interact('#stage').draggable({
        listeners: {
            start(event) {
                const clientX = event.clientX;
                const clientY = event.clientY;

                // 1. Find the actual item under the cursor (handling transparency)
                const targetEl = getTopItemAt(clientX, clientY);
                
                if (!targetEl) {
                    // No item found, stop the drag immediately
                    event.interaction.stop();
                    selectElement(null);
                    return;
                }

                // 2. Select it
                selectElement(targetEl);

                // 3. Store data for move/end, with drag threshold state
                const id = targetEl.dataset.id;
                event.interaction.data = {
                    id: id,
                    targetEl: targetEl,
                    type: targetEl.dataset.type,
                    startX: clientX,
                    startY: clientY,
                    dragStarted: false
                };
            },
            move(event) {
                const data = event.interaction.data;
                if (!data || !data.id) return;

                const THRESHOLD = 8; // pixels

                // If drag hasn't officially started yet, check if we've moved enough
                if (!data.dragStarted) {
                    const totalDx = event.clientX - data.startX;
                    const totalDy = event.clientY - data.startY;
                    const dist = Math.hypot(totalDx, totalDy);
                    if (dist < THRESHOLD) {
                        // Ignore tiny movements to keep taps clean
                        return;
                    }
                    // Now we consider this a real drag
                    data.dragStarted = true;
                    if (DELETE_ZONE) DELETE_ZONE.classList.add('active');
                }

                // 1. Move the item (and its pair/slaves)
                moveItem(data.id, event.dx, event.dy);

                // 2. Handle Delete Zone Hover
                if (DELETE_ZONE) {
                    const dzRect = DELETE_ZONE.getBoundingClientRect();
                    // Check the element's new rect
                    const elRect = data.targetEl.getBoundingClientRect();

                    if (isCenterOverlapping(dzRect, elRect)) {
                        DELETE_ZONE.classList.add('hover');
                    } else {
                        DELETE_ZONE.classList.remove('hover');
                    }
                }
            },
            end(event) {
                const data = event.interaction.data;
                if (!data || !data.id) return;

                // If we never passed the threshold, treat this as just a tap/selection
                if (!data.dragStarted) {
                    if (DELETE_ZONE) {
                        DELETE_ZONE.classList.remove('active');
                        DELETE_ZONE.classList.remove('hover');
                    }
                    return;
                }

                if (DELETE_ZONE) {
                    DELETE_ZONE.classList.remove('active');
                    DELETE_ZONE.classList.remove('hover');

                    const dzRect = DELETE_ZONE.getBoundingClientRect();
                    const elRect = data.targetEl.getBoundingClientRect();

                    if (isCenterOverlapping(dzRect, elRect)) {
                        deleteItem(data.id);
                        return;
                    }
                }

                // Update calibration for this item (wings, horns, hair, marks, etc.)
                updateItemCalibration(data.targetEl);
            }
        }
    })
    // Add tap listener to handle simple selection without dragging
    .on('tap', function(event) {
        const clientX = event.clientX;
        const clientY = event.clientY;
        const targetEl = getTopItemAt(clientX, clientY);
        selectElement(targetEl);
    });

    // Enable edge-based resizing for stage items (red edge guides)
    interact('.stage-item').resizable({
        // Allow grabbing any edge
        edges: { left: true, right: true, top: true, bottom: true },
        listeners: {
            start(event) {
                const target = event.target;
                const id = target.dataset.id;
                if (!id) return;

                const rect = target.getBoundingClientRect();
                event.interaction.data = {
                    resizeId: id,
                    startWidth: rect.width,
                    startHeight: rect.height
                };
            },
            move(event) {
                const data = event.interaction.data;
                if (!data || !data.resizeId) return;

                const itemStruct = state.items.find(i => i.id == data.resizeId);
                if (!itemStruct) return;

                const newW = event.rect.width || data.startWidth;
                const newH = event.rect.height || data.startHeight;

                const scaleX = newW / data.startWidth;
                const scaleY = newH / data.startHeight;
                let newScale = Math.min(scaleX, scaleY);

                // Clamp scale to reasonable range
                newScale = Math.max(0.4, Math.min(2.5, newScale));

                itemStruct.scale = newScale;
                applyItemTransform(itemStruct);

                // Keep selection handle in sync if present
                if (window.updateTransformHandleForSelection && state.selectedEl) {
                    window.updateTransformHandleForSelection(state.selectedEl);
                }
            },
            end(event) {
                // no-op for now; scale is already stored in itemStruct
            }
        }
    });
}