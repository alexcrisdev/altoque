# US-006: carrito desplazable en celular

## Cambio

El desplazamiento de productos pasa del fieldset a un div con altura mínima de
25dvh. El pie tiene desplazamiento independiente y un máximo que reserva espacio
para la cabecera. El contenedor interior descuenta los dos píxeles del borde del
diálogo. Desde md se conservan el panel lateral y el pie sin límite de altura.
No cambian eventos, validaciones, nombres accesibles ni lógica del carrito.

## Verificación visual local

Playwright con Microsoft Edge instalado, en localhost:3000. Los nombres de los
archivos indican dimensiones de referencia, no dispositivos físicos ni Safari.

- iPhone SE: viewport 375×667.
- Android bajo: viewport 360×560.
- Escritorio: viewport 1280×900.

### Carta real autorizada

Archivos `real-*.png`: QR proporcionado por la usuaria, correspondiente a Mesa 3
de Cevichería Demo. Mesa cerrada y cuatro productos disponibles. Se agregaron esos
cuatro productos al carrito local, se recorrieron y aumentaron sus cantidades.
Se seleccionó Para llevar desde la mesa, se completaron Nombre y Teléfono y se
alcanzó Confirmar pedido. El botón permaneció deshabilitado por la mesa cerrada.
No se confirmaron pedidos, abrieron sesiones ni modificaron existencias o QR.

Las capturas antes usan el componente original de HEAD; después usan la corrección.

| Tamaño | Antes, para llevar | Después, para llevar | Confirmar alcanzable |
| --- | --- | --- | --- |
| 375×667 | [Antes](real-iphone-se-llevar-antes.png) | [Después](real-iphone-se-llevar-despues.png) | [Confirmar](real-iphone-se-llevar-confirmar.png) |
| 360×560 | [Antes](real-android-bajo-llevar-antes.png) | [Después](real-android-bajo-llevar-despues.png) | [Confirmar](real-android-bajo-llevar-confirmar.png) |

### Componentes reales con datos ficticios

Archivos sin prefijo `real-`: página temporal local, eliminada al terminar,
con PanelCarrito y SelectorModalidad reales y seis platos ficticios. Modalidades
mesa y mostrador. El componente anterior se obtuvo de HEAD.

Se comprobó en los tres tamaños:

- Diálogo accesible como Tu carrito.
- Aumento de los seis productos de una a dos unidades, comprobando cada cantidad.
- Nombre y Teléfono editables en mostrador.
- Confirmar pedido alcanzable y apto para clic mediante `click({ trial: true })`;
  no se ejecutó la confirmación.
- En móvil, altura mínima de lista de al menos 25dvh, scroll efectivo de lista
  y pie, y pie contenido dentro del diálogo.
- En escritorio, pie sin scroll y lista desplazable; capturas antes/después.

Alturas medidas de la lista después: 176 px en 375×667 y 149 px en 360×560.
En mostrador, el pie se desplazó 228 px y 308 px respectivamente.

## Pendientes

- Safari de iPhone y Android físicos, incluido teclado virtual.
- Recorrido real desde un QR vigente de mostrador (solo se recibió el QR de mesa).
- Confirmación real: no necesaria para este ajuste visual y no ejecutada.

## Verificaciones automáticas

Resultados después de retirar la página temporal:

- `npm.cmd run lint`: aprobado.
- `npm.cmd run typecheck`: aprobado.
- `npm.cmd test`: 935 pruebas aprobadas en 58 archivos.
- `npm.cmd run build`: aprobado; 25 páginas generadas.
- `git diff --check`: sin errores.
