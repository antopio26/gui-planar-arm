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
        // Get the display size
        const parent = this.canvas.parentElement;
        const width = parent.clientWidth;
        const height = parent.clientHeight;

        // Add more padding as requested
        const size = Math.min(width, height) - 60; // Increased margin

        const dpr = window.devicePixelRatio || 1;

        // Set actual size in memory (scaled to account for extra pixel density)
        this.canvas.width = size * dpr;
        this.canvas.height = size * dpr;

        // Scale the drawing context so everything behaves close to 1:1 units
        this.ctx.scale(dpr, dpr);

        // Set visible size
        this.canvas.style.width = size + 'px';
        this.canvas.style.height = size + 'px';

        // Update state settings for the new dimensions
        // Note: The app logic relies on canvas dimensions for origin calculation
        this.state.settings.origin.x = size / 2;
        this.state.settings.origin.y = size / 2;
        this.state.settings.m_p = (0.328 * 2) / size;
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

        // Validation: Ignore clicks on left side (reserved?) or outside workspace
        // Original logic: if(x < width/2) return; -> Removed this restriction? 
        // Logic: The original code logic was `if(x < input_canvas.width/2) return;`
        // Let's keep it if the workspace is strictly on the right.
        // Actually, with the new UI, let's allow drawing anywhere inside the valid workspace radius.

        const width = parseFloat(this.canvas.style.width);
        const height = parseFloat(this.canvas.style.height);

        // Radius check (workspace limit)
        const distSq = Math.pow(x - settings.origin.x, 2) + Math.pow(y - settings.origin.y, 2);
        const maxRadius = height / 2;
        if (distSq > maxRadius * maxRadius) return;

        // Clear sent data if new drawing starts
        if (this.state.points.length === 0 && this.state.sentPoints.length > 0) {
            this.state.sentPoints = [];
            this.state.sentTrajectory.reset();
        }

        const currentTool = this.state.tool;
        const n = this.state.points.length;

        if (currentTool === TOOLS.LINE) {
            this.state.circleDefinition = [];

            const newPoint = new Point(x, y, settings);
            this.state.points.push(newPoint);

            if (this.state.points.length > 1) {
                const p0 = this.state.points[this.state.points.length - 2];
                const p1 = this.state.points[this.state.points.length - 1];
                this.state.trajectory.add_line(p0, p1, this.state.penUp);
            }

        } else if (currentTool === TOOLS.CIRCLE) {
            if (this.state.points.length === 0) {
                this.state.points.push(new Point(x, y, settings));
            } else {
                this.state.circleDefinition.push(new Point(x, y, settings));

                if (this.state.circleDefinition.length === 2) {
                    // Start point is the last point in the path
                    // Circle def has [diameter_point, end_point] (Wait, original logic?)
                    /* 
                       Original Logic:
                       circle_definition[0] = k (intermediate?)
                       circle_definition[1] = b (diameter?)
                       Wait, logic in handle_input:
                       if length == 0 -> push first point
                       else push to circle_def.
                       if circle_def length == 2:
                          params = find_circ()
                          add_circle
                          points.push(p)
                          reset circle_def
                    */

                    // Refined logic to match user flow
                    // User clicks result in:
                    // 1. (Existing point A)
                    // 2. Click 1 -> Intermediate K? 
                    // 3. Click 2 -> Diameter B?

                    const params = find_circ(this.state.points, this.state.circleDefinition, settings);
                    this.state.trajectory.add_circle(
                        params.c, params.r, params.theta_0, params.theta_1,
                        this.state.penUp, params.a, params.p
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
        const radius = height / 2;

        // 1. Draw valid workspace (Right Half - Cyan/Dark)
        ctx.beginPath();
        ctx.arc(origin.x, origin.y, radius, -Math.PI / 2, Math.PI / 2); // Right half
        ctx.fillStyle = '#2d2d2d';
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#404040';
        ctx.stroke();

        // 2. Draw invalid workspace (Left Half - Red)
        ctx.beginPath();
        ctx.arc(origin.x, origin.y, radius, Math.PI / 2, 3 * Math.PI / 2); // Left half
        ctx.fillStyle = 'rgba(255, 68, 68, 0.1)'; // Red tint
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 68, 68, 0.5)';
        ctx.stroke();

        // 3. Inner Limit (Singularity)
        ctx.beginPath();
        ctx.arc(origin.x, origin.y, height / 4, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(255, 68, 68, 0.05)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 68, 68, 0.2)';
        ctx.stroke();

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
        const mouseX = this.mouseX;
        const mouseY = this.mouseY;

        if (points.length === 0) return;
        const lastP = points[points.length - 1];

        if (this.state.tool === TOOLS.LINE) {
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.setLineDash([5, 5]);
            ctx.lineWidth = 2;
            ctx.moveTo(lastP.relX, lastP.relY);
            ctx.lineTo(mouseX, mouseY);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        else if (this.state.tool === TOOLS.CIRCLE) {
            const m = new Point(mouseX, mouseY, settings);
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
                // Defining Arc End - PREVIEW ACTUAL ARC

                // We need to simulate the circle definition to get arc parameters
                // mocking the inputs for find_circ
                const mockCircleDef = [this.state.circleDefinition[0], m];
                // Note: find_circ expects the circleDefinition to contain [diameter_point, end_point]
                // Here 'm' lies on the diameter? No. 
                // Wait, circle_definition[0] IS the diameter defining point.
                // 'm' is the arc end point.

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

                // Optional: Draw phantom full circle faintly
                ctx.beginPath();
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
                ctx.lineWidth = 1;
                ctx.arc(params.c.relX, params.c.relY, params.r, 0, 2 * Math.PI);
                ctx.stroke();
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
            this.state.manipulator.draw_pose(ctx);
            // this.state.manipulator.draw_traces(ctx); // Performance heavy
        }

        // Tool Preview
        this.drawToolPreview();

        requestAnimationFrame(() => this.animate());
    }
}
