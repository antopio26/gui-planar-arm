import { Point, find_circ } from './utils.js';
import { appState, TOOLS } from './state.js';
import { calculateRectangle, snapPointToGrid } from './utils_drawing.js';

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
        const maxRadius = this.workspaceRadius || (this.canvas.height / 2); // Fallback

        if (distSq > maxRadius * maxRadius) return;

        // Clear sent data if new drawing starts
        if (this.state.points.length === 0 && this.state.sentPoints.length > 0) {
            this.state.sentPoints = [];
            this.state.sentTrajectory.reset();
        }

        const currentTool = this.state.tool;

        if (currentTool === TOOLS.LINE) {
            this.state.circleDefinition = [];

            const newPoint = new Point(x, y, settings);
            this.state.points.push(newPoint);

            if (this.state.points.length > 1) {
                const p0 = this.state.points[this.state.points.length - 2];
                const p1 = this.state.points[this.state.points.length - 1];
                this.state.trajectory.add_line(p0, p1, this.state.penUp);
                this.state.saveState(); // Save to history
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
                        this.state.penUp, params.a, params.p
                    );

                    this.state.points.push(params.p);
                    this.state.circleDefinition = [];
                    this.state.saveState(); // Save to history
                }
            }
        } else if (currentTool === TOOLS.RECTANGLE) {
            if (!this.state.rectangleStart) {
                // First click - set start corner
                // If we have previous points, use the last one as start
                if (this.state.points.length > 0) {
                    this.state.rectangleStart = this.state.points[this.state.points.length - 1];
                } else {
                    this.state.rectangleStart = new Point(x, y, settings);
                    this.state.points.push(this.state.rectangleStart);
                }
            } else {
                // Second click - complete rectangle
                const p1 = this.state.rectangleStart;
                const p2 = new Point(x, y, settings);

                // Calculate all 4 corners
                const corners = calculateRectangle(p1, p2, settings);

                // Add 4 lines to form rectangle
                for (let i = 0; i < 4; i++) {
                    const start = corners[i];
                    const end = corners[(i + 1) % 4];
                    this.state.trajectory.add_line(start, end, this.state.penUp);
                }

                // Add final corner to points
                this.state.points.push(p2);

                // Reset for next rectangle
                this.state.rectangleStart = null;
                this.state.saveState(); // Save to history
            }
        } else if (currentTool === TOOLS.SEMICIRCLE) {
            if (!this.state.semicircleStart) {
                // First click - set center
                // If we have previous points, use the last one as center
                if (this.state.points.length > 0) {
                    this.state.semicircleStart = this.state.points[this.state.points.length - 1];
                } else {
                    this.state.semicircleStart = new Point(x, y, settings);
                    this.state.points.push(this.state.semicircleStart);
                }
            } else {
                // Second click - define radius and create semicircle
                const center = this.state.semicircleStart;
                const radiusPoint = new Point(x, y, settings);

                // Calculate radius in PIXEL coordinates
                const dx = radiusPoint.relX - center.relX;
                const dy = radiusPoint.relY - center.relY;
                const radius = Math.sqrt(dx * dx + dy * dy);

                // Calculate start angle (from center to radius point)
                const startAngle = Math.atan2(dy, dx);
                const endAngle = startAngle + Math.PI; // 180 degrees = semicircle

                // Create start and end points for the arc
                const startPoint = new Point(
                    center.relX + radius * Math.cos(startAngle),
                    center.relY + radius * Math.sin(startAngle),
                    settings
                );

                const endPoint = new Point(
                    center.relX + radius * Math.cos(endAngle),
                    center.relY + radius * Math.sin(endAngle),
                    settings
                );

                // Add semicircle as arc
                this.state.trajectory.add_circle(
                    center, radius, startAngle, endAngle,
                    this.state.penUp, startPoint, endPoint
                );

                this.state.points.push(endPoint);
                this.state.semicircleStart = null;
                this.state.saveState();
            }
        } else if (currentTool === TOOLS.FULLCIRCLE) {
            if (!this.state.fullcircleStart) {
                // First click - set center
                // If we have previous points, use the last one as center
                if (this.state.points.length > 0) {
                    this.state.fullcircleStart = this.state.points[this.state.points.length - 1];
                } else {
                    this.state.fullcircleStart = new Point(x, y, settings);
                    this.state.points.push(this.state.fullcircleStart);
                }
            } else {
                // Second click - define radius and create full circle
                const center = this.state.fullcircleStart;
                const radiusPoint = new Point(x, y, settings);

                // Calculate radius in PIXEL coordinates
                const dx = radiusPoint.relX - center.relX;
                const dy = radiusPoint.relY - center.relY;
                const radius = Math.sqrt(dx * dx + dy * dy);

                // Calculate start angle (from center to radius point)
                const startAngle = Math.atan2(dy, dx);
                const endAngle = startAngle + 2 * Math.PI; // 360 degrees = full circle

                // Create start point (same as end point for full circle)
                const startPoint = new Point(
                    center.relX + radius * Math.cos(startAngle),
                    center.relY + radius * Math.sin(startAngle),
                    settings
                );

                // Add full circle
                this.state.trajectory.add_circle(
                    center, radius, startAngle, endAngle,
                    this.state.penUp, startPoint, startPoint
                );

                this.state.points.push(startPoint);
                this.state.fullcircleStart = null;
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
                ctx.lineTo(mouseX, mouseY);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
                ctx.setLineDash([2, 2]);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }
        else if (this.state.tool === TOOLS.RECTANGLE) {
            if (this.state.rectangleStart) {
                // Preview rectangle while dragging
                const p1 = this.state.rectangleStart;
                const corners = calculateRectangle(p1, new Point(mouseX, mouseY, settings), settings);

                ctx.beginPath();
                ctx.strokeStyle = 'rgba(0, 229, 255, 0.6)';
                ctx.setLineDash([5, 5]);
                ctx.lineWidth = 2;

                // Draw rectangle outline
                ctx.moveTo(corners[0].relX, corners[0].relY);
                for (let i = 1; i < corners.length; i++) {
                    ctx.lineTo(corners[i].relX, corners[i].relY);
                }
                ctx.closePath();
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }
        else if (this.state.tool === TOOLS.SEMICIRCLE) {
            if (this.state.semicircleStart) {
                // Preview semicircle while defining radius
                const center = this.state.semicircleStart;
                const dx = mouseX - center.relX;
                const dy = mouseY - center.relY;
                const radius = Math.sqrt(dx * dx + dy * dy);
                const startAngle = Math.atan2(dy, dx);
                const endAngle = startAngle + Math.PI;

                ctx.beginPath();
                ctx.strokeStyle = 'rgba(255, 165, 0, 0.7)'; // Orange for semicircle
                ctx.setLineDash([5, 5]);
                ctx.lineWidth = 2;
                ctx.arc(center.relX, center.relY, radius, startAngle, endAngle, false);
                ctx.stroke();
                ctx.setLineDash([]);

                // Draw center point
                ctx.beginPath();
                ctx.fillStyle = 'rgba(255, 165, 0, 0.5)';
                ctx.arc(center.relX, center.relY, 3, 0, 2 * Math.PI);
                ctx.fill();
            }
        }
        else if (this.state.tool === TOOLS.FULLCIRCLE) {
            if (this.state.fullcircleStart) {
                // Preview full circle while defining radius
                const center = this.state.fullcircleStart;
                const dx = mouseX - center.relX;
                const dy = mouseY - center.relY;
                const radius = Math.sqrt(dx * dx + dy * dy);

                ctx.beginPath();
                ctx.strokeStyle = 'rgba(0, 255, 127, 0.7)'; // Green for full circle
                ctx.setLineDash([5, 5]);
                ctx.lineWidth = 2;
                ctx.arc(center.relX, center.relY, radius, 0, 2 * Math.PI);
                ctx.stroke();
                ctx.setLineDash([]);

                // Draw center point
                ctx.beginPath();
                ctx.fillStyle = 'rgba(0, 255, 127, 0.5)';
                ctx.arc(center.relX, center.relY, 3, 0, 2 * Math.PI);
                ctx.fill();
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
