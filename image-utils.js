// Cache for per-pixel hit-testing
const imageHitmapCache = new Map();

import { state } from './state.js';

export function processBasePony(src) {
    // If it's one of our transparent PNGs, we don't need the chroma key logic
    if (src.toLowerCase().endsWith('.png')) {
        return Promise.resolve(src);
    }

    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.src = src;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');

            // Draw image
            ctx.drawImage(img, 0, 0);

            // Get data
            const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = frame.data;

            // Simple grey removal logic
            const br = data[0];
            const bg = data[1];
            const bb = data[2];

            // Tolerance
            const t = 20; 

            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];

                if (Math.abs(r - br) < t && Math.abs(g - bg) < t && Math.abs(b - bb) < t) {
                    data[i + 3] = 0; // Set alpha to 0
                }
            }

            ctx.putImageData(frame, 0, 0);
            resolve(canvas.toDataURL());
        };
        img.onerror = reject;
    });
}

export function prepareHitmap(src) {
    if (imageHitmapCache.has(src) && imageHitmapCache.get(src).data) {
        return Promise.resolve(imageHitmapCache.get(src));
    }

    if (imageHitmapCache.has(src) && imageHitmapCache.get(src).promise) {
        return imageHitmapCache.get(src).promise;
    }

    const promise = new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.src = src;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

            const hitmap = {
                width: canvas.width,
                height: canvas.height,
                data: imageData.data
            };
            imageHitmapCache.set(src, hitmap);
            resolve(hitmap);
        };
        img.onerror = (err) => {
            console.error('Failed to prepare hitmap for', src, err);
            const hitmap = { width: 0, height: 0, data: null };
            imageHitmapCache.set(src, hitmap);
            resolve(hitmap);
        };
    });

    imageHitmapCache.set(src, { promise });
    return promise;
}

async function getSnapDefinition(basePonySrc, assetSrc) {
    const hitmap = await prepareHitmap(basePonySrc);
    if (!hitmap || !hitmap.data || hitmap.width === 0) {
        return { x: 0.5, y: 0.5, ratio: 1 };
    }

    // Resolve the correct base filename for calibration, even if basePonySrc is a data URL
    let baseFilename;
    if (basePonySrc.startsWith('data:') && state.currentBasePonySrc) {
        baseFilename = state.currentBasePonySrc.substring(
            state.currentBasePonySrc.lastIndexOf('/') + 1
        );
    } else {
        baseFilename = basePonySrc.substring(basePonySrc.lastIndexOf('/') + 1);
    }

    const assetFilename = assetSrc
        ? assetSrc.substring(assetSrc.lastIndexOf('/') + 1)
        : null;

    const baseCalib = assetFilename && state.calibrationData[baseFilename]
        ? state.calibrationData[baseFilename][assetFilename]
        : null;

    const ratio = hitmap.width / hitmap.height;

    // If we have calibration data for this base+asset, use it directly
    if (baseCalib && typeof baseCalib.x === 'number' && typeof baseCalib.y === 'number') {
        return {
            x: baseCalib.x,
            y: baseCalib.y,
            ratio,
            rotation: typeof baseCalib.rotation === 'number' ? baseCalib.rotation : 0,
            scale: typeof baseCalib.scale === 'number' ? baseCalib.scale : 1
        };
    }

    // Fallback for wings: automatic estimation using center column scan on the base pony
    const cx = Math.floor(hitmap.width / 2);
    let topY = -1;
    let bottomY = -1;

    // Scan down center column to find body height
    for (let y = 0; y < hitmap.height; y++) {
        const idx = (y * hitmap.width + cx) * 4 + 3; // Alpha channel
        const alpha = hitmap.data[idx];

        if (alpha > 20) {
            if (topY === -1) topY = y;
            bottomY = y; // Keep updating bottom as long as we find solid pixels
        } else if (topY !== -1) {
            // We found the body, now we hit transparency again.
            break;
        }
    }

    if (topY === -1 || bottomY === -1) {
        return { x: 0.5, y: 0.5, ratio };
    }

    const bodyHeight = bottomY - topY;

    // "go 1/6 to left"
    const targetXPixel = cx - (bodyHeight / 6);

    // "and 1/4 body side down"
    const targetYPixel = topY + (bodyHeight / 4);

    return {
        x: targetXPixel / hitmap.width,
        y: targetYPixel / hitmap.height,
        ratio,
        rotation: 0,
        scale: 1
    };
}

// Backward-compatible wrapper for existing wing code
export async function getWingSnapDefinition(basePonySrc, wingSrc) {
    return getSnapDefinition(basePonySrc, wingSrc);
}

// Expose generic snap function for all accessories
export { getSnapDefinition };

export function isOpaqueAtElement(el, clientX, clientY) {
    const src = el.src;
    const hitmap = imageHitmapCache.get(src);

    if (!hitmap || !hitmap.data) {
        return false;
    }

    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;

    let x = ((clientX - rect.left) / rect.width) * hitmap.width;
    let y = ((clientY - rect.top) / rect.height) * hitmap.height;

    x = Math.floor(x);
    y = Math.floor(y);

    if (x < 0 || y < 0 || x >= hitmap.width || y >= hitmap.height) {
        return false;
    }

    if (el.dataset.flip === 'true') {
        x = hitmap.width - 1 - x;
    }

    const idx = (y * hitmap.width + x) * 4 + 3; // alpha channel
    const alpha = hitmap.data[idx];

    return alpha > 10;
}

export function getTopItemAt(clientX, clientY) {
    // Get all potential candidates
    const stageItems = Array.from(document.querySelectorAll('.stage-item'));
    
    // Sort by visual stacking order (Z-Index then DOM order)
    stageItems.sort((a, b) => {
        const zA = parseInt(window.getComputedStyle(a).zIndex) || 0;
        const zB = parseInt(window.getComputedStyle(b).zIndex) || 0;
        if (zA !== zB) return zA - zB;
        // If z-index equal, later in DOM is higher
        return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
    });
    
    // Iterate from Top to Bottom
    for (let i = stageItems.length - 1; i >= 0; i--) {
        const el = stageItems[i];
        
        // Skip hidden or non-interactive items if necessary
        // (For now assuming all .stage-item are candidates)

        if (isOpaqueAtElement(el, clientX, clientY)) {
            return el;
        }
    }
    return null;
}

export function pickUnderlyingOpaqueStageItem(excludeEl, clientX, clientY) {
    // Deprecated in favor of getTopItemAt for global handler, 
    // but keeping for compatibility if needed.
    const elements = document.elementsFromPoint(clientX, clientY);
    for (const el of elements) {
        if (
            el !== excludeEl &&
            el.classList &&
            el.classList.contains('stage-item') &&
            el.dataset.isBack !== 'true' &&
            isOpaqueAtElement(el, clientX, clientY)
        ) {
            return el;
        }
    }
    return null;
}