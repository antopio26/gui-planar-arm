import serial
import time
import serial.tools.list_ports
from lib import binary_protocol as bp

ser = None # serial object

def verify_connection(s):
    """Helper to verify connection by sending a handshake."""
    try:
        print(f"Verifying connection on {s.port}...")
        s.reset_input_buffer()
        s.reset_output_buffer()
        
        # Send Handshake (Pos Request)
        print("Sending handshake...")
        packet = bp.encode_pos_command()
        s.write(packet)
        print("Handshake sent. Waiting for response...")
        
        # Wait for response (Max 0.5s)
        start_t = time.time()
        buffer = b''
        while time.time() - start_t < 0.5:
            if s.in_waiting:
                buffer += s.read(s.in_waiting)
                # Check if we have enough for header(2) + type(1)
                if len(buffer) >= 3:
                    # Try to decode
                    if buffer[0] == bp.START_BYTE_1 and buffer[1] == bp.START_BYTE_2:
                            # It looks like our protocol
                            print("Handshake OK: Valid Header found.")
                            return True
            time.sleep(0.05)
        
        print("Handshake Failed: No valid response.")
        return False
    except Exception as e:
        print(f"Handshake Error on {s.port}: {e}")
        return False

def ser_init(serial_path:str = None) -> bool:
    global ser 
    print("Starting Serial Connection:\n")
    
    # 1. candidate ports list
    candidates = []
    if serial_path:
        # If user specified a path, try ONLY that one first (or we could just add it to list)
        candidates.append(serial_path)
    else:
        # Auto-discovery
        system_ports = serial.tools.list_ports.comports()
        candidates = [p.device for p in system_ports]
    
    if not candidates:
        print("No serial ports found.")
        return False

    # 2. Try to connect
    for port in candidates:
        try:
            print(f"Trying {port}...")
            # Add write_timeout to prevent blocking forever
            temp_ser = serial.Serial(port, 115200, timeout=0.1, write_timeout=0.5) 
            
            # Auto-Reset DTR logic (Standard for Arduinos/STM32)
            temp_ser.dtr = False
            time.sleep(0.1)
            temp_ser.dtr = True
            time.sleep(1.0) # Wait for reboot
            
            if verify_connection(temp_ser):
                ser = temp_ser
                print(f"Connected to {port}")
                
                # Cleanup buffers before starting real work
                ser.reset_input_buffer()
                ser.reset_output_buffer()
                return True
            else:
                temp_ser.close()
                
        except Exception as e:
            print(f"Failed to connect to {port}: {e}")
            
    # 3. Fail
    print("Could not connect to any serial device.")
    return False

def write_serial(msg:str) -> bool:
    """Legacy string write"""
    global ser
    if ser is None: return False
    if len(msg) == 0:
        msg = "EMPTY\n"
    ser.write(bytes(msg,'utf-8'))
    return True

def write_data(data: bytes) -> bool:
    """Write raw binary data"""
    global ser
    if ser is None: return False
    try:
        ser.write(data)
        return True
    except Exception as e:
        print(f"Serial Write Error: {e}")
        return False

def read_serial() -> bytes:
    """Legacy string read"""
    global ser
    if ser is None: return None
    try:
        line = ser.readline()
        return line
    except Exception as e:
        print(f"Serial Read Error: {e}")
        return None

def read_data(size: int) -> bytes:
    """Read specific number of bytes"""
    global ser
    if ser is None: return None
    try:
        data = ser.read(size)
        return data
    except Exception as e:
        print(f"Serial Data Read Error: {e}")
        return None
        
def get_waiting_in_buffer() -> int:
    global ser
    if ser is None: return 0
    return ser.in_waiting

def serial_close():
    global ser
    if ser is not None:
        try:
            ser.flush()
            ser.close() # close port
        except:
            pass
    ser = None