import eel
import numpy as np
import traceback
from time import sleep

from lib import trajpy as tpy
from config import SETTINGS, SIZES, MAX_SPEED_RAD, MAX_ACC_TOLERANCE_FACTOR, SERIAL_PORT, DEBUG_MODE
from state import state
from serial_manager import serial_manager
from lib import serial_com as scm
from lib import binary_protocol as bp
from lib import char_gen
from lib import transform
import plotting
import math

def read_position_cartesian() -> list[float]:
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
    points = tpy.dk(np.array(q_actual), SIZES)
    return [points[0,0], points[1,0]]

def validate_trajectory(q, dq, ddq):
    """
    Validate trajectory against speed/acceleration limits.
    Returns: (is_valid, scale_factor)
    - is_valid: True if within limits (possibly after scaling)
    - scale_factor: Factor to multiply time intervals by (1.0 if already valid, >1.0 if needs slowing)
    """
    print("\n--- TRAJECTORY VALIDATION ---")
    MAX_ACC_RAD = SETTINGS['max_acc'] * MAX_ACC_TOLERANCE_FACTOR
    
    # Find maximum velocity and acceleration
    max_v = 0.0
    max_a = 0.0
    
    for i in range(len(dq[0])):
        v0 = abs(dq[0][i])
        v1 = abs(dq[1][i])
        a0 = abs(ddq[0][i])
        a1 = abs(ddq[1][i])
        
        max_v = max(max_v, v0, v1)
        max_a = max(max_a, a0, a1)
    
    print(f"Stats: Max Vel={max_v:.2f} rad/s (limit: {MAX_SPEED_RAD}), Max Acc={max_a:.2f} rad/s^2 (limit: {MAX_ACC_RAD:.2f})")
    
    # Calculate required scale factor
    # For velocity: v' = v / scale -> need scale >= v / v_max
    # For acceleration: a' = a / scale^2 -> need scale >= sqrt(a / a_max)
    scale_v = max_v / MAX_SPEED_RAD if max_v > MAX_SPEED_RAD else 1.0
    scale_a = (max_a / MAX_ACC_RAD) ** 0.5 if max_a > MAX_ACC_RAD else 1.0
    
    scale_factor = max(scale_v, scale_a)
    
    if scale_factor > 1.0:
        print(f"[!] Trajectory exceeds limits. Auto-scaling by factor {scale_factor:.2f}x (slower)")
        print(f"    New max vel: {max_v/scale_factor:.2f} rad/s, New max acc: {max_a/(scale_factor**2):.2f} rad/s^2")
        return (True, scale_factor)
    else:
        print("Trajectory Dynamics: OK")
        return (True, 1.0)

def trace_trajectory(q:tuple[list,list]):
    q1 = q[0][:]
    q2 = q[1][:]
    eel.js_draw_traces([q1, q2])
    eel.js_draw_pose([q1[-1], q2[-1]])

    # DEBUG
    if DEBUG_MODE:
        x = [] 
        for i in range(len(q1)):
            x.append(tpy.dk(np.array([q1[i], q2[i]]).T))
        plotting.debug_plotXY([xt[0] for xt in x], [yt[1] for yt in x], "xy")

# --- EEL EXPOSED FUNCTIONS ---

@eel.expose
def py_log(msg):
    print(msg)

