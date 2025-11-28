// InkVerse - Professional Sketch Editor
const canvas = document.getElementById('main-canvas');
const ctx = canvas.getContext('2d');
const canvasWrapper = document.getElementById('canvas-wrapper');

// State
let currentTool = 'brush';
let brushColor = '#000000';
let brushSize = 5;
let isDrawing = false;
let startX, startY;
let layers = [];
let currentLayerIndex = 0;
let history = [];
let historyIndex = -1;
let zoom = 1;

// Initialize
function init() {
    canvas.width = 800;
    canvas.height = 600;
    addLayer('Background');
    setupEventListeners();
    updateBrushPreview();
}

// Layers
function addLayer(name) {
    const layerCanvas = document.createElement('canvas');
    layerCanvas.width = canvas.width;
    layerCanvas.height = canvas.height;
    const layerCtx = layerCanvas.getContext('2d');

    if (layers.length === 0) {
        layerCtx.fillStyle = '#ffffff';
        layerCtx.fillRect(0, 0, layerCanvas.width, layerCanvas.height);
    }

    const layer = {
        id: Date.now(),
        name: name || `Layer ${layers.length + 1}`,
        canvas: layerCanvas,
        ctx: layerCtx,
        visible: true,
        opacity: 1
    };

    layers.push(layer);
    currentLayerIndex = layers.length - 1;
    updateLayersUI();
    renderCanvas();
}

function updateLayersUI() {
    const layersList = document.getElementById('layers-list');
    layersList.innerHTML = '';

    [...layers].reverse().forEach((layer, reverseIndex) => {
        const index = layers.length - 1 - reverseIndex;
        const layerItem = document.createElement('div');
        layerItem.className = `layer-item ${index === currentLayerIndex ? 'active' : ''}`;
        layerItem.onclick = () => selectLayer(index);

        layerItem.innerHTML = `
            <div class="layer-thumbnail">
                <canvas width="40" height="40"></canvas>
            </div>
            <div class="layer-info">
                <div class="layer-name">${layer.name}</div>
            </div>
            <div class="layer-actions">
                <button class="layer-action-btn" onclick="toggleLayerVisibility(${index}); event.stopPropagation();" title="Toggle Visibility">
                    <i class="fas fa-eye${layer.visible ? '' : '-slash'}"></i>
                </button>
                <button class="layer-action-btn" onclick="deleteLayer(${index}); event.stopPropagation();" title="Delete Layer">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;

        const thumbnail = layerItem.querySelector('canvas');
        const thumbCtx = thumbnail.getContext('2d');
        thumbCtx.drawImage(layer.canvas, 0, 0, 40, 40);

        layersList.appendChild(layerItem);
    });
}

function selectLayer(index) {
    currentLayerIndex = index;
    updateLayersUI();
}

function toggleLayerVisibility(index) {
    layers[index].visible = !layers[index].visible;
    updateLayersUI();
    renderCanvas();
}

function deleteLayer(index) {
    if (layers.length > 1) {
        layers.splice(index, 1);
        if (currentLayerIndex >= layers.length) {
            currentLayerIndex = layers.length - 1;
        }
        updateLayersUI();
        renderCanvas();
    } else {
        showToast('Cannot delete the last layer', 'error');
    }
}

// Rendering
function renderCanvas() {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    layers.forEach(layer => {
        if (layer.visible) {
            ctx.globalAlpha = layer.opacity;
            ctx.drawImage(layer.canvas, 0, 0);
            ctx.globalAlpha = 1;
        }
    });
}

// Drawing
function startDrawing(e) {
    isDrawing = true;
    const rect = canvas.getBoundingClientRect();
    startX = (e.clientX - rect.left) / zoom;
    startY = (e.clientY - rect.top) / zoom;

    const activeCtx = layers[currentLayerIndex].ctx;
    activeCtx.beginPath();
    activeCtx.lineWidth = brushSize;
    activeCtx.lineCap = 'round';
    activeCtx.lineJoin = 'round';
    activeCtx.strokeStyle = currentTool === 'eraser' ? '#ffffff' : brushColor;
    activeCtx.fillStyle = brushColor;

    if (currentTool === 'brush' || currentTool === 'eraser') {
        activeCtx.moveTo(startX, startY);
    }
}

function draw(e) {
    if (!isDrawing) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;
    const activeCtx = layers[currentLayerIndex].ctx;

    if (currentTool === 'brush' || currentTool === 'eraser') {
        activeCtx.lineTo(x, y);
        activeCtx.stroke();
        renderCanvas();
    }
}

function stopDrawing() {
    if (isDrawing) {
        isDrawing = false;
        saveHistory();
    }
}

// Tools
function setTool(tool) {
    currentTool = tool;
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-tool="${tool}"]`).classList.add('active');
}

// History
function saveHistory() {
    const state = layers.map(layer => layer.canvas.toDataURL());
    history = history.slice(0, historyIndex + 1);
    history.push(state);
    historyIndex++;
}

function undo() {
    if (historyIndex > 0) {
        historyIndex--;
        restoreHistory();
    }
}

function redo() {
    if (historyIndex < history.length - 1) {
        historyIndex++;
        restoreHistory();
    }
}

function restoreHistory() {
    const state = history[historyIndex];
    state.forEach((dataURL, index) => {
        const img = new Image();
        img.onload = () => {
            layers[index].ctx.clearRect(0, 0, canvas.width, canvas.height);
            layers[index].ctx.drawImage(img, 0, 0);
            renderCanvas();
        };
        img.src = dataURL;
    });
}

// Zoom
function setZoom(newZoom) {
    zoom = Math.max(0.1, Math.min(5, newZoom));
    canvas.style.transform = `scale(${zoom})`;
    document.getElementById('zoom-level').textContent = `${Math.round(zoom * 100)}%`;
}

// Save & Export
async function saveDrawing() {
    const title = document.getElementById('drawing-title').value;
    const isPublic = document.getElementById('is-public').checked;
    const imageData = canvas.toDataURL();
    const token = localStorage.getItem('token');

    try {
        const res = await fetch('http://localhost:3000/api/drawings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ title, image_data: imageData, is_public: isPublic })
        });

        if (res.ok) {
            showToast('Drawing saved successfully!', 'success');
        } else {
            showToast('Failed to save drawing', 'error');
        }
    } catch (err) {
        showToast('Connection error', 'error');
    }
}

