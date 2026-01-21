import { Point, find_circ } from './utils.js';
import { appState, TOOLS } from './state.js';
import { calculateRectangle, calculatePolygon, snapPointToGrid } from './utils_drawing.js';

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
    }

    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        this.mouseX = e.clientX - rect.left;
        this.mouseY = e.clientY - rect.top;
    }

    handleClick(e) {
        let x = this.mouseX;
        let y = this.mouseY;
        const settings = this.state.settings;

        // Apply grid snapping if enabled
        if (this.state.snapToGrid) {
            const snappedPoint = snapPointToGrid(new Point(x, y, settings), this.state.gridSize, settings);
            x = snappedPoint.relX;
            y = snappedPoint.relY;
        }

        // Radius check (workspace limit)
        const distSq = Math.pow(x - settings.origin.x, 2) + Math.pow(y - settings.origin.y, 2);
        const maxRadius = this.workspaceRadius || (this.canvas.height / 2);

        if (distSq > maxRadius * maxRadius) return;

        // Clear sent data if new drawing starts
        if (this.state.points.length === 0 && this.state.sentPoints.length > 0) {
            this.state.sentPoints = [];
            this.state.sentTrajectory.reset();
        }

        const currentTool = this.state.tool;
        const currentPoint = new Point(x, y, settings);

        if (currentTool === TOOLS.LINE) {
            this.state.points.push(currentPoint);

            if (this.state.points.length > 1) {
                const p0 = this.state.points[this.state.points.length - 2];
                const p1 = this.state.points[this.state.points.length - 1];
                this.state.trajectory.add_line(p0, p1, this.state.penUp);
                this.state.saveState();
            }

        } else if (currentTool === TOOLS.SEMICIRCLE) {
            // Logic: Start Point (Click 1) -> End Point (Click 2)
            if (!this.state.semicircleStart) {
                // If we have previous points, chain from last point
                if (this.state.points.length > 0) {
                    this.state.semicircleStart = this.state.points[this.state.points.length - 1];
                    // Proceed to second click immediately? No, wait for user to click End.
                    // But if user JUST clicked, that was 'Line End'.
                    // Now user selects Semicircle.
                    // User clicks 'End' of semicircle.
                    // So we treat the current click as END if we auto-chained.

                    // Wait: If I select tool, I haven't clicked yet.
                    // If I click now, is it Start or End?
                    // User expectation: "Scegliere il punto di partenza".
                    // If I want to chain, I click on the last point to confirm it?
                    // Or does it auto-start? 
                    // Let's require Explicit Start Click to be safe/flexible (allows detached semicircles).
                    // BUT "Incollare tra di loro".
                    // Compromise: If I click near the last point, it snaps?

                    this.state.semicircleStart = currentPoint;
                    this.state.points.push(currentPoint);
                } else {
                    this.state.semicircleStart = currentPoint;
                    this.state.points.push(currentPoint);
                }
            } else {
                // Second Click: End Point
                const start = this.state.semicircleStart;
                const end = currentPoint;

                // Calc properties for arc
                const cx = (start.relX + end.relX) / 2;
                const cy = (start.relY + end.relY) / 2;
                const center = new Point(cx, cy, settings);

                const dx = end.relX - start.relX;
                const dy = end.relY - start.relY;
                const radius = Math.sqrt(dx * dx + dy * dy) / 2;

                const startAngle = Math.atan2(start.relY - cy, start.relX - cx);
                const endAngle = Math.atan2(end.relY - cy, end.relX - cx);

                // Add Arc
                this.state.trajectory.add_circle(
                    center, radius, startAngle, endAngle,
                    this.state.penUp, start, end
                );

                this.state.points.push(end);
                this.state.semicircleStart = null;
                this.state.saveState();
            }

        } else if ([TOOLS.CIRCLE, TOOLS.SQUARE, TOOLS.POLYGON].includes(currentTool)) {
            // Centered Shapes: Center (Click 1) -> Radius/Corner (Click 2)
            if (!this.state.shapeStart) {
                this.state.shapeStart = currentPoint;
                this.state.points.push(currentPoint);

                // If there was a previous point, this creates a jump (or line if pen down?)
                // Usage: User clicks Center. Robot moves to Center.
                // If chained (points > 1), we add a line P_prev -> Center.
                if (this.state.points.length > 1) {
                    const p_prev = this.state.points[this.state.points.length - 2];
                    // We assume PenUp is desireable for moving to center of a new shape?
                    // Or keep current pen state? Use true (Pen Up) for clean jump to center.
                    this.state.trajectory.add_line(p_prev, currentPoint, true);
                }

            } else {
                // Second Click: Define Size/Rotation
                const center = this.state.shapeStart;
                const corner = currentPoint;

                const dx = corner.relX - center.relX;
                const dy = corner.relY - center.relY;
                const radius = Math.sqrt(dx * dx + dy * dy);
                const rotation = Math.atan2(dy, dx); // Angle to corner

                if (currentTool === TOOLS.CIRCLE) {
                    const startAngle = rotation;
                    const endAngle = rotation + 2 * Math.PI;

                    const startP = new Point(
                        center.relX + radius * Math.cos(startAngle),
                        center.relY + radius * Math.sin(startAngle),
                        settings
                    );

                    // Move Center -> StartP (Pen Up)
                    this.state.trajectory.add_line(center, startP, true);

                    this.state.trajectory.add_circle(
                        center, radius, startAngle, endAngle,
                        this.state.penUp, startP, startP
                    );

                    this.state.points.push(startP);

                } else {
                    // SQUARE or POLYGON
                    const sides = (currentTool === TOOLS.SQUARE) ? 4 : (this.state.polygonSides || 5);
                    const polyPoints = calculatePolygon(center, radius, sides, rotation, settings);

                    // Move Center -> Vertex 0
                    this.state.trajectory.add_line(center, polyPoints[0], true);

                    // Draw edges
                    for (let i = 0; i < polyPoints.length; i++) {
                        const p_start = polyPoints[i];
                        const p_end = polyPoints[(i + 1) % polyPoints.length];
                        this.state.trajectory.add_line(p_start, p_end, this.state.penUp);
                    }

                    // End at Start Vertex
                    this.state.points.push(polyPoints[0]);
                }

                this.state.shapeStart = null;
                this.state.saveState();
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

        // Mode-Specific Background
        const mode = this.state.textMode || 'linear'; // default

        if (mode === 'linear') {
            // Linear Workspace (Green Rectangle)
            // The user sketch shows a rectangle on the right. 
            // Let's draw the FULL reachable workspace in standard colors, 
            // AND the "Virtual Sheet" in green?
            // "Modalità Rettilinea: Mostra un rettangolo grigio (foglio virtuale) ... indica l'area sicura"
            // Wait, user request says: "Rettangolo Grigio" (Grey) in text description?? 
            // BUT sketches show GREEN.
            // "Linear Workspace: ... Green rectangle"
            // I will follow the Sketch (Green).

            // Draw Full Reachable (Faint)
            ctx.beginPath();
            ctx.arc(origin.x, origin.y, radius, 0, 2 * Math.PI);
            ctx.strokeStyle = '#333';
            ctx.stroke();

            // Draw "Safe Rect"
            // Let's position it based on inputs or fixed?
            // Fixed size "Sheet" at (0.15, -0.1) to (0.35, 0.1)?
            // Let's make it look like the sketch: Right side.

            // Green Rect
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
            // Y is flipped. World Y increases UP. Canvas Y increases DOWN.
            // visual_y = origin.y - world_y
            // We want top-left of RECT.
            // The rect is defined by (x, y) bottom-left? Or top-left?
            // "Sheet X/Y" usually implies a corner. Let's assume Bottom-Left as per standard Cartesian often used here?
            // Actually, if input is 0.15, -0.15. 
            // If we assume standard Graphics (Top-Left), then World Y is inverted.
            // Let's assume X,Y is Bottom-Left in World coords.
            // Top Y = y + h.

            // Canvas Top Y = origin.y - (ws.y + ws.h) / mp
            // Canvas X = origin.x + ws.x / mp

            const ry = origin.y - (ws.y + ws.h) / mp;

            ctx.fillRect(rx, ry, w_pix, h_pix);
            ctx.strokeRect(rx, ry, w_pix, h_pix);

        } else {
            // Curved Workspace (Green Donut Sector)
            // "Mostra l'intera ciambella"

            ctx.beginPath();
            // Inner radius limit (e.g. 0.15m)
            const innerR_m = 0.15;
            const outerR_m = 0.328; // max reach

            const mp = this.state.settings.m_p;
            const innerR = innerR_m / mp;
            const outerR = outerR_m / mp; // Should match 'radius'

            // Right side sector (-90 to +90 degrees)
            ctx.arc(origin.x, origin.y, outerR, -Math.PI / 2, Math.PI / 2, false);
            ctx.arc(origin.x, origin.y, innerR, Math.PI / 2, -Math.PI / 2, true); // inner reversed
            ctx.closePath();

            ctx.fillStyle = 'rgba(0, 200, 81, 0.3)'; // Green
            ctx.fill();
            ctx.strokeStyle = '#00c851';
            ctx.stroke();
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

    drawGrid() {
        if (!this.state.showGrid) return;

        const ctx = this.ctx;
        const width = parseFloat(this.canvas.style.width);
        const height = parseFloat(this.canvas.style.height);
        const gridSize = this.state.gridSize;

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;

        // Vertical lines
        for (let x = 0; x < width; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }

        // Horizontal lines
        for (let y = 0; y < height; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
    }

    drawCoordinates() {
        const ctx = this.ctx;
        const settings = this.state.settings;

        // Convert mouse position to world coordinates
        const worldX = (this.mouseX - settings.origin.x) * settings.m_p;
        const worldY = -(this.mouseY - settings.origin.y) * settings.m_p; // Y is flipped

        // Draw background box
        const padding = 10;
        const boxX = padding;
        const boxY = padding;
        const text = `X: ${worldX.toFixed(3)}m  Y: ${worldY.toFixed(3)}m`;

        ctx.font = '14px monospace';
        const metrics = ctx.measureText(text);
        const boxWidth = metrics.width + 20;
        const boxHeight = 30;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 1;
        ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);

        // Draw text
        ctx.fillStyle = '#00e5ff';
        ctx.fillText(text, boxX + 10, boxY + 20);
    }

    drawToolPreview() {
        const ctx = this.ctx;
        const settings = this.state.settings;
        const points = this.state.points;
        const mouseX = this.mouseX;
        const mouseY = this.mouseY;

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

        if (points.length === 0 && !this.state.semicircleStart && !this.state.shapeStart) return;

        let lastP = null;
        if (points.length > 0) lastP = points[points.length - 1];

        const currentTool = this.state.tool;

        if (currentTool === TOOLS.LINE && lastP) {
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.setLineDash([5, 5]);
            ctx.lineWidth = 2;
            ctx.moveTo(lastP.relX, lastP.relY);
            ctx.lineTo(mouseX, mouseY);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        else if (currentTool === TOOLS.SEMICIRCLE && this.state.semicircleStart) {
            const start = this.state.semicircleStart;
            // Preview Arc
            const cx = (start.relX + mouseX) / 2;
            const cy = (start.relY + mouseY) / 2;
            const dx = mouseX - start.relX;
            const dy = mouseY - start.relY;
            const r = Math.sqrt(dx * dx + dy * dy) / 2;
            const a1 = Math.atan2(start.relY - cy, start.relX - cx);
            const a2 = Math.atan2(mouseY - cy, mouseX - cx);

            ctx.beginPath();
            ctx.strokeStyle = 'rgba(255, 165, 0, 0.7)'; // Orange
            ctx.setLineDash([5, 5]);
            ctx.lineWidth = 2;
            ctx.arc(cx, cy, r, a1, a2, false);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        else if (this.state.shapeStart && [TOOLS.CIRCLE, TOOLS.SQUARE, TOOLS.POLYGON].includes(currentTool)) {
            const center = this.state.shapeStart;
            const dx = mouseX - center.relX;
            const dy = mouseY - center.relY;
            const r = Math.sqrt(dx * dx + dy * dy);
            const rot = Math.atan2(dy, dx);

            ctx.beginPath();
            ctx.strokeStyle = 'rgba(0, 255, 127, 0.7)'; // Green
            ctx.setLineDash([5, 5]);
            ctx.lineWidth = 2;

            if (currentTool === TOOLS.CIRCLE) {
                ctx.arc(center.relX, center.relY, r, 0, 2 * Math.PI);
            } else {
                const sides = (currentTool === TOOLS.SQUARE) ? 4 : (this.state.polygonSides || 5);
                const pts = calculatePolygon(center, r, sides, rot, settings);
                if (pts.length > 0) {
                    ctx.moveTo(pts[0].relX, pts[0].relY);
                    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].relX, pts[i].relY);
                    ctx.closePath();
                }
            }
            ctx.stroke();
            ctx.setLineDash([]);

            // Draw Center
            ctx.beginPath();
            ctx.fillStyle = 'rgba(0, 255, 127, 0.5)';
            ctx.arc(center.relX, center.relY, 3, 0, 2 * Math.PI);
            ctx.fill();
        }
    }

    animate() {
        const ctx = this.ctx;
        const width = parseFloat(this.canvas.style.width); // Use scaled size
        const height = parseFloat(this.canvas.style.height);

        // Clear entire canvas for redraw
        ctx.clearRect(0, 0, width, height);

        this.drawBackground();

        // Draw Grid (if enabled)
        this.drawGrid();

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

        // Draw Coordinates (always on top)
        this.drawCoordinates();

        requestAnimationFrame(() => this.animate());
    }
}