@eel.expose
def py_get_data():
    try:
        data: list = eel.js_get_data()()
        if len(data) < 1: 
            raise Exception("Not Enough Points to build a Trajectory")
            
        current_q = read_position_cartesian()
        print(f"Start Point: {current_q}")
        
        # Add initial path from current position
        data = [{'type':'line', 'points':[current_q, data[0]['points'][0]], 'data':{'penup':True}}] + data[::]
        
        # Stitch patches
        q0s = []
        q1s = []
        penups = []
        ts = []
        for patch in data: 
            (q0s_p, q1s_p, penups_p, ts_p) = tpy.slice_trj(
                patch, 
                Tc=SETTINGS['Tc'],
                max_acc=SETTINGS['max_acc'],
                line=SETTINGS['line_tl'],
                circle=SETTINGS['circle_tl'],
                sizes=SIZES
            )
            # Stitching logic
            q0s += q0s_p if len(q0s) == 0 else q0s_p[1:] 
            q1s += q1s_p if len(q1s) == 0 else q1s_p[1:]
            penups += penups_p if len(penups) == 0 else penups_p[1:]
            ts += [(t + ts[-1] if len(ts) > 0  else t) for t in (ts_p if len(ts) == 0 else ts_p[1:])]

        q = (q0s, q1s, penups)
        dq = (tpy.find_velocities(q[0], ts), tpy.find_velocities(q[1], ts))
        ddq = (tpy.find_accelerations(dq[0], ts), tpy.find_accelerations(dq[1], ts))
        
        # Validate and get scale factor
        (is_valid, scale_factor) = validate_trajectory(q, dq, ddq)
        
        # Apply scaling if needed
        if scale_factor > 1.0:
            print(f"Applying time scaling factor: {scale_factor:.2f}x")
            # Scale time intervals
            ts_scaled = [t * scale_factor for t in ts]
            # Recalculate velocities and accelerations with scaled time
            dq = (tpy.find_velocities(q[0], ts_scaled), tpy.find_velocities(q[1], ts_scaled))
            ddq = (tpy.find_accelerations(dq[0], ts_scaled), tpy.find_accelerations(dq[1], ts_scaled))
            ts = ts_scaled
            print(f"Trajectory scaled. New duration: {ts[-1]:.2f}s")
            
        state.stop_requested = False # Reset flag before start
        serial_manager.send_data('trj', q=q, dq=dq, ddq=ddq)
        
        if len(q0s) > 0:
             state.last_known_q = [q0s[-1], q1s[-1]]
        
        trace_trajectory(q)
        
        # DEBUG PLOTS
        if DEBUG_MODE:
            plotting.debug_plot(q[0], 'q1')
            plotting.debug_plot(dq[0], 'dq1')
            plotting.debug_plot(ddq[0], 'ddq1')
            plotting.debug_plot(q[1], 'q2')
            plotting.debug_plot(dq[1], 'dq2')
            plotting.debug_plot(ddq[1], 'ddq2')

    except Exception as e:
        print(f"Error in py_get_data: {e}")
        print(traceback.format_exc())

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
        # Real Robot Homing
        packet = bp.encode_homing_command()
        print(f"Homing packet sent: {packet}")
        scm.write_data(packet)
        # We assume the robot resets. 
        # Ideally we should wait for feedback, but for now we reset state locally too.
        state.last_known_q = [0.0, 0.0]
        state.firmware.q0 = 0.0
        state.firmware.q1 = 0.0
    else:
        # Simulated Homing
        print("Homing: SIMULATION MODE")
        
        # Get start position
        q_start = state.last_known_q
        q_end = [0.0, 0.0]
        
        # If already at 0, do nothing
        if abs(q_start[0]) < 0.001 and abs(q_start[1]) < 0.001:
            print("Already at home.")
            return

        # Generate smooth trajectory (Cycloidal)
        # Using max_acc/5 for gentle homing
        acc = SETTINGS['max_acc'] * 0.2 
        
        # Trajpy cycloidal returns tuple (functions, duration)
        # We need to compose for both joints.
        # cycloidal([start, end], acc)
        
        (f0, tf0) = tpy.cycloidal([q_start[0], q_end[0]], acc)
        (f1, tf1) = tpy.cycloidal([q_start[1], q_end[1]], acc)
        
        tf = max(tf0, tf1)
        
        # Sample points
        ts = tpy.rangef(0, SETTINGS['Tc'], tf, True)
        
        q0s = [f0[0](t) for t in ts]
        q1s = [f1[0](t) for t in ts]
        
        # Velocity/Acc (Optional for sim but good for plot)
        dq0s = [f0[1](t) for t in ts]
        dq1s = [f1[1](t) for t in ts]
        
        ddq0s = [f0[2](t) for t in ts]
        ddq1s = [f1[2](t) for t in ts] # Corrected from f0 to f1
        
        # Package for serial_manager (Sim Engine)
        # It expects tuple lists: q=(q0s, q1s, penups)
        # penups = 1 (Up) usually for homing to be safe? Or 0?
        # Let's say 1 (Up).
        penups = [1] * len(q0s)
        
        q = (q0s, q1s, penups)
        dq = (dq0s, dq1s)
        ddq = (ddq0s, ddq1s) # We don't really use this in sim, but consisteny
        
        # Send to manager
        serial_manager.send_data('trj', q=q, dq=dq, ddq=ddq)
        
        # Update last known
        state.last_known_q = [0.0, 0.0]

