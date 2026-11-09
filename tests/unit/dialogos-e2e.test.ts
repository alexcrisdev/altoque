import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type { Dialog, Page } from "@playwright/test";
import { aceptarDialogoDeAccion } from "../e2e/dialogos";

function entorno(tipo = "confirm", mensaje = "Cerrar") {
  const eventos = new EventEmitter();
  const page = eventos as unknown as Page;
  const dialogo = {
    type: () => tipo, message: () => mensaje,
    accept: vi.fn().mockResolvedValue(undefined), dismiss: vi.fn().mockResolvedValue(undefined),
  };
  return { eventos, page, dialogo, abrir: async () => { eventos.emit("dialog", dialogo as unknown as Dialog); } };
}

describe("diálogos de limpieza E2E", () => {
  it("acepta una sola vez y retira el manejador", async () => {
    const { eventos, page, dialogo, abrir } = entorno("prompt", "Motivo");
    await aceptarDialogoDeAccion(page, abrir, "prompt", "Motivo", "Prueba propia");
    expect(dialogo.accept).toHaveBeenCalledExactlyOnceWith("Prueba propia");
    expect(eventos.listenerCount("dialog")).toBe(0);
  });
  it("un clic fallido no deja un manejador que acepte el siguiente diálogo", async () => {
    const { eventos, page, dialogo, abrir } = entorno();
    const errorOriginal = new Error("Botón no disponible");
    await expect(aceptarDialogoDeAccion(page, async () => { throw errorOriginal; }, "confirm", "Cerrar")).rejects.toBe(errorOriginal);
    expect(eventos.listenerCount("dialog")).toBe(0);
    await aceptarDialogoDeAccion(page, abrir, "confirm", "Cerrar");
    expect(dialogo.accept).toHaveBeenCalledTimes(1);
  });
  it("se detiene sin tocar otro manejador ni ejecutar la acción", async () => {
    const { eventos, page } = entorno();
    const pendiente = vi.fn();
    eventos.on("dialog", pendiente);
    const accion = vi.fn();
    await expect(aceptarDialogoDeAccion(page, accion, "confirm", "Cerrar")).rejects.toThrow("manejador de diálogo pendiente");
    expect(accion).not.toHaveBeenCalled();
    expect(eventos.listeners("dialog")).toEqual([pendiente]);
  });
  it("propaga el fallo al aceptar sin dejar rechazos sin manejar", async () => {
    const { eventos, page, dialogo, abrir } = entorno();
    const errorOriginal = new Error("Navegador cerrado");
    dialogo.accept.mockRejectedValue(errorOriginal);
    await expect(aceptarDialogoDeAccion(page, abrir, "confirm", "Cerrar")).rejects.toBe(errorOriginal);
    expect(eventos.listenerCount("dialog")).toBe(0);
  });
  it("no confirma una ventana inesperada", async () => {
    const { eventos, page, dialogo, abrir } = entorno("confirm", "Otra acción");
    await expect(aceptarDialogoDeAccion(page, abrir, "confirm", "Cerrar")).rejects.toThrow("distinto del esperado");
    expect(dialogo.accept).not.toHaveBeenCalled();
    expect(dialogo.dismiss).toHaveBeenCalledTimes(1);
    expect(eventos.listenerCount("dialog")).toBe(0);
  });
  it("falla si no se abrió una ventana y elimina el manejador", async () => {
    const { eventos, page } = entorno();
    await expect(aceptarDialogoDeAccion(page, async () => {}, "confirm", "Cerrar")).rejects.toThrow("no abrió el diálogo");
    expect(eventos.listenerCount("dialog")).toBe(0);
  });
});
