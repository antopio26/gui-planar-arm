import { Manipulator } from './manipulator.js';
import { Trajectory } from './trajectory.js';

export const TOOLS = {
    LINE: 'line',
    CIRCLE: 'circle'
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
}

export const appState = new StateManager();
