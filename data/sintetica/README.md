# Datos de ventas sintéticos — US-074

Conjunto ficticio de seis meses para la demo del mapa de calor (US-084) y el primer entrenamiento del modelo de demanda (US-087). Se guarda en CSV y no se carga en Supabase.

La simulación usa hora de Lima. El local recibe pedidos de 11:00 a 22:00 todos los días, con mayor demanda los lunes y fines de semana y picos de 12:00 a 15:00 y de 19:00 a 22:00. Incluye una selección de feriados, tres eventos ficticios y platos que se agotan. Los tiempos de cocina y de pago también son simulados.

## Cómo regenerar los CSV en Windows

Desde la raíz del repositorio, con Python 3.13:

```powershell
$venv = Join-Path $env:LOCALAPPDATA "AlToque\venv-us074"
py -3.13 -m venv $venv
$python = Join-Path $venv "Scripts\python.exe"
& $python -m pip install -r .\scripts\analitica\requirements.txt
& $python .\scripts\analitica\generar_datos.py
```

El script usa la semilla fija `74` y reemplaza los cuatro CSV de esta carpeta. Los conteos esperados y el significado de cada columna están en el [diccionario de datos](diccionario-datos.md).

Antes de iniciar US-084 y US-087, el equipo debe revisar las preguntas de negocio, los patrones simulados y los campos que utilizará cada historia.