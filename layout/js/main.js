import { appState, TOOLS } from './state.js';
import { CanvasHandler } from './canvas.js';
import { API } from './api.js';
import { TabManager } from './tabs.js';
import { JointSpaceVisualizer } from './joint_space_visualizer.js';
import { TimePlotVisualizer } from './time_plot.js';
import { UI } from './ui.js';
import { ConfigUI } from './config_ui.js';
import { TextGenerator } from './text_generator.js';

// --- Initialization ---

const canvas = document.getElementById('input_canvas');
const jointCanvas = document.getElementById('joint_canvas');
const q1Canvas = document.getElementById('q1_plot_canvas');
const q2Canvas = document.getElementById('q2_plot_canvas');

// Initialize State
appState.init(canvas.width, canvas.height);

// Initialize UI
const ui = new UI();

// Initialize Visualizers
const jointVisualizer = new JointSpaceVisualizer(jointCanvas, appState);
const timeVisualizer = new TimePlotVisualizer(q1Canvas, q2Canvas, appState);

// Initialize Canvas Handler
const canvasHandler = new CanvasHandler(canvas, appState, () => {
    // On Shape Added / Update
    updateTrajectoryPreview();
});

// Initialize Managers
const configUI = new ConfigUI(ui, appState, {
    onResize: () => {
        canvasHandler.resize();
        jointVisualizer.resize();
    },
    onValidateText: () => textGen.validateText(),
    onPreviewTraj: () => updateTrajectoryPreview()
});

const textGen = new TextGenerator(ui, appState, () => {
    // On Text Preview Update
    if (appState.textPreview.length > 0) {
        updateTrajectoryPreview();
    }
});

const tabManager = new TabManager((activeTab) => {
    requestAnimationFrame(() => {
        if (activeTab === 'cartesian') canvasHandler.resize();
        else if (activeTab === 'joint') jointVisualizer.resize();
        else if (activeTab === 'trajectories') timeVisualizer.resize();
    });
});

// --- Main Controller Logic ---

// Mode Switching
ui.elements.btnMainDrawing.addEventListener('click', () => setMajorMode('drawing'));
ui.elements.btnMainText.addEventListener('click', () => setMajorMode('text'));

function setMajorMode(mode) {
    if (appState.majorMode === mode) return;

    // Reset State
    appState.resetDrawing();
    appState.sentPoints = [];
    appState.sentTrajectory.reset();
    textGen.clearPreviewState();
    jointVisualizer.setTrajectoryData({ q1: [], q2: [] }, []);
    if (appState.manipulator) appState.manipulator.reset_trace();

    appState.majorMode = mode;
    ui.setMajorMode(mode);

    if (mode === 'text') {
        textGen.validateText();
        textGen.generatePreview();
    }
}

// Drawing Tools
ui.elements.btnLine.addEventListener('click', () => setTool(TOOLS.LINE));
ui.elements.btnCircle.addEventListener('click', () => setTool(TOOLS.CIRCLE));
ui.elements.btnClearCanvas.addEventListener('click', async () => {
    appState.resetDrawing();
    appState.sentPoints = [];
    appState.sentTrajectory.reset();
    if (appState.manipulator) appState.manipulator.reset_trace();
    await API.stopTrajectory();
    textGen.clearPreviewState();
    jointVisualizer.setTrajectoryData([], []);
    ui.toggleWarning(false);
});

function setTool(tool) {
    appState.tool = tool;
    appState.circleDefinition = [];

    ui.elements.btnLine.classList.toggle('active', appState.tool === TOOLS.LINE);
    ui.elements.btnCircle.classList.toggle('active', appState.tool === TOOLS.CIRCLE);
}

// Keyboard Listener (Pen Up)
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (appState.majorMode === 'drawing') {
            appState.penUp = true;
            console.log("Pen Up Active");
        }
    }
});

// Config Loading
API.getConfig().then(config => {
    if (config) {
        configUI.updateConfigFromBackend(config);
        textGen.loadDefaults(config);
    }
});

