import eel # GUI
import math
import matplotlib.pyplot as plt # needed for plotting
import numpy as np # arrays
from time import sleep as tsleep, time
from math import cos, sin, tan, pi
from struct import pack, unpack
from binascii import unhexlify
import threading

from sys import stderr # standard error stream
from signal import signal, SIGINT # close the serial even if the server is forced to close

from lib import trajpy as tpy # trajectory library
from lib import serial_com as scm # serial communication library
from lib import binary_protocol as bp # binary protocol library


import traceback

settings = {
    'Tc' : 0.01, # s
    'data_rate': 0.000001, # rate at which msgs are sent
    'max_acc' : 0.35,#0.1,#1.05, #1.05, # rad/s**2
    'ser_started': False,
    'line_tl': lambda t, tf: tpy.cycloidal([0, 1], 2, tf)[0][0](t), # timing laws for line and circle segments
    'circle_tl': lambda t, tf: tpy.cycloidal([0, 1], 2, tf)[0][0](t) # lambda t, tf: t/tf
}

sizes = {
    'l1': 0.170,
    'l2': 0.158
}

log_data = {
    'time': [],         # time stamp
    'q0': [],           # desired q0
    'q1': [],           # desired q1
    'dq0': [],          # desired dq0
    'dq1': [],          # desired dq1
    'ddq0': [],         # desired ddq0
    'ddq1': [],         # desired ddq1
    'q0_actual': [],    # actual q0
    'q1_actual': [],    # actual q1
    'dq0_actual': [],   # actual dq0
    'dq1_actual': [],   # actual dq1
    'ddq0_actual': [],  # actual ddq0
    'ddq1_actual': [],  # actual ddq1
    'x': [],            # desired x position
    'y': [],            # desired y position
    'x_actual': [],     # actual x position
    'y_actual': []      # actual y position
}

web_options = {'host':'localhost', 'port':6969} # web server setup

# Global state for firmware feedback
firmware_state = {
    'q0': 0.0,
    'q1': 0.0,
    'buffer_level': 0,
    'last_update': 0
}

# Recording State
recording_active = False
rec_data = {
    'q0': [],
    'q1': [],
    't': []
}

# Global variable to store the last known position (joint space)
last_known_q = [0.0, 0.0]

def serial_monitor():
    print("Starting Serial Monitor Thread...")
    last_gui_update = 0
    GUI_UPDATE_INTERVAL = 0.05 # Limit updates to ~20Hz

    while True:
        if settings['ser_started']:
            try:
                # Check for feedback (Robust reading)
                # Process ALL available packets to avoid lag
                while scm.get_waiting_in_buffer() >= 3:
                    b1 = scm.read_data(1)
                    if b1 and b1[0] == bp.START_BYTE_1:
                        b2 = scm.read_data(1)
                        if b2 and b2[0] == bp.START_BYTE_2:
                            # Header found
                            b_type = scm.read_data(1)
                            if b_type:
                                if b_type[0] == bp.RESP_POS:
                                    payload = scm.read_data(12)
                                    if payload and len(payload) == 12:
                                        full_packet = b1 + b2 + b_type + payload
                                        feedback = bp.decode_feedback(full_packet)
                                        if feedback and feedback['type'] == bp.RESP_POS:
                                            firmware_state['q0'] = feedback['q0']
                                            firmware_state['q1'] = feedback['q1']
                                            firmware_state['last_update'] = time()
                                            
                                            if recording_active:
                                                rec_data['q0'].append(feedback['q0'])
                                                rec_data['q1'].append(feedback['q1'])
                                                rec_data['t'].append(time())
                                elif b_type[0] == bp.RESP_STATUS:
                                    payload = scm.read_data(5)
                                    if payload and len(payload) == 5:
                                        full_packet = b1 + b2 + b_type + payload
                                        feedback = bp.decode_feedback(full_packet)
                                        if feedback and 'buffer_level' in feedback:
                                            firmware_state['buffer_level'] = feedback['buffer_level']
                                            # print(f"MONITOR: Buffer Level = {feedback['buffer_level']}")
                    else:
                        # If not a start byte, consume it to realign
                        pass
                
                # Update GUI with current position
                if time() - last_gui_update > GUI_UPDATE_INTERVAL:
                    # Send current firmware state to GUI
                    # We use a try-except block for the eel call to avoid crashing the thread if eel is not ready
                    try:
                        eel.js_draw_pose([firmware_state['q0'], firmware_state['q1']])
                    except:
                        pass
                    last_gui_update = time()

            except Exception as e:
                print(f"Serial Monitor Error: {e}")
        
        tsleep(0.005) # Fast polling

