import { appState, TOOLS } from './state.js';
import { CanvasHandler } from './canvas.js';
import { Point } from './utils.js';
import { API } from './api.js';

// --- Initialization ---

const canvas = document.getElementById('input_canvas');
const state = appState;

// Initialize State
state.init(canvas.width, canvas.height);

// Initialize Canvas Handler
const canvasHandler = new CanvasHandler(canvas, state);

// --- UI Elements ---

const ui = {
    statusDot: document.getElementById('status-dot'),
    statusText: document.getElementById('status-text'),
    btnConnect: document.getElementById('start-serial-btn'),

    btnLine: document.getElementById('tool-line'),
    btnCircle: document.getElementById('tool-circle'),
    btnSquare: document.getElementById('tool-square'),
    btnPolygon: document.getElementById('tool-polygon'),
    btnSemicircle: document.getElementById('tool-semicircle'),
    btnPen: document.getElementById('penup-btn'),

    btnUndo: document.getElementById('undo-btn'),
    btnRedo: document.getElementById('redo-btn'),
    btnClear: document.getElementById('clear-btn'),
    btnGridToggle: document.getElementById('grid-toggle-btn'),
    btnSnapToggle: document.getElementById('snap-toggle-btn'),

    btnSend: document.getElementById('send-data-btn'),
    btnStop: document.getElementById('stop-traj-btn'),
    btnHoming: document.getElementById('homing-btn'),
    btnDemo: document.getElementById('repeatable-btn'),

    // Text Tools
    btnModeLinear: document.getElementById('mode-linear-btn'),
    btnModeCurved: document.getElementById('mode-curved-btn'),
    inputText: document.getElementById('text-input'),
    inputFontSize: document.getElementById('font-size'),
    controlsLinear: document.getElementById('linear-controls'),
    controlsCurved: document.getElementById('curved-controls'),

    // Linear Inputs
    inputLinX: document.getElementById('lin-x'),
    inputLinY: document.getElementById('lin-y'),
    inputLinAngle: document.getElementById('lin-angle'),

    // Workspace Config (Linear)
    inputWsX: document.getElementById('ws-x'),
    inputWsY: document.getElementById('ws-y'),
    inputWsW: document.getElementById('ws-w'),
    inputWsH: document.getElementById('ws-h'),

    // Curved Inputs
    inputCurvRadius: document.getElementById('curv-radius'),
    inputCurvOffset: document.getElementById('curv-offset'),

    inputCurvRadius: document.getElementById('curv-radius'),
    inputCurvOffset: document.getElementById('curv-offset'),

    warningMsg: document.getElementById('text-warning'),
    btnGenerate: document.getElementById('generate-text-btn'),
    btnNewline: document.getElementById('newline-btn'),
    btnNewline: document.getElementById('newline-btn'),
    btnClean: document.getElementById('clean-text-btn'),

    // Saved Templates
    inputTemplateName: document.getElementById('template-name'),
    selectTemplate: document.getElementById('template-select'),
    btnSaveTemplate: document.getElementById('save-template-btn'),
    btnLoadTemplate: document.getElementById('load-template-btn'),
    btnDeleteTemplate: document.getElementById('delete-template-btn'),
    btnRefreshTemplates: document.getElementById('refresh-templates-btn'),
};

// --- Event Listeners ---

// Connection
ui.btnConnect.addEventListener('click', async () => {
    await API.startSerial();
    updateSerialStatus();
});

// Tools
ui.btnLine.addEventListener('click', () => {
    setTool(TOOLS.LINE);
    updateToolUI();
});

ui.btnCircle.addEventListener('click', () => {
    setTool(TOOLS.CIRCLE);
    updateToolUI();
});

ui.btnSquare.addEventListener('click', () => {
    setTool(TOOLS.SQUARE);
    updateToolUI();
});

ui.btnPolygon.addEventListener('click', () => {
    const sides = prompt("How many sides?", state.polygonSides || "6");
    if (sides && !isNaN(sides) && parseInt(sides) >= 3) {
        state.polygonSides = parseInt(sides);
        setTool(TOOLS.POLYGON);
        updateToolUI();
    }
});

ui.btnSemicircle.addEventListener('click', () => {
    setTool(TOOLS.SEMICIRCLE);
    updateToolUI();
});

ui.btnPen.addEventListener('click', () => {
    state.penUp = !state.penUp;
    ui.btnPen.classList.toggle('active', state.penUp);
    ui.btnPen.textContent = state.penUp ? "✏️ Pen Up (Active)" : "✏️ Toggle Pen Up";
});

