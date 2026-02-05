
import sys
import os
import numpy as np

# Adjust path to include the current directory
sys.path.append(os.getcwd())

from lib import char_gen
from lib import trajpy as tpy
from config import SIZES, SETTINGS

def verify_polyline():
    text = "ciaso"
    # User Options
    options = {'mode': 'linear', 'fontSize': 0.04, 'x': 0.22, 'y': 0.17, 'angle': -90, 'radius': 0.2, 'offset': 90}
    
    print(f"Generating trajectory for text: '{text}' with options: {options}")
    
    # 1. Generate Base Text at origin (as per gui_interface.py)
    # font_size=0.04 (User value)
    patches = char_gen.text_to_traj(text, (0,0), 0.04, 0.04*0.2)
    
    # 2. Apply Transform (copied from gui_interface.py)
    import math
    final_patches = []
    mode = options.get('mode', 'linear')
    if mode == 'linear':
        x = float(options.get('x', 0.05))
        y = float(options.get('y', 0.0))
        angle = float(options.get('angle', 0.0))
        
        angle_rad = math.radians(angle)
        cos_a = math.cos(angle_rad)
        sin_a = math.sin(angle_rad)
        
        for patch in patches:
            new_points = []
            for p in patch['points']:
                # p is (x,y) tuple. transform assumes [0] [1] access.
                x_rot = p[0] * cos_a - p[1] * sin_a
                y_rot = p[0] * sin_a + p[1] * cos_a
                new_points.append([x_rot + x, y_rot + y])
            final_patches.append({**patch, 'points': new_points})
    
    patches = final_patches
    # ... rest of script ...
    
    # 2. Slice Trajectory 
    print("\nSlicing Trajectory (Generating Points)...")
    
    current_sizes = SIZES
    # Use config limits or default
    current_limits = SETTINGS.get('limits', None) 
    # Actually limits are separate constant JOINT_LIMITS in config
    from config import JOINT_LIMITS
    current_limits = JOINT_LIMITS

    # Initialize state
    # In App, state starts at Home or Last Known.
    # The Log says "READ POS ... [0.002, -0.001]". So effectively [0,0].
    # But the App adds a LEAD-IN MOVE from [0,0] to Start.
    # We should simulate that too?
    # Or just jump to start. If IK is unstable, jump to start might pick wrong branch.
    
    # Let's start from Home [0,0] and see if IK finds a path to first point.
    current_joint_pos = [0.0, 0.0] 
    
    # Add Lead-in (Line from 0,0 to First Point)
    first_target = patches[0]['points'][0]
    # In App, read_position_cartesian returns current DK. 
    # For [0,0], DK is (l1+l2, 0) = (0.328, 0).
    
    # Actually, let's just seed with [0,0] for the first point's IK.
    # But wait, [0,0] is "elbow straight". 
    # The target might be "elbow up" or "elbow down".
    # [0,0] is a singularity boundary.
    # If seed is [0,0], which branch does it pick?
    
    res = tpy.ik(first_target[0], first_target[1], 0, None, current_sizes, current_limits, seed_q=np.array([[0],[0],[0]]))
    if res is None:
         print(f"FAIL: Initial IK failed for {first_target}.")
         return
    current_joint_pos = [res[0,0], res[1,0]]
    print(f"Initial Q (Start of Text): {current_joint_pos}")

    for i, patch in enumerate(patches):
        print(f"\nProcessing Patch {i} ({patch['type']}):")
        try:
            q0s, q1s, penups, ts = tpy.slice_trj(
                patch,
                Tc=0.01,
                max_acc=0.5,
                line=SETTINGS['line_tl'],
                circle=SETTINGS['circle_tl'],
                sizes=current_sizes,
                limits=current_limits,
                initial_q=current_joint_pos
            )
            
            if not q0s:
                print("  WARNING: No points generated.")
                continue

            # Check Start vs Previous End
            start_q = np.array([q0s[0], q1s[0]])
            prev_q = np.array(current_joint_pos)
            dist = np.linalg.norm(start_q - prev_q)
            print(f"  Stitching Dist: {dist:.6f} rad")
            if dist > 0.1:
                print(f"  [!] JUMP DETECTED!")
                print(f"      Prev: {prev_q}")
                print(f"      New:  {start_q}")
                # dk check
                dk_prev = tpy.dk(np.array([[prev_q[0]], [prev_q[1]]]), current_sizes)
                dk_new = tpy.dk(np.array([[start_q[0]], [start_q[1]]]), current_sizes)
                print(f"      DK Prev: {dk_prev.T[0]}")
                print(f"      DK New:  {dk_new.T[0]}")
                
            # Update State
            current_joint_pos = [q0s[-1], q1s[-1]]
            print(f"  End Q: {current_joint_pos}")
            
        except Exception as e:
            print(f"FAIL: Error slicing patch: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    verify_polyline()