def print_error(*args, **kwargs):
    print(*args, file=stderr, **kwargs)

def handle_closure(sig, frame):
    print("Closing Serial...")
    if settings['ser_started']:
        scm.serial_close()
        settings['ser_started'] = False
    exit(1)

'''
def compute_trajectory(q_list: np.ndarray, method = tpy.compose_cycloidal, ddqm=settings['max_acc']) -> list[list[tuple]]:
    q1 = method([q[0] for q in q_list], ddqm) # trajectory of joint 1
    q2 = method([q[1] for q in q_list], ddqm) # trajectory of joint 2
    q3 = [q[2] for q in q_list] # pen up or pen down ?
    return [q1, q2, q3]
'''

def debug_plot(q, name="image"):
    #print(q)
    plt.figure()
    t = [i*settings['Tc'] for i in range(len(q))]
    plt.plot(t, q)
    plt.grid(visible=True)
    plt.savefig('images/'+name+'.png')
    plt.close()

def debug_plotXY(x, y, name="image"):
    #print(q)
    plt.figure()
    plt.plot(x, y)
    plt.grid(visible=True)
    plt.savefig('images/'+name+'.png')
    plt.close()

def plot_recorded_data(des_q0, des_q1, Tc):
    global rec_data
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
    try:
        # Helper to find active duration based on velocity
        def get_active_bounds(t, q, threshold=0.05):
            # Calculate velocity (simple difference)
            vel = np.gradient(q) 
            # Normalize velocity to find significant movement
            max_vel = np.max(np.abs(vel))
            if max_vel == 0: return 0, len(t)-1
            
            is_moving = np.abs(vel) > max_vel * threshold
            indices = np.where(is_moving)[0]
            
            if len(indices) < 2:
                return 0, len(t)-1
            
            return indices[0], indices[-1]

        # Find bounds in indices
        idx_s_des, idx_e_des = get_active_bounds(t_des, q0_des)
        idx_s_act, idx_e_act = get_active_bounds(t_act, q0_act)
        
        # Get times
        t_s_des, t_e_des = t_des[idx_s_des], t_des[idx_e_des]
        t_s_act, t_e_act = t_act[idx_s_act], t_act[idx_e_act]
        
        dur_des = t_e_des - t_s_des
        dur_act = t_e_act - t_s_act
        
        if dur_act > 0.1: # Avoid div by zero
            scale = dur_des / dur_act
            shift = t_s_des - (t_s_act * scale)
            
            print(f"Aligning: Scale={scale:.4f}, Shift={shift:.4f}")
            
            # Apply transformation
            t_act = t_act * scale + shift
            
    except Exception as e:
        print(f"Alignment failed: {e}")

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


def d2h(d: float) -> str: # double to hex
    # < = little endian
    # Q = long (double)
    # d = double
    # check: https://docs.python.org/2/library/struct.html
    return hex(unpack('<Q', pack('<d', d))[0]).ljust(18,"0")

def h2d(string: str) -> float: # hex to double
    return unpack('>f', unhexlify(string))[0]