// Undo/Redo/Clear
ui.btnUndo.addEventListener('click', () => {
    state.undo();
    updateUndoRedoUI();
});

ui.btnRedo.addEventListener('click', () => {
    state.redo();
    updateUndoRedoUI();
});

ui.btnClear.addEventListener('click', () => {
    if (confirm('Clear all drawing? This cannot be undone.')) {
        state.resetDrawing();
        state.history = [];
        state.historyIndex = -1;
        state.rectangleStart = null;
        updateUndoRedoUI();
    }
});

// Grid Controls
ui.btnGridToggle.addEventListener('click', () => {
    state.showGrid = !state.showGrid;
    ui.btnGridToggle.textContent = state.showGrid ? '⊞ Grid: ON' : '⊞ Grid: OFF';
    ui.btnGridToggle.classList.toggle('active', state.showGrid);
});

ui.btnSnapToggle.addEventListener('click', () => {
    state.snapToGrid = !state.snapToGrid;
    ui.btnSnapToggle.textContent = state.snapToGrid ? '🧲 Snap: ON' : '🧲 Snap: OFF';
    ui.btnSnapToggle.classList.toggle('active', state.snapToGrid);
});

// Commands
ui.btnHoming.addEventListener('click', () => {
    API.homing();
});

ui.btnSend.addEventListener('click', () => {
    API.sendData();
    // Sending is triggered via Python callback -> js_get_data
});

ui.btnDemo.addEventListener('click', () => {
    // Implement demo/repeatable trajectory logic if needed
    // ...
    console.log("Demo trajectory requested");
});

// Stop Trajectory
ui.btnStop.addEventListener('click', async () => {
    console.log("Stopping trajectory...");
    await API.stopTrajectory();
});

// --- Text Tool Logic ---

// Default State
state.textMode = 'linear'; // 'linear' | 'curved'
state.generatedTextPatches = [];

function getTextOptions() {
    return {
        mode: state.textMode,
        fontSize: parseFloat(ui.inputFontSize.value) || 0.05,
        x: parseFloat(ui.inputLinX.value) || 0.05,
        y: parseFloat(ui.inputLinY.value) || 0.0,
        angle: parseFloat(ui.inputLinAngle.value) || 0,
        radius: parseFloat(ui.inputCurvRadius.value) || 0.2,
        offset: parseFloat(ui.inputCurvOffset.value) || 90
    };
}

ui.btnModeLinear.addEventListener('click', () => setTextMode('linear'));
ui.btnModeCurved.addEventListener('click', () => setTextMode('curved'));

function setTextMode(mode) {
    state.textMode = mode;

    // Update Buttons
    ui.btnModeLinear.classList.toggle('active', mode === 'linear');
    ui.btnModeCurved.classList.toggle('active', mode === 'curved');

    // Update Controls Visibility
    if (mode === 'linear') {
        ui.controlsLinear.classList.remove('hidden');
        ui.controlsCurved.classList.add('hidden');
    } else {
        ui.controlsLinear.classList.add('hidden');
        ui.controlsCurved.classList.remove('hidden');
    }

    // Trigger validation/redraw
    validateText();
}

function updateWorkspaceState() {
    // Parse inputs
    const x = parseFloat(ui.inputWsX.value) || 0.01;
    const y = parseFloat(ui.inputWsY.value) || -0.18;
    const w = parseFloat(ui.inputWsW.value) || 0.27;
    const h = parseFloat(ui.inputWsH.value) || 0.36;

    // Update State
    if (state.settings.linearWorkspace) {
        state.settings.linearWorkspace.x = x;
        state.settings.linearWorkspace.y = y;
        state.settings.linearWorkspace.w = w;
        state.settings.linearWorkspace.h = h;
    }
}

// Ensure state is updated on any change
[ui.inputWsX, ui.inputWsY, ui.inputWsW, ui.inputWsH].forEach(el => {
    if (el) {
        el.addEventListener('input', () => {
            updateWorkspaceState();
            // Also validate text since workspace changed
            validateText();
        });
    }
});

// Initialize state from default inputs once
updateWorkspaceState();

// Real-time Text Visualization
ui.inputText.addEventListener('input', () => {
    if (ui.inputText.value.length > 0) {
        ui.btnGenerate.click();
    } else {
        state.textPreview = [];
        state.generatedTextPatches = [];
        validateText();
    }
});

