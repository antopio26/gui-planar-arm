
export class TimePlotVisualizer {
    constructor(q1Canvas, q2Canvas, state) {
        this.q1Canvas = q1Canvas;
        this.q2Canvas = q2Canvas;
        this.state = state;

        this.ctx1 = q1Canvas.getContext('2d');
        this.ctx2 = q2Canvas.getContext('2d');

        // Data Storage
        // Planned: { ts: [], q1: [], q2: [] }
        this.plannedPath = null;

        // Real: { ts: [], q1: [], q2: [] }
        // We accumulate real data over time.
        this.traceData = { ts: [], q1: [], q2: [] };

        // Settings
        this.padding = 40;
        this.timeWindow = 10.0; // Seconds to show
        this.currentTime = 0;   // Current Simulation Time

        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.animate();
    }

    resize() {
        // Resize Q1 Canvas
        this.resizeCanvas(this.q1Canvas, this.ctx1);
        // Resize Q2 Canvas
        this.resizeCanvas(this.q2Canvas, this.ctx2);
    }

    resizeCanvas(canvas, ctx) {
        const parent = canvas.parentElement;
        const width = parent.clientWidth;
        const height = parent.clientHeight;
        const dpr = window.devicePixelRatio || 1;

        if (canvas.width === width * dpr && canvas.height === height * dpr) return;

        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
    }

    setPlannedPath(ts, q1s, q2s) {
        this.plannedPath = { ts, q1: q1s, q2: q2s };
        // Determine total time for windowing? 
        // Or just let it scroll?
        // If we have a planned path, maybe we want to fit it?
        if (ts.length > 0) {
            this.timeWindow = Math.max(10, ts[ts.length - 1] * 1.2);
        }
    }

    addTrace(t, q1, q2) {
        this.traceData.ts.push(t);
        this.traceData.q1.push(q1);
        this.traceData.q2.push(q2);
        this.currentTime = t;
    }

    clearTrace() {
        this.traceData = { ts: [], q1: [], q2: [] };
        this.currentTime = 0;
    }

    // Generic Plot Function
    drawPlot(ctx, width, height, dataKey, limitMin, limitMax, color, label, traceColor = '#00e5ff') {
        ctx.clearRect(0, 0, width, height);

        // Grid & Axis
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#333';
        ctx.beginPath();

        // Y-Axis mapping
        // Value -> Y Pixel
        const mapY = (val) => {
            const range = limitMax - limitMin;
            const norm = (val - limitMin) / range;
            return height - (this.padding + norm * (height - 2 * this.padding));
        };

        // X-Axis mapping (Time)
        // Time -> X Pixel
        const mapX = (t) => {
            const tEnd = Math.max(this.timeWindow, this.currentTime);
            const tStart = 0; // Fixed start for now, or scrolling window?
            // Let's do fixed start 0 for simplicity if planned path exists.

            const range = tEnd - tStart;
            return this.padding + (t / range) * (width - 2 * this.padding);
        };

        // Draw Limits (Horizontal)
        const yMin = mapY(limitMin);
        const yMax = mapY(limitMax);

        // Draw Zero Line
        if (limitMin < 0 && limitMax > 0) {
            const y0 = mapY(0);
            ctx.strokeStyle = '#444';
            ctx.setLineDash([2, 4]);
            ctx.beginPath();
            ctx.moveTo(this.padding, y0);
            ctx.lineTo(width - this.padding, y0);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // --- PLANNED PATH (Gray Dashed) ---
        if (this.plannedPath && this.plannedPath.ts.length > 0) {
            ctx.beginPath();
            ctx.strokeStyle = '#888888';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);

            const ts = this.plannedPath.ts;
            const vals = this.plannedPath[dataKey]; // q1 or q2

            for (let i = 0; i < ts.length; i++) {
                const x = mapX(ts[i]);
                const y = mapY(vals[i]);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // --- REAL TRACE (Solid Trace Color) ---
        if (this.traceData.ts.length > 1) {
            ctx.beginPath();
            ctx.strokeStyle = traceColor; // Use passed color
            ctx.lineWidth = 2;

            const ts = this.traceData.ts;
            const vals = this.traceData[dataKey];

            for (let i = 0; i < ts.length; i++) {
                const x = mapX(ts[i]);
                const y = mapY(vals[i]); // Should clamp?
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }

        // Draw Labels
        ctx.fillStyle = '#aaa';
        ctx.textAlign = 'left';
        ctx.font = '12px Inter';
        ctx.fillText(label, this.padding, 22);

        ctx.textAlign = 'right';
        ctx.fillStyle = color; // Limit color
        ctx.fillText(limitMax.toFixed(2), this.padding - 5, yMax + 4);
        ctx.fillText(limitMin.toFixed(2), this.padding - 5, yMin + 4);

        // Draw Limits Lines
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        // Max Line
        ctx.moveTo(this.padding, yMax);
        ctx.lineTo(width - this.padding, yMax);
        // Min Line
        ctx.moveTo(this.padding, yMin);
        ctx.lineTo(width - this.padding, yMin);
        ctx.stroke();
    }

    animate() {
        if (!this.q1Canvas.offsetParent && !this.q2Canvas.offsetParent) {
            requestAnimationFrame(() => this.animate());
            return;
        }

        // Draw Q1
        const w1 = parseFloat(this.q1Canvas.style.width);
        const h1 = parseFloat(this.q1Canvas.style.height);
        const lim = this.state.settings.limits;

        // Use Red (#ff5252) for both limits and trace
        this.drawPlot(this.ctx1, w1, h1, 'q1', lim.q1_min, lim.q1_max, '#ff5252', 'Shoulder Joint (q1)', '#ff5252');

        // Draw Q2
        const w2 = parseFloat(this.q2Canvas.style.width);
        const h2 = parseFloat(this.q2Canvas.style.height);
        // Use Cyan (#00bcd4) for both limits and trace
        this.drawPlot(this.ctx2, w2, h2, 'q2', lim.q2_min, lim.q2_max, '#00bcd4', 'Elbow Joint (q2)', '#00bcd4');

        requestAnimationFrame(() => this.animate());
    }
}
