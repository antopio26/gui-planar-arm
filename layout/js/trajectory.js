export class Trajectory {
    constructor() {
        this.data = [];
    }

    add_line(p0, p1, raised) {
        this.data.push({
            'type': 'line',
            'data': [p0, p1, raised] // start, end, raised
        });
    }

    add_circle(c, r, theta_0, theta_1, raised, a, p) {
        this.data.push({
            'type': 'circle',
            'data': [c, r, theta_0, theta_1, raised, a, p]
        });
    }

    reset() {
        this.data = [];
    }

    update() {
        for (let traj of this.data) {
            if (traj.type === 'line') {
                // p0, p1
                traj.data[0].updateRelative();
                traj.data[1].updateRelative();
            } else if (traj.type === 'circle') {
                // data: [c, r, theta_0, theta_1, raised, a, p]
                const c = traj.data[0];
                const a = traj.data[5];
                const p = traj.data[6];

                c.updateRelative();
                a.updateRelative();
                p.updateRelative();

                // Recalc Radius (pixels)
                // r = distance(c, a)
                traj.data[1] = c.sub(a).mag();

                // Recalc Angles
                // Vector C->A = c.sub(a). Angle of A relative to C is angle(a-c) = angle(-(c-a)) = angle(c-a) + PI
                const v1 = c.sub(a);
                const v2 = c.sub(p);

                traj.data[2] = v1.angle() + Math.PI; // theta_0
                traj.data[3] = v2.angle() + Math.PI; // theta_1
            }
        }
    }

    draw(ctx) {
        for (let traj of this.data) {
            const raised = (traj.type === 'line') ? traj.data[2] : traj.data[4];

            // Skip raised (pen up) segments for visualization if desired, 
            // or draw them dashed
            if (raised) {
                // Pen Up: Draw Dashed Line
                ctx.beginPath();
                ctx.lineWidth = 2; // Slightly thinner?
                ctx.strokeStyle = 'rgba(255, 165, 0, 0.7)'; // Orange, semi-transparent
                ctx.setLineDash([5, 5]);

                if (traj.type === 'line') {
                    const p0 = traj.data[0];
                    const p1 = traj.data[1];
                    ctx.moveTo(p0.relX, p0.relY);
                    ctx.lineTo(p1.relX, p1.relY);
                }
                // (Circle pen-up is rare/unusual but could happen? Usually pen down for arc)
                // If needed, can add here.

                ctx.stroke();
                ctx.closePath();
                ctx.setLineDash([]); // Reset
                continue; // Done drawing this segment
            }

            ctx.beginPath();
            ctx.lineWidth = 3;
            ctx.strokeStyle = "#00e5ff"; // Path color - cyan for high contrast

            if (traj.type === 'line') {
                const p0 = traj.data[0];
                const p1 = traj.data[1];
                ctx.moveTo(p0.relX, p0.relY);
                ctx.lineTo(p1.relX, p1.relY);
            } else if (traj.type === 'circle') {
                const c = traj.data[0];
                const r = traj.data[1];
                const theta_0 = traj.data[2];
                const theta_1 = traj.data[3];

                // Determine counter-clockwise check logic (from original)
                const A = theta_0 > theta_1;
                const B = Math.abs(theta_1 - theta_0) < Math.PI;
                const ccw = (!A && !B) || (A && B); // XNOR

                ctx.arc(c.relX, c.relY, r, theta_0, theta_1, ccw);
            }
            ctx.stroke();
            ctx.closePath();
        }
    }
}
