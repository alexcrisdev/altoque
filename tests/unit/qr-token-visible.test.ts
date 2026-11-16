import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { generarToken, hashToken, recuperarTokenQr, tokenConFormatoValido, tokenDeQr } from "../../src/features/acceso-qr/token";
import { estadoQrAdmin } from "../../src/features/acceso-qr/imagen-qr";

// US-096: QR visibles sin guardar el token (HMAC del id del QR).
const id = "20000000-0000-4000-8000-000000000001";
const otroId = "20000000-0000-4000-8000-000000000002";
const secreto = "s".repeat(32);

afterEach(() => vi.unstubAllEnvs());

describe("US-096: token del QR calculado con HMAC", () => {
  it("es el mismo para el mismo QR, distinto entre QR y con formato válido", () => {
    vi.stubEnv("QR_TOKEN_SECRET", secreto);
    const token = tokenDeQr(id)!;
    expect(token).toBe(tokenDeQr(id));
    expect(token).not.toBe(tokenDeQr(otroId));
    expect(tokenConFormatoValido(token)).toBe(true);
    expect(token).toHaveLength(43);
  });

  it("cambia si cambia el secreto", () => {
    vi.stubEnv("QR_TOKEN_SECRET", secreto);
    const antes = tokenDeQr(id);
    vi.stubEnv("QR_TOKEN_SECRET", "t".repeat(32));
    expect(tokenDeQr(id)).not.toBe(antes);
  });

  it("sin secreto, corto o con espacios no calcula token", () => {
    vi.stubEnv("QR_TOKEN_SECRET", "");
    expect(tokenDeQr(id)).toBeNull();
    vi.stubEnv("QR_TOKEN_SECRET", "corto");
    expect(tokenDeQr(id)).toBeNull();
    vi.stubEnv("QR_TOKEN_SECRET", ` ${secreto}`);
    expect(tokenDeQr(id)).toBeNull();
  });

  it("recupera el token solo si el hash guardado coincide", () => {
    vi.stubEnv("QR_TOKEN_SECRET", secreto);
    const token = tokenDeQr(id)!;
    expect(recuperarTokenQr(id, hashToken(token))).toBe(token);
    // QR antiguo: token aleatorio, no se puede reconstruir
    expect(recuperarTokenQr(id, hashToken(generarToken()))).toBeNull();
    // hash de otro QR
    expect(recuperarTokenQr(otroId, hashToken(token))).toBeNull();
    expect(recuperarTokenQr(id, "abc")).toBeNull();
  });
});

describe("US-096: lo que ve el admin", () => {
  it("sin QR activo no muestra nada", async () => {
    expect(await estadoQrAdmin(null)).toBeNull();
  });

  it("QR nuevo: imagen y enlace con el token", async () => {
    vi.stubEnv("QR_TOKEN_SECRET", secreto);
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://altoque.test/");
    const token = tokenDeQr(id)!;
    const estado = await estadoQrAdmin({ id, token_hash: hashToken(token) });
    expect(estado).toMatchObject({ estado: "visible", url: `https://altoque.test/m/${token}` });
    expect(estado && "imagen" in estado && estado.imagen.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("QR antiguo o sin secreto: pide regenerarlo una vez", async () => {
    vi.stubEnv("QR_TOKEN_SECRET", secreto);
    expect(await estadoQrAdmin({ id, token_hash: hashToken(generarToken()) })).toEqual({ estado: "antiguo" });
    vi.stubEnv("QR_TOKEN_SECRET", "");
    expect(await estadoQrAdmin({ id, token_hash: hashToken("x".repeat(43)) })).toEqual({ estado: "antiguo" });
  });
});