"""
#@
@name: send_data
@brief: sends data to the micro controller using the Binary Buffered Protocol
@inputs: 
- str msg_type: type of message to send : "trj" is used for trajectory data;
- any list \*\*data: any number of lists (containing the position setpoints to send in case of trj data);
@outputs: 
- None;
@#
"""
def send_data(msg_type: str, **data):
    match msg_type:
        case 'trj':
            if ('q' not in data) or ('dq' not in data) or ('ddq' not in data):
                print_error("Not enough data to define the trajectory")
                return 

            # Total number of points
            num_points = len(data['q'][0])
            print(f"Total Trajectory Points: {num_points}")
            
            # Configuration for Flow Control
            FIRMWARE_BUFFER_SIZE = 50 # Assumed Firmware Buffer Size
            HIGH_WATERMARK = 40       # Try to keep 40 points in buffer
            BATCH_SIZE = 5            # Send 5 points at a time
            
            # --- EXECUTION ENGINE ---
            
            # 1. Fill the buffer initially (Pre-roll)
            global recording_active, rec_data
            rec_data = {'q0': [], 'q1': [], 't': []} # Clear buffer
            recording_active = True
            start_time = time()
            
            sent_count = 0
            initial_fill = min(num_points, FIRMWARE_BUFFER_SIZE - 5)
            
            print(f"Pre-rolling {initial_fill} points...")
            for i in range(initial_fill):
                packet = bp.encode_trajectory_point(
                    data['q'][0][i], data['q'][1][i],
                    data['dq'][0][i], data['dq'][1][i],
                    data['ddq'][0][i], data['ddq'][1][i],
                    int(data['q'][2][i])
                )
                scm.write_data(packet)
                sent_count += 1
                
            # 2. Main Execution Loop
            while sent_count < num_points:
                # Flow Control Strategy:
                # In a real scenario, we would read the 'BufferLevel' from the firmware via `scm.read_data()`.
                # Since we are implementing the Python side ahead of the full firmware handshake, 
                # we will simulate the consumption rate.
                # Use a timed loop to approximate the 100Hz consumption of the firmware.
                # However, to be robust, we rely on the fact that if we send slightly faster than consumption,
                # the PC serial buffer might fill up, OR the firmware flow control (if implemented) sends XOFF.
                
                # IMPORTANT: Since we don't have the real feedback yet, we conservatively pause 
                # to let the firmware consume points.
                
                # Feedback is now handled by the background thread (serial_monitor)
                # We can check firmware_state if needed for flow control
                
                # Send next batch
                points_to_send = 0
                
                # Conservative Open-Loop Logic: 
                # Firmware consumes 100 points/sec (10ms per point).
                # We sent X points. Wait based on consumption.
                # Better: Send small batches and sleep.
                
                tsleep(0.04) # Sleep 40ms -> Firmware consumes ~4 points
                
                # Send a batch of 5 points to top up
                limit = min(sent_count + BATCH_SIZE, num_points)
                for i in range(sent_count, limit):
                     packet = bp.encode_trajectory_point(
                        data['q'][0][i], data['q'][1][i],
                        data['dq'][0][i], data['dq'][1][i],
                        data['ddq'][0][i], data['ddq'][1][i],
                        int(data['q'][2][i])
                    )
                     scm.write_data(packet)
                
                sent_count = limit
                
                if sent_count % 100 == 0:
                    print(f"Progress: {sent_count}/{num_points}")

            print(f"TRJ SENT COMPLETE: {num_points} points")
            
            # Wait for the trajectory to finish physically
            total_duration = num_points * settings['Tc']
            elapsed = time() - start_time
            remaining = total_duration - elapsed
            
            if remaining > 0:
                print(f"Waiting for trajectory to finish: {remaining:.2f}s")
                tsleep(remaining + 0.5) # Add 0.5s margin
            
            recording_active = False
            # Pass desired trajectory data to plotter
            plot_recorded_data(data['q'][0], data['q'][1], settings['Tc'])

