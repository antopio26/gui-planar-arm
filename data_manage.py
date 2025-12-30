from struct import unpack, pack
import numpy as np
import csv

def hex_to_double(hex_value: str) -> float:
    """
    Converte una stringa esadecimale rappresentante un double in valore float.
    """
    # Rimuove il prefisso 0x e completa a 16 cifre per il formato corretto
    hex_value = hex_value.lstrip("0x").rjust(16, "0")
    # Decodifica da little-endian a double
    return unpack('>d', bytes.fromhex(hex_value))[0]

def rad_to_deg(rad):
    """
    Converte da radianti a gradi
    """
    return rad #(rad * 180 / np.pi)

def encoder_to_deg(ticks):
    """
    Converte i ticks dell'encoder in gradi (1 grado = 338 ticks)
    """
    return ticks

def main(input_file, output_file):
    # Leggi il file
    with open(input_file, 'r') as file:
        lines = file.readlines()

    # Trova gli indici delle righe TRJ
    trj_indices = [i for i, line in enumerate(lines) if line.startswith("TRJ")]

    # Prepara i dati per il CSV
    csv_data = []
    headers = ['Trajectory', 'Angle_1_deg', 'Angle_2_deg', 'Encoder_1_deg', 'Encoder_2_deg']

    for i in range(len(trj_indices) - 1):
        # Riga TRJ iniziale
        trj_start = lines[trj_indices[i]].strip()

        # Converte i valori esadecimali in double (radianti)
        hex_values = trj_start.split(':')[1:]
        double_values = [hex_to_double(value) for value in hex_values]
        
        # Converti da radianti a gradi
        degree_values = [rad_to_deg(val) for val in double_values[:2]]

        # Blocchi intermedi
        # 
        start = trj_indices[i] + 1
        end = trj_indices[i + 1]
        block = [line.strip().split(';') for line in lines[start:end]]
        first_values = [int(pair[0]) for pair in block]
        second_values = [int(pair[1]) for pair in block]
        mean_first = np.mean(first_values)
        mean_second = np.mean(second_values)
        
        # Converti le medie dell'encoder in gradi
        encoder_deg_1 = encoder_to_deg(mean_first)
        encoder_deg_2 = encoder_to_deg(mean_second)

        # Aggiungi riga al CSV
        csv_data.append([
            i,  # Numero traiettoria
            degree_values[0],  # Primo angolo in gradi
            degree_values[1],  # Secondo angolo in gradi
            encoder_deg_1,  # Media encoder 1 in gradi
            encoder_deg_2   # Media encoder 2 in gradi
        ])

    # Gestione dell'ultima TRJ
    final_block = lines[trj_indices[-1] + 1: trj_indices[-1] + 7]
    if final_block:
        trj_start = lines[trj_indices[-1]].strip()
        hex_values = trj_start.split(':')[1:]
        double_values = [hex_to_double(value) for value in hex_values]
        degree_values = [rad_to_deg(val) for val in double_values[1:3]]
        block = [line.strip().split(';') for line in final_block]
        first_values = [int(pair[0]) for pair in block]
        second_values = [int(pair[1]) for pair in block]
        mean_first = np.mean(first_values)
        mean_second = np.mean(second_values)
        
        # Converti le medie dell'encoder in gradi
        encoder_deg_1 = encoder_to_deg(mean_first)
        encoder_deg_2 = encoder_to_deg(mean_second)
        
        csv_data.append([
            len(trj_indices) - 1,  # Numero ultima traiettoria
            degree_values[0],
            degree_values[1],
            encoder_deg_1,
            encoder_deg_2
        ])

    # Scrivi il file CSV
    with open(output_file, 'w', newline='') as file:
        writer = csv.writer(file)
        writer.writerow(headers)  # Scrivi l'intestazione
        writer.writerows(csv_data)  # Scrivi i dati

    print(f"File CSV generato correttamente: {output_file}")

# Esegui il codice
input_file = "E:/Magistrale/Robotics/2DOF_Manipulator_Robotics1p-main/firmware/SWV_export/SWV_ITM_Data_Console_2.txt"
output_file = "trajectory_data.csv"
main(input_file, output_file)