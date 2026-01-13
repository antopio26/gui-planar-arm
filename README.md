# gui-planar-arm

A Python-based GUI application for controlling a planar robotic arm. This tool provides an interface for trajectory planning, simulation, and real-time control via serial communication with a microcontroller.

## Features

- **Trajectory Planning**: Generate complex trajectories using line and circle segments with cycloidal timing laws.
- **Visual Interface**: Web-based GUI built with [Eel](https://github.com/python-eel/Eel) for easy interaction.
- **Simulation & Visualization**: Preview trajectories and robot poses using [Matplotlib](https://matplotlib.org/).
- **Hardware Control**: robust serial communication implementation using a custom binary protocol for efficient data transfer to the robot firmware.
- **Data Logging**: Records trajectory data (desired vs. actual) for analysis.

## Project Structure

The project has been refactored for better modularity and maintainability.

### Core Components
- **`main.py`**: The entry point. Initializes the serial manager and launches the GUI.
- **`config.py`**: Central configuration file for hardware settings, serial port (`SERIAL_PORT`), dimensions, and web server options.
- **`state.py`**: Thread-safe global state management (`RobotState`) for sharing data between the GUI and serial threads.
- **`gui_interface.py`**: Contains the logic exposed to the Javascript frontend (Eel callbacks) and trajectory validation.
- **`serial_manager.py`**: Manages the background serial communication thread and protocol handling.
- **`plotting.py`**: Unified module for generating debug and performance plots.

### Libraries & Layout
- **`lib/`**:
    - `trajpy.py`: Trajectory generation algorithms, kinematics (inverse/direct), and path slicing.
    - `serial_com.py`: Low-level serial port wrapper.
    - `binary_protocol.py`: Implementation of the custom binary protocol.
- **`layout/`**: Frontend resources.
    - `css/`: Stylesheets (`style.css`, `variables.css`).
    - `js/`: Modular JavaScript files (`main.js`, `canvas.js`, `api.js`, `state.js`, etc.).

### Legacy & Utils
- **`data_manage.py`**: Utility script for processing raw log files (independent of main app).

## Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/GabrieleSantangelo/gui-planar-arm.git
    cd gui-planar-arm
    ```

2.  **Set up a virtual environment (Recommended):**
    ```bash
    python -m venv .venv
    source .venv/bin/activate  # On Windows use `.venv\Scripts\activate`
    ```

3.  **Install dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

## Usage

1.  **Configure the application:**
    Open `config.py` and set the `SERIAL_PORT` variable to your device's path (e.g., `/dev/ttyUSB0` or `COM3`).

2.  **Run the application:**
    ```bash
    python main.py
    ```

3.  **Using the GUI:**
    -   The application window should open automatically.
    -   If a microcontroller is connected, the application will attempt to establish a serial connection.
    -   Use the interface to draw or define trajectories.
    -   Click "Send" to compute the trajectory and transmit the setpoints to the robot.

## Requirements

- Python 3.10+
- See `requirements.txt` for Python package dependencies.