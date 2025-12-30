import sys
from unittest.mock import MagicMock

# Mock 'eel' before importing main
mock_eel = MagicMock()
def expose_side_effect(func):
    return func
mock_eel.expose = expose_side_effect
sys.modules['eel'] = mock_eel
sys.modules['matplotlib'] = MagicMock()
sys.modules['matplotlib.pyplot'] = MagicMock()
sys.modules['numpy'] = MagicMock()

import unittest
from unittest.mock import patch
import struct
import time

# Now we can import main
# We need to make sure we are in the right directory or path is correct
sys.path.append('..') 
# Adjusting path if running from 'tests' dir, but I'll run it from root.

# If running from root, just import main
try:
    import main
    from lib import binary_protocol as bp
    from lib import serial_com as scm
except ImportError:
    # If main is not found, maybe we are in tests dir
    sys.path.append('.')
    import main
    from lib import binary_protocol as bp
    from lib import serial_com as scm

class TestMainLogic(unittest.TestCase):
    
    def setUp(self):
        # Reset serial started flag
        main.settings['ser_started'] = True
        
    @patch('lib.serial_com.write_data')
    @patch('time.sleep') # Don't actually sleep
    @patch('lib.serial_com.get_waiting_in_buffer')
    @patch('lib.serial_com.read_data')
    def test_send_data_flow(self, mock_read, mock_waiting, mock_sleep, mock_write):
        """
        Test that send_data:
        1. Encodes points correctly.
        2. Sends the initial pre-roll batch.
        3. Sends subsequent batches.
        """
        # Setup Mocks
        mock_waiting.return_value = 0 # No feedback waiting by default
        
        # Create Dummy Data
        # 100 points
        N = 100
        q = ([0.0]*N, [0.0]*N, [0]*N) # q0, q1, penup
        dq = ([0.0]*N, [0.0]*N)
        ddq = ([0.0]*N, [0.0]*N)
        
        data = {
            'q': q,
            'dq': dq,
            'ddq': ddq
        }
        
        # Execute
        print("Executing send_data...")
        main.send_data('trj', **data)
        
        # Verification
        # Total writes should be 100 (one per point)
        self.assertEqual(mock_write.call_count, 100)
        
        # Verify Content of first packet
        # q=0, dq=0, ddq=0, pen=0
        # Checksum calculation:
        # Cmd=1, Payload=25 bytes of zeros. 
        # CRC32 of ( \x01 + 25*\x00 )
        expected_packet = bp.encode_trajectory_point(0,0,0,0,0,0,0)
        
        # Check first call
        first_call_args = mock_write.call_args_list[0]
        sent_data = first_call_args[0][0]
        self.assertEqual(sent_data, expected_packet)
        
        print("Test Passed: send_data calls write_data correctly.")

    @patch('lib.serial_com.write_data')
    def test_homing_cmd(self, mock_write):
        main.py_homing_cmd()
        self.assertEqual(mock_write.call_count, 1)
        expected = bp.encode_homing_command()
        mock_write.assert_called_with(expected)
        print("Test Passed: homing command.")

if __name__ == '__main__':
    unittest.main()
