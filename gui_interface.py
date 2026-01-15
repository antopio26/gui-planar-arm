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

def trace_trajectory(q:tuple[list,list]):
    q1 = q[0][:]
    q2 = q[1][:]
    eel.js_draw_traces([q1, q2])
    eel.js_draw_pose([q1[-1], q2[-1]])

    # DEBUG
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
        
        validate_trajectory(q, dq, ddq)
        
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
    packet = bp.encode_homing_command()
    print(f"Homing packet sent: {packet}")
    scm.write_data(packet)
    state.last_known_q = [0.0, 0.0]

@eel.expose
def py_serial_online():
    return SETTINGS['ser_started']

@eel.expose
def py_serial_startup():
    print(f"Calling scm.ser_init({SERIAL_PORT})...")
    SETTINGS['ser_started'] = scm.ser_init(SERIAL_PORT)
    print(f"Serial Started? {SETTINGS['ser_started']}")


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
