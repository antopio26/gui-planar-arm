export class JointSpaceVisualizer {
    constructor(canvas, state) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.state = state;

        this.trajectoryData = null; // { q1: [], q2: [] }

        this.resize();
        window.addEventListener('resize', () => this.resize());

        this.animate();
    }

    resize() {
        const parent = this.canvas.parentElement;
        // If parent is hidden (display:none), these might be 0.
        // But we handle that in animate or by checking visibility.
        // For now, assume it might be resized when visible.
        const width = parent.clientWidth || 700;
        const height = parent.clientHeight || 700;

        const size = Math.min(width, height) - 20;
        const dpr = window.devicePixelRatio || 1;

        this.canvas.width = size * dpr;
        this.canvas.height = size * dpr;
        this.ctx.scale(dpr, dpr);

        this.canvas.style.width = size + 'px';
        this.canvas.style.height = size + 'px';

        // Padding for axes
        this.padding = 60;
        this.graphWidth = size - this.padding * 2;
        this.graphHeight = size - this.padding * 2;
    }

    setTrajectoryData(q1s, q2s) {
        this.trajectoryData = { q1: q1s, q2: q2s };
    }

    // Coordinate Transform: Joint Space -> Canvas Pixels
    toCanvas(q1, q2, limits) {
        // Map q1 [min, max] -> x [padding, padding + width]
        // Map q2 [min, max] -> y [padding + height, padding] (Y inverted)

        const q1Range = limits.q1_max - limits.q1_min;
        const q2Range = limits.q2_max - limits.q2_min;

        const x = this.padding + ((q1 - limits.q1_min) / q1Range) * this.graphWidth;
        const y = (this.padding + this.graphHeight) - ((q2 - limits.q2_min) / q2Range) * this.graphHeight;

        return { x, y };
    }

    drawBackground() {
        const width = parseFloat(this.canvas.style.width);
        const height = parseFloat(this.canvas.style.height);

        // Clear
        this.ctx.clearRect(0, 0, width, height);

        // Draw Axes
        const limits = this.state.settings.limits || { q1_min: -1.57, q1_max: 1.57, q2_min: -2.5, q2_max: 2.5 };

        // Border
        this.ctx.strokeStyle = '#444';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(this.padding, this.padding, this.graphWidth, this.graphHeight);

        // Grid (Optional)
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 1;

        // Center Lines (0,0) if visible
        if (limits.q1_min < 0 && limits.q1_max > 0) {
            const p0 = this.toCanvas(0, limits.q2_min, limits);
            const p1 = this.toCanvas(0, limits.q2_max, limits);
            this.ctx.beginPath();
            this.ctx.moveTo(p0.x, p0.y);
            this.ctx.lineTo(p1.x, p1.y);
            this.ctx.stroke();
        }
        if (limits.q2_min < 0 && limits.q2_max > 0) {
            const p0 = this.toCanvas(limits.q1_min, 0, limits);
            const p1 = this.toCanvas(limits.q1_max, 0, limits);
            this.ctx.beginPath();
            this.ctx.moveTo(p0.x, p0.y);
            this.ctx.lineTo(p1.x, p1.y);
            this.ctx.stroke();
        }

        // Labels
        this.ctx.fillStyle = '#888';
        this.ctx.textAlign = 'center';
        this.ctx.fillText("q1 (rad)", this.padding + this.graphWidth / 2, height - 10);

        this.ctx.save();
        this.ctx.translate(20, this.padding + this.graphHeight / 2);
        this.ctx.rotate(-Math.PI / 2);
        this.ctx.textAlign = 'center';
        this.ctx.fillText("q2 (rad)", 0, 0);
        this.ctx.restore();

        // Min/Max Text
        this.ctx.textAlign = 'center';
        this.ctx.fillText(limits.q1_min.toFixed(2), this.padding, height - 20);
        this.ctx.fillText(limits.q1_max.toFixed(2), width - this.padding, height - 20);

        this.ctx.textAlign = 'right';
        this.ctx.fillText(limits.q2_max.toFixed(2), this.padding - 10, this.padding + 5);
        this.ctx.fillText(limits.q2_min.toFixed(2), this.padding - 10, height - this.padding + 5);
    }

    drawTrajectory() {
        if (!this.trajectoryData || !this.trajectoryData.q1.length) return;

        const limits = this.state.settings.limits;
        const q1s = this.trajectoryData.q1;
        const q2s = this.trajectoryData.q2;

        this.ctx.beginPath();
        this.ctx.strokeStyle = '#00e5ff'; // Cyan
        this.ctx.lineWidth = 2;

        for (let i = 0; i < q1s.length; i++) {
            const p = this.toCanvas(q1s[i], q2s[i], limits);
            if (i === 0) this.ctx.moveTo(p.x, p.y);
            else this.ctx.lineTo(p.x, p.y);
        }
        this.ctx.stroke();
    }

    drawRobotState() {
        if (!this.state.manipulator) return;
        const [q1, q2] = this.state.manipulator.q;
        const limits = this.state.settings.limits;

        const p = this.toCanvas(q1, q2, limits);

        // Draw Dot
        this.ctx.beginPath();
        this.ctx.fillStyle = '#ff4444'; // Red
        this.ctx.arc(p.x, p.y, 6, 0, 2 * Math.PI);
        this.ctx.fill();

        // Draw Coordinates Text
        this.ctx.fillStyle = '#fff';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`(${q1.toFixed(2)}, ${q2.toFixed(2)})`, p.x + 10, p.y - 10);
    }

    animate() {
        // Only draw if visible to save resources
        if (this.canvas.offsetParent !== null) {
            // Check for size change (hacky but effective for tab switches)
            const parent = this.canvas.parentElement;
            if (parent.clientWidth !== parseFloat(this.canvas.style.width)) {
                this.resize();
            }

            this.drawBackground();
            this.drawTrajectory();
            this.drawRobotState();
        }
        requestAnimationFrame(() => this.animate());
    }
}