ui.btnGenerate.addEventListener('click', async () => {
    const text = ui.inputText.value;
    if (!text) return;

    const options = getTextOptions();
    console.log("Generating with:", options);

    const patches = await API.generateText(text, options);
    state.generatedTextPatches = patches; // Store for valid sending?

    // We want to visualize this.
    // The patches are {type, points:[], data:{penup}}
    // Let's treat them as a preview in canvas
    // OR add them to state.points/trajectory?
    // "Clicca Generate Text per visualizzare il percorso sulla canvas."
    // So distinct from sending?
    // "Clicca Send Trajectory per avviare il robot."

    // We'll store them in appState.textPreview for Canvas to draw
    state.textPreview = patches;

});

async function validateText() {
    const text = ui.inputText.value;
    if (!text) {
        ui.warningMsg.classList.add('hidden');
        return;
    }

    const options = getTextOptions();
    const result = await API.validateText(text, options);

    if (result.valid) {
        ui.warningMsg.classList.add('hidden');
    } else {
        ui.warningMsg.classList.remove('hidden');
        ui.warningMsg.textContent = "⚠ " + (result.message || "Text exceeds workspace!");
    }
}

// Bind Validation to Inputs
[ui.inputText, ui.inputFontSize, ui.inputLinX, ui.inputLinY, ui.inputLinAngle, ui.inputCurvRadius, ui.inputCurvOffset, ui.inputWsX, ui.inputWsY, ui.inputWsW, ui.inputWsH].forEach(el => {
    if (el) el.addEventListener('input', validateText);
});

// Override Send Button to include Text if valid?
// The user request says: "Clicca Generate Text per visualizzare... Clicca Send Trajectory per avviare".
// "Send Trajectory" normally sends `state.trajectory`.
// If we generated text, should we Convert text patches to `state.trajectory`?
// Yes.
// So when clicking Generate, we should probably update the main trajectory or a separate one?
// --- Real-time Text Logic ---

let debounceTimer = null;

async function generatePreview() {
    const text = ui.inputText.value;
    if (!text) {
        state.textPreview = [];
        state.generatedTextPatches = [];
        validateText(); // Will hide warning
        return;
    }

    const options = getTextOptions();
    console.log("Generating Preview for:", text); // Debug

    try {
        const patches = await API.generateText(text, options);
        console.log("Patches:", patches ? patches.length : 0);

        state.textPreview = patches || [];
        state.generatedTextPatches = patches || [];

        // Sync Internal Trajectory for Sending
        state.points = [];
        state.trajectory.reset();
        state.trajectory.data = [];

        if (state.textPreview.length > 0) {
            state.textPreview.forEach(patch => {
                // Ensure we handle lines correctly (and ellipses are already Lines here)
                if (patch.type === 'line') {
                    // Create Point instances to ensure relX/relY are calculated
                    // We receive ACTUAL coordinates from Python

                    // Import Point class is needed! ensuring state.settings is passed
                    // We assume Point is available in global scope or imported if module.
                    // main.js imports { CanvasHandler } but Point is in utils.js?
                    // We need to import Point from utils.js at top of main.js if not present.
                    // Assuming imports: import { Point } from './utils.js';

                    // Create dummy points first
                    const p0 = new Point(0, 0, state.settings);
                    p0.actX = patch.points[0][0];
                    p0.actY = patch.points[0][1];

                    const p1 = new Point(0, 0, state.settings);
                    p1.actX = patch.points[1][0];
                    p1.actY = patch.points[1][1];

                    state.trajectory.data.push({
                        type: 'line',
                        data: [p0, p1, patch.data.penup]
                    });
                }
            });
        }

        validateText(); // Validate the result

    } catch (e) {
        console.error("Preview Generation Error:", e);
    }
}

// Input Listener (Debounced)
ui.inputText.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        generatePreview();
    }, 100); // 100ms delay
});

// Update on other parameter changes too
[ui.inputFontSize, ui.inputLinX, ui.inputLinY, ui.inputLinAngle, ui.inputCurvRadius, ui.inputCurvOffset].forEach(el => {
    if (el) {
        el.addEventListener('input', () => {
            // Debounce less critical here? Or same.
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(generatePreview, 100);
        });
    }
});

// Generate Button (Immediate)
ui.btnGenerate.addEventListener('click', () => {
    clearTimeout(debounceTimer);
    generatePreview();
});

