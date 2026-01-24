import { abs2rel } from './utils.js';

export class Manipulator {
    constructor(q, settings) {
        this.q_coords = q;
        this.settings = settings;
        this.traces = { 'x1': [], 'x2': [] };

        // Default Viz Settings if not present
        if (this.settings.showFrames === undefined) this.settings.showFrames = false;
        if (this.settings.showLimits === undefined) this.settings.showLimits = true;

        // Calculate initial position
        const [p1, p2] = this.dk(q);
        this.p = p1;
        this.end_eff = p2;

        this.penState = 1; // Default Up (1)
    }

    setPenState(state) {
        this.penState = state;
    }

    // --- Getters & Setters ---

    set q(q) {
        this.q_coords = q;
        const [p1, p2] = this.dk(this.q_coords);
        this.p = p1;
        this.end_eff = p2;
    }

    get q() {
        return this.q_coords;
    }

    // Update internal state (e.g. after resize)
    update() {
        // Recalculate p and end_eff using current settings (which have new m_p/origin)
        const [p1, p2] = this.dk(this.q_coords);
        this.p = p1;
        this.end_eff = p2;
    }

    // --- Trace Management ---

    add2trace(q) {
        // Calculate Absolute Position (Forward Kinematics)
        const l1 = this.settings['l1'];
        const l2 = this.settings['l2'];

        const x1_abs = l1 * Math.cos(q[0]);
        const y1_abs = l1 * Math.sin(q[0]);

        const x2_abs = x1_abs + l2 * Math.cos(q[0] + q[1]);
        const y2_abs = y1_abs + l2 * Math.sin(q[0] + q[1]);

        // Store Absolute Coordinates
        this.traces['x2'].push({ x: x2_abs, y: y2_abs, pen: this.penState });
    }

    add_trace(points) {
        this.traces = { 'x2': [] };
        for (let point of points) {
            // Assuming points are already in World Coordinates {x, y, pen}
            this.traces['x2'].push({ x: point.x, y: point.y, pen: point.pen || 0 });
        }
    }

    reset_trace() {
        this.traces = { 'x2': [] };
    }

    // --- Kinematics ---

    dk(q) {
        const l1 = this.settings['l1'];
        const l2 = this.settings['l2'];

        // Forward Kinematics
        // p1 = end of first link
        const p1_abs = [
            l1 * Math.cos(q[0]),
            l1 * Math.sin(q[0])
        ];

        // p2 = end of second link (end effector)
        const p2_abs = [
            p1_abs[0] + l2 * Math.cos(q[0] + q[1]),
            p1_abs[1] + l2 * Math.sin(q[0] + q[1])
        ];

        // Convert to canvas relative coordinates for drawing
        const p1_rel = abs2rel(p1_abs[0], p1_abs[1], this.settings);
        const p2_rel = abs2rel(p2_abs[0], p2_abs[1], this.settings);

        return [p1_rel, p2_rel];
    }

    // --- Drawing ---

    draw_pose(ctx) {
        const origin = this.settings['origin'];

        // Draw Joint Limits (Wedges)
        if (this.settings.showLimits) {
            this.drawJointLimits(ctx, origin);
        }

        ctx.beginPath();
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = "#cccccc"; // Arm color - lighter for dark theme

        // Base to Joint 1
        ctx.moveTo(origin.x, origin.y);
        ctx.lineTo(this.p[0], this.p[1]);

        // Joint 1 to End Effector
        ctx.lineTo(this.end_eff[0], this.end_eff[1]);

        ctx.stroke();
        ctx.closePath();

        // Draw Joints
        this.drawJoint(ctx, origin.x, origin.y);
        this.drawJoint(ctx, this.p[0], this.p[1]);

        // End Effector Color based on Pen State (0=Down, 1=Up)
        const efColor = (this.penState === 0) ? '#00e5ff' : '#ffbb33';
        this.drawJoint(ctx, this.end_eff[0], this.end_eff[1], efColor);


        // Draw Frames
        if (this.settings.showFrames) {
            // Base Frame (0)
            this.drawFrame(ctx, origin.x, origin.y, 0);

            // Joint 1 Frame (Rotated by q1)
            // Note: Canvas angles are inverted (CW positive). q1 is CCW. So -q1.
            const q1 = this.q[0];
            this.drawFrame(ctx, this.p[0], this.p[1], -q1);

            // End Effector Frame (Rotated by q1+q2)
            const q2 = this.q[1];
            this.drawFrame(ctx, this.end_eff[0], this.end_eff[1], -(q1 + q2));
        }
    }

