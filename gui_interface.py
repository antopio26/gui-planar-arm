import eel
import numpy as np
import traceback
from time import sleep

from lib import trajpy as tpy
from config import SETTINGS, SIZES, MAX_SPEED_RAD, MAX_ACC_TOLERANCE_FACTOR, SERIAL_PORT
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
    print("\n--- TRAJECTORY VALIDATION ---")
    MAX_ACC_RAD = SETTINGS['max_acc'] * MAX_ACC_TOLERANCE_FACTOR
    
    valid = True
    
    # 1. Check Limits
    max_v = 0.0
    max_a = 0.0
    
    for i in range(len(dq[0])):
        v0 = abs(dq[0][i])
        v1 = abs(dq[1][i])
        a0 = abs(ddq[0][i])
        a1 = abs(ddq[1][i])
        
        max_v = max(max_v, v0, v1)
        max_a = max(max_a, a0, a1)
        
        if v0 > MAX_SPEED_RAD or v1 > MAX_SPEED_RAD:
            print(f"[!] VELOCITY VIOLATION at index {i}: {max(v0,v1):.2f} rad/s > {MAX_SPEED_RAD}")
            valid = False
        if a0 > MAX_ACC_RAD or a1 > MAX_ACC_RAD:
            print(f"[!] ACCELERATION VIOLATION at index {i}: {max(a0,a1):.2f} rad/s^2 > {MAX_ACC_RAD}")
            valid = False
            
    print(f"Stats: Max Vel={max_v:.2f}, Max Acc={max_a:.2f}")
    
    if not valid:
        print("!!! TRAJECTORY UNSAFE - ABORTING SUGGESTED !!!")
    else:
        print("Trajectory Dynamics: OK")

    return valid

def trace_trajectory(q:tuple[list,list,list]):
    q1 = q[0][:]
    q2 = q[1][:]
    penups = q[2][:]
    eel.js_draw_traces([q1, q2])
    eel.js_draw_pose([q1[-1], q2[-1]], penups[-1])

    # DEBUG
    x = [] 
    for i in range(len(q1)):
        x.append(tpy.dk(np.array([q1[i], q2[i]]).T))
    plotting.debug_plotXY([xt[0] for xt in x], [yt[1] for yt in x], "xy")

# --- EEL EXPOSED FUNCTIONS ---

@eel.expose
def py_log(msg):
    print(msg)

def resolve_config(settings_override=None):
    sizes = SIZES.copy()
    limits = None # usage of imported JOINT_LIMITS is possible but we need to check if it's imported globally.
    # It is imported in py_get_config only. 
    # Let's import it here or trust that if settings_override is None we use defaults passed to functions
    
    if settings_override:
        if 'l1' in settings_override: sizes['l1'] = float(settings_override['l1'])
        if 'l2' in settings_override: sizes['l2'] = float(settings_override['l2'])
        if 'limits' in settings_override: limits = settings_override['limits']
        
    return sizes, limits

