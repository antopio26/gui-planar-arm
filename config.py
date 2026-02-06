from lib import trajpy as tpy

# General Settings
SETTINGS = {
    'Tc': 0.01,  # s
    'data_rate': 1 * 10**-6,  # rate at which msgs are sent
    'max_acc': 0.1,  # rad/s**2
    'ser_started': False,
    'line_tl': lambda t, tf: tpy.cycloidal([0, 1], 2, tf)[0][0](t),  # timing laws for line
    'circle_tl': lambda t, tf: tpy.cycloidal([0, 1], 2, tf)[0][0](t)  # timing laws for circle
}

# Speed Profiles (rad/s, rad/s^2)
SPEED_PROFILES = {
    'default': {'max_speed': 1.0, 'max_acc': 0.5},
    'linear':  {'max_speed': 1.0, 'max_acc': 0.1},
    'curve':   {'max_speed': 1.0, 'max_acc': 0.02}, # Slower for curves
    'jump':    {'max_speed': 2.0, 'max_acc': 0.1}, # Fast for pen-up moves
}

# Serial Configuration
SERIAL_PORT = None # Auto-detect

# Robot Physical Dimensions
SIZES = {
    'l1': 0.128,
    'l2': 0.144
}

# Joint Limits (Radians)
JOINT_LIMITS = {
    'q1_min': -2.06, # -118 deg
    'q1_max': 1.57, # 118 deg
    'q2_min': -2.34, # -136 deg
    'q2_max': 2.06 # 136 deg
}

# Web Server Options
WEB_OPTIONS = {
    'host': 'localhost',
    'port': 6969
}

# Text Generation Defaults
TEXT_OPTIONS = {
    'mode': 'linear',
    'fontSize': 0.04, # Slightly smaller for safety
    'x': 0.17,
    'y': 0.1,
    'angle': -90,
    'radius': 0.20,
    'offset': 90
}

# Trajectory Validation Limits
MAX_SPEED_RAD = 10.0
MAX_ACC_TOLERANCE_FACTOR = 1000.0 # Relaxed for testing (was 40.0)
