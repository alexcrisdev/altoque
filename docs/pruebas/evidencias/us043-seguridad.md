# US-043: pipeline de seguridad (DevSecOps)

Alexander · 03/11/2026 · PR #39, commit `f004b08`.

## Qué revisa el pipeline

`.github/workflows/seguridad.yml` corre en cada PR y push a `develop`/`main`, los lunes a las 8:00 (hora de Lima) y a mano.

| Job | Herramienta | Qué detecta | Cuándo bloquea |
|---|---|---|---|
| Secretos filtrados | Gitleaks | Claves, tokens o contraseñas subidas en commits | Si encuentra cualquier secreto |
| Análisis del código | CodeQL (`security-extended`) | Inyecciones, XSS y otros patrones inseguros en TypeScript | Las alertas nuevas aparecen como check "CodeQL" en el PR |
| Dependencias vulnerables | npm audit | Librerías con vulnerabilidades conocidas | Solo si es alta/crítica y llega a producción (`--omit=dev`) |
| Revisión de dependencias nuevas | Dependency Review | Librerías vulnerables que agrega un PR | Severidad alta o mayor; solo corre en PR |
| Resultado de seguridad | — | Junta los cuatro resultados | Si alguno falló (`skipped` cuenta como válido) |

Además, en el repositorio quedan activas las alertas de Dependabot: GitHub avisa en Security si alguna dependencia tiene una vulnerabilidad conocida. No se usa `dependabot.yml` (actualizaciones automáticas semanales): al probarlo abrió 5 PRs, 3 eran saltos de versión mayor y uno (TypeScript 7) rompía el lint, así que se retiró para no meter cambios grandes antes de la entrega.

## Evidencias

**Gráfico del pipeline.** Las cuatro revisiones corren en paralelo y el job final depende de todas (`needs`). Todo en verde.

![Gráfico del pipeline de seguridad](captura-us043-grafico.png)

**CodeQL en el PR.** Sin alertas nuevas en el código del PR. En el repositorio quedan 0 alertas abiertas.

![Resultado de CodeQL](captura-us043-codeql.png)

**Dependabot en el repositorio.** Alertas y security updates activados.

![Configuración de Dependabot](captura-us043-dependabot.png)

**Protección de secretos.** Secret scanning y push protection activados: GitHub rechaza un push que traiga una clave reconocible.

![Secret scanning y push protection](captura-us043-secretos.png)

El detalle de cada ejecución, con tiempos y la revisión previa local, está en [us043-validacion.txt](us043-validacion.txt).

## Lo que encontró el pipeline

La primera ejecución falló en "Revisión de dependencias nuevas" porque el repositorio no tenía activado el *Dependency graph*. Se activó desde Settings, se volvieron a correr los jobs fallidos y pasaron. Es un ejemplo de lo que busca DevSecOps: el problema era de configuración y lo detectó el pipeline, no una persona.

## Límites conocidos

- npm audit reporta 16 vulnerabilidades moderadas en herramientas de desarrollo (cadena de ESLint → minimatch 3.1.5). No llegan a producción, por eso no bloquean. Corregirlas exige migrar a ESLint 10; queda para después de la entrega.
- Todos los entornos usan la misma base de Supabase; este pipeline no la toca.