@eel.expose
def py_get_data(settings_override=None):
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
        
        sizes, limits = resolve_config(settings_override)
        print(f"Using Config: Sizes={sizes}, Limits={limits}")

        # Use current robot position as starting seed for continuity
        # state.last_known_q is [q1, q2]
        current_joint_pos = state.last_known_q 
        
        for patch in data: 
            (q0s_p, q1s_p, penups_p, ts_p) = tpy.slice_trj(
                patch, 
                Tc=SETTINGS['Tc'],
                max_acc=SETTINGS['max_acc'],
                line=SETTINGS['line_tl'],
                circle=SETTINGS['circle_tl'],
                sizes=sizes,
                limits=limits,
                initial_q=current_joint_pos
            )
            # Stitching logic
            q0s += q0s_p if len(q0s) == 0 else q0s_p[1:] 
            q1s += q1s_p if len(q1s) == 0 else q1s_p[1:]
            penups += penups_p if len(penups) == 0 else penups_p[1:]
            ts += [(t + ts[-1] if len(ts) > 0  else t) for t in (ts_p if len(ts) == 0 else ts_p[1:])]
            
            # Update seed for next patch
            if len(q0s_p) > 0:
                current_joint_pos = [q0s_p[-1], q1s_p[-1]]

        q = (q0s, q1s, penups)
        dq = (tpy.find_velocities(q[0], ts), tpy.find_velocities(q[1], ts))
        ddq = (tpy.find_accelerations(dq[0], ts), tpy.find_accelerations(dq[1], ts))
        
        if not validate_trajectory(q, dq, ddq):
            raise Exception("Trajectory Validation Failed: Safety limit exceeded. Execution aborted.")
            
        state.stop_requested = False # Reset flag before start
        serial_manager.send_data('trj', q=q, dq=dq, ddq=ddq)
        
        if len(q0s) > 0:
             state.last_known_q = [q0s[-1], q1s[-1]]
        
        trace_trajectory(q)
        
        # DEBUG PLOTS
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
def py_compute_trajectory(settings_override=None):
    """
    Computes the trajectory in Joint Space (q1, q2) without sending it to serial.
    Returns: { 'q1': [float], 'q2': [float], 'penups': [bool] } or None if error.
    """
    try:
        data: list = eel.js_get_data()()
        if len(data) < 1: 
            return None # Not enough points

        # We assume start from current position (or last known)
        current_q = read_position_cartesian()
        
        # Add initial path from current position
        data = [{'type':'line', 'points':[current_q, data[0]['points'][0]], 'data':{'penup':True}}] + data[::]
        
        # Stitch patches
        q0s = []
        q1s = []
        penups = []
        ts = []
        
        sizes, limits = resolve_config(settings_override)

        # Simulation/Preview only -> Use internal state last know
        current_joint_pos = state.last_known_q 
        
        for patch in data: 
            (q0s_p, q1s_p, penups_p, ts_p) = tpy.slice_trj(
                patch, 
                Tc=SETTINGS['Tc'],
                max_acc=SETTINGS['max_acc'],
                line=SETTINGS['line_tl'],
                circle=SETTINGS['circle_tl'],
                sizes=sizes,
                limits=limits,
                initial_q=current_joint_pos
            )
            # Stitching logic
            q0s += q0s_p if len(q0s) == 0 else q0s_p[1:] 
            q1s += q1s_p if len(q1s) == 0 else q1s_p[1:]
            penups += penups_p if len(penups) == 0 else penups_p[1:]
            ts += [(t + ts[-1] if len(ts) > 0  else t) for t in (ts_p if len(ts) == 0 else ts_p[1:])]
            
            # Update seed for next patch
            if len(q0s_p) > 0:
                current_joint_pos = [q0s_p[-1], q1s_p[-1]]

        return {
            'q1': q0s,
            'q2': q1s,
            'penups': penups
        }

    except Exception as e:
        print(f"Error in py_compute_trajectory: {e}")
        traceback.print_exc()
        return None

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
def py_log_data():
    # Deprecated or needs update if used? 
    # original logic wrote to 'log_data.csv' from global dict
    # Re-implementing basic dump
    try:
        with open('log_data.csv', 'w') as f:
            f.write("time,q0,q1\n") # Minimal header
            # Dump state.log_data if populated (currently empty in init)
            # The original code logic was a bit weird constructing string
            pass
    except Exception as e:
        print(e)

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

@eel.expose
def py_get_config():
    # Return relevant config to frontend
    # config contains callables (lambdas), so we pick what we need
    from config import JOINT_LIMITS 
    
    return {
        'sizes': SIZES,
        'limits': JOINT_LIMITS,
        'max_acc': SETTINGS['max_acc']
    }


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
def py_generate_text(text, options, settings_override=None):
    print(f"Generating Text: '{text}' with options: {options}")
    try:
        if not text: return []
        
        mode = options.get('mode', 'linear')
        font_size = float(options.get('fontSize', 0.05))
        
        
        # 1. Generate Base Text (Linear, at origin)
        # We pass start_pos=(0,0) and handle placement via transform
        patches = char_gen.text_to_traj(text, (0,0), font_size, char_spacing=font_size*0.2)
        
        # 2. Apply Transform
        final_patches = []
        
        if mode == 'linear':
            x = float(options.get('x', 0.05))
            y = float(options.get('y', 0.0))
            angle = float(options.get('angle', 0.0))
            final_patches = _apply_linear_transform(patches, x, y, angle)
            
        elif mode == 'curved':
            radius = float(options.get('radius', 0.2))
            offset = float(options.get('offset', 90))
            final_patches = _apply_curved_transform(patches, radius, offset)
            
        else:
            final_patches = patches

        return final_patches
        
    except Exception as e:
        print(f"Error generating text: {e}")
        traceback.print_exc()
        return []

@eel.expose
def py_validate_text(text, options, settings_override=None):
    # Generate the trajectory first
    patches = py_generate_text(text, options, settings_override)
    
    if not patches:
        return {'valid': True, 'message': 'Empty'}

    valid = True
    msg = "OK"
    
    sizes, limits = resolve_config(settings_override)
    
    # Check every point against IK or Workspace limits
    # We can use tpy.ik to check if a solution exists
    for patch in patches:
        for p in patch['points']:
            try:
                # Check if point is reachable
                # tpy.ik returns numpy array of q1, q2
                # If it raises error or returns NaNs (depends on implementation), it's invalid.
                
                x, y = p
                
                # Check using updated IK with limits
                # tpy.ik returns None if out of reach or limits violation
                res = tpy.ik(x, y, 0, None, sizes, limits)
                
                if res is None:
                    valid = False
                    msg = "Point out of reach or Limit violation"
                    break
                    
            except Exception as e:
                valid = False
                msg = f"IK Error: {e}"
                break
        if not valid: break
        
    return {'valid': valid, 'message': msg}