// Trajectory Preview
async function updateTrajectoryPreview() {
    if (!jointVisualizer) return;

    // If text mode, ensure trajectory is synced (textGen handles this internally before calling callback)
    // But if we are in drawing mode, appState.trajectory is updated by CanvasHandler.

    const result = await API.computeTrajectory(appState.settings);
    if (result) {
        jointVisualizer.setTrajectoryData(result.q1, result.q2);
        if (timeVisualizer && result.t) {
            timeVisualizer.setPlannedPath(result.t, result.q1, result.q2);
            if (result.t.length > 0) {
                appState.expectedDuration = result.t[result.t.length - 1];
            }
        }
    } else {
        jointVisualizer.setTrajectoryData([], []);
        if (timeVisualizer) timeVisualizer.setPlannedPath([], [], []);
        appState.expectedDuration = 0;
    }
}

// Commands
ui.elements.btnHoming.addEventListener('click', () => {
    appState.startTime = Date.now() / 1000;
    appState.expectedDuration = 20.0;
    if (jointVisualizer) jointVisualizer.clearTrace();
    if (timeVisualizer) timeVisualizer.clearTrace();
    API.homing();
});

ui.elements.btnSend.addEventListener('click', async () => {
    if (appState.manipulator) appState.manipulator.reset_trace();
    if (jointVisualizer) jointVisualizer.clearTrace();
    if (timeVisualizer) timeVisualizer.clearTrace();

    appState.startTime = Date.now() / 1000;

    try {
        await API.sendData(appState.settings);
        appState.moveToSent();
        if (canvasHandler) canvasHandler.resize();
    } catch (e) {
        console.error("Send Failed:", e);
        alert("Failed to send trajectory: " + e);
    }
});

ui.elements.btnStop.addEventListener('click', async () => {
    await API.stopTrajectory();
});

// Serial Connection
async function populateSerialPorts() {
    const ports = await API.listSerialPorts();
    const select = ui.elements.selectPort;
    const currentVal = select.value;

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

ui.elements.btnRefresh.addEventListener('click', populateSerialPorts);
ui.elements.btnConnect.addEventListener('click', async () => {
    const selectedPort = ui.elements.selectPort.value;
    await API.startSerial(selectedPort);
    const isOnline = await API.getSerialStatus();
    ui.setSerialStatus(isOnline);
    appState.isSerialOnline = isOnline;
});

// Initial Population & Status
populateSerialPorts();
API.getSerialStatus().then(isOnline => {
    ui.setSerialStatus(isOnline);
    appState.isSerialOnline = isOnline;
});

setInterval(async () => {
    const isOnline = await API.getSerialStatus();
    ui.setSerialStatus(isOnline);
    appState.isSerialOnline = isOnline;
}, 2000);

// Viz Toggles
ui.elements.btnToggleFrames.addEventListener('click', () => {
    appState.settings.showFrames = !appState.settings.showFrames;
    ui.elements.btnToggleFrames.classList.toggle('active', appState.settings.showFrames);
    ui.elements.btnToggleFrames.textContent = `Frames: ${appState.settings.showFrames ? 'ON' : 'OFF'}`;
});

ui.elements.btnToggleLimits.addEventListener('click', () => {
    appState.settings.showLimits = !appState.settings.showLimits;
    ui.elements.btnToggleLimits.classList.toggle('active', appState.settings.showLimits);
    ui.elements.btnToggleLimits.textContent = `Limits: ${appState.settings.showLimits ? 'ON' : 'OFF'}`;
});


// API Callbacks (Viz Updates)
API.initCallbacks({
    onLog: (msg) => console.log("Backend:", msg),

    onDrawPose: (q, penup) => {
        if (appState.manipulator) {
            appState.manipulator.q = q;
            if (penup !== undefined) appState.manipulator.setPenState(penup);

            // Update Monitors
            const worldPos = appState.manipulator.getEndEffectorWorld();
            ui.updateMonitor(q[0], q[1], worldPos.x, worldPos.y);

            // Update Traces
            if (jointVisualizer) jointVisualizer.addTrace(q[0], q[1], penup);
            appState.manipulator.add2trace(q);

            // Time Plot
            const now = Date.now() / 1000;
            if (!appState.startTime) appState.startTime = now;
            const t = now - appState.startTime;

            if (t <= (appState.expectedDuration + 2.0)) {
                if (timeVisualizer) timeVisualizer.addTrace(t, q[0], q[1]);
            }
        }
    },

    onDrawTraces: (points) => {
        // Implementation for batch trace updates if needed
    },

    onGetData: () => {
        // Prepare payload
        const payload = [];
        for (let t of appState.trajectory.data) {
            let item = {};
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
        return payload;
    }
});
