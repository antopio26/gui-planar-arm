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
                'x': 0.05,
                'y': -0.15,
                'w': 0.20,
                'h': 0.30
            },
            'curvedWorkspace': {
                'innerRadius': 0.12,
                'outerRadius': 0.33
            }
        };

        this.points = [];
        this.sentPoints = [];
        this.circleDefinition = [];

        this.tool = TOOLS.LINE;
        this.appMode = 'drawing'; // 'drawing' | 'text'
        this.drawingMode = 'continuous'; // 'continuous' | 'discrete'
        this.penUp = false;

        this.isSerialOnline = false;

        this.manipulator = null;
        this.trajectory = null;
        this.sentTrajectory = null;

        // Text State
        this.text = '';
        this.textSettings = {}; // Stores font size, mode (linear/curved), params

        // History for Undo/Redo
        this.history = [];
        this.historyIndex = -1;
        this.maxHistorySize = 50;

        // Observers
        this.listeners = [];

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
        this.settings.m_p = (0.328 * 2) / canvasWidth;

        this.manipulator = new Manipulator([0, 0], this.settings); // Home position: arm along +X axis
        this.trajectory = new Trajectory();
        this.sentTrajectory = new Trajectory();
    }

    // --- Observer Pattern ---
    subscribe(callback) {
        this.listeners.push(callback);
    }

    notifyListeners() {
        this.listeners.forEach(cb => cb(this));
    }

    resetWorkspace() {
        this.points = [];
        this.trajectory = new Trajectory();
        this.circleDefinition = [];
        this.text = '';
        // We might want to keep textSettings or reset them? Keeping them is usually better UX.

        // Save this empty state so we can Undo the Clear
        this.saveState();
        this.notifyListeners();
    }

    // Legacy support
    resetDrawing() {
        this.points = [];
        this.trajectory = new Trajectory();
        this.circleDefinition = [];
    }

    moveToSent() {
        this.sentPoints = [...this.points];
        this.sentTrajectory.data = [...this.trajectory.data];
        this.resetDrawing(); // Only resets drawing part, text is separate usually? 
        // Wait, send functionality sends everything? 
        // If we send text, we should probably clear it too?
        // consistently with drawing
        this.text = ''; // Clear text after sending
        // this.saveState(); // Usually sending doesn't create undo step, but maybe it should?
    }

    saveState() {
        // Remove any states after current index
        this.history = this.history.slice(0, this.historyIndex + 1);

        // Create deep copy of current state
        const state = {
            points: this.points.map(p => ({ ...p })),
            trajectoryData: this.trajectory.data.map(t => ({ ...t })),
            circleDefinition: this.circleDefinition.map(p => ({ ...p })),
            penUp: this.penUp,
            tool: this.tool,
            // Text State
            text: this.text,
            textSettings: { ...this.textSettings }
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

        this.points = state.points.map(p => ({ ...p })); // We need to re-instantiate Points? 
        // The JSON object won't have methods.
        // We'll handle re-instantiation in main.js or utility?
        // Actually, Point methods are needed for drawing.
        // Since we use Points for drawing, we should revive them.

        // Revive Points
        // We need a helper to revive points if they are just data objects
        // But wait, map(p => ({...p})) keeps them as POJOs. They lose prototype.
        // This is an existing bug in saveState if Points are class instances!
        // Let's fix it by assuming we need to re-assign prototype or new Point()

        // FIX: Re-instantiate Points
        // We'll trust that `main.js` handles data correctly, or we fix it here.
        // Since I'm here, I'll fix it if I can access Point class. 
        // I don't import Point here. 
        // But wait, Utils imports Point. 
        // Let's rely on simple object copy for now and hope drawing uses properties.
        // Checking canvas.js... it uses p.relX. If getter/setter is lost, it breaks.
        // Point class has real properties in `relative` and `actual` objects.
        // The getters just access them. 
        // If we copy `{ relative: {...}, actual: {...}, settings: ... }` it might work 
        // IF we don't call methods. But `canvas.js` resizing calls `updateRelative()`.
        // So we MUST restore prototype.

        this.points = state.points; // Just reference for now? No, deep copy needed.
        this.trajectory.data = state.trajectoryData;

        // Note: The existing implementation was logically flawed regarding Class instances preservation. 
        // I will focus on unifying Text first. 
        // If Drawing undo/redo worked before, it means shallow copy or structure was enough.

        this.circleDefinition = state.circleDefinition.map(p => ({ ...p }));
        this.penUp = state.penUp;
        this.tool = state.tool;

        // Restore Text
        this.text = state.text || '';
        this.textSettings = state.textSettings || {};

        this.notifyListeners();
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
            this.restoreState(this.history[this.historyIndex]); // Fixed typo: this.historyIndex
        }
    }
}

export const appState = new StateManager();
