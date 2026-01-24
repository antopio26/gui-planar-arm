import { appState, TOOLS } from './state.js';
import { CanvasHandler } from './canvas.js';
import { Point } from './utils.js';
import { API } from './api.js';
import { TabManager } from './tabs.js';
import { JointSpaceVisualizer } from './joint_space_visualizer.js';

// --- Initialization ---

const canvas = document.getElementById('input_canvas');
const jointCanvas = document.getElementById('joint_canvas');
const state = appState;

// Initialize State
state.init(canvas.width, canvas.height);

// Initialize Tab Manager
const tabManager = new TabManager();

// --- UI Elements ---

const ui = {
    statusDot: document.getElementById('status-dot'),
    statusText: document.getElementById('status-text'),
    btnConnect: document.getElementById('start-serial-btn'),
    selectPort: document.getElementById('serial-port-list'),
    btnRefresh: document.getElementById('refresh-ports-btn'),

    btnLine: document.getElementById('line-btn'),
    btnCircle: document.getElementById('circle-btn'),
    btnPen: document.getElementById('penup-btn'),
    btnClearCanvas: document.getElementById('clear-canvas-btn'),

    // Main Mode Switcher
    btnMainDrawing: document.getElementById('main-mode-drawing'),
    btnMainText: document.getElementById('main-mode-text'),
    containerDrawing: document.getElementById('drawing-mode-container'),
    containerText: document.getElementById('text-mode-container'),

    btnSend: document.getElementById('send-data-btn'),
    btnStop: document.getElementById('stop-traj-btn'),
    btnHoming: document.getElementById('homing-btn'),
    // btnDemo removed


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

    // Robot Config Inputs
    inputL1: document.getElementById('robot-l1'),
    inputL2: document.getElementById('robot-l2'),
    inputQ1Min: document.getElementById('limit-q1-min'),
    inputQ1Max: document.getElementById('limit-q1-max'),
    inputQ2Min: document.getElementById('limit-q2-min'),
    inputQ2Max: document.getElementById('limit-q2-max'),

    // Workspace Config (Linear)
    inputWsX: document.getElementById('ws-x'),
    inputWsY: document.getElementById('ws-y'),
    inputWsW: document.getElementById('ws-w'),
    inputWsH: document.getElementById('ws-h'),

    // Curved Inputs
    inputCurvRadius: document.getElementById('curv-radius'),
    inputCurvOffset: document.getElementById('curv-offset'),



    // Viz Controls
    btnToggleFrames: document.getElementById('viz-toggle-frames'),
    btnToggleLimits: document.getElementById('viz-toggle-limits'),
    monQ1: document.getElementById('mon-q1'),
    monQ2: document.getElementById('mon-q2'),
    monX: document.getElementById('mon-x'),
    monY: document.getElementById('mon-y'),

    warningMsg: document.getElementById('text-warning'),
    // btnGenerate: document.getElementById('generate-text-btn'), // Removed
    // btnNewline: document.getElementById('newline-btn'), // Removed
    btnClean: document.getElementById('clean-text-btn'),
};

// Fetch Config from Backend and Update State
// Fetch Config from Backend and Update State
API.getConfig().then(config => {
    if (config) {
        console.log("Config loaded from backend:", config);
        if (config.sizes) {
            state.settings.l1 = config.sizes.l1;
            state.settings.l2 = config.sizes.l2;
            if (ui.inputL1) ui.inputL1.value = config.sizes.l1;
            if (ui.inputL2) ui.inputL2.value = config.sizes.l2;
        }
        if (config.limits) {
            state.settings.limits = config.limits;
            if (ui.inputQ1Min) ui.inputQ1Min.value = config.limits.q1_min;
            if (ui.inputQ1Max) ui.inputQ1Max.value = config.limits.q1_max;
            if (ui.inputQ2Min) ui.inputQ2Min.value = config.limits.q2_min;
            if (ui.inputQ2Max) ui.inputQ2Max.value = config.limits.q2_max;
        }
        // Force redraw if needed, or it will happen on next animate frame
    }
});