// New Line Button
ui.btnNewline.addEventListener('click', () => {
    ui.inputText.value += "\n";
    ui.inputText.focus(); // Keep focus
    generatePreview();
});

ui.btnClean.addEventListener('click', () => {
    // Clear Input
    ui.inputText.value = "";

    // Clear State
    state.textPreview = [];
    state.generatedTextPatches = [];
    state.points = [];
    state.trajectory.reset();

    // Clear Sent/Ghost Trajectory (User Request)
    state.sentPoints = [];
    state.sentTrajectory.reset();

    // Clear Backend State
    API.clearState();

    ui.warningMsg.classList.add('hidden');
    console.log("Workspace Cleared");
});

// --- Template System ---

async function refreshTemplateList() {
    try {
        const files = await API.listTemplates();
        ui.selectTemplate.innerHTML = '<option value="">Select Template...</option>';

        if (!files || files.length === 0) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = '(No templates saved)';
            option.disabled = true;
            ui.selectTemplate.appendChild(option);
            return;
        }

        files.forEach(f => {
            const option = document.createElement('option');
            option.value = f;
            option.textContent = f;
            ui.selectTemplate.appendChild(option);
        });

        console.log(`Loaded ${files.length} template(s)`);
    } catch (error) {
        console.error('Error refreshing template list:', error);
        ui.selectTemplate.innerHTML = '<option value="">Error loading templates</option>';
    }
}

function getTrajectoryPayload() {
    // Collect data to save in the correct format for backend
    // Priority order:
    // 1. generatedTextPatches (from text generation or loaded templates)
    // 2. trajectory.data (from manual drawing with tools)

    const payload = [];

    // Check if we have generated/loaded patches first
    if (state.generatedTextPatches && state.generatedTextPatches.length > 0) {
        // These are already in the correct format
        return [...state.generatedTextPatches];
    }

    // Otherwise, convert trajectory.data to payload format
    if (!state.trajectory || !state.trajectory.data || state.trajectory.data.length === 0) {
        return payload; // Empty
    }

    for (let t of state.trajectory.data) {
        if (t.type === 'line') {
            const p0 = t.data[0];
            const p1 = t.data[1];
            const penup = t.data[2];

            // Ensure points have actX and actY properties
            if (!p0 || !p1 || p0.actX === undefined || p1.actX === undefined) {
                console.warn('Skipping invalid line data:', t);
                continue;
            }

            payload.push({
                'type': 'line',
                'points': [[p0.actX, p0.actY], [p1.actX, p1.actY]],
                'data': { 'penup': penup || false }
            });

        } else if (t.type === 'circle') {
            const c = t.data[0];
            const r = t.data[1];
            const theta0 = t.data[2];
            const theta1 = t.data[3];
            const penup = t.data[4];

            // Validate circle data
            if (!c || c.actX === undefined || !r) {
                console.warn('Skipping invalid circle data:', t);
                continue;
            }

            // --- Circle Sampling Logic ---
            // Convert circle to line segments for saving

            // Determine Direction (same as Trajectory.draw)
            const A = theta0 > theta1;
            const B = Math.abs(theta1 - theta0) < Math.PI;
            const ccw = (!A && !B) || (A && B); // XNOR

            // Calculate valid Delta Angle
            let delta = theta1 - theta0;
            if (ccw) {
                if (delta <= 0) delta += 2 * Math.PI;
            } else {
                if (delta >= 0) delta -= 2 * Math.PI;
            }

            // Determine steps (approx 1 step per 5 degrees or min 20)
            const steps = Math.max(20, Math.ceil(Math.abs(delta) * (180 / Math.PI) / 5));

            let prevX = c.actX + r * Math.cos(theta0);
            let prevY = c.actY + r * Math.sin(theta0);

            for (let i = 1; i <= steps; i++) {
                const t_param = i / steps;
                const angle = theta0 + delta * t_param;

                const currX = c.actX + r * Math.cos(angle);
                const currY = c.actY + r * Math.sin(angle);

                payload.push({
                    'type': 'line',
                    'points': [[prevX, prevY], [currX, currY]],
                    'data': { 'penup': penup || false }
                });

                prevX = currX;
                prevY = currY;
            }
        }
    }

    return payload;
}