    drawFrame(ctx, x, y, angle) {
        const axisLen = 30;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);

        ctx.lineWidth = 2;

        // X Axis (Red)
        ctx.beginPath();
        ctx.strokeStyle = '#ff4444';
        ctx.moveTo(0, 0);
        ctx.lineTo(axisLen, 0);
        ctx.stroke();

        // Y Axis (Green)
        // Y is Down in Canvas, but Up in World. 
        // If we want it to look like standard frame where Y is CCW 90 from X:
        // In Canvas (Y down), X right. 
        // CCW 90 degrees in World = -90 in Canvas.
        ctx.beginPath();
        ctx.strokeStyle = '#00C851';
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -axisLen);
        ctx.stroke();

        ctx.restore();
    }

    drawJointLimits(ctx, origin) {
        if (!this.settings.limits) return;

        const limits = this.settings.limits;
        // Canvas Y is inverted relative to World Y.
        // World Angle theta increases CCW.
        // Canvas Angle increases CW.
        // So Canvas Angle = -World Angle.

        // --- Joint 1 Limits (Base) ---
        // Range: [q1_min, q1_max]
        // In Canvas: [-q1_max, -q1_min] (since -q1_max is the "start" in CW direction if we map strictly?)
        // Let's stick to: Start = -q1_max, End = -q1_min

        const q1_min = limits.q1_min;
        const q1_max = limits.q1_max;

        ctx.beginPath();
        ctx.moveTo(origin.x, origin.y);
        // Note: ctx.arc takes (x, y, radius, startAngle, endAngle, counterClockwise)
        // We want to fill the sector between q1_min and q1_max.
        // In Canvas coords:
        // Angle 1: -q1_max
        // Angle 2: -q1_min
        // We draw from -q1_max to -q1_min (Counter-Clockwise in Canvas? No, -q1_max is numerically smaller? No.)
        // Example: min=-45 (-0.78), max=+45 (+0.78).
        // Canvas: Start (+0.78? No, -0.78), End (+0.78).
        // Let's try drawing from -q1_max to -q1_min.

        ctx.arc(origin.x, origin.y, 40, -q1_max, -q1_min, false);
        ctx.lineTo(origin.x, origin.y);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fill();
        // Draw Limit Lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.closePath();

        // --- Joint 2 Limits (Elbow) ---
        // Range: [q2_min, q2_max] relative to q1.
        // World Absolute Angle of Link 2 range: q1 + q2_min to q1 + q2_max.
        // Canvas Absolute Angle: -(q1 + q2_max) to -(q1 + q2_min).

        const q2_min = limits.q2_min;
        const q2_max = limits.q2_max;
        const q1 = this.q[0]; // Current q1

        const p1 = this.p; // Elbow position in pixels

        ctx.beginPath();
        ctx.moveTo(p1[0], p1[1]);
        ctx.arc(p1[0], p1[1], 30, -(q1 + q2_max), -(q1 + q2_min), false);
        ctx.lineTo(p1[0], p1[1]);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'; // Reddish for limits
        ctx.stroke();
        ctx.closePath();
    }

    drawJoint(ctx, x, y, color = '#ffffff') {
        ctx.beginPath();
        ctx.fillStyle = color;
        ctx.arc(x, y, 6, 0, 2 * Math.PI);
        ctx.fill();
        ctx.closePath();
    }

    draw_traces(ctx) {
        // Traces are heavy, draw them efficiently
        const path = this.traces['x2'];
        if (path.length < 2) return;

        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.lineWidth = 3;

        // Helper to get pixel coords from stored absolute coords
        const getPix = (pt) => {
            const rel = abs2rel(pt.x, pt.y, this.settings);
            return { x: rel[0], y: rel[1] };
        };

        // Iterate and draw segments
        let currentState = path[0].pen;
        ctx.beginPath();
        this.startSegmentStyle(ctx, currentState);

        let p = getPix(path[0]);
        ctx.moveTo(p.x, p.y);

        for (let i = 1; i < path.length; i++) {
            const pt = path[i];
            p = getPix(pt);

            // If state changed, stroke current path and start new one
            if (pt.pen !== currentState) {
                ctx.lineTo(p.x, p.y); // Finish segment at this point
                ctx.stroke();

                currentState = pt.pen;
                ctx.beginPath();
                this.startSegmentStyle(ctx, currentState);
                ctx.moveTo(p.x, p.y); // Start new segment from here
            } else {
                ctx.lineTo(p.x, p.y);
            }
        }
        ctx.stroke();
        ctx.setLineDash([]); // Reset
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
}
