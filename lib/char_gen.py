
"""
Simple Vector Font Generator for Robot Arm
Defines a "stick font" where each character is a set of lines/arcs.
Coordinates are normalized 0.0 to 1.0 within the character box.
"""

# Character definitions: List of strokes. 
# Each stroke is a list of points [(x,y), (x,y), ...].
# 'pen_up' is implicit between strokes.

"""
Vector Font Generator with Geometric Primitives
Supports 'line' (list of points) and 'ellipse' (parametric).
"""

import math

# Character definitions
# Format: List of Primitives.
# Primitive: 
#   {'type': 'line', 'points': [(x,y), ...]}
#   {'type': 'ellipse', 'center': (cx, cy), 'radii': (rx, ry), 'arc': (start_deg, end_deg)}
#   {'type': 'ellipse_path', 'points': [...]} # Implicit path of ellipses? No, keep simple.

FONT_DEFS = {
    # Straight Letters
    'A': [{'type': 'line', 'points': [(0,0), (0.5,1), (1,0)]}, 
          {'type': 'line', 'points': [(0.2, 0.4), (0.8, 0.4)]}],
    'E': [{'type': 'line', 'points': [(1,0), (0,0), (0,1), (1,1)]}, 
          {'type': 'line', 'points': [(0,0.5), (0.8,0.5)]}],
    'F': [{'type': 'line', 'points': [(0,0), (0,1), (1,1)]}, 
          {'type': 'line', 'points': [(0,0.5), (0.8,0.5)]}],
    'H': [{'type': 'line', 'points': [(0,0), (0,1)]}, 
          {'type': 'line', 'points': [(1,0), (1,1)]}, 
          {'type': 'line', 'points': [(0,0.5), (1,0.5)]}],
    'I': [{'type': 'line', 'points': [(0.5,0), (0.5,1)]}, 
          {'type': 'line', 'points': [(0,1), (1,1)]}, 
          {'type': 'line', 'points': [(0,0), (1,0)]}],
    'K': [{'type': 'line', 'points': [(0,0), (0,1)]}, 
          {'type': 'line', 'points': [(1,1), (0,0.5), (1,0)]}],
    'L': [{'type': 'line', 'points': [(0,1), (0,0), (1,0)]}],
    'M': [{'type': 'line', 'points': [(0,0), (0,1), (0.5,0.5), (1,1), (1,0)]}],
    'N': [{'type': 'line', 'points': [(0,0), (0,1), (1,0), (1,1)]}],
    'T': [{'type': 'line', 'points': [(0.5,0), (0.5,1)]}, 
          {'type': 'line', 'points': [(0,1), (1,1)]}],
    'V': [{'type': 'line', 'points': [(0,1), (0.5,0), (1,1)]}],
    'W': [{'type': 'line', 'points': [(0,1), (0.2,0), (0.5,0.5), (0.8,0), (1,1)]}],
    'X': [{'type': 'line', 'points': [(0,0), (1,1)]}, 
          {'type': 'line', 'points': [(0,1), (1,0)]}],
    'Y': [{'type': 'line', 'points': [(0,1), (0.5,0.5)]}, 
          {'type': 'line', 'points': [(1,1), (0.5,0.5), (0.5,0)]}],
    'Z': [{'type': 'line', 'points': [(0,1), (1,1), (0,0), (1,0)]}],

    # Curved & Refined Letters
    'B': [{'type': 'line', 'points': [(0,1), (0,0)]}, 
          {'type': 'line', 'points': [(0,1), (0.5,1)]}, 
          {'type': 'ellipse', 'center': (0.5, 0.75), 'radii': (0.4, 0.25), 'arc': (90, -90)},
          {'type': 'line', 'points': [(0.5,0.5), (0,0.5)]},
          {'type': 'line', 'points': [(0,0.5), (0.5,0.5)]}, 
          {'type': 'ellipse', 'center': (0.5, 0.25), 'radii': (0.4, 0.25), 'arc': (90, -90)},
          {'type': 'line', 'points': [(0.5,0), (0,0)]}],
          
    'C': [{'type': 'ellipse', 'center': (0.5, 0.5), 'radii': (0.5, 0.5), 'arc': (315, 45)}], 
    
    'D': [{'type': 'ellipse', 'center': (0.4, 0.5), 'radii': (0.6, 0.5), 'arc': (-90, 90)}, 
          {'type': 'line', 'points': [(0.4, 1), (0, 1), (0, 0), (0.4, 0)]}],
          
    'G': [{'type': 'ellipse', 'center': (0.5, 0.5), 'radii': (0.5, 0.5), 'arc': (45, 315)}, 
          {'type': 'line', 'points': [(0.85, 0.15), (0.85, 0.4), (0.5, 0.4)]}],

    'J': [{'type': 'line', 'points': [(0.8, 1), (0.8, 0.3)]},
          {'type': 'ellipse', 'center': (0.4, 0.3), 'radii': (0.4, 0.3), 'arc': (0, -180)}],

    'O': [{'type': 'ellipse', 'center': (0.5, 0.5), 'radii': (0.5, 0.5), 'arc': (0, -360)}],
    
    'P': [{'type': 'line', 'points': [(0,0), (0,1)]}, 
          {'type': 'line', 'points': [(0,1), (0.5,1)]},
          {'type': 'ellipse', 'center': (0.5, 0.75), 'radii': (0.4, 0.25), 'arc': (90, -90)},
          {'type': 'line', 'points': [(0.5,0.5), (0,0.5)]}],
    
    'Q': [{'type': 'ellipse', 'center': (0.5, 0.5), 'radii': (0.5, 0.5), 'arc': (0, 360)},
          {'type': 'line', 'points': [(0.6, 0.2), (1, 0)]}],

    'R': [{'type': 'line', 'points': [(0,0), (0,1)]}, 
          {'type': 'line', 'points': [(0,1), (0.5,1)]},
          {'type': 'ellipse', 'center': (0.5, 0.75), 'radii': (0.4, 0.25), 'arc': (90, -90)},
          {'type': 'line', 'points': [(0.5,0.5), (0,0.5)]},
          {'type': 'line', 'points': [(0.4, 0.5), (1, 0)]}], 

    'S': [{'type': 'ellipse', 'center': (0.5, 0.75), 'radii': (0.5, 0.25), 'arc': (25, 270)}, # Extended Top
          {'type': 'ellipse', 'center': (0.5, 0.25), 'radii': (0.5, 0.25), 'arc': (90, -155)}], # Extended Bottom

    'U': [{'type': 'line', 'points': [(0, 1), (0, 0.3)]},
          {'type': 'ellipse', 'center': (0.5, 0.3), 'radii': (0.5, 0.3), 'arc': (180, 360)}, 
          {'type': 'line', 'points': [(1, 0.3), (1, 1)]}],

    # Numbers
    '0': [{'type': 'ellipse', 'center': (0.5, 0.5), 'radii': (0.45, 0.5), 'arc': (0, 360)}],
    '1': [{'type': 'line', 'points': [(0.3, 0.7), (0.5, 1), (0.5, 0)]}, 
          {'type': 'line', 'points': [(0.2, 0), (0.8, 0)]}],
    '2': [{'type': 'ellipse', 'center': (0.5, 0.7), 'radii': (0.5, 0.3), 'arc': (160, -50)}, # End at -50 deg -> x=0.82, y=0.47
          {'type': 'line', 'points': [(0.82, 0.47), (0, 0), (1, 0)]}], # Connected exactly
    '3': [{'type': 'ellipse', 'center': (0.5, 0.75), 'radii': (0.4, 0.25), 'arc': (210, -90)}, # Ends at (0.5, 0.5)
          {'type': 'ellipse', 'center': (0.5, 0.25), 'radii': (0.45, 0.25), 'arc': (90, -210)}], # Starts at (0.5, 0.5)
          
    '4': [{'type': 'line', 'points': [(0.7,0), (0.7,1)]}, 
          {'type': 'line', 'points': [(0,1), (0,0.4), (1,0.4)]}], 
    '5': [{'type': 'line', 'points': [(0.9,1), (0.1,1), (0.1,0.55)]}, 
          {'type': 'ellipse', 'center': (0.5, 0.35), 'radii': (0.48, 0.35), 'arc': (146, -135)}], # Extended more
    '6': [{'type': 'line', 'points': [(0.8, 1.0), (0.1, 0.45)]}, # Extended top stalk
          {'type': 'ellipse', 'center': (0.5, 0.3), 'radii': (0.5, 0.3), 'arc': (0, 360)}], 
    '7': [{'type': 'line', 'points': [(0,1), (1,1), (0.4,0)]}], 
    '8': [{'type': 'ellipse', 'center': (0.5, 0.75), 'radii': (0.4, 0.25), 'arc': (0, 360)}, 
          {'type': 'ellipse', 'center': (0.5, 0.25), 'radii': (0.5, 0.25), 'arc': (0, 360)}],
    '9': [{'type': 'ellipse', 'center': (0.5, 0.7), 'radii': (0.45, 0.3), 'arc': (0, 360)},
          {'type': 'line', 'points': [(0.95, 0.7), (0.95, 0.5)]},
          {'type': 'ellipse', 'center': (0.5, 0.5), 'radii': (0.45, 0.5), 'arc': (0, -110)}], # Extended tail
          
    ' ': [],
    '-': [{'type': 'line', 'points': [(0, 0.5), (1, 0.5)]}],
    '.': [{'type': 'line', 'points': [(0.4,0), (0.6,0), (0.6,0.2), (0.4,0.2), (0.4,0)]}], 
}

