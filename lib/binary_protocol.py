import struct

# Constants
START_BYTE_1 = 0xA5
START_BYTE_2 = 0x5A

# Command IDs
CMD_TRAJECTORY = 0x01
CMD_HOMING = 0x02
CMD_STOP = 0x03
CMD_POS = 0x04

# Response IDs
RESP_ACK = 0xAA
RESP_NACK = 0xFF
RESP_STATUS = 0x01
RESP_POS = 0x02

def calculate_crc32(data: bytes) -> int:
    import zlib
    return zlib.crc32(data) & 0xFFFFFFFF

def encode_trajectory_point(q0: float, q1: float, dq0: float, dq1: float, ddq0: float, ddq1: float, pen_up: bool) -> bytes:
    cmd = CMD_TRAJECTORY
    pen_up_val = 1 if pen_up else 0
    payload = struct.pack('<ffffffB', q0, q1, dq0, dq1, ddq0, ddq1, pen_up_val)
    checksum_data = struct.pack('B', cmd) + payload
    crc = calculate_crc32(checksum_data)
    header = struct.pack('BB', START_BYTE_1, START_BYTE_2)
    packet = header + checksum_data + struct.pack('<I', crc)
    return packet

def encode_homing_command() -> bytes:
    cmd = CMD_HOMING
    payload = struct.pack('<ffffffB', 0, 0, 0, 0, 0, 0, 0) # Zero payload
    checksum_data = struct.pack('B', cmd) + payload
    crc = calculate_crc32(checksum_data)
    header = struct.pack('BB', START_BYTE_1, START_BYTE_2)
    packet = header + checksum_data + struct.pack('<I', crc)
    return packet

def encode_pos_command() -> bytes:
    cmd = CMD_POS
    payload = struct.pack('<ffffffB', 0, 0, 0, 0, 0, 0, 0) # Zero payload
    checksum_data = struct.pack('B', cmd) + payload
    crc = calculate_crc32(checksum_data)
    header = struct.pack('BB', START_BYTE_1, START_BYTE_2)
    packet = header + checksum_data + struct.pack('<I', crc)
    return packet

def decode_feedback(data: bytes) -> dict:
    if len(data) < 8:
        return None
    if data[0] != START_BYTE_1 or data[1] != START_BYTE_2:
        return None
    
    resp_type = data[2]
    
    if resp_type == RESP_POS:
        return decode_position_feedback(data)
        
    buffer_level = data[3]
    return {'type': resp_type, 'buffer_level': buffer_level}

def decode_position_feedback(data: bytes) -> dict:
    # Structure: Header(2) + Type(1) + Q0(4) + Q1(4) + CRC(4) = 15 bytes
    MIN_SIZE = 15
    if len(data) < MIN_SIZE:
        return None
        
    try:
        # Check CRC?
        # We need to checksum bytes 2 to 10 (Type + Q0 + Q1)
        # Type is at index 2.
        # Payload ends at 2+1+8 = 11.
        # CRC is at 11..15
        
        received_crc = struct.unpack('<I', data[11:15])[0]
        calculated_crc = calculate_crc32(data[2:11])
        
        if received_crc != calculated_crc:
            print("CRC Error on POS Feedback")
            return None
            
        q0, q1 = struct.unpack('<ff', data[3:11])
        return {'type': RESP_POS, 'q0': q0, 'q1': q1}
        
    except Exception as e:
        print(f"Decode Error: {e}")
        return None
