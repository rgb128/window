'use strict';

const CONFIG = {
    IMAGE_SIZE: 1000,
    GRID_ROWS: 4,
    GRID_COLS: 4,
    MIN_POOL_SIZE: 16,
    TARGET_POOL_SIZE: 32,
    JITTER_FACTOR: 0.35,
    LINE_WIDTH: 3,
    LINE_COLOR: '#ffffff',
    EXPAND_SPEED: 0.04,
    MAX_PROGRESS: 0.75,
    PUSH_MULTIPLIER: 150000,
    EDGE_CONSTRAINT: true
};

const state = {
    images: [],
    polygons: [],
    points: [],
    isLoaded: false,
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

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    const scaleX = canvas.width / CONFIG.IMAGE_SIZE;
    const scaleY = canvas.height / CONFIG.IMAGE_SIZE;
    state.scale = Math.max(scaleX, scaleY);
    
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
    while (state.images.length < CONFIG.TARGET_POOL_SIZE) {
        const img = await fetchImage();
        if (img) {
            state.images.push(img);
            if (!state.isLoaded && state.images.length >= CONFIG.MIN_POOL_SIZE) {
                state.isLoaded = true;
                loading.style.opacity = '0';
                setTimeout(() => loading.style.display = 'none', 500);
                generateGrid();
                requestAnimationFrame(render);
            }
        }
    }
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
            
            row.push({ baseX: x, baseY: y, x: x, y: y, isEdge: isEdge, isCorner: isEdge && (r === 0 || r === CONFIG.GRID_ROWS) && (c === 0 || c === CONFIG.GRID_COLS) });
        }
        state.points.push(row);
    }

    const neededImages = CONFIG.GRID_ROWS * CONFIG.GRID_COLS * 2;
    const polyImages = getImages(neededImages);
    let imgIdx = 0;

    for (let r = 0; r < CONFIG.GRID_ROWS; r++) {
        for (let c = 0; c < CONFIG.GRID_COLS; c++) {
            const p1 = state.points[r][c];
            const p2 = state.points[r][c + 1];
            const p3 = state.points[r + 1][c + 1];
            const p4 = state.points[r + 1][c];

            if (Math.random() > 0.5) {
                state.polygons.push({ pts: [p1, p2, p3], img: polyImages[imgIdx++] });
                state.polygons.push({ pts: [p1, p3, p4], img: polyImages[imgIdx++] });
            } else {
                state.polygons.push({ pts: [p1, p2, p4], img: polyImages[imgIdx++] });
                state.polygons.push({ pts: [p2, p3, p4], img: polyImages[imgIdx++] });
            }
        }
    }
}

function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
}

function updatePoints() {
    const ease = easeOutCubic(state.progress);

    for (let r = 0; r <= CONFIG.GRID_ROWS; r++) {
        for (let c = 0; c <= CONFIG.GRID_COLS; c++) {
            const p = state.points[r][c];
            
            if (state.progress === 0) {
                p.x = p.baseX;
                p.y = p.baseY;
                continue;
            }

            if (p.isCorner) continue;

            const dx = p.baseX - state.clickX;
            const dy = p.baseY - state.clickY;
            const distSq = dx * dx + dy * dy;
            const dist = Math.sqrt(distSq) || 0.001;
            
            const force = CONFIG.PUSH_MULTIPLIER / (distSq + 10000);
            
            let targetX = p.baseX + (dx / dist) * force;
            let targetY = p.baseY + (dy / dist) * force;

            if (CONFIG.EDGE_CONSTRAINT && p.isEdge) {
                if (p.baseX === 0 || p.baseX === CONFIG.IMAGE_SIZE) targetX = p.baseX;
                if (p.baseY === 0 || p.baseY === CONFIG.IMAGE_SIZE) targetY = p.baseY;
            }

            targetX = Math.max(0, Math.min(CONFIG.IMAGE_SIZE, targetX));
            targetY = Math.max(0, Math.min(CONFIG.IMAGE_SIZE, targetY));

            p.x = p.baseX + (targetX - p.baseX) * ease;
            p.y = p.baseY + (targetY - p.baseY) * ease;
        }
    }
}

function render() {
    if (state.isDown && state.progress < CONFIG.MAX_PROGRESS) {
        state.progress += CONFIG.EXPAND_SPEED;
        if (state.progress > CONFIG.MAX_PROGRESS) state.progress = CONFIG.MAX_PROGRESS;
    } else if (!state.isDown && state.progress > 0) {
        state.progress = 0;
        generateGrid();
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

    if (CONFIG.LINE_WIDTH > 0) {
        ctx.lineWidth = CONFIG.LINE_WIDTH / state.scale;
        ctx.strokeStyle = CONFIG.LINE_COLOR;
        ctx.lineJoin = 'round';
        
        for (let i = 0; i < state.polygons.length; i++) {
            const poly = state.polygons[i];
            ctx.beginPath();
            ctx.moveTo(poly.pts[0].x, poly.pts[0].y);
            for (let j = 1; j < poly.pts.length; j++) {
                ctx.lineTo(poly.pts[j].x, poly.pts[j].y);
            }
            ctx.closePath();
            ctx.stroke();
        }
    }

    ctx.restore();
    requestAnimationFrame(render);
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