// Save Template
ui.btnSaveTemplate.addEventListener('click', async () => {
    const items = getTrajectoryPayload();
    let name = ui.inputTemplateName.value.trim();

    // Validation
    if (!name) {
        alert("Please enter a template name!");
        ui.inputTemplateName.focus();
        return;
    }

    if (items.length === 0) {
        alert("Nothing to save! Draw something first.");
        return;
    }

    // Add .json extension if not present
    if (!name.endsWith('.json')) {
        name += '.json';
    }

    console.log(`Saving template "${name}" with ${items.length} items...`);

    try {
        const res = await API.saveTemplate(name, items);
        if (res.success) {
            alert(`✓ Template "${name}" saved successfully!`);
            ui.inputTemplateName.value = ''; // Clear input
            await refreshTemplateList();
        } else {
            alert("Error saving template: " + (res.message || "Unknown error"));
        }
    } catch (error) {
        console.error('Save template error:', error);
        alert("Error saving template: " + error.message);
    }
});

// Load Template
ui.btnLoadTemplate.addEventListener('click', async () => {
    const name = ui.selectTemplate.value;

    if (!name) {
        alert("Please select a template to load!");
        return;
    }

    console.log(`Loading template "${name}"...`);

    try {
        const res = await API.loadTemplate(name);

        if (!res.success) {
            alert("Error loading template: " + (res.message || "Unknown error"));
            return;
        }

        if (!res.data || res.data.length === 0) {
            alert("Template is empty or invalid!");
            return;
        }

        // Clear current drawing first
        state.resetDrawing();
        state.history = [];
        state.historyIndex = -1;
        state.rectangleStart = null;
        state.sentPoints = [];
        state.sentTrajectory.reset();

        // Load the template data
        const patches = res.data;

        // Store in both textPreview (for visualization) and generatedTextPatches (for saving/sending)
        state.textPreview = patches;
        state.generatedTextPatches = patches;

        // Clear text input since we're loading a template
        if (ui.inputText) {
            ui.inputText.value = '';
        }

        console.log(`✓ Template "${name}" loaded successfully with ${patches.length} items`);
        alert(`✓ Template "${name}" loaded successfully!`);

        updateUndoRedoUI();

    } catch (error) {
        console.error('Load template error:', error);
        alert("Error loading template: " + error.message);
    }
});

// Delete Template
ui.btnDeleteTemplate.addEventListener('click', async () => {
    const name = ui.selectTemplate.value;

    if (!name) {
        alert("Please select a template to delete!");
        return;
    }

    // Confirmation dialog
    if (!confirm(`Are you sure you want to delete "${name}"?\n\nThis action cannot be undone.`)) {
        return;
    }

    console.log(`Deleting template "${name}"...`);

    try {
        const res = await API.deleteTemplate(name);

        if (res.success) {
            console.log(`✓ Template "${name}" deleted successfully`);
            alert(`✓ Template "${name}" deleted successfully!`);

            // Clear selection
            ui.selectTemplate.value = '';

            // Refresh list
            await refreshTemplateList();
        } else {
            alert("Error deleting template: " + (res.message || "Unknown error"));
        }
    } catch (error) {
        console.error('Delete template error:', error);
        alert("Error deleting template: " + error.message);
    }
});

ui.btnRefreshTemplates.addEventListener('click', refreshTemplateList);

// Initial Load
refreshTemplateList();

// --- Helper Functions ---

function setTool(tool) {
    state.tool = tool;
    state.circleDefinition = []; // Reset partials
    state.rectangleStart = null; // Reset rectangle start
    state.semicircleStart = null; // Reset semicircle start
    state.fullcircleStart = null; // Reset fullcircle start
    state.shapeStart = null;
}

function updateToolUI() {
    ui.btnLine.classList.toggle('active', state.tool === TOOLS.LINE);
    ui.btnCircle.classList.toggle('active', state.tool === TOOLS.CIRCLE);
    ui.btnSquare.classList.toggle('active', state.tool === TOOLS.SQUARE);
    ui.btnPolygon.classList.toggle('active', state.tool === TOOLS.POLYGON);
    ui.btnSemicircle.classList.toggle('active', state.tool === TOOLS.SEMICIRCLE);
}

function updateUndoRedoUI() {
    ui.btnUndo.disabled = !state.canUndo();
    ui.btnRedo.disabled = !state.canRedo();
}

async function updateSerialStatus() {
    const isOnline = await API.getSerialStatus();
    setSerialUI(isOnline);
}

