
"""
Simple Vector Font Generator for Robot Arm
Defines a "stick font" where each character is a set of lines/arcs.
Coordinates are normalized 0.0 to 1.0 within the character box.
"""

# Character definitions: List of strokes. 
# Each stroke is a list of points [(x,y), (x,y), ...].
# 'pen_up' is implicit between strokes.
FONT_DEFS = {
    'A': [[(0,0), (0.5,1), (1,0)], [(0.2, 0.4), (0.8, 0.4)]],
    'B': [[(0,0), (0,1), (0.5,1), (0.5,0.5), (0,0.5)], [(0.5,0.5), (0.5,0), (0,0)]], # Simplified B
    'C': [[(1,0.2), (0.8,0), (0.2,0), (0,0.2), (0,0.8), (0.2,1), (0.8,1), (1,0.8)]],
    'D': [[(0,0), (0,1), (0.6,1), (1,0.6), (1,0.4), (0.6,0), (0,0)]],
    'E': [[(1,0), (0,0), (0,1), (1,1)], [(0,0.5), (0.8,0.5)]],
    'F': [[(0,0), (0,1), (1,1)], [(0,0.5), (0.8,0.5)]],
    'G': [[(1,1), (0.2,1), (0,0.8), (0,0.2), (0.2,0), (1,0), (1,0.5), (0.6,0.5)]],
    'H': [[(0,0), (0,1)], [(1,0), (1,1)], [(0,0.5), (1,0.5)]],
    'I': [[(0.5,0), (0.5,1)], [(0,1), (1,1)], [(0,0), (1,0)]],
    'J': [[(0,0.3), (0.2,0), (0.6,0), (0.8,0.3), (0.8,1)]],
    'K': [[(0,0), (0,1)], [(1,1), (0,0.5), (1,0)]],
    'L': [[(0,1), (0,0), (1,0)]],
    'M': [[(0,0), (0,1), (0.5,0.5), (1,1), (1,0)]],
    'N': [[(0,0), (0,1), (1,0), (1,1)]],
    'O': [[(0.5,0), (0,0.2), (0,0.8), (0.5,1), (1,0.8), (1,0.2), (0.5,0)]],
    'P': [[(0,0), (0,1), (1,1), (1,0.5), (0,0.5)]],
    'Q': [[(0.5,0), (0,0.2), (0,0.8), (0.5,1), (1,0.8), (1,0.2), (0.5,0)], [(0.6,0.2), (1,0)]],
    'R': [[(0,0), (0,1), (1,1), (1,0.5), (0,0.5), (1,0)]],
    'S': [[(1,1), (0.2,1), (0,0.8), (0,0.6), (1,0.4), (1,0.2), (0.8,0), (0,0)]],
    'T': [[(0.5,0), (0.5,1)], [(0,1), (1,1)]],
    'U': [[(0,1), (0,0.2), (0.2,0), (0.8,0), (1,0.2), (1,1)]],
    'V': [[(0,1), (0.5,0), (1,1)]],
    'W': [[(0,1), (0.2,0), (0.5,0.5), (0.8,0), (1,1)]],
    'X': [[(0,0), (1,1)], [(0,1), (1,0)]],
    'Y': [[(0,1), (0.5,0.5)], [(1,1), (0.5,0.5), (0.5,0)]],
    'Z': [[(0,1), (1,1), (0,0), (1,0)]],
    '0': [[(0.5,0), (0,0.2), (0,0.8), (0.5,1), (1,0.8), (1,0.2), (0.5,0), (1,1)]], # Slashed
    '1': [[(0.2,0.8), (0.5,1), (0.5,0)], [(0.2,0), (0.8,0)]],
    '2': [[(0,0.8), (0.2,1), (0.8,1), (1,0.8), (0,0), (1,0)]],
    '3': [[(0,1), (1,1), (0.5,0.5), (1,0.2), (0.8,0), (0.2,0)]],
    '4': [[(0.8,0), (0.8,1)], [(0,1), (0,0.5), (1,0.5)]],
    '5': [[(1,1), (0,1), (0,0.6), (0.8,0.6), (1,0.4), (1,0.2), (0.8,0), (0,0)]],
    '6': [[(1,1), (0.2,0.5), (0,0.2), (0.2,0), (0.8,0), (1,0.2), (0.8,0.5), (0.2,0.5)]],
    '7': [[(0,1), (1,1), (0.4,0)]],
    '8': [[(0.5,0.5), (0.2,0.8), (0.5,1), (0.8,0.8), (0.5,0.5), (0.2,0.2), (0.5,0), (0.8,0.2), (0.5,0.5)]],
    '9': [[(0,0), (0.8,0.5), (1,0.8), (0.8,1), (0.2,1), (0,0.8), (0.2,0.5), (0.8,0.5)]],
    ' ': [], # Space
    '-': [[(0,0.5), (1,0.5)]],
    '.': [[(0.4,0), (0.6,0), (0.6,0.2), (0.4,0.2), (0.4,0)]], # Box dot
}

def get_char_strokes(char):
    return FONT_DEFS.get(char.upper(), [])

