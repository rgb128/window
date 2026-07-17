'use strict';

const CONFIG = {
    // Base resolution of fetched images and internal canvas coordinate system. Should be high enough to avoid pixelation (e.g., 1000-2000).
    IMAGE_SIZE: 1000,
    
    // Number of horizontal grid cells. 
    GRID_ROWS: 4,
    
    // Number of vertical grid cells.
    GRID_COLS: 4,
    
    // Maximum images used per generation. Since a cell can split into 2 triangles, this MUST be at least GRID_ROWS * GRID_COLS * 2. For 5x5, this SHOULD BE 50.
    MAX_NEEDED_IMAGES: 50, 
    
    // Total images to keep cached in memory. Should be >= MAX_NEEDED_IMAGES to ensure instant transitions.
    TARGET_POOL_SIZE: 150,
    
    // Number of concurrent image fetch requests. 3-5 is usually optimal to avoid browser connection limits.
    FETCH_BATCH_SIZE: 3,
    
    // How much vertices deviate from a perfect grid. 0 = strict grid, 0.5 = heavy distortion. Should be < 0.5 to prevent self-intersecting polygons.
    JITTER_FACTOR: 0.4,
    
    // Multiplier for canvas size relative to screen size. Hides edges pulling inward during extreme distortion. Should be 1.1 to 1.5.
    OVERSCALE: 1.1, 
    
    // Amount added to animation progress per frame. Lower = slower animation.
    EXPAND_SPEED: 0.0005,
    
    // Max limit for animation progress (0.0 to 1.0). 1.0 pushes points entirely to the boundaries. You wanted it around 60%, so this should be ~0.6.
    MAX_PROGRESS: 0.9,
    
    // Mathematical curve for pushing points. 1.0 is linear. < 1.0 makes points near the click move much faster/farther than points far away.
    BULGE_POWER: 0.15 
};

const state = {
    images: [],
    polygons: [],
    points: [],
    lines: [],
    isLoaded: false,
    isFetching: false,
    isDown: false,
    clickX: 0,
    clickY: 0,
    progress: 0,
    scale: 1,
    offsetX: 0,
    offsetY: 0
};

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const loading = document.getElementById('loading');
const computedStyle = getComputedStyle(document.documentElement);
const loadingPct = document.getElementById('loading-pct');

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    const scaleX = canvas.width / CONFIG.IMAGE_SIZE;
    const scaleY = canvas.height / CONFIG.IMAGE_SIZE;
    
    state.scale = Math.max(scaleX, scaleY) * CONFIG.OVERSCALE;
    
    state.offsetX = (canvas.width - CONFIG.IMAGE_SIZE * state.scale) / 2;
    state.offsetY = (canvas.height - CONFIG.IMAGE_SIZE * state.scale) / 2;
}

function fetchImage() {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = `https://picsum.photos/${CONFIG.IMAGE_SIZE}/${CONFIG.IMAGE_SIZE}?random=${Math.random()}`;
    });
}

async function maintainImagePool() {
    if (state.isFetching) return;
    state.isFetching = true;
    
    while (state.images.length < CONFIG.TARGET_POOL_SIZE) {
        const batch = [];
        for (let i = 0; i < CONFIG.FETCH_BATCH_SIZE; i++) {
            if (state.images.length + batch.length < CONFIG.TARGET_POOL_SIZE) {
                batch.push(fetchImage());
            }
        }
        
        const fetched = await Promise.all(batch);
        for (let i = 0; i < fetched.length; i++) {
            if (fetched[i]) {
                state.images.push(fetched[i]);
                if (!state.isLoaded) {
                    const pct = Math.min((state.images.length / CONFIG.TARGET_POOL_SIZE) * 100, 100);
                    loadingPct.textContent = pct.toFixed(0);
                }
            }
        }
        
        if (!state.isLoaded && state.images.length >= CONFIG.TARGET_POOL_SIZE) {
            state.isLoaded = true;
            hideLoading();
            generateGrid();
            requestAnimationFrame(render);
        }
    }
    
    state.isFetching = false;
}

function showLoading() {
    loading.style.display = 'flex';
    setTimeout(() => { loading.style.opacity = '1'; }, 10);
}

function hideLoading() {
    loading.style.opacity = '0';
    setTimeout(() => { loading.style.display = 'none'; }, 500);
}

function getImages(count) {
    const result = [];
    for (let i = 0; i < count; i++) {
        result.push(state.images.shift());
    }
    maintainImagePool(); 
    return result;
}

