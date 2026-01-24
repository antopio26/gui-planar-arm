import matplotlib.pyplot as plt
import numpy as np
from lib import trajpy as tpy
from config import SETTINGS
import os

# Ensure images directory exists
os.makedirs('images', exist_ok=True)

def debug_plot(q, name="image"):
    plt.figure()
    t = [i*SETTINGS['Tc'] for i in range(len(q))]
    plt.plot(t, q)
    plt.grid(visible=True)
    plt.savefig('images/'+name+'.png')
    plt.close()

def debug_plotXY(x, y, name="image"):
    plt.figure()
    plt.plot(x, y)
    plt.grid(visible=True)
    plt.savefig('images/'+name+'.png')
    plt.close()

def plot_recorded_data(des_q0, des_q1, Tc, rec_data):
    if not rec_data['t']:
        print("No data recorded to plot.")
        return

    plt.close('all') # FORCE CLOSE ALL PREVIOUS FIGURES
    plt.figure()
    
    # 1. Actual Time Axis
    t0 = rec_data['t'][0]
    t_act = np.array([ti - t0 for ti in rec_data['t']])
    q0_act = np.array(rec_data['q0'])
    
    # 2. Desired Time Axis
    t_des = np.array([i * Tc for i in range(len(des_q0))])
    q0_des = np.array(des_q0)
    
    # 3. Alignment Logic (Start/End Scaling)
    # 3. Alignment Logic (Start/End Scaling)
    # DISABLED: We want to see the RAW timing to verify the fix.
    # try:
    #     # ... (code removed/commented) ...
    #     pass      
    # except Exception as e:
    #     print(f"Alignment failed: {e}")

    # 4. Plotting
    plt.plot(t_des, des_q0, '--', label='q0_des', alpha=0.7)
    plt.plot(t_des, des_q1, '--', label='q1_des', alpha=0.7)
    plt.plot(t_act, rec_data['q0'], label='q0_act', linewidth=1.5)
    plt.plot(t_act, rec_data['q1'], label='q1_act', linewidth=1.5)
    
    plt.xlabel('Time (s)')
    plt.ylabel('Joint Position (rad)')
    plt.title('Trajectory Tracking: Desired vs Actual')
    plt.legend()
    plt.grid(visible=True)
    plt.savefig('images/recorded_trajectory.png')
    plt.close('all') # CLEANUP
    print("Recorded trajectory plot saved at images/recorded_trajectory.png")

    # 5. XY Plotting
    plt.figure()
    
    # Compute Desired XY
    x_des = []
    y_des = []
    for q0, q1 in zip(des_q0, des_q1):
        pos = tpy.dk(np.array([q0, q1]))
        x_des.append(pos[0][0])
        y_des.append(pos[1][0])
        
    # Compute Actual XY
    x_act = []
    y_act = []
    for q0, q1 in zip(rec_data['q0'], rec_data['q1']):
        pos = tpy.dk(np.array([q0, q1]))
        x_act.append(pos[0][0])
        y_act.append(pos[1][0])
        
    plt.plot(x_des, y_des, '--', label='Desired Path', alpha=0.7)
    plt.plot(x_act, y_act, label='Actual Path', linewidth=1.5)
    
    plt.xlabel('X Position (m)')
    plt.ylabel('Y Position (m)')
    plt.title('Path Tracking: Desired vs Actual')
    plt.legend()
    plt.grid(visible=True)
    plt.axis('equal') # Ensure aspect ratio is correct for spatial path
    plt.savefig('images/recorded_xy.png')
    plt.close('all')
    print("Recorded XY path plot saved at images/recorded_xy.png")