function exportPNG() {
    const link = document.createElement('a');
    link.download = `${document.getElementById('drawing-title').value || 'drawing'}.png`;
    link.href = canvas.toDataURL();
    link.click();
    showToast('Drawing exported!', 'success');
}

// UI Updates
function updateBrushPreview() {
    const preview = document.getElementById('brush-preview-circle');
    preview.style.width = `${brushSize}px`;
    preview.style.height = `${brushSize}px`;
    preview.style.background = brushColor;
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Event Listeners
function setupEventListeners() {
    // Canvas events
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);

    // Tools
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.addEventListener('click', () => setTool(btn.dataset.tool));
    });

    // Color
    const colorPicker = document.getElementById('color-picker');
    colorPicker.addEventListener('change', (e) => {
        brushColor = e.target.value;
        updateBrushPreview();
    });

    document.querySelectorAll('.color-swatch').forEach(swatch => {
        swatch.addEventListener('click', () => {
            brushColor = swatch.dataset.color;
            colorPicker.value = brushColor;
            updateBrushPreview();
        });
    });

    // Brush size
    const brushSizeInput = document.getElementById('brush-size');
    brushSizeInput.addEventListener('input', (e) => {
        brushSize = parseInt(e.target.value);
        updateBrushPreview();
    });

    // Actions
    document.getElementById('action-undo').addEventListener('click', undo);
    document.getElementById('action-redo').addEventListener('click', redo);
    document.getElementById('action-clear').addEventListener('click', () => {
        if (confirm('Clear the current layer?')) {
            layers[currentLayerIndex].ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (currentLayerIndex === 0) {
                layers[currentLayerIndex].ctx.fillStyle = '#ffffff';
                layers[currentLayerIndex].ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
            renderCanvas();
            saveHistory();
        }
    });

    // Layers
    document.getElementById('add-layer').addEventListener('click', () => addLayer());

    // Zoom
    document.getElementById('zoom-in').addEventListener('click', () => setZoom(zoom + 0.1));
    document.getElementById('zoom-out').addEventListener('click', () => setZoom(zoom - 0.1));
    document.getElementById('zoom-reset').addEventListener('click', () => setZoom(1));

    // Tabs
    document.querySelectorAll('.sidebar-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
        });
    });

    // Opacity
    const opacitySlider = document.getElementById('layer-opacity');
    opacitySlider.addEventListener('input', (e) => {
        const opacity = parseInt(e.target.value) / 100;
        layers[currentLayerIndex].opacity = opacity;
        document.getElementById('opacity-value').textContent = `${e.target.value}%`;
        renderCanvas();
    });

    // Save & Export
    document.getElementById('save-btn').addEventListener('click', saveDrawing);
    document.getElementById('export-png-btn').addEventListener('click', exportPNG);

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) {
            if (e.key === 'z') {
                e.preventDefault();
                undo();
            } else if (e.key === 'y') {
                e.preventDefault();
                redo();
            }
        }

        // Tool shortcuts
        const toolKeys = {
            'b': 'brush',
            'e': 'eraser',
            'f': 'fill',
            'i': 'picker',
            'l': 'line',
            'r': 'rect',
            'c': 'circle',
            't': 'text'
        };

        if (toolKeys[e.key.toLowerCase()]) {
            setTool(toolKeys[e.key.toLowerCase()]);
        }
    });
}

// Initialize on load
init();
