// utils_drawing.js - Helper functions for drawing tools

import { Point } from './utils.js';

/**
 * Calculate points for a rectangle given two opposite corners
 * @param {Point} p1 - First corner
 * @param {Point} p2 - Opposite corner
 * @param {Object} settings - Canvas settings
 * @returns {Point[]} Array of 4 corner points in order
 */
export function calculateRectangle(p1, p2, settings) {
    // Create the 4 corners of the rectangle
    // p1 (top-left), p2 (bottom-right in canvas coords)
    const corners = [
        p1, // Start point
        new Point(p2.relX, p1.relY, settings), // Top-right
        p2, // Bottom-right
        new Point(p1.relX, p2.relY, settings), // Bottom-left
    ];

    return corners;
}

/**
 * Calculate points for a regular polygon
 * @param {Point} center - Center point
 * @param {number} radius - Radius in pixels
 * @param {number} sides - Number of sides
 * @param {number} rotation - Rotation angle in radians (default 0)
 * @param {Object} settings - Canvas settings
 * @returns {Point[]} Array of vertex points
 */
export function calculatePolygon(center, radius, sides, rotation = 0, settings) {
    const points = [];
    const angleStep = (2 * Math.PI) / sides;

    for (let i = 0; i < sides; i++) {
        const angle = i * angleStep + rotation;
        const x = center.relX + radius * Math.cos(angle);
        const y = center.relY + radius * Math.sin(angle);
        points.push(new Point(x, y, settings));
    }

    return points;
}

/**
 * Calculate points for an ellipse
 * @param {Point} center - Center point
 * @param {number} radiusX - Horizontal radius in pixels
 * @param {number} radiusY - Vertical radius in pixels
 * @param {number} segments - Number of segments to approximate ellipse
 * @param {Object} settings - Canvas settings
 * @returns {Point[]} Array of points approximating the ellipse
 */
export function calculateEllipse(center, radiusX, radiusY, segments = 36, settings) {
    const points = [];
    const angleStep = (2 * Math.PI) / segments;

    for (let i = 0; i <= segments; i++) {
        const angle = i * angleStep;
        const x = center.relX + radiusX * Math.cos(angle);
        const y = center.relY + radiusY * Math.sin(angle);
        points.push(new Point(x, y, settings));
    }

    return points;
}

/**
 * Calculate points for an arc
 * @param {Point} center - Center point
 * @param {number} radius - Radius in pixels
 * @param {number} startAngle - Start angle in radians
 * @param {number} endAngle - End angle in radians
 * @param {number} segments - Number of segments
 * @param {Object} settings - Canvas settings
 * @returns {Point[]} Array of points approximating the arc
 */
export function calculateArc(center, radius, startAngle, endAngle, segments = 20, settings) {
    const points = [];

    // Calculate the angular span
    let span = endAngle - startAngle;
    if (span < 0) span += 2 * Math.PI;

    const angleStep = span / segments;

    for (let i = 0; i <= segments; i++) {
        const angle = startAngle + i * angleStep;
        const x = center.relX + radius * Math.cos(angle);
        const y = center.relY + radius * Math.sin(angle);
        points.push(new Point(x, y, settings));
    }

    return points;
}

/**
 * Simplify a path using the Douglas-Peucker algorithm
 * @param {Point[]} points - Array of points
 * @param {number} tolerance - Tolerance in pixels
 * @returns {Point[]} Simplified array of points
 */
export function simplifyPath(points, tolerance = 2.0) {
    if (points.length <= 2) return points;

    // Find the point with maximum distance from the line segment
    let maxDist = 0;
    let maxIndex = 0;
    const end = points.length - 1;

    for (let i = 1; i < end; i++) {
        const dist = perpendicularDistance(points[i], points[0], points[end]);
        if (dist > maxDist) {
            maxDist = dist;
            maxIndex = i;
        }
    }

    // If max distance is greater than tolerance, recursively simplify
    if (maxDist > tolerance) {
        const left = simplifyPath(points.slice(0, maxIndex + 1), tolerance);
        const right = simplifyPath(points.slice(maxIndex), tolerance);

        // Concatenate results, removing duplicate middle point
        return left.slice(0, -1).concat(right);
    } else {
        // Return just the endpoints
        return [points[0], points[end]];
    }
}

/**
 * Calculate perpendicular distance from point to line segment
 * @param {Point} point - The point
 * @param {Point} lineStart - Start of line segment
 * @param {Point} lineEnd - End of line segment
 * @returns {number} Distance in pixels
 */
function perpendicularDistance(point, lineStart, lineEnd) {
    const dx = lineEnd.relX - lineStart.relX;
    const dy = lineEnd.relY - lineStart.relY;

    // If line segment is actually a point
    if (dx === 0 && dy === 0) {
        return Math.sqrt(
            Math.pow(point.relX - lineStart.relX, 2) +
            Math.pow(point.relY - lineStart.relY, 2)
        );
    }

    // Calculate perpendicular distance
    const numerator = Math.abs(
        dy * point.relX - dx * point.relY +
        lineEnd.relX * lineStart.relY -
        lineEnd.relY * lineStart.relX
    );
    const denominator = Math.sqrt(dx * dx + dy * dy);

    return numerator / denominator;
}

/**
 * Snap a coordinate to grid
 * @param {number} value - Coordinate value
 * @param {number} gridSize - Grid size
 * @returns {number} Snapped value
 */
export function snapToGrid(value, gridSize) {
    return Math.round(value / gridSize) * gridSize;
}

/**
 * Snap a point to grid
 * @param {Point} point - Point to snap
 * @param {number} gridSize - Grid size in pixels
 * @param {Object} settings - Canvas settings
 * @returns {Point} New snapped point
 */
export function snapPointToGrid(point, gridSize, settings) {
    const snappedX = snapToGrid(point.relX, gridSize);
    const snappedY = snapToGrid(point.relY, gridSize);
    return new Point(snappedX, snappedY, settings);
}
