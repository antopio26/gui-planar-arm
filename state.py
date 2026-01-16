from dataclasses import dataclass, field
from typing import List, Dict, Optional

@dataclass
class FirmwareState:
    q0: float = 0.0
    q1: float = 0.0
    pen_up: bool = True
    buffer_level: int = 0
    last_update: float = 0
    
@dataclass
class RobotState:
    firmware: FirmwareState = field(default_factory=FirmwareState)
    recording_active: bool = False
    stop_requested: bool = False
    rec_data: Dict[str, List[float]] = field(default_factory=lambda: {'q0': [], 'q1': [], 't': []})
    last_known_q: List[float] = field(default_factory=lambda: [0.0, 0.0])
    
    # Logging data
    log_data: Dict[str, List] = field(default_factory=lambda: {
        'time': [], 'q0': [], 'q1': [], 'dq0': [], 'dq1': [],
        'ddq0': [], 'ddq1': [], 'q0_actual': [], 'q1_actual': [],
        'dq0_actual': [], 'dq1_actual': [], 'ddq0_actual': [], 'ddq1_actual': [],
        'x': [], 'y': [], 'x_actual': [], 'y_actual': []
    })

    def reset_recording(self):
        self.rec_data = {'q0': [], 'q1': [], 't': []}
        self.recording_active = True

    def stop_recording(self):
        self.recording_active = False

# Global state instance
state = RobotState()
