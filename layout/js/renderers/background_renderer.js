
export class BackgroundRenderer {
    constructor(ctx, state) {
        this.ctx = ctx;
        this.state = state;
    }

    draw(width, height, workspaceRadius) {
        const ctx = this.ctx;
        const origin = this.state.settings.origin;

        // Clear
        ctx.clearRect(0, 0, width, height);

        // --- Workspace Limits ---
        const radius = workspaceRadius || (height / 2);

        // 1. Draw Accurate Reachable Workspace
        const limits = this.state.settings.limits;
        const mp = this.state.settings.m_p;
        const l1 = this.state.settings.l1;
        const l2 = this.state.settings.l2;

        if (limits) {
            // A. Sweep Fill (Robust to folds/singularities)
            const sweepSteps = 60;
            const q1_step = (limits.q1_max - limits.q1_min) / sweepSteps;

            ctx.strokeStyle = 'rgba(80, 80, 80, 0.15)';
            ctx.lineWidth = 4;

            for (let i = 0; i <= sweepSteps; i++) {
                const q1 = limits.q1_min + i * q1_step;

                // Elbow position in Canvas Frame
                const ex = origin.x + (l1 * Math.cos(q1)) / mp;
                const ey = origin.y - (l1 * Math.sin(q1)) / mp;

                // Radius in pixels
                const r_pix = l2 / mp;

                // Draw arc for q2 range
                const a1 = -(q1 + limits.q2_min);
                const a2 = -(q1 + limits.q2_max);

                ctx.beginPath();
                ctx.arc(ex, ey, r_pix, a1, a2, true);
                ctx.stroke();
            }

            // B. Draw Wireframe Boundaries
            ctx.lineWidth = 1;

            const drawCurve = (start, end, func, color, setDash = []) => {
                ctx.beginPath();
                ctx.strokeStyle = color;
                ctx.setLineDash(setDash);
                const segs = 50;
                for (let i = 0; i <= segs; i++) {
                    const t = start + (end - start) * (i / segs);
                    const p = func(t);
                    if (i === 0) ctx.moveTo(p.x, p.y);
                    else ctx.lineTo(p.x, p.y);
                }
                ctx.stroke();
                ctx.setLineDash([]);
            };

            // 1. q2 limits (Inner/Outer Curves) - Blueish
            drawCurve(limits.q1_min, limits.q1_max, (t) => this.getFK(t, limits.q2_min), '#00bcd4');
            drawCurve(limits.q1_min, limits.q1_max, (t) => this.getFK(t, limits.q2_max), '#00bcd4');

            // 2. q1 limits (Radial Sides) - Reddish
            drawCurve(limits.q2_min, limits.q2_max, (t) => this.getFK(limits.q1_min, t), '#ff5252');
            drawCurve(limits.q2_min, limits.q2_max, (t) => this.getFK(limits.q1_max, t), '#ff5252');

            // 3. Max Reach Singularity (q2 = 0)
            if (limits.q2_min <= 0 && limits.q2_max >= 0) {
                drawCurve(limits.q1_min, limits.q1_max, (t) => this.getFK(t, 0), '#777', [5, 5]);
            }

        } else {
            // Fallback
            ctx.beginPath();
            const innerR_m_limit = 0.15;
            const outerR_m_limit = 0.328;
            const mp_limit = this.state.settings.m_p;

            // Normalize radius to be positive
            const r_out = Math.abs(outerR_m_limit / mp_limit);
            const r_in = Math.abs(innerR_m_limit / mp_limit);

            ctx.arc(origin.x, origin.y, r_out, 0, 2 * Math.PI);
            ctx.strokeStyle = '#333';
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(origin.x, origin.y, r_in, 0, 2 * Math.PI);
            ctx.strokeStyle = '#333';
            ctx.setLineDash([5, 5]);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Axis Lines
        ctx.beginPath();
        ctx.strokeStyle = '#404040';
        ctx.moveTo(0, origin.y);
        ctx.lineTo(width, origin.y);
        ctx.moveTo(origin.x, 0);
        ctx.lineTo(origin.x, height);
        ctx.stroke();

        // Mode-Specific Background
        if (this.state.majorMode === 'text') {
            // Green Rect (The Sheet)
            ctx.fillStyle = 'rgba(0, 200, 81, 0.3)'; // Green transparent
            ctx.strokeStyle = '#00c851';

            // Get from State
            const ws = this.state.settings.linearWorkspace || { x: 0.15, y: -0.15, w: 0.20, h: 0.30 };
            const mp = this.state.settings.m_p;

            const x1 = ws.x / mp;
            const y1 = ws.y / mp;

            const w_pix = ws.w / mp;
            const h_pix = ws.h / mp;

            const rx = origin.x + x1;
            const ry = origin.y - (ws.y + ws.h) / mp;

            ctx.fillRect(rx, ry, w_pix, h_pix);
            ctx.strokeRect(rx, ry, w_pix, h_pix);
        }

        // Axis Lines (Repeated? Original code repeated it)
        ctx.beginPath();
        ctx.strokeStyle = '#404040';
        ctx.moveTo(0, origin.y);
        ctx.lineTo(width, origin.y);
        ctx.moveTo(origin.x, 0);
        ctx.lineTo(origin.x, height);
        ctx.stroke();
    }

    getFK(q1, q2) {
        const l1 = this.state.settings.l1;
        const l2 = this.state.settings.l2;
        const origin = this.state.settings.origin;
        const mp = this.state.settings.m_p;

        const x = l1 * Math.cos(q1) + l2 * Math.cos(q1 + q2);
        const y = l1 * Math.sin(q1) + l2 * Math.sin(q1 + q2);

        // Convert key points to Canvas Coords
        // Canvas Y is DOWN, World Y is UP.
        return {
            x: origin.x + x / mp,
            y: origin.y - y / mp
        };
    }
}
