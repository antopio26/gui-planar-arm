import { Point, find_circ } from './utils.js';
import { appState, TOOLS } from './state.js';

export class CanvasHandler {
    constructor(canvas, state) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.state = state; // App State Singleton

        this.mouseX = 0;
        this.mouseY = 0;

        this.resize(); // Handle HiDPI scaling
        this.initEvents();
    }

    initEvents() {
        // Use arrow function to bind 'this'
        this.canvas.addEventListener('click', (e) => this.handleClick(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));

        // Listen for resize
        window.addEventListener('resize', () => this.resize());

        // Start Loop
        this.animate();
    }

    resize() {
        const parent = this.canvas.parentElement;
        const width = parent.clientWidth;
        const height = parent.clientHeight;

        // Canvas element size (fit container with small margin)
        const size = Math.min(width, height) - 20;

        const dpr = window.devicePixelRatio || 1;

        this.canvas.width = size * dpr;
        this.canvas.height = size * dpr;

        this.ctx.scale(dpr, dpr);

        this.canvas.style.width = size + 'px';
        this.canvas.style.height = size + 'px';

        // Internal Padding Logic
        const padding = 40; // Internal padding in pixels
        const usableSize = size - (padding * 2);
        const radius = usableSize / 2;

        // Update Origin to center
        this.state.settings.origin.x = size / 2;
        this.state.settings.origin.y = size / 2;

        // Scale: Robot diameter (0.328 * 2) -> Usable Diameter
        this.state.settings.m_p = (0.328 * 2) / usableSize;

        // Store visual radius for drawing
        this.workspaceRadius = radius;

        // Force Manipulator Re-calc
        if (this.state.manipulator) {
            this.state.manipulator.update();
        }

        // Force Trajectory Re-calc (Points & Curves)
        this.state.update();
    }


    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        this.mouseX = e.clientX - rect.left;
        this.mouseY = e.clientY - rect.top;
    }

    handleClick(e) {
        const x = this.mouseX;
        const y = this.mouseY;
        const settings = this.state.settings;

        // Radius check (workspace limit)
        const distSq = Math.pow(x - settings.origin.x, 2) + Math.pow(y - settings.origin.y, 2);
        const maxRadius = this.workspaceRadius || (this.canvas.height / 2); // Fallback

        if (distSq > maxRadius * maxRadius) return;

        // Clear sent data if new drawing starts
        if (this.state.points.length === 0 && this.state.sentPoints.length > 0) {
            this.state.sentPoints = [];
            this.state.sentTrajectory.reset();
        }

        // Pen Up Logic using ESC / Keyboard
        // If penUp is active, the NEXT click finishes the "move" (dashed line)
        // and starts the next "draw" (solid line).
        if (this.state.penUp) {
            // We have a start point (last point). Current click is end point.
            if (this.state.points.length > 0) {
                const p0 = this.state.points[this.state.points.length - 1]; // Last point
                const p1 = new Point(x, y, settings);

                // Add Dashed Line (Move)
                this.state.trajectory.add_line(p0, p1, true); // raised=true
                this.state.points.push(p1);

                // Disable Pen Up automatically
                this.state.penUp = false;

                // We are now at p1. Next moves will be standard tool (Line/Circle).
                // If Line tool, we need a start point for the preview... which is p1.
                // Reset circle def if any?
                this.state.circleDefinition = [];
            } else {
                // If no points yet, just move there?
                const p = new Point(x, y, settings);
                this.state.points.push(p);
                this.state.penUp = false;
            }
            return; // Handled
        }

        const currentTool = this.state.tool;

        if (currentTool === TOOLS.LINE) {
            this.state.circleDefinition = [];

            const newPoint = new Point(x, y, settings);
            this.state.points.push(newPoint);

            if (this.state.points.length > 1) {
                // Check if previous segment was penup?
                // Logic handles continuous lines.
                const p0 = this.state.points[this.state.points.length - 2];
                const p1 = this.state.points[this.state.points.length - 1];

                // Only add if not already added by penup logic (which we returned from)
                this.state.trajectory.add_line(p0, p1, false); // raised=false
            }

        } else if (currentTool === TOOLS.CIRCLE) {
            if (this.state.points.length === 0) {
                this.state.points.push(new Point(x, y, settings));
            } else {
                this.state.circleDefinition.push(new Point(x, y, settings));

                if (this.state.circleDefinition.length === 2) {
                    const params = find_circ(this.state.points, this.state.circleDefinition, settings);
                    this.state.trajectory.add_circle(
                        params.c, params.r, params.theta_0, params.theta_1,
                        false, params.a, params.p // raised=false
                    );

                    this.state.points.push(params.p);
                    this.state.circleDefinition = [];
                }
            }
        }

        if (this.state.manipulator) this.state.manipulator.reset_trace();
    }

    drawBackground() {
        const width = parseFloat(this.canvas.style.width);
        const height = parseFloat(this.canvas.style.height);

        const ctx = this.ctx;
        const origin = this.state.settings.origin;

        // Clear
        ctx.clearRect(0, 0, width, height);

        // --- Workspace Limits ---
        const radius = this.workspaceRadius || (height / 2);
        // origin already defined above

        // 1. Draw Accurate Reachable Workspace
        // 1. Draw Accurate Reachable Workspace (Robust Visualization)
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
                // Note: Canvas angles are inverted relative to world if Y is flipped?
                // World: Y up. Canvas: Y down.
                // Angle theta in world -> -theta in canvas.
                // Start Angle: -(q1 + q2_min)
                // End Angle: -(q1 + q2_max)
                // However, arc method takes start/end.

                const a1 = -(q1 + limits.q2_min);
                const a2 = -(q1 + limits.q2_max);

                ctx.beginPath();
                // Ensure counterclockwise is correct for the fill direction
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

            ctx.arc(origin.x, origin.y, outerR_m_limit / mp_limit, 0, 2 * Math.PI);
            ctx.strokeStyle = '#333';
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(origin.x, origin.y, innerR_m_limit / mp_limit, 0, 2 * Math.PI);
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
        // Only show GREEN Workspace Hints if in Text Mode
        if (this.state.majorMode === 'text') {
            // Always draw "Sheet" (Green Rectangle) regardless of mode (Linear/Curved)

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
            // Canvas Y is DOWN. 
            // We assume ws.y is bottom-left Y in world.
            // so top Y in canvas is origin.y - (ws.y + ws.h) / mp
            const ry = origin.y - (ws.y + ws.h) / mp;

            ctx.fillRect(rx, ry, w_pix, h_pix);
            ctx.strokeRect(rx, ry, w_pix, h_pix);
        }

        // Axis Lines
        ctx.beginPath();
        ctx.strokeStyle = '#404040';
        ctx.moveTo(0, origin.y);
        ctx.lineTo(width, origin.y);
        ctx.moveTo(origin.x, 0);
        ctx.lineTo(origin.x, height);
        ctx.stroke();
    }


    drawPoint(p, color = '#00e5ff') { // Default to accent color (cyan) for visibility
        this.ctx.beginPath();
        this.ctx.fillStyle = color;
        this.ctx.arc(p.relX, p.relY, 4, 0, 2 * Math.PI);
        this.ctx.fill();
    }

    drawToolPreview() {
        const ctx = this.ctx;
        const settings = this.state.settings;
        const points = this.state.points;
        // If Pen Up is active, do not show tool preview (it's confusing)
        // OR show a "Moving to..." dashed line?
        // User requested: "when pen up is enabled do not show the preview dashed line, 
        // show that only when the first point of the next line / curve is drawn"
        // Wait, "show that only when the first point... is drawn" refers to the DASHED line?
        // "leave the dash line on the canvas" (persisting).
        // "do not show the preview dashed line" (elastic band).
        if (this.state.penUp) return;

        // Draw Text Preview (Generated)
        if (this.state.textPreview && this.state.textPreview.length > 0) {
            const mp = this.state.settings.m_p;
            const origin = this.state.settings.origin;

            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;

            for (let patch of this.state.textPreview) {
                if (patch.type === 'line') {
                    const p0 = patch.points[0];
                    const p1 = patch.points[1];

                    // Convert world meters to canvas pixels
                    // x_pix = origin.x + x_m / mp
                    // y_pix = origin.y - y_m / mp (Y up in world, Down in canvas)

                    const x0 = origin.x + p0[0] / mp;
                    const y0 = origin.y - p0[1] / mp;
                    const x1 = origin.x + p1[0] / mp;
                    const y1 = origin.y - p1[1] / mp;

                    ctx.beginPath();
                    ctx.moveTo(x0, y0);
                    ctx.lineTo(x1, y1);
                    if (patch.data.penup) {
                        ctx.strokeStyle = 'rgba(255, 165, 0, 0.8)'; // Orange visible for jumps
                        ctx.setLineDash([5, 5]);
                        ctx.lineWidth = 1.5;
                    } else {
                        ctx.strokeStyle = '#ffffff';
                        ctx.setLineDash([]);
                        ctx.lineWidth = 2.0;
                    }
                    ctx.stroke();
                }
            }
            ctx.setLineDash([]);
        }

        if (points.length === 0) return;
        const lastP = points[points.length - 1];

        if (this.state.tool === TOOLS.LINE) {
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.setLineDash([5, 5]);
            ctx.lineWidth = 2;
            ctx.moveTo(lastP.relX, lastP.relY);
            ctx.lineTo(this.mouseX, this.mouseY);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        else if (this.state.tool === TOOLS.CIRCLE) {
            const m = new Point(this.mouseX, this.mouseY, settings);
            const a = lastP;

            if (this.state.circleDefinition.length === 0) {
                // Defining Diameter
                const c = a.add(m.sub(a).scale(0.5));
                const r = m.sub(a).mag() / 2;

                ctx.beginPath();
                ctx.strokeStyle = 'rgba(0, 229, 255, 0.5)';
                ctx.lineWidth = 1;
                ctx.setLineDash([5, 5]);
                ctx.arc(c.relX, c.relY, r, 0, 2 * Math.PI);
                ctx.stroke();
                ctx.setLineDash([]);
            }
            else if (this.state.circleDefinition.length === 1) {
                // Defining Arc End
                const mockCircleDef = [this.state.circleDefinition[0], m];
                const params = find_circ(points, mockCircleDef, settings);

                // Draw the dashed arc
                ctx.beginPath();
                ctx.strokeStyle = 'rgba(0, 229, 255, 0.8)';
                ctx.lineWidth = 2;
                ctx.setLineDash([5, 5]);

                const A = params.theta_0 > params.theta_1;
                const B = Math.abs(params.theta_1 - params.theta_0) < Math.PI;
                const ccw = (!A && !B) || (A && B);

                ctx.arc(params.c.relX, params.c.relY, params.r, params.theta_0, params.theta_1, ccw);
                ctx.stroke();
                ctx.setLineDash([]);

                // Phantom full circle
                ctx.beginPath();
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
                ctx.lineWidth = 1;
                ctx.arc(params.c.relX, params.c.relY, params.r, 0, 2 * Math.PI);
                ctx.stroke();

                // Radius Line Indicator (Center to Mouse)
                ctx.beginPath();
                ctx.moveTo(params.c.relX, params.c.relY);
                ctx.lineTo(this.mouseX, this.mouseY);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
                ctx.setLineDash([2, 2]);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }
    }

    animate() {
        const ctx = this.ctx;
        const width = parseFloat(this.canvas.style.width); // Use scaled size
        const height = parseFloat(this.canvas.style.height);

        // Clear entire canvas for redraw
        ctx.clearRect(0, 0, width, height);

        this.drawBackground();

        // Draw Sent Data (Ghost)
        if (this.state.sentTrajectory) this.state.sentTrajectory.draw(ctx);
        for (let p of this.state.sentPoints) this.drawPoint(p, '#666666');

        // Draw Current Data
        if (this.state.trajectory) this.state.trajectory.draw(ctx);
        for (let p of this.state.points) this.drawPoint(p);

        // Draw Manipulator
        if (this.state.manipulator) {
            // Check Pen State (inverse of penUp)
            const isPenDown = !this.state.penUp;
            this.state.manipulator.draw_pose(ctx, isPenDown);
            // this.state.manipulator.draw_traces(ctx); // Performance heavy
        }

        // Tool Preview
        this.drawToolPreview();

        requestAnimationFrame(() => this.animate());
    }

    // Helper for Workspace Visualization
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
