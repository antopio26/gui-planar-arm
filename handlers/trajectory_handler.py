import numpy as np
from lib import trajpy as tpy
from config import SIZES, SETTINGS, MAX_SPEED_RAD, MAX_ACC_TOLERANCE_FACTOR

def validate_trajectory_dynamics(q, dq, ddq):
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

def generate_trajectory_data(data_points, current_sizes, current_limits, current_joint_pos):
    """
    Common logic to stitch trajectory patches into full joint lists.
    Returns: (q0s, q1s, penups, ts, last_joint_pos)
    """
    q0s, q1s, penups, ts = [], [], [], []
    
    for patch in data_points:
        (q0s_p, q1s_p, penups_p, ts_p) = tpy.slice_trj(
            patch, 
            Tc=SETTINGS['Tc'],
            max_acc=SETTINGS['max_acc'],
            line=SETTINGS['line_tl'],
            circle=SETTINGS['circle_tl'],
            sizes=current_sizes,
            limits=current_limits,
            initial_q=current_joint_pos
        )
        # Stitching logic
        if len(q0s_p) > 0:
            start_new = np.array([q0s_p[0], q1s_p[0]])
            prev_end = np.array(current_joint_pos)
            dist = np.linalg.norm(start_new - prev_end)
            
            if dist > 0.1: # 0.1 rad tolerance
                error_msg = f"Stitching Jump Detected: {dist:.4f} rad. New segment starts far from previous end."
                print(f"[!] {error_msg}")
                raise Exception(error_msg)
                print(f"    Prev End: {prev_end}")
                print(f"    New Start: {start_new}")
                print(f"    Patch Type: {patch.get('type')}, PenUp: {patch.get('data', {}).get('penup')}")

        q0s += q0s_p if len(q0s) == 0 else q0s_p[1:] 
        q1s += q1s_p if len(q1s) == 0 else q1s_p[1:]
        penups += penups_p if len(penups) == 0 else penups_p[1:]
        ts += [(t + ts[-1] if len(ts) > 0  else t) for t in (ts_p if len(ts) == 0 else ts_p[1:])]
        
        # Update seed for next patch
        if len(q0s_p) > 0:
            current_joint_pos = [q0s_p[-1], q1s_p[-1]]
            
    return q0s, q1s, penups, ts, current_joint_pos