def get_char_strokes(char):
    return FONT_DEFS.get(char.upper(), [])

def sample_ellipse(center, radii, arc, steps=None):
    """
    Samples an elliptical arc.
    center: (cx, cy)
    radii: (rx, ry)
    arc: (start_deg, end_deg)
    """
    cx, cy = center
    rx, ry = radii
    start_rad = math.radians(arc[0])
    end_rad = math.radians(arc[1])
    
    # Adaptive resolution if steps not provided
    # Aim for ~2 degrees per step for high smoothness (Ultra Quality)
    if steps is None:
        span_deg = abs(arc[1] - arc[0])
        steps = max(20, int(span_deg / 2)) # Every 2 degrees -> 180 points for a circle
    
    points = []
    
    # Determine direction
    # We want to go from start to end.
    span = end_rad - start_rad
    step_rad = span / steps
    
    for i in range(steps + 1):
        theta = start_rad + i * step_rad
        x = cx + rx * math.cos(theta)
        y = cy + ry * math.sin(theta)
        points.append((x, y))
        
    return points

def text_to_traj(text: str, start_pos: tuple, font_size: float, char_spacing: float):
    """
    Generates a list of line segments for the given text.
    Handles 'line' and 'ellipse' primitives by sampling them into dense lines.
    """
    traj_patches = []
    cursor_x, cursor_y = start_pos
    
    for char in text:
        if char == '\n':
            cursor_x = start_pos[0]
            cursor_y -= font_size * 1.5 
            continue

        if char == ' ':
            cursor_x += (font_size * 0.8) + char_spacing
            continue

        primitives = get_char_strokes(char)
        char_width = font_size
        
        for prim in primitives:
            # 1. Get Normalized Points
            norm_points = []
            
            if prim['type'] == 'line':
                norm_points = prim['points']
            elif prim['type'] == 'ellipse':
                norm_points = sample_ellipse(prim['center'], prim['radii'], prim['arc'])
                
            if not norm_points: continue
            
            # 2. Scale & Translate to World
            world_points = []
            for p in norm_points:
                wx = cursor_x + p[0] * char_width * 0.8 
                wy = cursor_y + p[1] * font_size
                world_points.append((wx, wy))
            
            # 3. Create Segments
            for i in range(len(world_points) - 1):
                p0 = world_points[i]
                p1 = world_points[i+1]
                
                patch = {
                    'type': 'line',
                    'points': [p0, p1],
                    'data': {'penup': False}
                }
                
                # Check discontinuity with previous patch to insert PENUP
                if traj_patches:
                    prev_end = traj_patches[-1]['points'][1]
                    dist = ((prev_end[0]-p0[0])**2 + (prev_end[1]-p0[1])**2)**0.5
                    
                    if dist > 0.001:
                        traj_patches.append({
                            'type': 'line',
                            'points': [prev_end, p0],
                            'data': {'penup': True}
                        })
                
                traj_patches.append(patch)

        cursor_x += (font_size * 0.8) + char_spacing

    return traj_patches
