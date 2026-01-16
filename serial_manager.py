import threading
from time import sleep, time
import eel

from lib import serial_com as scm
from lib import binary_protocol as bp
from state import state
from config import SETTINGS
import plotting 

class SerialManager:
    def __init__(self):
        self.stop_event = threading.Event()
        self.monitor_thread = None

    def start_monitor(self):
        print("Starting Serial Monitor Thread...")
        self.stop_event.clear()
        self.monitor_thread = threading.Thread(target=self._monitor_loop, daemon=True)
        self.monitor_thread.start()

    def _monitor_loop(self):
        last_gui_update = 0
        GUI_UPDATE_INTERVAL = 0.05 # Limit updates to ~20Hz

        while not self.stop_event.is_set():
            if SETTINGS['ser_started']:
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
                                                state.firmware.q0 = feedback['q0']
                                                state.firmware.q1 = feedback['q1']
                                                state.firmware.last_update = time()
                                                
                                                if state.recording_active:
                                                    state.rec_data['q0'].append(feedback['q0'])
                                                    state.rec_data['q1'].append(feedback['q1'])
                                                    state.rec_data['t'].append(time())
                                    elif b_type[0] == bp.RESP_STATUS:
                                        payload = scm.read_data(5)
                                        if payload and len(payload) == 5:
                                            full_packet = b1 + b2 + b_type + payload
                                            feedback = bp.decode_feedback(full_packet)
                                            if feedback and 'buffer_level' in feedback:
                                                state.firmware.buffer_level = feedback['buffer_level']
                        else:
                            # If not a start byte, consume it to realign
                            pass
                    
                except Exception as e:
                    print(f"Serial Monitor Error: {e}")

            # Update GUI with current position (Always, even if offline)
            if time() - last_gui_update > GUI_UPDATE_INTERVAL:
                try:
                    eel.js_draw_pose([state.firmware.q0, state.firmware.q1])
                except:
                    pass
                last_gui_update = time()
            
            sleep(0.005) # Fast polling

    def stop_monitor(self):
        self.stop_event.set()
        if self.monitor_thread:
            self.monitor_thread.join()

    def send_data(self, msg_type: str, **data):
        match msg_type:
            case 'trj':
                if ('q' not in data) or ('dq' not in data) or ('ddq' not in data):
                    print("Not enough data to define the trajectory")
                    return 

                # Total number of points
                num_points = len(data['q'][0])
                print(f"Total Trajectory Points: {num_points}")
                
                if SETTINGS['ser_started']:
                    # Configuration for Flow Control
                    FIRMWARE_BUFFER_SIZE = 50 # Assumed Firmware Buffer Size
                    BATCH_SIZE = 5            # Send 5 points at a time
                    
                    # --- EXECUTION ENGINE ---
                    
                    # 1. Fill the buffer initially (Pre-roll)
                    state.reset_recording()
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
                        if state.stop_requested:
                            print("!!! TRAJECTORY ABORTED BY USER (ONLINE) !!!")
                            break

                        sleep(0.04) # Sleep 40ms -> Firmware consumes ~4 points
                        
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
                        
                        # Update State for UI Visualization (Commanded Position)
                        # This allows seeing the arm move even if feedback is silent
                        current_idx = limit - 1
                        state.firmware.q0 = data['q'][0][current_idx]
                        state.firmware.q1 = data['q'][1][current_idx]
                        
                        if sent_count % 100 == 0:
                            print(f"Progress: {sent_count}/{num_points}")

                    if state.stop_requested:
                         print("Execution stopped.")
                    else:
                        print(f"TRJ SENT COMPLETE: {num_points} points")
                        # Ensure final position is set
                        state.firmware.q0 = data['q'][0][-1]
                        state.firmware.q1 = data['q'][1][-1]
                        
                        # Wait for the trajectory to finish physically
                        total_duration = num_points * SETTINGS['Tc']
                        elapsed = time() - start_time
                        remaining = total_duration - elapsed
                        
                        if remaining > 0:
                            print(f"Waiting for trajectory to finish: {remaining:.2f}s")
                            sleep(remaining + 0.5) # Add 0.5s margin
                    state.stop_recording()

                else:
                    # --- SIMULATION ENGINE ---
                    print("SIMULATION MODE: Playing trajectory locally...")
                    state.reset_recording()
                    start_time = time()

                    for i in range(num_points):
                        if state.stop_requested:
                            print("!!! TRAJECTORY ABORTED BY USER (SIMULATION) !!!")
                            break

                        # Simula il passare del tempo esatto del controller
                        loop_start = time()

                        # Update State
                        state.firmware.q0 = data['q'][0][i]
                        state.firmware.q1 = data['q'][1][i]
                        state.firmware.last_update = loop_start
                        
                        # Notify UI (Animation)
                        try:
                            eel.js_draw_pose([state.firmware.q0, state.firmware.q1])
                        except:
                            pass # Ignore if eel closed

                        if state.recording_active:
                            state.rec_data['q0'].append(state.firmware.q0)
                            state.rec_data['q1'].append(state.firmware.q1)
                            state.rec_data['t'].append(loop_start)
                        
                        # Wait typical sample time
                        # Assuming Tc is reliable. If too fast on Windows, this might drift, 
                        # but acceptable for simulation.
                        sleep(SETTINGS['Tc']) 
                        
                        if i % 100 == 0:
                            print(f"Sim Progress: {i}/{num_points}")
                    
                    state.stop_recording()
                # Pass desired trajectory data to plotter
                plotting.plot_recorded_data(data['q'][0], data['q'][1], SETTINGS['Tc'], state.rec_data)

# Global Instance
serial_manager = SerialManager()