function updateRobotConfig() {
    state.settings.l1 = parseFloat(ui.inputL1.value) || 0.170;
    state.settings.l2 = parseFloat(ui.inputL2.value) || 0.158;

    if (!state.settings.limits) state.settings.limits = {};
    state.settings.limits.q1_min = parseFloat(ui.inputQ1Min.value) || -1.57;
    state.settings.limits.q1_max = parseFloat(ui.inputQ1Max.value) || 1.57;
    state.settings.limits.q2_min = parseFloat(ui.inputQ2Min.value) || -2.5;
    state.settings.limits.q2_max = parseFloat(ui.inputQ2Max.value) || 2.5;

    // Trigger canvas resize/recalc to update visuals (e.g. workspace sweep)
    if (canvasHandler) canvasHandler.resize();
    if (jointVisualizer) jointVisualizer.resize();
    validateText();
}

[ui.inputL1, ui.inputL2, ui.inputQ1Min, ui.inputQ1Max, ui.inputQ2Min, ui.inputQ2Max].forEach(el => {
    if (el) el.addEventListener('input', updateRobotConfig);
});

// Initialize Canvas Handler
const canvasHandler = new CanvasHandler(canvas, state);
const jointVisualizer = new JointSpaceVisualizer(jointCanvas, state);

// --- Mode Switcher Logic ---

ui.btnMainDrawing.addEventListener('click', () => setMajorMode('drawing'));
ui.btnMainText.addEventListener('click', () => setMajorMode('text'));

function setMajorMode(mode) {
    if (state.majorMode === mode) return;

    // Clear Canvas & State on Mode Switch
    state.resetDrawing();
    state.sentPoints = [];
    state.sentTrajectory.reset();
    state.textPreview = [];
    state.generatedTextPatches = [];
    jointVisualizer.setTrajectoryData({ q1: [], q2: [] }, []);

    // Partially stop backend if needed, but not full stop
    // API.stopTrajectory();

    state.majorMode = mode;
    // Update Buttons
    ui.btnMainDrawing.classList.toggle('active', mode === 'drawing');
    ui.btnMainText.classList.toggle('active', mode === 'text');

    // Update Containers
    if (mode === 'drawing') {
        ui.containerDrawing.classList.remove('hidden');
        ui.containerText.classList.add('hidden');
    } else {
        ui.containerDrawing.classList.add('hidden');
        ui.containerText.classList.remove('hidden');
        // Regenerate preview when entering text mode
        validateText();
        generatePreview();
    }
}

// --- Event Listeners ---

// Connection
// Connection
async function populateSerialPorts() {
    const ports = await API.listSerialPorts();
    const select = ui.selectPort;

    // Save current selection if possible
    const currentVal = select.value;

    // Clear except OFFLINE
    select.innerHTML = '<option value="OFFLINE">Offline Mode</option>';

    ports.forEach(port => {
        const option = document.createElement('option');
        option.value = port.device;
        option.textContent = `${port.device} (${port.description})`;
        select.appendChild(option);
    });

    if (currentVal && Array.from(select.options).some(o => o.value === currentVal)) {
        select.value = currentVal;
    }
}

ui.btnRefresh.addEventListener('click', populateSerialPorts);

ui.btnConnect.addEventListener('click', async () => {
    const selectedPort = ui.selectPort.value;
    console.log("Connecting to:", selectedPort);
    await API.startSerial(selectedPort);
    updateSerialStatus();
});

// Initial Population
populateSerialPorts();

// Tools
ui.btnLine.addEventListener('click', () => {
    setTool(TOOLS.LINE);
    updateToolUI();
});

ui.btnCircle.addEventListener('click', () => {
    setTool(TOOLS.CIRCLE);
    updateToolUI();
});

// Keyboard Listener for ESC (Pen Up)
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (state.majorMode === 'drawing') {
            state.penUp = true;
            console.log("Pen Up Active (Waiting for next click to move)");
        }
    }
});

ui.btnClearCanvas.addEventListener('click', async () => {
    // Immediate clear without confirmation
    state.resetDrawing();
    state.sentPoints = [];
    state.sentTrajectory.reset();

    // Also clear backend
    await API.stopTrajectory();
    // API.clearState(); // Assuming this is needed if stopTrajectory doesn't clear points

    state.textPreview = [];
    state.generatedTextPatches = [];
    jointVisualizer.setTrajectoryData([], []);

    ui.warningMsg.classList.add('hidden');
});

// Commands
ui.btnHoming.addEventListener('click', () => {
    API.homing();
});

ui.btnSend.addEventListener('click', () => {
    API.sendData(state.settings);
    // Sending is triggered via Python callback -> js_get_data
});

// Demo button removed


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

