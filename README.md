# gui-planar-arm

A Python-based GUI application for controlling a planar robotic arm. This tool provides an interface for trajectory planning, simulation, and real-time control via serial communication with a microcontroller.

## Features

- **Trajectory Planning**: Generate complex trajectories using line and circle segments with cycloidal timing laws.
- **Visual Interface**: Web-based GUI built with [Eel](https://github.com/python-eel/Eel) for easy interaction.
- **Simulation & Visualization**: Preview trajectories and robot poses using [Matplotlib](https://matplotlib.org/).
- **Hardware Control**: robust serial communication implementation using a custom binary protocol for efficient data transfer to the robot firmware.
- **Data Logging**: Records trajectory data (desired vs. actual) for analysis.

## Project Structure

- `main.py`: The entry point of the application. Handles the GUI backend, trajectory generation, and serial communication orchestration.
- `layout/`: Contains the frontend code (HTML, CSS, JavaScript) for the GUI.
- `lib/`: Core libraries for the application:
    - `trajpy.py`: Trajectory generation algorithms and kinematics.
    - `serial_com.py`: Serial communication wrapper.
    - `binary_protocol.py`: Implementation of the custom binary protocol for firmware communication.
- `TEST/`: Unit tests and testing scripts.

## Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/GabrieleSantangelo/gui-planar-arm.git
    cd gui-planar-arm
    ```

2.  **Set up a virtual environment (Recommended):**
    ```bash
    python -m venv venv
    source venv/bin/activate  # On Windows use `venv\Scripts\activate`
    ```

3.  **Install dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

## Usage

1.  **Run the application:**
    ```bash
    python main.py
    ```

2.  **Using the GUI:**
    -   The application window should open automatically.
    -   If a microcontroller is connected, the application will attempt to establish a serial connection.
    -   Use the interface to draw or define trajectories.
    -   Click "Send" to compute the trajectory and transmit the setpoints to the robot.

## Requirements

- Python 3.10+
- See `requirements.txt` for Python package dependencies.