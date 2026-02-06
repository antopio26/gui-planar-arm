
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib import char_gen
from handlers import trajectory_handler
from config import SIZES, JOINT_LIMITS, SETTINGS
import numpy as np

def test_char_generation_splitting():
    print("\n--- Testing Character Generation Splitting ---")
    
    # Test 'A' -> Should have splits at the top
    # The 'A' def is: 
    # {'type': 'line', 'points': [(0,0), (0.5,1), (1,0)]}, 
    # {'type': 'line', 'points': [(0.2, 0.4), (0.8, 0.4)]}
    # The first primitive has a sharp turn at (0.5, 1). 
    # Let's see if text_to_traj splits it into two polylines (or line segments).
    
    text = "A"
    patches = char_gen.text_to_traj(text, (0.05, 0.15), 0.04, 0.01) # Use valid position
    
    # Expected: 
    # 1. Polyline/Line for left leg (0,0)->(0.5,1)
    # 2. Polyline/Line for right leg (0.5,1)->(1,0) (Because of sharp turn split)
    # 3. Jump to crossbar start
    # 4. Crossbar
    
    print(f"Patches generated for 'A': {len(patches)}")
    for i, p in enumerate(patches):
        pts = p['points']
        print(f"  Patch {i}: Type={p['type']}, Profile={p['data'].get('profile')}, Points={len(pts)}")
        # print(f"    {pts}")

    # Check for split in the first primitive (legs)
    # If not split, the first patch would have 3 points: start, top, bottom-right.
    # If split, we should have a patch ending at top, and next starting at top.
    
    # Filter out jumps
    draw_patches = [p for p in patches if not p['data']['penup']]
    
    if len(draw_patches) >= 3:
        print("PASS: 'A' seems to be split (at least 3 drawing segments: leg1, leg2, crossbar)")
    else:
        print(f"FAIL: 'A' has only {len(draw_patches)} segments. (Expected split at top vertex)")
        
    
def test_speed_profiles():
    print("\n--- Testing Speed Profiles ---")
    
    # Compare 'I' (linear) vs 'O' (curved)
    
    # 1. Generate 'I'
    patches_I = char_gen.text_to_traj("I", (0.05, 0.15), 0.04, 0.01)
    patch_I = [p for p in patches_I if not p['data']['penup']][0] # Main vertical line
    print(f"Patch 'I' Profile: {patch_I['data'].get('profile')}")
    
    # 2. Generate 'O'
    patches_O = char_gen.text_to_traj("O", (0.05, 0.15), 0.04, 0.01)
    patch_O = [p for p in patches_O if not p['data']['penup']][0] # Circle
    print(f"Patch 'O' Profile: {patch_O['data'].get('profile')}")
    
    if patch_O['data'].get('profile') != 'curve':
        print("FAIL: 'O' profile is not 'curve'")
        
    # Valid start q for (0.05, 0.15).
    import math
    from lib import trajpy as tpy
    
    res_start = tpy.ik(0.05, 0.15, 0, None, SIZES, JOINT_LIMITS)
    if res_start is None:
        print("FAIL: Start position IK failed!")
        return
        
    start_q = [res_start[0,0], res_start[1,0]]
    
    # Compute Trajectory for 'O'
    q0, q1, pu, ts_O, _ = trajectory_handler.generate_trajectory_data([patch_O], SIZES, JOINT_LIMITS, start_q)
    dur_O = ts_O[-1] if ts_O else 0
    
    # Control Case: Linear segment of same length (approx 0.125)
    # patch_O is polyline with length ~0.1134 (from previous debug log)
    # Let's use 0.1134 as target length for control
    len_O = 0.1134
    
    patch_C = {
        'type': 'line', 
        'points': [(0.05, 0.15), (0.05 + len_O, 0.15)], 
        'data': {'penup': False, 'profile': 'linear'}
    }
    q0, q1, pu, ts_C, _ = trajectory_handler.generate_trajectory_data([patch_C], SIZES, JOINT_LIMITS, start_q)
    dur_C = ts_C[-1] if ts_C else 0
    
    print(f"Duration O (Curve, Acc=0.5): {dur_O:.4f}")
    print(f"Duration C (Lin,   Acc=1.0): {dur_C:.4f}")
    
    if dur_O > dur_C:
        print(f"PASS: Curved 'O' is slower than equal-length Linear segment (Ratio: {dur_O/dur_C:.2f}, Expected ~1.41)")
    else:
        print(f"FAIL: Curved 'O' is NOT slower than Linear segment.")

if __name__ == "__main__":
    test_char_generation_splitting()
    test_speed_profiles()
    print("\nDone.")