"""
#@
@name: trace_trajectory
@brief: draws the trajectories on the GUI
@inputs: 
- tuple[list, list] q: a tuple containing the list of positions for each motor;
@outputs: 
- None;
@#
"""
def trace_trajectory(q:tuple[list,list]):
    q1 = q[0][:]
    q2 = q[1][:]
    eel.js_draw_traces([q1, q2])
    eel.js_draw_pose([q1[-1], q2[-1]])

    # DEBUG
    x = [] # [tpy.dk([q1t, q2t]) for q1t, q2t in zip(q1, q2)]
    for i in range(len(q1)):
        x.append(tpy.dk(np.array([q1[i], q2[i]]).T))
    debug_plotXY([xt[0] for xt in x], [yt[1] for yt in x], "xy")
    # END DEBUG


"""
#@
@name: eel.expose py_log
@brief: simply prints a message on the python console
@inputs: 
- str msg: message to be print;
@outputs: 
- None;
@#
"""
@eel.expose
def py_log(msg):
    print(msg)

"""
#@
@name: eel.expose py_get_data 
@brief: gets the trajectory data from the web GUI and converts it into a list of setpoints to be sent to the micro controller
@inputs: 
- None;
@outputs: 
- None;
@#
"""
@eel.expose
def py_get_data():

    # local method to interpret the message read on the serial com
    def read_position_cartesian() -> list[float]:
         global last_known_q
         q_actual = last_known_q[:]
         if settings['ser_started']:
            scm.ser.reset_input_buffer()
            packet = bp.encode_pos_command()
            scm.write_data(packet)
            
            # Wait for the background thread to pick up the response
            # We give it a bit of time (e.g. 100ms)
            tsleep(0.1)
            
            # Read from global state
            q_actual = [firmware_state['q0'], firmware_state['q1']]
            print(f"READ POS (from state): {q_actual}")
         
         # Convert to Cartesian
         points = tpy.dk(np.array(q_actual), sizes)
         return [points[0,0], points[1,0]]

    def validate_trajectory(q, dq, ddq):
        print("\n--- TRAJECTORY VALIDATION ---")
        MAX_SPEED_RAD = 10.0 # From custom.h
        MAX_ACC_RAD = settings['max_acc'] * 2.0 # Tolerance margin
        
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

        # 2. Packet Inspection
        print("\n--- PACKET INSPECTION (First 3 Points) ---")
        for i in range(min(3, len(q[0]))):
            pkt = bp.encode_trajectory_point(
                q[0][i], q[1][i],
                dq[0][i], dq[1][i],
                ddq[0][i], ddq[1][i],
                int(q[2][i])
            )
            print(f"Point {i}: {pkt.hex().upper()}")
            # Verify Checksum locally?
            # bp.decode... not implemented for Packet_t in python, but we trust logic.
            
        print("-" * 30 + "\n")
        return valid

    try:
        data: list = eel.js_get_data()()
        # add an initial patch to move the manipulator to the correct starting position
        if len(data) < 1: 
            raise Exception("Not Enough Points to build a Trajectory")
            
        current_q = read_position_cartesian()
        print(f"Start Point: {current_q}")
        
        data = [{'type':'line', 'points':[current_q, data[0]['points'][0]], 'data':{'penup':True}}] + data[::]
        
        # data contains the trajectory patches to stitch together
        q0s = []
        q1s = []
        penups = []
        ts = []
        for patch in data: 
            (q0s_p, q1s_p, penups_p, ts_p) = tpy.slice_trj( patch, 
                                                    Tc=settings['Tc'],
                                                    max_acc=settings['max_acc'], # * 0.15, # REDUCED TO 15% TO PREVENT ACCEL SPIKES
                                                    line=settings['line_tl'],
                                                    circle=settings['circle_tl'],
                                                    sizes=sizes) # returns a tuple of points given a timing law for the line and for the circle
            q0s += q0s_p if len(q0s) == 0 else q0s_p[1:] # for each adjacent patch, the last and first values coincide, so ignore the first value of the next patch to avoid singularities
            q1s += q1s_p if len(q1s) == 0 else q1s_p[1:] # ignoring the starting and ending values of consecutive patches avoids diverging accelerations
            penups += penups_p if len(penups) == 0 else penups_p[1:]
            ts += [(t + ts[-1] if len(ts) > 0  else t) for t in (ts_p if len(ts) == 0 else ts_p[1:])] # each trajectory starts from 0: the i-th patch has to start in reality from the (i-1)-th final time instant

        q = (q0s, q1s, penups)
        dq = (tpy.find_velocities(q[0], ts), tpy.find_velocities(q[1], ts))
        ddq = (tpy.find_accelerations(dq[0], ts), tpy.find_accelerations(dq[1], ts))
        
        # VALIDATE BEFORE SENDING
        validate_trajectory(q, dq, ddq)
        
        # NEW: Send using Binary Protocol
        send_data('trj', q=q, dq=dq, ddq=ddq)
        
        # Update last known position
        global last_known_q
        if len(q0s) > 0:
             last_known_q = [q0s[-1], q1s[-1]]
        
        trace_trajectory(q)
        # DEBUG
        debug_plot(q[0], 'q1')
        debug_plot(dq[0], 'dq1')
        debug_plot(ddq[0], 'ddq1')
        debug_plot(q[1], 'q2')
        debug_plot(dq[1], 'dq2')
        debug_plot(ddq[1], 'ddq2')
        # END DEBUG

    except Exception as e:
        print(e)
        print(traceback.format_exc())
        pass # do not do anything if the given points are not enough for a trajectory

