import { Manipulator } from './manipulator.js';
import { Trajectory } from './trajectory.js';

export const TOOLS = {
    LINE: 'line',
    SEMICIRCLE: 'semicircle',
    CIRCLE: 'circle',
    SQUARE: 'square',
    POLYGON: 'polygon'
};

class StateManager {
    constructor() {
        this.settings = {
            'origin': { 'x': 350, 'y': 350 }, // Default, updated on resize/init
            'm_p': (0.328 * 2) / 700, // meters per pixel
            'l1': 0.170,
            'l2': 0.158,
            's_step': 1 / 50,
            'framerate': 60,

            // Workspace Config
            'linearWorkspace': {
                'x': 0.01,
                'y': -0.18,
                'w': 0.27,
                'h': 0.36
            }
        };

        this.points = [];
        this.sentPoints = [];
        this.circleDefinition = [];

        this.tool = TOOLS.LINE;
        this.penUp = false;

        this.isSerialOnline = false;

        this.manipulator = null;
        this.trajectory = null;
        this.sentTrajectory = null;

        // History for Undo/Redo
        this.history = [];
        this.historyIndex = -1;
        this.maxHistorySize = 50;

        // Grid settings
        this.snapToGrid = false;
        this.gridSize = 20; // pixels
        this.showGrid = false;

        // Tool-specific options
        this.polygonSides = 6;
        this.arcSegments = 20;
        this.freehandPoints = [];
        this.rectangleStart = null;
        this.semicircleStart = null;
        this.fullcircleStart = null;
        this.shapeStart = null;
    }

    init(canvasWidth, canvasHeight) {
        // Update settings based on canvas
        this.settings.origin.x = canvasWidth / 2;
        this.settings.origin.y = canvasHeight / 2;
        // Fix m_p calculation based on original logic or new
        this.settings.m_p = (0.328 * 2) / canvasWidth;

        this.manipulator = new Manipulator([-Math.PI / 2, -Math.PI / 2], this.settings);
        this.trajectory = new Trajectory();
        this.sentTrajectory = new Trajectory();
    }

    resetDrawing() {
        this.points = [];
        this.trajectory = new Trajectory();
        this.circleDefinition = [];
    }

    moveToSent() {
        this.sentPoints = [...this.points];
        this.sentTrajectory.data = [...this.trajectory.data];
        this.resetDrawing();
    }

    saveState() {
        // Remove any states after current index (when undoing then making new action)
        this.history = this.history.slice(0, this.historyIndex + 1);

        // Create deep copy of current state
        const state = {
            points: this.points.map(p => ({ ...p })),
            trajectoryData: this.trajectory.data.map(t => ({ ...t })),
            circleDefinition: this.circleDefinition.map(p => ({ ...p })),
            penUp: this.penUp,
            tool: this.tool
        };

        this.history.push(state);
        this.historyIndex++;

        // Limit history size
        if (this.history.length > this.maxHistorySize) {
            this.history.shift();
            this.historyIndex--;
        }
    }

    restoreState(state) {
        if (!state) return;

        this.points = state.points.map(p => ({ ...p }));
        this.trajectory.data = state.trajectoryData.map(t => ({ ...t }));
        this.circleDefinition = state.circleDefinition.map(p => ({ ...p }));
        this.penUp = state.penUp;
        this.tool = state.tool;
    }

    canUndo() {
        return this.historyIndex > 0;
    }

    canRedo() {
        return this.historyIndex < this.history.length - 1;
    }

    undo() {
        if (this.canUndo()) {
            this.historyIndex--;
            this.restoreState(this.history[this.historyIndex]);
        }
    }

    redo() {
        if (this.canRedo()) {
            this.historyIndex++;
            this.restoreState(this.history[this.historyIndex]);
        }
    }
}

export const appState = new StateManager();