@eel.expose
def py_serial_online():
    return SETTINGS['ser_started']

@eel.expose
def py_serial_startup():
    print(f"Calling scm.ser_init({SERIAL_PORT})...")
    SETTINGS['ser_started'] = scm.ser_init(SERIAL_PORT)
    print(f"Serial Started? {SETTINGS['ser_started']}")

@eel.expose
def py_get_position():
    # Return current robot state for Polling (Backup for Push)
    q0, q1, pen_up = state.firmware.get_position()
    return [q0, q1, pen_up]

@eel.expose
def py_clear_state():
    print("Clearing Backend State...")
    # Reset State
    state.recording_active = False
    state.reset_recording()
    
    # If serial is connected, maybe stop any current motion?
    # Sending empty trajectory or stop?
    # For now, just reset internal trackers.
    state.last_known_q = [state.firmware.q0, state.firmware.q1]
    
    if SETTINGS['ser_started']:
        # Optional: Send a specific invalidation command if protocol supports it
        pass
        
    return True


def _apply_linear_transform(patches, x_offset, y_offset, angle_deg):
    angle_rad = math.radians(angle_deg)
    cos_a = math.cos(angle_rad)
    sin_a = math.sin(angle_rad)
    
    transformed = []
    for patch in patches:
        new_points = []
        for p in patch['points']:
            # Rotation
            x_rot = p[0] * cos_a - p[1] * sin_a
            y_rot = p[0] * sin_a + p[1] * cos_a
            # Translation
            new_points.append([x_rot + x_offset, y_rot + y_offset])
            
        transformed.append({
            'type': patch['type'],
            'points': new_points,
            'data': patch['data']
        })
    return transformed

def _apply_curved_transform(patches, radius, offset_angle):
    # Convert patches to the format expected by transform.py (if needed)
    # OR better: just implement the loop here using transform.apply_curved_transform logic
    # But since we wrote apply_curved_transform to take a list of dicts {x,y,z}, 
    # we can adapt.
    
    transformed = []
    
    for patch in patches:
        # Create a temporary trajectory list for this patch's points
        temp_traj = []
        for p in patch['points']:
            temp_traj.append({'x': p[0], 'y': p[1], 'z': 0}) # Z doesn't matter much here
            
        # Transform
        # Note: char_gen outputs X as horizontal, Y as vertical.
        # transform.apply_curved_transform maps X to Angle, Y to Radius.
        # We need to ensure scale is correct. 
        # But stick with unit units?
        
        # Call the library function
        res = transform.apply_curved_transform(temp_traj, radius, start_angle_deg=offset_angle)
        
        new_points = [[pt['x'], pt['y']] for pt in res]
        
        transformed.append({
            'type': patch['type'],
            'points': new_points,
            'data': patch['data']
        })
        
    return transformed

@eel.expose
def py_generate_text(text, options):
    print(f"Generating Text: '{text}' with options: {options}")
    try:
        # Input Validation
        if not text or not isinstance(text, str):
            print("Invalid text input: empty or not a string")
            return []
        
        if len(text) > 100:
            print(f"Text too long: {len(text)} chars (max 100)")
            return []
        
        # Validate mode
        mode = options.get('mode', 'linear')
        if mode not in ['linear', 'curved']:
            print(f"Invalid mode: {mode}")
            return []
        
        # Validate numeric parameters
        try:
            font_size = float(options.get('fontSize', 0.05))
            if not (0.01 <= font_size <= 0.2):
                print(f"Font size out of range: {font_size} (valid: 0.01-0.2)")
                return []
        except (ValueError, TypeError) as e:
            print(f"Invalid fontSize: {e}")
            return []
        
        # 1. Generate Base Text (Linear, at origin)
        # We pass start_pos=(0,0) and handle placement via transform
        patches = char_gen.text_to_traj(text, (0,0), font_size, char_spacing=font_size*0.2)
        
        # 2. Apply Transform
        final_patches = []
        
        if mode == 'linear':
            try:
                x = float(options.get('x', 0.05))
                y = float(options.get('y', 0.0))
                angle = float(options.get('angle', 0.0))
                
                # Removed strict range validation - frontend handles geometry validation
                # Robot reach is ~0.328m, so values up to 0.35 are reasonable
                    
                final_patches = _apply_linear_transform(patches, x, y, angle)
            except (ValueError, TypeError) as e:
                print(f"Invalid linear parameters: {e}")
                return []
            
        elif mode == 'curved':
            try:
                radius = float(options.get('radius', 0.2))
                offset = float(options.get('offset', 90))
                
                # Removed strict range validation - frontend handles geometry validation
                # Just ensure radius is positive
                if radius <= 0:
                    print(f"Radius must be positive: {radius}")
                    return []
                    
                final_patches = _apply_curved_transform(patches, radius, offset)
            except (ValueError, TypeError) as e:
                print(f"Invalid curved parameters: {e}")
                return []
            
        else:
            final_patches = patches

        return final_patches
        
    except Exception as e:
        print(f"Error generating text: {e}")
        traceback.print_exc()
        return []

