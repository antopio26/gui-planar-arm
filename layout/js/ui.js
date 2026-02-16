export class UI {
    constructor() {
        this.elements = {
            // connection
            statusDot: document.getElementById('status-dot'),
            statusText: document.getElementById('status-text'),
            btnConnect: document.getElementById('start-serial-btn'),
            selectPort: document.getElementById('serial-port-list'),
            btnRefresh: document.getElementById('refresh-ports-btn'),

            // tools
            btnLine: document.getElementById('line-btn'),
            btnCircle: document.getElementById('circle-btn'),
            btnPen: document.getElementById('penup-btn'),
            btnClearCanvas: document.getElementById('clear-canvas-btn'),

            // main mode switcher
            btnMainDrawing: document.getElementById('main-mode-drawing'),
            btnMainText: document.getElementById('main-mode-text'),
            containerDrawing: document.getElementById('drawing-mode-container'),
            containerText: document.getElementById('text-mode-container'),

            // commands
            btnSend: document.getElementById('send-data-btn'),
            btnStop: document.getElementById('stop-traj-btn'),
            btnHoming: document.getElementById('homing-btn'),

            // text tools
            btnModeLinear: document.getElementById('mode-linear-btn'),
            btnModeCurved: document.getElementById('mode-curved-btn'),
            inputText: document.getElementById('text-input'),
            inputFontSize: document.getElementById('font-size'),
            controlsLinear: document.getElementById('linear-controls'),
            controlsCurved: document.getElementById('curved-controls'),

            // linear inputs
            inputLinX: document.getElementById('lin-x'),
            inputLinY: document.getElementById('lin-y'),
            inputLinAngle: document.getElementById('lin-angle'),

            // robot config inputs
            inputL1: document.getElementById('robot-l1'),
            inputL2: document.getElementById('robot-l2'),
            inputQ1Min: document.getElementById('limit-q1-min'),
            inputQ1Max: document.getElementById('limit-q1-max'),
            inputQ2Min: document.getElementById('limit-q2-min'),
            inputQ2Max: document.getElementById('limit-q2-max'),

            // workspace config (linear)
            inputWsX: document.getElementById('ws-x'),
            inputWsY: document.getElementById('ws-y'),
            inputWsW: document.getElementById('ws-w'),
            inputWsH: document.getElementById('ws-h'),

            // curved inputs
            inputCurvRadius: document.getElementById('curv-radius'),
            inputCurvOffset: document.getElementById('curv-offset'),

            // viz controls
            btnToggleFrames: document.getElementById('viz-toggle-frames'),
            btnToggleLimits: document.getElementById('viz-toggle-limits'),
            btnToggleVel: document.getElementById('viz-toggle-vel'),
            btnToggleForce: document.getElementById('viz-toggle-force'),
            monQ1: document.getElementById('mon-q1'),
            monQ2: document.getElementById('mon-q2'),
            monX: document.getElementById('mon-x'),
            monY: document.getElementById('mon-y'),

            warningMsg: document.getElementById('text-warning'),
            btnClean: document.getElementById('clean-text-btn'),
        };
    }

    setSerialStatus(isOnline) {
        if (isOnline) {
            this.elements.statusDot.classList.remove('connecting'); // Ensure connecting is removed
            this.elements.statusDot.classList.add('online');
            this.elements.statusText.textContent = "Connected";
        } else {
            this.elements.statusDot.classList.remove('connecting'); // Ensure connecting is removed
            this.elements.statusDot.classList.remove('online');
            this.elements.statusText.textContent = "Disconnected";
        }
    }

    setConnecting(isConnecting) {
        if (isConnecting) {
            this.elements.statusDot.classList.remove('online');
            this.elements.statusDot.classList.add('connecting');
            this.elements.statusText.textContent = "Connecting...";
            
            this.elements.btnConnect.disabled = true;
            this.elements.btnConnect.textContent = "Connecting...";
            this.elements.selectPort.disabled = true;
            this.elements.btnRefresh.disabled = true;
        } else {
            this.elements.statusDot.classList.remove('connecting');
            // Status text/color will be set by setSerialStatus immediately after
            
            this.elements.btnConnect.disabled = false;
            this.elements.btnConnect.textContent = "Connect Serial";
            this.elements.selectPort.disabled = false;
            this.elements.btnRefresh.disabled = false;
        }
    }

    setMajorMode(mode) {
        // buttons
        this.elements.btnMainDrawing.classList.toggle('active', mode === 'drawing');
        this.elements.btnMainText.classList.toggle('active', mode === 'text');

        // containers
        if (mode === 'drawing') {
            this.elements.containerDrawing.classList.remove('hidden');
            this.elements.containerText.classList.add('hidden');
        } else {
            this.elements.containerDrawing.classList.add('hidden');
            this.elements.containerText.classList.remove('hidden');
        }
    }

    setTextMode(mode) {
        this.elements.btnModeLinear.classList.toggle('active', mode === 'linear');
        this.elements.btnModeCurved.classList.toggle('active', mode === 'curved');

        if (mode === 'linear') {
            this.elements.controlsLinear.classList.remove('hidden');
            this.elements.controlsCurved.classList.add('hidden');
        } else {
            this.elements.controlsLinear.classList.add('hidden');
            this.elements.controlsCurved.classList.remove('hidden');
        }
    }

    toggleWarning(show, message = "") {
        if (show) {
            this.elements.warningMsg.classList.remove('hidden');
            this.elements.warningMsg.textContent = "⚠ " + message;
        } else {
            this.elements.warningMsg.classList.add('hidden');
        }
    }

    updateMonitor(q1, q2, x, y) {
        if (this.elements.monQ1) this.elements.monQ1.value = q1.toFixed(2);
        if (this.elements.monQ2) this.elements.monQ2.value = q2.toFixed(2);
        if (this.elements.monX) this.elements.monX.value = x.toFixed(3);
        if (this.elements.monY) this.elements.monY.value = y.toFixed(3);
    }
}
