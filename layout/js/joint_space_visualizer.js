export class JointSpaceVisualizer {
    constructor(canvas, state) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.ctx.lineJoin = 'round';
        this.ctx.lineCap = 'round';
        this.state = state;

        this.trajectoryData = null; // { q1: [], q2: [] } (Planned)
        this.traceData = { q1: [], q2: [] }; // (Executed/Real-time)

        // Try to resize immediately, but if hidden it might be 0.
        // The TabManager will trigger another resize when shown.
        this.resize();
        window.addEventListener('resize', () => this.resize());

        this.animate();
    }

    resize() {
        const parent = this.canvas.parentElement;
        const width = parent.clientWidth;
        const height = parent.clientHeight;

        const size = Math.max(100, Math.min(width, height) - 20); // Minimum size guard
        const dpr = window.devicePixelRatio || 1;

        if (this.canvas.width === size * dpr && this.canvas.height === size * dpr) return;

        this.canvas.width = size * dpr;
        this.canvas.height = size * dpr;
        this.ctx.scale(dpr, dpr);

        this.canvas.style.width = size + 'px';
        this.canvas.style.height = size + 'px';

        this.padding = 60;
        this.graphWidth = Math.max(10, size - this.padding * 2);
        this.graphHeight = Math.max(10, size - this.padding * 2);
    }

    setTrajectoryData(q1s, q2s) {
        this.trajectoryData = { q1: q1s, q2: q2s };
    }

    addTrace(q1, q2, penState = 0) {
        if (q1 === undefined || q2 === undefined || isNaN(q1) || isNaN(q2)) {
            console.warn("Invalid trace point received:", q1, q2);
            return;
        }
        this.traceData.q1.push(q1);
        this.traceData.q2.push(q2);
        // Store pen state in separate array (or struct, but let's add array)
        if (!this.traceData.pen) this.traceData.pen = [];
        this.traceData.pen.push(penState);

        // Limit trace size to avoid performance issues
        if (this.traceData.q1.length > 5000) {
            this.traceData.q1.shift();
            this.traceData.q2.shift();
            this.traceData.pen.shift();
        }
    }

    clearTrace() {
        this.traceData = { q1: [], q2: [], pen: [] };
    }

    // Coordinate Transform: Joint Space -> Canvas Pixels
    toCanvas(q1, q2, limits) {
        const q1Range = limits.q1_max - limits.q1_min;
        const q2Range = limits.q2_max - limits.q2_min;

        // Clamp for safety
        const q1c = Math.max(limits.q1_min, Math.min(limits.q1_max, q1));
        const q2c = Math.max(limits.q2_min, Math.min(limits.q2_max, q2));

        const x = this.padding + ((q1c - limits.q1_min) / q1Range) * this.graphWidth;
        const y = (this.padding + this.graphHeight) - ((q2c - limits.q2_min) / q2Range) * this.graphHeight;

        return { x, y };
    }

    drawBackground() {
        const width = parseFloat(this.canvas.style.width);
        const height = parseFloat(this.canvas.style.height);

        this.ctx.clearRect(0, 0, width, height);
        const limits = this.state.settings.limits || { q1_min: -1.57, q1_max: 1.57, q2_min: -2.5, q2_max: 2.5 };

        // Draw Colored Limits Box
        // q1 limits (Vertical lines) -> Red (#ff5252)
        // q2 limits (Horizontal lines) -> Cyan (#00bcd4)

        const pMin = this.toCanvas(limits.q1_min, limits.q2_min, limits);
        const pMax = this.toCanvas(limits.q1_max, limits.q2_max, limits);

        const left = pMin.x;
        const right = pMax.x;
        const bottom = pMin.y;
        const top = pMax.y;

        // Grid System
        this.ctx.lineWidth = 1;
        this.ctx.strokeStyle = '#333';
        this.ctx.beginPath();
        // Zero axes
        if (limits.q1_min < 0 && limits.q1_max > 0) {
            const p0 = this.toCanvas(0, limits.q2_min, limits);
            const p1 = this.toCanvas(0, limits.q2_max, limits);
            this.ctx.moveTo(p0.x, bottom); this.ctx.lineTo(p1.x, top);
        }
        if (limits.q2_min < 0 && limits.q2_max > 0) {
            const p0 = this.toCanvas(limits.q1_min, 0, limits);
            const p1 = this.toCanvas(limits.q1_max, 0, limits);
            this.ctx.moveTo(left, p0.y); this.ctx.lineTo(right, p0.y);
        }
        this.ctx.stroke();

        // Workspace Limits (Colored)
        this.ctx.lineWidth = 3;

        // Top (q2 Max) - Cyan
        this.ctx.beginPath();
        this.ctx.strokeStyle = '#00bcd4';
        this.ctx.moveTo(left, top);
        this.ctx.lineTo(right, top);
        this.ctx.stroke();

        // Bottom (q2 Min) - Cyan
        this.ctx.beginPath();
        this.ctx.strokeStyle = '#00bcd4';
        this.ctx.moveTo(left, bottom);
        this.ctx.lineTo(right, bottom);
        this.ctx.stroke();

        // Left (q1 Min) - Red
        this.ctx.beginPath();
        this.ctx.strokeStyle = '#ff5252';
        this.ctx.moveTo(left, top);
        this.ctx.lineTo(left, bottom);
        this.ctx.stroke();

        // Right (q1 Max) - Red
        this.ctx.beginPath();
        this.ctx.strokeStyle = '#ff5252';
        this.ctx.moveTo(right, top);
        this.ctx.lineTo(right, bottom);
        this.ctx.stroke();

        // Labels
        this.ctx.fillStyle = '#888';
        this.ctx.font = '12px Inter';
        this.ctx.textAlign = 'center';
        this.ctx.fillText("Shoulder Joint (q1)", this.padding + this.graphWidth / 2, height - 10);

        this.ctx.save();
        this.ctx.translate(15, this.padding + this.graphHeight / 2);
        this.ctx.rotate(-Math.PI / 2);
        this.ctx.textAlign = 'center';
        this.ctx.fillText("Elbow Joint (q2)", 0, 0);
        this.ctx.restore();

        // Min/Max Text
        this.ctx.textAlign = 'center';
        this.ctx.fillStyle = '#ff5252';
        this.ctx.fillText(limits.q1_min.toFixed(2), this.padding, height - 20);
        this.ctx.fillText(limits.q1_max.toFixed(2), width - this.padding, height - 20);

        this.ctx.textAlign = 'right';
        this.ctx.fillStyle = '#00bcd4';
        this.ctx.fillText(limits.q2_max.toFixed(2), this.padding - 10, this.padding + 5);
        this.ctx.fillText(limits.q2_min.toFixed(2), this.padding - 10, height - this.padding + 5);
    }

    drawTrajectory() {
        const limits = this.state.settings.limits;

        // 1. Draw Executed Trace (Real-time)
        if (this.traceData.q1.length > 1) {
            const q1s = this.traceData.q1;
            const q2s = this.traceData.q2;
            const pens = this.traceData.pen || new Array(q1s.length).fill(0); // Default 0 (Down)

            this.ctx.lineWidth = 2; // Prominent

            let currentState = pens[0];
            this.ctx.beginPath();
            this.startSegmentStyle(this.ctx, currentState);

            let p = this.toCanvas(q1s[0], q2s[0], limits);
            this.ctx.moveTo(p.x, p.y);

            for (let i = 1; i < q1s.length; i++) {
                p = this.toCanvas(q1s[i], q2s[i], limits);

                if (pens[i] !== currentState) {
                    this.ctx.lineTo(p.x, p.y);
                    this.ctx.stroke();

                    currentState = pens[i];
                    this.ctx.beginPath();
                    this.startSegmentStyle(this.ctx, currentState);
                    this.ctx.moveTo(p.x, p.y);
                } else {
                    this.ctx.lineTo(p.x, p.y);
                }
            }
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }

        // 2. Draw Planned Trajectory (Preview) - GRAY DASHED THIN
        if (this.trajectoryData && this.trajectoryData.q1.length) {
            this.ctx.beginPath();
            this.ctx.strokeStyle = '#888888'; // Gray
            this.ctx.lineWidth = 1; // Thin/Smaller
            this.ctx.setLineDash([4, 4]); // Dashed

            const q1s = this.trajectoryData.q1;
            const q2s = this.trajectoryData.q2;

            for (let i = 0; i < q1s.length; i++) {
                const p = this.toCanvas(q1s[i], q2s[i], limits);
                if (i === 0) this.ctx.moveTo(p.x, p.y);
                else this.ctx.lineTo(p.x, p.y);
            }
            this.ctx.stroke();
            this.ctx.setLineDash([]); // Reset
        }
    }

    startSegmentStyle(ctx, penState) {
        if (penState === 1) { // Up
            ctx.strokeStyle = '#ffbb33'; // Orange
            ctx.setLineDash([5, 5]);
        } else { // Down (0)
            ctx.strokeStyle = '#ffffff'; // White
            ctx.setLineDash([]);
        }
    }

    drawRobotState() {
        if (!this.state.manipulator) return;
        const [q1, q2] = this.state.manipulator.q;
        const limits = this.state.settings.limits;

        const p = this.toCanvas(q1, q2, limits);

        // Draw Crosshairs
        this.ctx.beginPath();
        this.ctx.strokeStyle = 'rgba(255, 68, 68, 0.5)';
        this.ctx.setLineDash([2, 4]);
        this.ctx.moveTo(p.x, this.padding);
        this.ctx.lineTo(p.x, this.padding + this.graphHeight); // Vert
        this.ctx.moveTo(this.padding, p.y);
        this.ctx.lineTo(this.padding + this.graphWidth, p.y); // Horiz
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        // Draw Dot
        this.ctx.beginPath();
        this.ctx.fillStyle = '#ff4444'; // Red
        this.ctx.arc(p.x, p.y, 6, 0, 2 * Math.PI);
        this.ctx.fill();
        this.ctx.stroke();

        // Draw Coordinates Text
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '12px monospace';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`(${q1.toFixed(2)}, ${q2.toFixed(2)})`, p.x + 10, p.y - 10);
    }

    animate() {
        // Only draw if visible to save resources
        if (this.canvas.offsetParent !== null) {
            const parent = this.canvas.parentElement;
            // Check for size change
            if (Math.abs(parent.clientWidth - parseFloat(this.canvas.style.width)) > 1) {
                this.resize();
            }

            this.drawBackground();
            this.drawTrajectory();
            this.drawRobotState();
        }
        requestAnimationFrame(() => this.animate());
    }
}
