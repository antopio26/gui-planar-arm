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

    btnLine: document.getElementById('line-btn'),
    btnCircle: document.getElementById('circle-btn'),
    btnPen: document.getElementById('penup-btn'),

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
    btnClean: document.getElementById('clean-text-btn'),
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

ui.btnPen.addEventListener('click', () => {
    state.penUp = !state.penUp;
    ui.btnPen.classList.toggle('active', state.penUp);
    ui.btnPen.textContent = state.penUp ? "Pen Up (Active)" : "Toggle Pen Up";
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
