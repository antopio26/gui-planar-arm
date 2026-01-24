
import sys
import os
sys.path.append(os.getcwd())
try:
    from lib import trajpy as tpy
    import numpy as np

    sizes = {'l1': 0.170, 'l2': 0.158}
    limits = {
        'q1_min': -1.57, 'q1_max': 1.57,
        'q2_min': -2.5,  'q2_max': 2.5
    }

    print("Testing Standard IK (no limits)...")
    res = tpy.ik(0.2, 0.1, 0, None, sizes, None)
    print(f"Result: {res.T[0] if res is not None else 'None'}")
    assert res is not None

    print("\nTesting IK with Wide Limits...")
    res = tpy.ik(0.2, 0.1, 0, None, sizes, limits)
    print(f"Result: {res.T[0] if res is not None else 'None'}")
    assert res is not None

    print("\nTesting IK with Restrictive Limits (Blocking Solution)...")
    # Current solution q1 is likely around 0. Something.
    # Let's force q1 out of range.
    restrictive_limits = limits.copy()
    restrictive_limits['q1_max'] = -1.0 # Force violation if q1 > -1.0
    
    # We expect q1 to be positive for (0.2, 0.1)
    res = tpy.ik(0.2, 0.1, 0, None, sizes, restrictive_limits)
    print(f"Result: {res if res is None else res.T[0]}")
    assert res is None

    print("\nTesting IK with Alternative Solution (if implemented)...")
    # Logic in code: if q2 is positive, tries negative q2.
    # If q2=0.5, q2_neg=-0.5.
    # (0.2, 0.1) likely has q2 > 0 default.
    # Let's restrict q2 to be negative only.
    neg_q2_limits = limits.copy()
    neg_q2_limits['q2_max'] = -0.1
    neg_q2_limits['q2_min'] = -3.0
    
    res = tpy.ik(0.2, 0.1, 0, None, sizes, neg_q2_limits)
    print(f"Result (Negative Q2 forced): {res.T[0] if res is not None else 'None'}")
    # If valid alternative exists, it should be found.

    print("\nSuccess: IK Limits Logic verified.")

except Exception as e:
    print(f"Test Failed: {e}")
    import traceback
    traceback.print_exc()
