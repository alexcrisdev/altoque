import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const esLocal = (() => {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    return url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  } catch { return false; }
})();

function ejecutarSql(sql: string | Buffer): string {
  return execFileSync("docker", [
    "exec", "-i", "supabase_db_altoque", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q",
  ], { input: sql, encoding: "utf8", timeout: 30000, stdio: ["pipe", "pipe", "pipe"] });
}

// Cada caso crea su propio local, Mesa 88 y QR dentro de una transacción.
// No usa Mesa 5 ni el QR de mostrador reservado para E2E. ROLLBACK también
// descarta la serie ficticia: ningún número se consume en Nubefact.
function cuentaLocal(modalidad: "DINE_IN" | "TAKEAWAY"): string {
  return `begin;
insert into auth.users(id, email) values ('88000000-0000-4000-8000-000000000090', 'reserva-us088@example.test');
insert into public.users(id, full_name) values ('88000000-0000-4000-8000-000000000090', 'Caja reserva local');
insert into public.staff_memberships(user_id, restaurant_id, role_id)
 select '88000000-0000-4000-8000-000000000090', '10000000-0000-0000-0000-000000000001', id from public.roles where code = 'CASHIER';
insert into public.branches(id, restaurant_id, name) values
 ('88000000-0000-4000-8000-000000000091', '10000000-0000-0000-0000-000000000001', 'US-088 local aislado');
insert into public.dining_tables(id, restaurant_id, branch_id, number) values
 ('88000000-0000-4000-8000-000000000092', '10000000-0000-0000-0000-000000000001', '88000000-0000-4000-8000-000000000091', 88);
insert into public.qr_codes(id, restaurant_id, branch_id, dining_table_id, purpose, token_hash) values
 ('88000000-0000-4000-8000-000000000093', '10000000-0000-0000-0000-000000000001', '88000000-0000-4000-8000-000000000091',
 ${modalidad === "DINE_IN" ? "'88000000-0000-4000-8000-000000000092'" : "null"}, '${modalidad}', repeat('b', 64));
${modalidad === "DINE_IN" ? `insert into public.table_sessions(id, restaurant_id, branch_id, dining_table_id, opened_by) values
 ('88000000-0000-4000-8000-000000000094', '10000000-0000-0000-0000-000000000001', '88000000-0000-4000-8000-000000000091', '88000000-0000-4000-8000-000000000092', '88000000-0000-4000-8000-000000000090');` : ""}
insert into public.orders(id, restaurant_id, branch_id, qr_code_id, table_session_id, dining_table_id, modality, total, idempotency_key) values
 ('88000000-0000-4000-8000-000000000095', '10000000-0000-0000-0000-000000000001', '88000000-0000-4000-8000-000000000091', '88000000-0000-4000-8000-000000000093',
 ${modalidad === "DINE_IN" ? "'88000000-0000-4000-8000-000000000094', '88000000-0000-4000-8000-000000000092'" : "null, null"}, '${modalidad}', 10, gen_random_uuid());
insert into public.order_items(order_id, product_id, product_name, quantity, unit_price, subtotal)
 select '88000000-0000-4000-8000-000000000095', id, name, 1, 10, 10 from public.products
 where restaurant_id = '10000000-0000-0000-0000-000000000001' order by id limit 1;
insert into public.receipt_series(restaurant_id, series, next_number)
 values ('10000000-0000-0000-0000-000000000001', 'BBB1', 33);
select set_config('request.jwt.claim.sub', '88000000-0000-4000-8000-000000000090', true);
set local role authenticated;
`;
}

function pagoLocal(modalidad: "DINE_IN" | "TAKEAWAY", monto: number, correo: string): string {
  const cuenta = modalidad === "DINE_IN"
    ? "'88000000-0000-4000-8000-000000000094', null"
    : "null, '88000000-0000-4000-8000-000000000095'";
  return `select * from public.registrar_pago(${cuenta}, 'CASH', ${monto}, ${monto}, null, null, gen_random_uuid(), ${correo});\n`;
}

function comprobarReserva(cantidad: number, siguiente: number): string {
  return `reset role;
do $$ begin
 if (select count(*) from public.receipts where restaurant_id = '10000000-0000-0000-0000-000000000001') <> ${cantidad} then
   raise exception 'Reserva inesperada'; end if;
 if (select next_number from public.receipt_series where restaurant_id = '10000000-0000-0000-0000-000000000001') <> ${siguiente} then
   raise exception 'Correlativo inesperado'; end if;
 ${cantidad ? `if not exists (select 1 from public.receipts where restaurant_id = '10000000-0000-0000-0000-000000000001'
   and number = 33 and status = 'PENDIENTE') then raise exception 'Numero reservado incorrecto'; end if;` : ""}
end $$;
select 'US-088: regla de correo aprobada';
rollback;`;
}

// SQL con datos propios, aserciones y ROLLBACK. El contenedor está fijado al
// proyecto local; nunca se ejecuta en CI contra la base compartida.
describe.skipIf(!esLocal)("US-088 sobre US-097: boletas en Supabase local", () => {
  it("valida snapshot, correo, correlativo, RLS e idempotencia y descarta sus datos", () => {
    const salida = ejecutarSql(readFileSync("supabase/tests/us088_boletas.sql"));
    expect(salida).toContain("US-088: verificaciones SQL y RLS locales aprobadas");
  }, 35000);

  describe.each(["DINE_IN", "TAKEAWAY"] as const)("reserva por cuenta %s", (modalidad) => {
    it.each(["null", "''", "'   '"])("pago completo sin correo (%s) no reserva ni consume correlativo", (correo) => {
      const salida = ejecutarSql(cuentaLocal(modalidad) + pagoLocal(modalidad, 10, correo) + comprobarReserva(0, 33));
      expect(salida).toContain("US-088: regla de correo aprobada");
    });

    it("pago completo con correo reserva exactamente el siguiente numero", () => {
      const salida = ejecutarSql(cuentaLocal(modalidad) + pagoLocal(modalidad, 10, "'cliente@example.test'") + comprobarReserva(1, 34));
      expect(salida).toContain("US-088: regla de correo aprobada");
    });

    it("pago parcial con correo y pago final sin correo reservan al completar la cuenta", () => {
      const parcialSinReserva = `reset role;
do $$ begin
 if exists (select 1 from public.receipts where restaurant_id = '10000000-0000-0000-0000-000000000001')
   or (select next_number from public.receipt_series where restaurant_id = '10000000-0000-0000-0000-000000000001') <> 33
 then raise exception 'El pago parcial consumio correlativo'; end if;
end $$;
set local role authenticated;\n`;
      const salida = ejecutarSql(cuentaLocal(modalidad) + pagoLocal(modalidad, 4, "'cliente@example.test'")
        + parcialSinReserva + pagoLocal(modalidad, 6, "null") + comprobarReserva(1, 34));
      expect(salida).toContain("US-088: regla de correo aprobada");
    });
  });
});
