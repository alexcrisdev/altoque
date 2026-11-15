# US-095 · Validación

**Historia:** Pipeline conectado al pasar a producción (Task).
**Responsable:** Alexander · **Sprint 7** · **Fecha:** 13/11/2026 (planificada 14/11, adelantada un día)

## Qué cambió

- Nuevo `.github/workflows/pipeline-main.yml` (en Actions se llama **Pipeline**). Corre en cada push a `develop` (staging) y `main` (producción), y a mano con *Run workflow*.
- Encadena con `needs` los workflows que ya existían, llamados con `workflow_call`:
  `1. CI → 2. Integración → 3. E2E → 4. Seguridad → 5. Despliegue (Vercel) → 6. Smoke`.
- La etapa **Despliegue** espera a que Vercel publique ese commit y lo registra como entorno `staging` o `produccion`, con su enlace.
- En `develop` y `main` los workflows ya no corren sueltos (no se duplican). En los PR siguen corriendo solos.
- Documentado en `docs/despliegue.md` (sección «Pipeline de develop y main»).

## Criterios de aceptación

| Criterio | Evidencia | Resultado |
|---|---|---|
| Nuevo `pipeline-main.yml` que llama a ci, seguridad y smoke con `workflow_call` y los encadena con `needs` | El archivo llama también a integración y E2E. Primera corrida: run [#43529684098](https://github.com/alexcrisdev/altoque/actions/runs/43529684098) | Aprobado |
| Si una etapa falla, las siguientes no corren | Cada etapa tiene `needs` sobre la anterior; GitHub omite las siguientes si una falla | Aprobado (por diseño; documentado) |
| Los workflows siguen funcionando solos en los PR | PR #80: `verificar`, integración, E2E, las 4 revisiones de seguridad y Vercel en verde | Aprobado |
| Captura del gráfico en `docs/pruebas/evidencias` | [Gráfico de 6 etapas](captura-us095-grafico-6-etapas.png) · [Página completa del run](captura-us095-pipeline-develop.png) | Aprobado |

## Primera corrida (develop, merge del PR #80, commit `8d84048`)

```
Pipeline · push · develop · Success · 11 min 27 s
1. CI / verificar                          success   1 min 17 s
2. Integración / integracion               success   1 min 46 s
3. E2E / e2e                               success   6 min 1 s
4. Seguridad / Gitleaks, CodeQL, npm audit success   (Revisión de dependencias: omitida, solo aplica en PR)
4. Seguridad / Resultado de seguridad      success
5. Despliegue (Vercel)                     success   entorno staging
6. Smoke / smoke                           success
```

## Limitación conocida

Integración y E2E comparten el grupo de concurrencia `integracion-supabase-compartida` para no escribir a la vez en la base compartida. GitHub permite **1 en curso y 1 en espera** por grupo: si llega un tercero, el que esperaba se cancela (pasó con el E2E del PR #80, que pasó al relanzarlo). Si una etapa sale *cancelled*, se usa **Re-run failed jobs**. Recomendación al equipo: mergear a develop de uno en uno.

El pase a `main` (US-101) mostrará el mismo gráfico con la etiqueta `main` y el entorno `produccion`.
