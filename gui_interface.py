import eel
import numpy as np
import traceback
from time import sleep
import math

from lib import trajpy as tpy
from config import SETTINGS, SIZES, MAX_SPEED_RAD, MAX_ACC_TOLERANCE_FACTOR, SERIAL_PORT
from state import state
from serial_manager import serial_manager
from lib import serial_com as scm
from lib import binary_protocol as bp
from lib import char_gen
from lib import transform
from handlers import trajectory_handler as traj_handler
import plotting

# --- INTERNAL HELPER FUNCTIONS ---

def read_position_cartesian(sizes=None) -> list[float]:
    if sizes is None:
        sizes = SIZES

    q_actual = state.last_known_q[:]
    if SETTINGS['ser_started']:
        scm.ser.reset_input_buffer()
        packet = bp.encode_pos_command()
        scm.write_data(packet)
        
        # Wait for latency
        sleep(0.1)
        
        # Read from global state (updated by serial manager)
        q_actual = [state.firmware.q0, state.firmware.q1]
        print(f"READ POS (from state): {q_actual}")
     
    # Convert to Cartesian
    points = tpy.dk(np.array(q_actual), sizes)
    return [points[0,0], points[1,0]]

# Removed validate_trajectory_dynamics (Moved to handlers)

def resolve_config(settings_override=None):
    sizes = SIZES.copy()
    limits = None 
    
    if settings_override:
        if 'l1' in settings_override: sizes['l1'] = float(settings_override['l1'])
        if 'l2' in settings_override: sizes['l2'] = float(settings_override['l2'])
        if 'limits' in settings_override: limits = settings_override['limits']
        
    return sizes, limits

# Removed _generate_trajectory_data (Moved to handlers)


# --- EEL EXPOSED FUNCTIONS ---

# 1. System & Config

@eel.expose
def py_log(msg):
    print(msg)

@eel.expose
def py_serial_online():
    return SETTINGS['ser_started']

@eel.expose
def py_list_ports():
    return scm.list_serial_ports()

@eel.expose
def py_serial_startup(port_name=None):
    print(f"Calling scm.ser_init({port_name})...")
    
    if port_name == "OFFLINE":
        print("Switching to OFFLINE mode.")
        if SETTINGS['ser_started']:
            scm.serial_close()
        SETTINGS['ser_started'] = False
        return False
        
    SETTINGS['ser_started'] = scm.ser_init(port_name)
    print(f"Serial Started? {SETTINGS['ser_started']}")
    return SETTINGS['ser_started']

@eel.expose
def py_get_config():
    from config import JOINT_LIMITS, TEXT_OPTIONS
    return {
        'sizes': SIZES,
        'limits': JOINT_LIMITS,
        'max_acc': SETTINGS['max_acc'],
        'text_options': TEXT_OPTIONS
    }

@eel.expose
def py_clear_state():
    print("Clearing Backend State...")
    state.recording_active = False
    state.reset_recording()
    state.last_known_q = [state.firmware.q0, state.firmware.q1]
    return True

# 2. Text Generation

@eel.expose
def py_generate_text(text, options, settings_override=None):
    print(f"Generating Text: '{text}' with options: {options}")
    try:
        if not text: return []
        
        mode = options.get('mode', 'linear')
        font_size = float(options.get('fontSize', 0.05))
        
        # 1. Generate Base Text at origin
        patches = char_gen.text_to_traj(text, (0,0), font_size, char_spacing=font_size*0.2)
        
        # 2. Apply Transform
        final_patches = []
        if mode == 'linear':
            x = float(options.get('x', 0.05))
            y = float(options.get('y', 0.0))
            angle = float(options.get('angle', 0.0))
            
            # Inline Transform Logic
            angle_rad = math.radians(angle)
            cos_a = math.cos(angle_rad)
            sin_a = math.sin(angle_rad)
            
            for patch in patches:
                new_points = []
                for p in patch['points']:
                    x_rot = p[0] * cos_a - p[1] * sin_a
                    y_rot = p[0] * sin_a + p[1] * cos_a
                    new_points.append([x_rot + x, y_rot + y])
                final_patches.append({**patch, 'points': new_points})

        elif mode == 'curved':
            radius = float(options.get('radius', 0.2))
            offset = float(options.get('offset', 90))
            
            # transform.apply_curved_transform expects list of dicts {x,y}
            for patch in patches:
                temp_traj = [{'x': p[0], 'y': p[1], 'z': 0} for p in patch['points']]
                res = transform.apply_curved_transform(temp_traj, radius, start_angle_deg=offset)
                new_points = [[pt['x'], pt['y']] for pt in res]
                final_patches.append({**patch, 'points': new_points})
            
        else:
            final_patches = patches

        return final_patches
        
    except Exception as e:
        print(f"Error generating text: {e}")
        traceback.print_exc()
        return []