def text_to_traj(text: str, start_pos: tuple, font_size: float, char_spacing: float):
    """
    Generates a list of line segments for the given text.
    Returns: list of dicts {'type':'line', 'points':[[x1,y1], [x2,y2]], 'data':{'penup':...}}
    """
    traj_patches = []
    
    cursor_x, cursor_y = start_pos
    
    for char in text:
        if char == '\n':
            cursor_x = start_pos[0]
            cursor_y -= font_size * 1.5 # Line spacing
            continue

        if char == ' ':
            cursor_x += (font_size * 0.8) + char_spacing
            continue

        strokes = get_char_strokes(char)
        
        # Adjust for character width + spacing
        # Assuming monospaced 1.0 width for now
        char_width = font_size
        
        for stroke in strokes:
            if not stroke: continue
            
            # Map normalized stroke points to world space
            world_points = []
            for p in stroke:
                wx = cursor_x + p[0] * char_width * 0.8 # Scale width slightly down for aspect
                wy = cursor_y + p[1] * font_size # Add to scale Y up (Standard Frame)
                world_points.append((wx, wy))
            
            # Create patches from stroke (continuous line)
            # First move to start of stroke (PEN UP if needed)
            # Actually the system handles pen up automatically if disjoint.
            # But we must ensure the list of patches reflects disjoint segments.
            
            # We will create line segments for the stroke
            for i in range(len(world_points) - 1):
                p0 = world_points[i]
                p1 = world_points[i+1]
                
                # Check if this is the start of a new stroke (implicit pen up before this)
                is_start_of_stroke = (i == 0)
                # But our trajectory logic in gui_interface stitches them.
                # If we return a list of patches, the 'gap' between patches is handled by slice_trj logic?
                # In gui_interface.py: py_get_data iterates patches.
                # It stitches data[i] to data[i+1]. If data[i] end != data[i+1] start, what happens?
                # Looking at py_get_data: 
                # q0s += q0s_p ...
                # It seems it assumes continuity or inserts something?
                # NO. `slice_trj` checks `patch['data']['penup']`. 
                # If valid trajectory needs jumps, we must insert PENUP patches or rely on the logic 
                # identifying gaps.
                
                # Actually, standard way in this app seems to be: 
                # a 'line' patch is drawn. 
                # If we need to jump, we insert a 'penup' patch? 
                # OR we verify how `py_get_data` handles it.
                # "stitch patches" just concatenates. It does NOT automatically insert jumps for gaps.
                # So we must explicitly generate a jump (penup) if previous end != current start.
                
                # However, for simplicity here, we will return just the drawing patches. 
                # The user might rely on the loop in py_get_data to add the initial path from current position.
                # BUT between letters, we need jumps.
                
                # Solution: The output of this function should be fully explicit?
                # Or we let the caller handle it.
                # Let's make it explicit: 
                # Each segment in a stroke is a LINE.
                # The gap between strokes is a transition.
                # The GUI `py_get_data` normally takes a list of drawing primitives from JS.
                # JS usually sends lines/circles. 
                # If we generate this on Python side, we should match that structure.
                
                patch = {
                    'type': 'line',
                    'points': [p0, p1],
                    'data': {'penup': False}
                }
                
                # If this is the very first point of a stroke, and it's not the very first point of the text,
                # we might need to assume the previous patch ended elsewhere.
                # We will mark the start of each stroke as requiring a 'jump' from previous?
                # Actually, `slice_trj` in `gui_interface` does NOT seem to auto-magically handle jumps between list items.
                # Wait, line 96 in gui_interface:
                # `data = [{'type':'line', 'points':[current_q, data[0]['points'][0]], 'data':{'penup':True}}] + data[::]`
                # This handles the jump from ROBOT POS to START OF TRAJ.
                # But within "data", if patch[0] end != patch[1] start, there is a physical discontinuity.
                # If we just concatenate q lists, the robot will TELEPORT in `qt` lists?
                # No, `state.last_known_q` is updated. 
                # But `slice_trj` produces lists of q values. 
                # If `q0s` ends at A and next `q0s_p` starts at B, the concatenation `q0s += q0s_p` 
                # will result in the list jumping from A to B in one timestep. 
                # THIS IS BAD. infinite velocity.
                
                # So we MUST insert penup moves between disjoint segments.
                pass
                
                traj_patches.append(patch)

        cursor_x += (font_size * 0.8) + char_spacing

    # Now we need to post-process to insert PENUP moves between disjoint patches
    final_patches = []
    if not traj_patches: return []
    
    # We can't know the robot start position here, so the first patch is just the first patch.
    # (The main loop handles the move-to-start).
    
    final_patches.append(traj_patches[0])
    
    for i in range(1, len(traj_patches)):
        prev = final_patches[-1]
        curr = traj_patches[i]
        
        # Check continuity
        prev_end = prev['points'][1]
        curr_start = curr['points'][0]
        
        dist = ((prev_end[0]-curr_start[0])**2 + (prev_end[1]-curr_start[1])**2)**0.5
        
        if dist > 0.001: # Discontinuity
            # Insert PenUp
            penup_patch = {
                'type': 'line',
                'points': [prev_end, curr_start],
                'data': {'penup': True}
            }
            final_patches.append(penup_patch)
            
        final_patches.append(curr)
        
    return final_patches
