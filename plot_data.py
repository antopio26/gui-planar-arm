import pandas as pd
import matplotlib.pyplot as plt
import numpy as np

def process_file(input_path, output_path):
    # Legge il file e filtra le righe che non iniziano con TRJ
    data = []
    with open(input_path, 'r') as file:
        for line in file:
            if not line.startswith("TRJ"):
                values = line.strip().split(';')
                if len(values) == 2:  # Evita righe malformate
                    data.append([int(values[0]), int(values[1])])

    # Crea il DataFrame
    f_reduction1=1/10 #Considerato già nel firmware
    f_reduction2=1/5 #Considerato già nel firmware
    count1=40000
    count2=20000

    df = pd.DataFrame(data, columns=["value1", "value2"]) #Crea il dataframe con i dati dell'encoder 
    df1= pd.read_csv(csv_file) #Legge il file csv con i dati della traiettoria precalcolata
    # df2 = pd.read_csv(csv_file1) #Legge il file csv
    df["value1"]=(-df["value1"]/count1)*2*np.pi #Convrsione in rad con segno meno per movimenti speculari 
    df["value2"]=2*np.pi+(-df["value2"]/count2)*2*np.pi #Convrsione in rad con segno meno per movimenti speculari + controrotazione 2pi

    # df2["Encoder_1_deg"]=(-df2["Encoder_1_deg"]/count1)*2*np.pi #Segno meno per movimenti speculari
    # df2["Encoder_2_deg"]=2*np.pi+(-df2["Encoder_2_deg"]/count2)*2*np.pi #Segno meno per movimenti speculari + controrotazioen 2pi

    # Salva il CSV
    df.to_csv(output_path, index=False)
    print(f"File CSV generato: {output_path}")
    
    # Crea la figura e i subplot

    fig, axes = plt.subplots(2, 2, figsize=(14, 10))

    # Subplot 1: value1
    axes[0, 0].plot(df["value1"], label="Value 1", color="blue")
    axes[0, 0].set_title("Encoder M1")
    #axes[0, 0].set_xlabel("Index")
    axes[0, 0].set_ylabel("Value 1")
    axes[0, 0].legend()

    # Subplot 2: value2
    axes[0, 1].plot(df["value2"], label="Value 2", color="orange")
    axes[0, 1].set_title("Encoder M2")
    #axes[0, 1].set_xlabel("Index")
    axes[0, 1].set_ylabel("Value 2")
    axes[0, 1].legend()

    # Subplot 3: Angle_1
    scaled_trajectory = df1['Trajectory'] * 15  # Adeguamento della scala x
    axes[1, 0].plot(scaled_trajectory, df1['Angle_1_deg'], 'b-', label='Angolo 1 (Calcolato)', linewidth=2)
    axes[1, 0].set_title('Trj M1')
    #axes[1, 0].set_xlabel("Index (Scaled)")
    axes[1, 0].set_ylabel("Angle 1 (deg)")
    axes[1, 0].legend()

    # Subplot 4: Angle_2
    axes[1, 1].plot(scaled_trajectory, df1['Angle_2_deg'], 'r-', label='Angolo 2 (Calcolato)', linewidth=2)
    axes[1, 1].set_title('Trj M2')
    #axes[1, 1].set_xlabel("Index (Scaled)")
    axes[1, 1].set_ylabel("Angle 2 (deg)")
    axes[1, 1].legend()
    
    # #Plotta i valori mediati di encoder presi dal file trajectory_data.csv
    # #Genera nuova figura
    # fig1, axes1 = plt.subplots(2, 2, figsize=(14, 10))
    # # Subplot 1: Encoder_1_deg
    # axes1[0, 0].plot(df2["Encoder_1_deg"], label="Encoder 1", color="blue")
    # axes1[0, 0].set_title("Encoder M1")
    # #axes1[0, 0].set_xlabel("Index")
    # axes1[0, 0].set_ylabel("Encoder 1 (deg)")
    # axes1[0, 0].legend()
    
    # # Subplot 2: Encoder_2_deg
    # axes1[0, 1].plot(df2["Encoder_2_deg"], label="Encoder 2", color="orange")
    # axes1[0, 1].set_title("Encoder M2")
    # #axes1[0, 1].set_xlabel("Index")
    # axes1[0, 1].set_ylabel("Encoder 2 (deg)")
    # axes1[0, 1].legend()

    #plt.tight_layout()
    plt.show()


# Percorso del file di input e di output
csv_file = "trajectory_data.csv"
csv_file1 = "trajectory_data.csv"
input_path = "E:/Magistrale/Robotics/2DOF_Manipulator_Robotics1p-main/firmware/SWV_export/SWV_ITM_Data_Console_2.txt"  # Percorso file input
output_path = "filtered_values.csv"
process_file(input_path, output_path)
