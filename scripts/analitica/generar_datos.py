from datetime import date, datetime, timedelta
from pathlib import Path
from random import Random

import pandas as pd

SEMILLA = 74
INICIO = date(2026, 5, 1)
FIN = date(2026, 11, 1)  # Exclusivo.
SALIDA = Path(__file__).resolve().parents[2] / "data" / "sintetica"

# Selección de feriados para la simulación, no un calendario completo.
FERIADOS = {(5, 1), (7, 28), (7, 29), (10, 8)}
EVENTOS = {
    date(2026, 5, 17): "Festival del ceviche",
    date(2026, 8, 15): "Aniversario del local",
    date(2026, 10, 24): "Feria gastronómica",
}
# Código, nombre y precio en céntimos.
PLATOS = [
    ("P01", "Ceviche clásico", 3200),
    ("P02", "Ceviche mixto", 3800),
    ("P03", "Chicharrón de pescado", 3500),
    ("P04", "Chicharrón de pota", 2800),
    ("P05", "Leche de tigre", 1800),
]


def generar() -> None:
    azar = Random(SEMILLA)
    pedidos, lineas, pagos, demanda = [], [], [], []

    for indice in range((FIN - INICIO).days):
        fecha = INICIO + timedelta(days=indice)
        feriado = (fecha.month, fecha.day) in FERIADOS
        evento = EVENTOS.get(fecha, "")
        factor = 1.4 if fecha.weekday() in (0, 5, 6) else 1.0
        factor *= 1.25 if feriado else 1.0
        factor *= 1.55 if evento else 1.0

        inicial = {
            codigo: azar.randint(35, 50) if codigo == "P01"
            else azar.randint(24, 38)
            for codigo, _, _ in PLATOS
        }
        stock = inicial.copy()
        solicitadas = dict.fromkeys(stock, 0)
        agotado_desde = dict.fromkeys(stock, "")

        for hora in range(11, 22):
            pico = 12 <= hora < 15 or 19 <= hora < 22
            intentos = round(azar.randint(7, 10) * factor) if pico else azar.randint(1, 3)
            minutos = sorted(azar.randrange(60) for _ in range(intentos))

            for minuto in minutos:
                creado = datetime(fecha.year, fecha.month, fecha.day, hora, minuto)
                sello = creado.isoformat(timespec="minutes")
                seleccion = azar.choices(
                    PLATOS, weights=(34, 23, 17, 12, 14), k=azar.randint(1, 2)
                )
                carrito = {}

                for codigo, nombre, precio in seleccion:
                    cantidad = azar.choices((1, 2, 3), weights=(78, 19, 3))[0]
                    solicitadas[codigo] += cantidad
                    servidas = min(cantidad, stock[codigo])
                    if servidas == 0:
                        continue
                    stock[codigo] -= servidas
                    if stock[codigo] == 0:
                        agotado_desde[codigo] = sello
                    anterior = carrito.get(codigo, (nombre, precio, 0))[2]
                    carrito[codigo] = (nombre, precio, anterior + servidas)

                if not carrito:
                    continue

                pedido_id = f"PED-{len(pedidos) + 1:06d}"
                modalidad = azar.choices(("DINE_IN", "TAKEAWAY"), weights=(75, 25))[0]
                inicio_cocina = creado + timedelta(minutes=azar.randint(2, 8))
                listo = inicio_cocina + timedelta(
                    minutes=azar.randint(9, 24) + (5 if pico else 0)
                )
                demora_pago = (
                    azar.randint(15, 50) if modalidad == "DINE_IN"
                    else azar.randint(2, 12)
                )
                confirmado = listo + timedelta(minutes=demora_pago)
                total = sum(precio * cantidad for _, precio, cantidad in carrito.values())

                pedidos.append({
                    "pedido_id": pedido_id,
                    "creado_en": sello,
                    "modalidad": modalidad,
                    "estado": "DELIVERED",
                    "inicio_cocina_en": inicio_cocina.isoformat(timespec="minutes"),
                    "listo_en": listo.isoformat(timespec="minutes"),
                    "total_centimos": total,
                })
                for codigo, (nombre, precio, cantidad) in carrito.items():
                    lineas.append({
                        "pedido_id": pedido_id,
                        "producto_id": codigo,
                        "producto": nombre,
                        "cantidad": cantidad,
                        "precio_centimos": precio,
                        "subtotal_centimos": precio * cantidad,
                    })
                pagos.append({
                    "pago_id": f"PAG-{len(pagos) + 1:06d}",
                    "pedido_id": pedido_id,
                    "cuenta_id": f"CTA-{len(pedidos):06d}",
                    "metodo": azar.choices(
                        ("CASH", "YAPE", "CARD"), weights=(30, 50, 20)
                    )[0],
                    "estado": "CONFIRMED",
                    "confirmado_en": confirmado.isoformat(timespec="minutes"),
                    "monto_centimos": total,
                })

        for codigo, nombre, _ in PLATOS:
            vendidas = inicial[codigo] - stock[codigo]
            demanda.append({
                "fecha": fecha.isoformat(),
                "producto_id": codigo,
                "producto": nombre,
                "dia_semana": fecha.weekday(),
                "feriado": int(feriado),
                "evento": evento,
                "stock_inicial": inicial[codigo],
                "unidades_solicitadas": solicitadas[codigo],
                "unidades_vendidas": vendidas,
                "unidades_no_atendidas": solicitadas[codigo] - vendidas,
                "agotado_desde": agotado_desde[codigo],
            })

    SALIDA.mkdir(parents=True, exist_ok=True)
    for nombre, filas in {
        "pedidos": pedidos,
        "lineas_pedido": lineas,
        "pagos": pagos,
        "demanda_diaria": demanda,
    }.items():
        pd.DataFrame(filas).to_csv(
            SALIDA / f"{nombre}.csv", index=False, lineterminator="\n"
        )
        print(f"{nombre}.csv: {len(filas)} filas")


if __name__ == "__main__":
    generar()