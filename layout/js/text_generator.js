import { API } from './api.js';
import { Point } from './utils.js';
import { TOOLS } from './state.js';

export class TextGenerator {
    constructor(ui, state, onUpdatePreview) {
        this.ui = ui;
        this.state = state;
        this.onUpdatePreview = onUpdatePreview; // Callback to refresh visuals

        this.debounceTimer = null;
        this.initListeners();
    }

    initListeners() {
        const els = this.ui.elements;

        // Mode switching
        els.btnModeLinear.addEventListener('click', () => this.setTextMode('linear'));
        els.btnModeCurved.addEventListener('click', () => this.setTextMode('curved'));

        // Validation & Preview Triggers
        const inputs = [
            els.inputText,
            els.inputFontSize,
            els.inputLinX, els.inputLinY, els.inputLinAngle,
            els.inputCurvRadius, els.inputCurvOffset,
            els.inputWsX, els.inputWsY, els.inputWsW, els.inputWsH
        ];

        inputs.forEach(el => {
            if (el) el.addEventListener('input', () => {
                this.validateText();
                this.debouncedGeneratePreview();
            });
        });

        // Clean
        els.btnClean.addEventListener('click', () => this.clean());
    }

    loadDefaults(config) {
        if (!config || !config.text_options) return;

        const opts = config.text_options;
        const els = this.ui.elements;

        if (opts.fontSize) els.inputFontSize.value = opts.fontSize;
        if (opts.x) els.inputLinX.value = opts.x;
        if (opts.y) els.inputLinY.value = opts.y;
        if (opts.angle) els.inputLinAngle.value = opts.angle;
        if (opts.radius) els.inputCurvRadius.value = opts.radius;
        if (opts.offset) els.inputCurvOffset.value = opts.offset;

        // Also set mode if needed, but let's stick to default linear
        if (opts.mode) this.setTextMode(opts.mode);
    }

    setTextMode(mode) {
        this.state.textMode = mode;
        this.ui.setTextMode(mode);
        this.validateText();
        this.generatePreview();
    }

    getTextOptions() {
        const els = this.ui.elements;
        return {
            mode: this.state.textMode,
            fontSize: parseFloat(els.inputFontSize.value) || 0.05,
            x: parseFloat(els.inputLinX.value) || 0.05,
            y: parseFloat(els.inputLinY.value) || 0.0,
            angle: parseFloat(els.inputLinAngle.value) || 0,
            radius: parseFloat(els.inputCurvRadius.value) || 0.2,
            offset: parseFloat(els.inputCurvOffset.value) || 90
        };
    }

    async validateText() {
        const text = this.ui.elements.inputText.value;
        if (!text) {
            this.ui.toggleWarning(false);
            return;
        }

        const options = this.getTextOptions();
        const result = await API.validateText(text, options, this.state.settings);

        if (result.valid) {
            this.ui.toggleWarning(false);
        } else {
            this.ui.toggleWarning(true, result.message || "Text exceeds workspace!");
        }
    }

    debouncedGeneratePreview() {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => this.generatePreview(), 500);
    }

    async generatePreview() {
        const text = this.ui.elements.inputText.value;
        if (!text) {
            this.clearPreviewState();
            this.validateText();
            return;
        }

        const options = this.getTextOptions();

        try {
            const patches = await API.generateText(text, options, this.state.settings);

            this.state.textPreview = patches || [];
            this.state.generatedTextPatches = patches || [];

            this.syncTrajectoryFromPreview();

            this.validateText();
            if (this.onUpdatePreview) this.onUpdatePreview();

        } catch (e) {
            console.error("Preview Generation Error:", e);
        }
    }

    syncTrajectoryFromPreview() {
        // Sync Internal Trajectory for Sending
        this.state.points = [];
        this.state.trajectory.reset();
        this.state.trajectory.data = [];

        if (this.state.textPreview.length > 0) {
            this.state.textPreview.forEach(patch => {
                if (patch.type === 'line') {
                    // Create Point instances
                    // dummy points
                    const p0 = new Point(0, 0, this.state.settings);
                    p0.actX = patch.points[0][0];
                    p0.actY = patch.points[0][1];

                    const p1 = new Point(0, 0, this.state.settings);
                    p1.actX = patch.points[1][0];
                    p1.actY = patch.points[1][1];

                    this.state.trajectory.data.push({
                        type: 'line',
                        data: [p0, p1, patch.data.penup]
                    });
                }
            });
        }
    }

    async clean() {
        this.ui.elements.inputText.value = "";
        this.clearPreviewState();

        // Also clear backend
        await API.stopTrajectory();
        if (API.clearState) API.clearState();

        this.ui.toggleWarning(false);
        if (this.onUpdatePreview) this.onUpdatePreview();
    }

    clearPreviewState() {
        this.state.textPreview = [];
        this.state.generatedTextPatches = [];
        this.state.resetDrawing();
        this.state.sentPoints = [];
        this.state.sentTrajectory.reset();
    }
}