@eel.expose
def py_validate_text(text, options, settings_override=None):
    patches = py_generate_text(text, options, settings_override)
    if not patches: return {'valid': True, 'message': 'Empty'}

    sizes, limits = resolve_config(settings_override)
    
    for patch in patches:
        for p in patch['points']:
            try:
                res = tpy.ik(p[0], p[1], 0, None, sizes, limits)
                if res is None:
                    return {'valid': False, 'message': "Point out of reach or Limit violation"}
            except Exception as e:
                return {'valid': False, 'message': f"IK Error: {e}"}
        
    return {'valid': True, 'message': "OK"}

# 3. Trajectory Management

@eel.expose
def py_compute_trajectory(settings_override=None):
    """
    Computes the trajectory in Joint Space (q1, q2) without sending it to serial.
    """
    try:
        data = eel.js_get_data()() 
        if not data: return None
            
        sizes, limits = resolve_config(settings_override)
        current_q = read_position_cartesian(sizes)
        
        # Add initial path from current position
        if len(data) > 0:
             data = [{'type':'line', 'points':[current_q, data[0]['points'][0]], 'data':{'penup':True}}] + data[::]
        
        # Use internal helper via handler
        q0s, q1s, penups, ts, _ = traj_handler.generate_trajectory_data(data, sizes, limits, state.last_known_q)

        return {
            'q1': q0s,
            'q2': q1s,
            'penups': penups,
            't': ts
        }

    except Exception as e:
        print(f"Error in py_compute_trajectory: {e}")
        traceback.print_exc()
        return None

@eel.expose
def py_get_data(settings_override=None):
    try:
        sizes, limits = resolve_config(settings_override)
        data_points = eel.js_get_data()() 
        
        if not data_points:
            print("No data received from JS")
            return False

        current_joint_pos = state.last_known_q if state.last_known_q else [0, 0]

        # Add initial path segment
        if data_points and len(data_points[0]['points']) > 0:
            current_cartesian = read_position_cartesian(sizes)
            first_target = data_points[0]['points'][0]
            
            initial_segment = {
                'type': 'line', 
                'points': [current_cartesian, first_target], 
                'data': {'penup': True}
            }
            data_points = [initial_segment] + data_points

        # Generate Full Trajectory
        q0s, q1s, penups, ts, last_q = traj_handler.generate_trajectory_data(data_points, sizes, limits, current_joint_pos)

        q = (q0s, q1s, penups)
        dq = (tpy.find_velocities(q[0], ts), tpy.find_velocities(q[1], ts))
        ddq = (tpy.find_accelerations(dq[0], ts), tpy.find_accelerations(dq[1], ts))
        
        if not traj_handler.validate_trajectory_dynamics(q, dq, ddq):
            raise Exception("Trajectory Validation Failed: Safety limit exceeded.")
            
        state.stop_requested = False 
        serial_manager.send_data('trj', q=q, dq=dq, ddq=ddq)
        
        if len(q0s) > 0:
             state.last_known_q = last_q
        
        return True
        
    except Exception as e:
        print(f"Error in py_get_data: {e}")
        traceback.print_exc()
        return False

@eel.expose
def py_stop_trajectory():
    print("Received STOP request from UI")
    state.stop_requested = True
    
    if SETTINGS['ser_started']:
        try:
            packet = bp.encode_stop_command()
            scm.write_data(packet)
            print("Physical STOP command sent to Firmware.")
        except Exception as e:
            print(f"Failed to send STOP command: {e}")

@eel.expose
def py_homing_cmd():
    if SETTINGS['ser_started']:
        packet = bp.encode_homing_command()
        print(f"Homing packet sent: {packet}")
        scm.write_data(packet)
        state.last_known_q = [0.0, 0.0]
        state.firmware.q0 = 0.0
        state.firmware.q1 = 0.0
    else:
        print("Homing: SIMULATION MODE")
        q_start = state.last_known_q
        q_end = [0.0, 0.0]
        
        if abs(q_start[0]) < 0.001 and abs(q_start[1]) < 0.001:
            return

        acc = SETTINGS['max_acc'] * 0.2 
        (f0, tf0) = tpy.cycloidal([q_start[0], q_end[0]], acc)
        (f1, tf1) = tpy.cycloidal([q_start[1], q_end[1]], acc)
        
        tf = max(tf0, tf1)
        ts = tpy.rangef(0, SETTINGS['Tc'], tf, True)
        
        q0s = [f0[0](t) for t in ts]
        q1s = [f1[0](t) for t in ts]
        penups = [1] * len(q0s)
        
        q = (q0s, q1s, penups)
        dq = ([f0[1](t) for t in ts], [f1[1](t) for t in ts])
        ddq = ([f0[2](t) for t in ts], [f1[2](t) for t in ts])
        
        serial_manager.send_data('trj', q=q, dq=dq, ddq=ddq)
        state.last_known_q = [0.0, 0.0]