@eel.expose
def py_validate_text(text, options):
    # Generate the trajectory first
    patches = py_generate_text(text, options)
    
    if not patches:
        return {'valid': True, 'message': 'Empty'}

    valid = True
    msg = "OK"
    
    # Check every point against IK or Workspace limits
    # We can use tpy.ik to check if a solution exists
    for patch in patches:
        for p in patch['points']:
            try:
                # Check if point is reachable
                # tpy.ik returns numpy array of q1, q2
                # If it raises error or returns NaNs (depends on implementation), it's invalid.
                # Looking at tpy.ik (dk is imported), let's assume it might throw or we check bounds.
                # Actually commonly verification is checking if point is within reach.
                # R_min < dist < R_max
                
                x, y = p
                dist = (x**2 + y**2)**0.5
                
                # Check simple radius bounds
                l1 = SIZES['l1']
                l2 = SIZES['l2']
                max_reach = l1 + l2
                min_reach = abs(l1 - l2)
                
                if dist > max_reach * 0.99 or dist < min_reach * 1.01:
                    valid = False
                    msg = "Point out of reach"
                    break
                    
            except Exception as e:
                valid = False
                msg = f"IK Error: {e}"
                break
        if not valid: break
        
    return {'valid': valid, 'message': msg}

import os
import json

TEMPLATE_DIR = "saved_trajectories"

@eel.expose
def py_save_template(filename, data):
    print(f"Saving Template: {filename}")
    try:
        if not filename:
            raise ValueError("Filename cannot be empty")
        
        # Add .json extension if missing
        if not filename.endswith('.json'):
            filename += ".json"
            
        # Ensure dir exists (redundant check)
        if not os.path.exists(TEMPLATE_DIR):
            os.makedirs(TEMPLATE_DIR)
            
        filepath = os.path.join(TEMPLATE_DIR, filename)
        
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=4)
            
        print(f"Saved to {filepath}")
        return {'success': True, 'message': f"Saved {filename}"}
        
    except Exception as e:
        print(f"Save Error: {e}")
        return {'success': False, 'message': str(e)}

@eel.expose
def py_load_template(filename):
    print(f"Loading Template: {filename}")
    try:
        filepath = os.path.join(TEMPLATE_DIR, filename)
        if not os.path.exists(filepath):
             raise FileNotFoundError(f"File {filename} not found")
             
        with open(filepath, 'r') as f:
            data = json.load(f)
            
        return {'success': True, 'data': data}
        
    except Exception as e:
        print(f"Load Error: {e}")
        return {'success': False, 'message': str(e)}

@eel.expose
def py_list_templates():
    try:
        if not os.path.exists(TEMPLATE_DIR):
            return []
            
        files = [f for f in os.listdir(TEMPLATE_DIR) if f.endswith('.json')]
        return files
        
    except Exception as e:
        print(f"List Error: {e}")
        return []

@eel.expose
def py_delete_template(filename):
    print(f"Deleting Template: {filename}")
    try:
        if not filename:
            raise ValueError("Filename cannot be empty")
            
        filepath = os.path.join(TEMPLATE_DIR, filename)
        
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"File {filename} not found")
            
        os.remove(filepath)
        print(f"Deleted {filepath}")
        return {'success': True, 'message': f"Deleted {filename}"}
        
    except Exception as e:
        print(f"Delete Error: {e}")
        return {'success': False, 'message': str(e)}
