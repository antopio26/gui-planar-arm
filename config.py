from lib import trajpy as tpy

# General Settings
SETTINGS = {
    'Tc': 0.01,  # s
    'data_rate': 1 * 10**-6,  # rate at which msgs are sent
    'max_acc': 0.35,  # rad/s**2
    'ser_started': False,
    'line_tl': lambda t, tf: tpy.cycloidal([0, 1], 2, tf)[0][0](t),  # timing laws for line
    'circle_tl': lambda t, tf: tpy.cycloidal([0, 1], 2, tf)[0][0](t)  # timing laws for circle
}

# Serial Configuration
SERIAL_PORT = '/dev/tty.usbmodem2103' # Default, change this if needed

# Robot Physical Dimensions
SIZES = {
    'l1': 0.170,
    'l2': 0.158
}

# Web Server Options
WEB_OPTIONS = {
    'host': 'localhost',
    'port': 6969
}

# Trajectory Validation Limits
MAX_SPEED_RAD = 10.0
MAX_ACC_TOLERANCE_FACTOR = 2.0