function generateGrid() {
    state.points = [];
    state.polygons = [];
    state.lines = [];
    
    const cellW = CONFIG.IMAGE_SIZE / CONFIG.GRID_COLS;
    const cellH = CONFIG.IMAGE_SIZE / CONFIG.GRID_ROWS;
    
    for (let r = 0; r <= CONFIG.GRID_ROWS; r++) {
        const row = [];
        for (let c = 0; c <= CONFIG.GRID_COLS; c++) {
            let x = c * cellW;
            let y = r * cellH;
            
            const isEdge = r === 0 || r === CONFIG.GRID_ROWS || c === 0 || c === CONFIG.GRID_COLS;
            
            if (!isEdge) {
                x += (Math.random() * 2 - 1) * cellW * CONFIG.JITTER_FACTOR;
                y += (Math.random() * 2 - 1) * cellH * CONFIG.JITTER_FACTOR;
            }
            
            row.push({ baseX: x, baseY: y, x: x, y: y });
        }
        state.points.push(row);
    }

    const maxNeeded = CONFIG.GRID_ROWS * CONFIG.GRID_COLS * 2;
    const polyImages = getImages(maxNeeded);
    let imgIdx = 0;

    for (let r = 0; r < CONFIG.GRID_ROWS; r++) {
        for (let c = 0; c < CONFIG.GRID_COLS; c++) {
            const p1 = state.points[r][c];
            const p2 = state.points[r][c + 1];
            const p3 = state.points[r + 1][c + 1];
            const p4 = state.points[r + 1][c];

            if (r > 0) state.lines.push([p1, p2]);
            if (c > 0) state.lines.push([p1, p4]);

            const rand = Math.random();
            if (rand < 0.33) {
                state.polygons.push({ pts: [p1, p2, p3, p4], img: polyImages[imgIdx++] });
            } else if (rand < 0.66) {
                state.polygons.push({ pts: [p1, p2, p3], img: polyImages[imgIdx++] });
                state.polygons.push({ pts: [p1, p3, p4], img: polyImages[imgIdx++] });
                state.lines.push([p1, p3]);
            } else {
                state.polygons.push({ pts: [p1, p2, p4], img: polyImages[imgIdx++] });
                state.polygons.push({ pts: [p2, p3, p4], img: polyImages[imgIdx++] });
                state.lines.push([p2, p4]);
            }
        }
    }
}

function easeOutQuad(t) {
    return t * (2 - t);
}

function updatePoints() {
    const ease = easeOutQuad(state.progress);
    const currentPower = 1.0 - (1.0 - CONFIG.BULGE_POWER) * ease;

    for (let r = 0; r <= CONFIG.GRID_ROWS; r++) {
        for (let c = 0; c <= CONFIG.GRID_COLS; c++) {
            const p = state.points[r][c];
            
            if (state.progress === 0) {
                p.x = p.baseX;
                p.y = p.baseY;
                continue;
            }

            const vx = p.baseX - state.clickX;
            const vy = p.baseY - state.clickY;

            if (vx === 0 && vy === 0) {
                p.x = p.baseX;
                p.y = p.baseY;
                continue;
            }

            let tx = Infinity;
            let ty = Infinity;

            if (vx < 0) tx = (0 - state.clickX) / vx;
            else if (vx > 0) tx = (CONFIG.IMAGE_SIZE - state.clickX) / vx;

            if (vy < 0) ty = (0 - state.clickY) / vy;
            else if (vy > 0) ty = (CONFIG.IMAGE_SIZE - state.clickY) / vy;

            const t_edge = Math.min(tx, ty);
            let u = 1 / t_edge;
            
            if (u > 1) u = 1;
            if (u < 0) u = 0;

            const u_new = Math.pow(u, currentPower);
            const t_new = u_new * t_edge;

            p.x = state.clickX + vx * t_new;
            p.y = state.clickY + vy * t_new;
        }
    }
}

let isRendering = false;
function render() {
    if (state.isDown && state.progress < CONFIG.MAX_PROGRESS) {
        state.progress += CONFIG.EXPAND_SPEED;
        if (state.progress > CONFIG.MAX_PROGRESS) state.progress = CONFIG.MAX_PROGRESS;
    } else if (!state.isDown && state.progress > 0) {
        state.progress = 0;
        
        if (state.images.length >= CONFIG.MAX_NEEDED_IMAGES) {
            generateGrid();
        } else {
            showLoading();
            state.isLoaded = false;
            maintainImagePool();
            isRendering = false;
            return; 
        }
    }

    updatePoints();

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.save();
    ctx.translate(state.offsetX, state.offsetY);
    ctx.scale(state.scale, state.scale);

    for (let i = 0; i < state.polygons.length; i++) {
        const poly = state.polygons[i];
        
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(poly.pts[0].x, poly.pts[0].y);
        for (let j = 1; j < poly.pts.length; j++) {
            ctx.lineTo(poly.pts[j].x, poly.pts[j].y);
        }
        ctx.closePath();
        ctx.clip();
        
        if (poly.img) {
            ctx.drawImage(poly.img, 0, 0, CONFIG.IMAGE_SIZE, CONFIG.IMAGE_SIZE);
        }
        
        ctx.restore();
    }

    const lineWidthRaw = parseInt(computedStyle.getPropertyValue('--line-width')) || 0;
    if (lineWidthRaw > 0) {
        ctx.lineWidth = lineWidthRaw / state.scale;
        ctx.strokeStyle = computedStyle.getPropertyValue('--line-color').trim() || '#fff';
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        
        ctx.beginPath();
        for (let i = 0; i < state.lines.length; i++) {
            const line = state.lines[i];
            ctx.moveTo(line[0].x, line[0].y);
            ctx.lineTo(line[1].x, line[1].y);
        }
        ctx.stroke();
    }

    ctx.restore();
    
    if (state.isLoaded) {
        isRendering = true;
        requestAnimationFrame(render);
    }
}

function handleDown(e) {
    if (!state.isLoaded) return;
    state.isDown = true;
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    state.clickX = (clientX - state.offsetX) / state.scale;
    state.clickY = (clientY - state.offsetY) / state.scale;
}

function handleUp() {
    state.isDown = false;
}

window.addEventListener('resize', resize);
window.addEventListener('mousedown', handleDown);
window.addEventListener('touchstart', handleDown, { passive: false });
window.addEventListener('mouseup', handleUp);
window.addEventListener('touchend', handleUp);
window.addEventListener('mouseleave', handleUp);

resize();
maintainImagePool();