function setSerialUI(isOnline) {
    state.isSerialOnline = isOnline;
    if (isOnline) {
        ui.statusDot.classList.add('online');
        ui.statusText.textContent = "Connected";
    } else {
        ui.statusDot.classList.remove('online');
        ui.statusText.textContent = "Disconnected";
    }
}

// --- API Callbacks ---

API.initCallbacks({
    onLog: (msg) => {
        // Optional: display in UI console
        const consoleEl = document.getElementById('console-output');
        if (consoleEl) consoleEl.textContent = msg;
    },

    onDrawPose: (q) => {
        if (state.manipulator) state.manipulator.q = q;
    },

    onDrawTraces: (points) => {
        // points = [[x1, y1], [x2, y2]...] ? 
        // Original: js_draw_traces(points) -> man.add2trace([points[0][i], points[1][i]])
        // Check protocol.
        // Assuming points is list of configs? Or points? 
        // Original cnv.js:
        /*
        function js_draw_traces(points) {
            for(var i = 0; i < points[0].length; i++){
                man.add2trace([points[0][i], points[1][i]]);
            }
        }
        */
        // It seems to receive a zipped structure or parallel arrays?
        // Let's assume standard behavior for now.
        if (state.manipulator) {
            // Basic implementation
        }
    },

    onGetData: () => {
        const payload = [];

        // 1. Check for Generated/Loaded Patches (High Priority)
        // This handles Text AND Loaded Templates
        if (state.generatedTextPatches && state.generatedTextPatches.length > 0) {
            // They are already in the correct format!
            // Just return a copy
            // Move to Sent first?
            state.sentPoints = []; // Visualization only supports points...
            // state.sentTrajectory...
            return state.generatedTextPatches;
        }

        // 2. Fallback to Manual Drawing (state.trajectory)
        for (let t of state.trajectory.data) {
            let item = {};

            // Reconstruct payload expected by Python
            /*
            line_t = {'type':'line', 'points': [[x1,y1], [x2,y2]], 'data':{'penup': bool}}
            circle_t = {'type':'circle', 'points': [[a_x, a_y], [b_x, b_y]], 'data':{'penup', 'center':[], 'radius'}}
            */

            if (t.type === 'line') {
                const p0 = t.data[0];
                const p1 = t.data[1];
                const penup = t.data[2];

                item = {
                    'type': 'line',
                    'points': [[p0.actX, p0.actY], [p1.actX, p1.actY]],
                    'data': { 'penup': penup }
                };
            } else if (t.type === 'circle') {
                const c = t.data[0];
                const r = t.data[1];
                // theta0, theta1 ignored in backend?
                const penup = t.data[4];
                const a = t.data[5];
                const p = t.data[6];

                item = {
                    'type': 'circle',
                    'points': [[a.actX, a.actY], [p.actX, p.actY]],
                    'data': {
                        'penup': penup,
                        'center': [c.actX, c.actY],
                        'radius': r
                    }
                };
            }
            payload.push(item);
        }

        // Move current to sent
        state.moveToSent();

        return payload;
    }
});

// Initial Status Check
updateSerialStatus();
setInterval(updateSerialStatus, 2000); // Polling status

// Initial UI Update
updateUndoRedoUI();

// --- Keyboard Shortcuts ---
document.addEventListener('keydown', (e) => {
    // Ignore if typing in input fields
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    // Ctrl/Cmd + Z: Undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        state.undo();
        updateUndoRedoUI();
    }

    // Ctrl/Cmd + Y or Ctrl/Cmd + Shift + Z: Redo
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        state.redo();
        updateUndoRedoUI();
    }

    // Tool shortcuts (only if not holding Ctrl/Cmd)
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        switch (e.key.toLowerCase()) {
            case 'l':
                setTool(TOOLS.LINE);
                updateToolUI();
                break;
            case 'c':
                setTool(TOOLS.CIRCLE);
                updateToolUI();
                break;
            case 'r':
                setTool(TOOLS.RECTANGLE);
                updateToolUI();
                break;
            case 'p':
                if (!ui.btnPolygon.disabled) {
                    setTool(TOOLS.POLYGON);
                    updateToolUI();
                }
                break;
            case 's':
                setTool(TOOLS.SEMICIRCLE);
                updateToolUI();
                break;
            case 'o':
                setTool(TOOLS.FULLCIRCLE);
                updateToolUI();
                break;
            case 'g':
                ui.btnGridToggle.click();
                break;
            case 'delete':
                ui.btnClear.click();
                break;
        }
    }
});