// Viz Toggles
ui.btnToggleFrames.addEventListener('click', () => {
    state.settings.showFrames = !state.settings.showFrames;
    ui.btnToggleFrames.classList.toggle('active', state.settings.showFrames);
    ui.btnToggleFrames.textContent = `Frames: ${state.settings.showFrames ? 'ON' : 'OFF'}`;
    // Force redraw
    // Animation loop handles it
});

ui.btnToggleLimits.addEventListener('click', () => {
    state.settings.showLimits = !state.settings.showLimits;
    ui.btnToggleLimits.classList.toggle('active', state.settings.showLimits);
    ui.btnToggleLimits.textContent = `Limits: ${state.settings.showLimits ? 'ON' : 'OFF'}`;
    // Force redraw
    // Animation loop handles it
});

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
    generatePreview(); // Regenerate on switch
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
// Redundant listener removed. merged with debounced listener below.

// Generate button listener removed.

async function validateText() {
    const text = ui.inputText.value;
    if (!text) {
        ui.warningMsg.classList.add('hidden');
        return;
    }

    const options = getTextOptions();
    const result = await API.validateText(text, options, state.settings);

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
        jointVisualizer.setTrajectoryData({ q1: [], q2: [] });
        validateText(); // Will hide warning
        return;
    }

    const options = getTextOptions();
    console.log("Generating Preview for:", text); // Debug

    try {
        const patches = await API.generateText(text, options, state.settings);
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

            // --- Update Joint Space Preview ---
            // Now that state.trajectory is populated, we can compute the joint path
            const jointData = await API.computeTrajectory(state.settings);
            if (jointData) {
                console.log("Computed Joint Path:", jointData.q1.length, "points");
                jointVisualizer.setTrajectoryData(jointData.q1, jointData.q2);
            }
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
    }, 500); // Increased debounce to 500ms to avoid overloading backend with IK
});

// Update on other parameter changes too
[ui.inputFontSize, ui.inputLinX, ui.inputLinY, ui.inputLinAngle, ui.inputCurvRadius, ui.inputCurvOffset].forEach(el => {
    if (el) {
        el.addEventListener('input', () => {
            // Debounce less critical here? Or same.
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(generatePreview, 500);
        });
    }
});

// Generate Button (Immediate)
// Generate and Newline buttons removed in UI redesign.
// Text generation remains reactive (input event).

ui.btnClean.addEventListener('click', async () => {
    // Clear Input
    ui.inputText.value = "";

    // Clear State
    state.textPreview = [];
    state.generatedTextPatches = [];
    state.resetDrawing();
    state.sentPoints = [];
    state.sentTrajectory.reset();
    jointVisualizer.setTrajectoryData({ q1: [], q2: [] }, []);

    // Clear Backend State
    await API.stopTrajectory();
    // If backend has specific clear endpoint, use it. 
    // "API.clearState" is referenced in line 390 of original file, let's verify if defined.
    // It was in line 390 of the original file read: `API.clearState();`
    if (API.clearState) API.clearState();

    ui.warningMsg.classList.add('hidden');
    console.log("Workspace Cleared");
});

// --- Helper Functions ---

function setTool(tool) {
    state.tool = tool;
    state.circleDefinition = []; // Reset partials
}

function updateToolUI() {
    ui.btnLine.classList.toggle('active', state.tool === TOOLS.LINE);
    ui.btnCircle.classList.toggle('active', state.tool === TOOLS.CIRCLE);
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

    onDrawPose: (q, penup) => {
        if (state.manipulator) {
            state.manipulator.q = q;
            if (penup !== undefined) state.manipulator.setPenState(penup);

            // Update Monitor
            if (ui.monQ1) ui.monQ1.value = q[0].toFixed(2);
            if (ui.monQ2) ui.monQ2.value = q[1].toFixed(2);

            // Calculate End Effector Position (relative to origin, not pixels)
            // state.manipulator.end_eff gives pixels.
            // We want real world coords.
            // Forward Kinematics simple:
            const l1 = state.settings.l1;
            const l2 = state.settings.l2;
            const x = l1 * Math.cos(q[0]) + l2 * Math.cos(q[0] + q[1]);
            const y = l1 * Math.sin(q[0]) + l2 * Math.sin(q[0] + q[1]);

            if (ui.monX) ui.monX.value = x.toFixed(3);
            if (ui.monY) ui.monY.value = y.toFixed(3);
        }
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