def log(**data):
    global log_data
    for key in data: log_data[key].append(data[key])

@eel.expose
def py_log_data():
    content = '' # contents of the file
    for key in log_data: content+=key+',' # add the first row (the legend)
    content = content[:len(content-1)]+'\n' # remove the last comma and add '\n'
    for t in len(log_data['time']):
        row = ''
        for key in log_data:
            row += str(log_data[key]) + ','
        row = row[:len(row)-1]
        content += row + '\n'
    with open('log_data.csv', 'w') as file:
        file.write(content)
        file.close() # this is unnecessary because the with statement handles it already, but better safe than sorry

"""
#@
@name: eel.expose py_homing_cmd
@brief: sends the homing command to the micro controller
@inputs: 
- None;
@outputs: 
- None;
@#
"""
@eel.expose
def py_homing_cmd():
    # send the binary homing command 
    packet = bp.encode_homing_command()
    print(f"Homing packet sent: {packet}")
    scm.write_data(packet)
    
    # Reset last known position to home (0,0)
    global last_known_q
    last_known_q = [0.0, 0.0]


"""
#@
@name: eel.expose py_serial_online
@brief: return whether the serial is online or not
@inputs: 
- None;
@outputs: 
- bool: bool value that shows if the serial is online or not;
@#
"""
@eel.expose
def py_serial_online():
    return settings['ser_started'] # return whether the serial is started or not

"""
#@
@name: eel.expose py_serial_sartup
@brief: initializes the serial communication
@inputs: 
- None;
@outputs: 
- None;
@#
"""
@eel.expose
def py_serial_startup():
    print("Calling scm.ser_init()...")
    settings['ser_started'] = scm.ser_init()
    print(f"Serial Started? {settings['ser_started']}")

signal(SIGINT, handle_closure) # ensures that the serial is closed 

if __name__ == "__main__":
    global ser
    settings['ser_started'] = scm.ser_init()
    
    # Start Serial Monitor Thread
    monitor_thread = threading.Thread(target=serial_monitor, daemon=True)
    monitor_thread.start()
    
    if not settings['ser_started']:
        print("No serial could be found, continuing anyway for GUI debug.")
        # print("No serial could be found, stopping the application.")
        # exit() 

    # GUI
    eel.init("./layout") # initialize the view
    eel.start("./index.html", host=web_options['host'], port=web_options['port']) # start the server

    scm.serial_close() # once the server stops, close the serial