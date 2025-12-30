import pandas as pd
import matplotlib.pyplot as plt

# Leggi i dati dal file CSV
# Sostituisci 'nome_file.csv' con il percorso del tuo file CSV
df = pd.read_csv('step_PI.csv')

# Smooth delle traettorie generate 
def moving_average(series, window_size=10):
    return series.rolling(window=window_size, min_periods=1).mean()

df['q0'] = moving_average(df['q0'])
df['q1'] = moving_average(df['q1'])

# Normalizza i timestamp sottraendo il valore del primo timestamp
# così che il primo valore sia 0 e gli altri rappresentino i millisecondi trascorsi
first_timestamp = df['timestamp'].iloc[0]
df['normalized_time'] = df['timestamp'] - first_timestamp
df['normalized_time'] = df['normalized_time'] / 1000  # Conversione dei millisecondi in secondi

# Crea una figura con due subplot
plt.figure(figsize=(14, 8))

# Primo subplot: confronto tra q0 e q0_actual
plt.subplot(2, 1, 1)
plt.plot(df['normalized_time'], df['q0'], label='q0_ref', color='red', linewidth=1.5)
plt.plot(df['normalized_time'], df['q0_actual'], label='q0_actual', color='blue')
plt.title('Confronto tra q0 e q0_actual - PI')
# plt.xlabel('Tempo [s]')
plt.ylabel('Angle [rad]')
plt.legend()
plt.grid(True)

# Secondo subplot: confronto tra q1 e q1_actual
plt.subplot(2, 1, 2)
plt.plot(df['normalized_time'], df['q1'], label='q1_ref', color='red', linewidth=1.5)
plt.plot(df['normalized_time'], df['q1_actual'], label='q1_actual', color='green')
plt.title('Confronto tra q1 e q1_actual - PI')
plt.xlabel('Tempo [s]')
plt.ylabel('Angle [rad]')
plt.legend()
plt.grid(True)

plt .savefig('Step PI.png', dpi=300, bbox_inches='tight')

plt.figure(figsize=(14, 8))
plt.subplot(2, 1, 1)
plt.plot(df['normalized_time'], df['q0']-df['q0_actual'], label='e0', color='red')
plt.title('Errore tra q0 e q0_actual - PI')
# plt.xlabel('Tempo [s]')
plt.ylabel('Angle [rad]')
plt.legend()
plt.grid(True)

plt.subplot(2, 1, 2)
plt.plot(df['normalized_time'], df['q1']-df['q1_actual'], label='e0', color='blue')
plt.title('Errore tra q1 e q1_actual - PI')
plt.xlabel('Tempo [s]')
plt.ylabel('Angle [rad]')
plt.legend()
plt.grid(True)

plt .savefig('Step PI Error.png', dpi=300, bbox_inches='tight')

# Aggiusta il layout
plt.tight_layout()

# Mostra il grafico
plt.show()

# Opzionalmente, puoi aggiungere questa riga per visualizzare informazioni sul tempo totale
print(f"Tempo totale della registrazione: {df['normalized_time'].iloc[-1]} s")