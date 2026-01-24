export class ConfigUI {
    constructor(ui, state, callbacks) {
        this.ui = ui; // specific elements from UI class
        this.state = state;
        this.callbacks = callbacks || {}; // { onResize: (), onValidateText: (), onPreviewTraj: () }

        this.initListeners();
    }

    initListeners() {
        const els = this.ui.elements;
        const robotInputs = [
            els.inputL1, els.inputL2,
            els.inputQ1Min, els.inputQ1Max,
            els.inputQ2Min, els.inputQ2Max
        ];

        robotInputs.forEach(el => {
            if (el) el.addEventListener('input', () => this.updateRobotConfig());
        });

        const wsInputs = [
            els.inputWsX, els.inputWsY,
            els.inputWsW, els.inputWsH
        ];

        wsInputs.forEach(el => {
            if (el) el.addEventListener('input', () => {
                this.updateWorkspaceState();
                if (this.callbacks.onValidateText) this.callbacks.onValidateText();
            });
        });
    }

    updateConfigFromBackend(config) {
        const els = this.ui.elements;
        if (config.sizes) {
            this.state.settings.l1 = config.sizes.l1;
            this.state.settings.l2 = config.sizes.l2;
            if (els.inputL1) els.inputL1.value = config.sizes.l1;
            if (els.inputL2) els.inputL2.value = config.sizes.l2;
        }
        if (config.limits) {
            this.state.settings.limits = config.limits;
            if (els.inputQ1Min) els.inputQ1Min.value = config.limits.q1_min;
            if (els.inputQ1Max) els.inputQ1Max.value = config.limits.q1_max;
            if (els.inputQ2Min) els.inputQ2Min.value = config.limits.q2_min;
            if (els.inputQ2Max) els.inputQ2Max.value = config.limits.q2_max;
        }
        // Force update internal state from these values just in case
        this.updateRobotConfig();
    }

    updateRobotConfig() {
        const els = this.ui.elements;

        this.state.settings.l1 = parseFloat(els.inputL1.value) || 0.170;
        this.state.settings.l2 = parseFloat(els.inputL2.value) || 0.158;

        if (!this.state.settings.limits) this.state.settings.limits = {};
        this.state.settings.limits.q1_min = parseFloat(els.inputQ1Min.value) || -1.57;
        this.state.settings.limits.q1_max = parseFloat(els.inputQ1Max.value) || 1.57;
        this.state.settings.limits.q2_min = parseFloat(els.inputQ2Min.value) || -2.5;
        this.state.settings.limits.q2_max = parseFloat(els.inputQ2Max.value) || 2.5;

        // Callbacks
        if (this.callbacks.onResize) this.callbacks.onResize();
        if (this.callbacks.onValidateText) this.callbacks.onValidateText();
        if (this.callbacks.onPreviewTraj) this.callbacks.onPreviewTraj();
    }

    updateWorkspaceState() {
        const els = this.ui.elements;

        // Parse inputs
        const x = parseFloat(els.inputWsX.value) || 0.01;
        const y = parseFloat(els.inputWsY.value) || -0.18;
        const w = parseFloat(els.inputWsW.value) || 0.27;
        const h = parseFloat(els.inputWsH.value) || 0.36;

        // Update State
        if (this.state.settings.linearWorkspace) {
            this.state.settings.linearWorkspace.x = x;
            this.state.settings.linearWorkspace.y = y;
            this.state.settings.linearWorkspace.w = w;
            this.state.settings.linearWorkspace.h = h;
        }
    }
}
