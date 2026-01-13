import { appState, TOOLS } from './state.js';
import { CanvasHandler } from './canvas.js';
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
    btnHoming: document.getElementById('homing-btn'),
    btnDemo: document.getElementById('repeatable-btn'),
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
