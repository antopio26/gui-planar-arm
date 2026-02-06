

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import SIZES, JOINT_LIMITS
from lib import trajpy as tpy
import math

print("--- SIZES ---")
print(SIZES)
print("--- LIMITS ---")
print(JOINT_LIMITS)

x,y = 0.05, 0.15
print(f"\nTesting IK for ({x}, {y})")

l1 = SIZES['l1']
l2 = SIZES['l2']
max_r = l1 + l2
r = math.sqrt(x**2 + y**2)
print(f"Radius: {r:.4f} (Max: {max_r:.4f})")

solutions = []
a1 = l1
a2 = l2
cos_q2 = (x**2+y**2-a1**2-a2**2)/(2*a1*a2)
print(f"Cos q2: {cos_q2:.4f}")

if abs(cos_q2) <= 1.0:
    q2_std = math.acos(cos_q2)
    q1_std = math.atan2(y,x)-math.atan2(a2*math.sin(q2_std), a1+a2*math.cos(q2_std))
    solutions.append((q1_std, q2_std))
    
    q2_alt = -q2_std
    q1_alt = math.atan2(y,x)-math.atan2(a2*math.sin(q2_alt), a1+a2*math.cos(q2_alt))
    solutions.append((q1_alt, q2_alt))

print("\nComputed Solutions:")
for i, sol in enumerate(solutions):
    print(f"Sol {i}: q1={sol[0]:.4f} ({math.degrees(sol[0]):.1f}), q2={sol[1]:.4f} ({math.degrees(sol[1]):.1f})")
    
    # Check limits
    valid = True
    if not (JOINT_LIMITS['q1_min'] <= sol[0] <= JOINT_LIMITS['q1_max']): valid = False
    if not (JOINT_LIMITS['q2_min'] <= sol[1] <= JOINT_LIMITS['q2_max']): valid = False
    print(f"  -> Valid? {valid}")

res = tpy.ik(x, y, 0, None, SIZES, JOINT_LIMITS)
print(f"\ntpy.ik result: {res}")
