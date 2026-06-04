/* Headless checks for the Solana engine. Run: npx tsx scripts/svm-smoke.ts */
import { detect } from "../src/lib/detect";
import { analyzeSolanaAddress, analyzeSolanaTransaction } from "../src/lib/svm";

const RPC = process.env.SOLANA_RPC || "https://solana-rpc.publicnode.com";

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const j = (await r.json()) as { result?: T; error?: { message: string } };
  if (j.error) throw new Error(j.error.message);
  return j.result as T;
}
async function recentSig(program: string): Promise<string | undefined> {
  const sigs = await rpc<{ signature: string; err: unknown }[]>("getSignaturesForAddress", [program, { limit: 8 }]);
  return sigs.find((s) => !s.err)?.signature ?? sigs[0]?.signature;
}
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const JUPITER = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}

async function main() {
  console.log("\n[detect — Solana]");
  check("token program is a Solana address", detect(TOKEN_PROGRAM).kind === "solanaAddress", detect(TOKEN_PROGRAM).kind);
  check("EVM address still wins", detect("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045").kind === "address");
  check("number not mistaken for base58", detect("123456789").kind === "number");

  console.log("\n[Solana account (network)]");
  try {
    const acct = await analyzeSolanaAddress({ rpc: RPC, cluster: "mainnet-beta" }, TOKEN_PROGRAM);
    check("token program account exists", !!acct?.exists, JSON.stringify(acct));
    check("token program is executable", acct?.executable === true, String(acct?.executable));
  } catch (e) { console.log(`  (skipped: ${(e as Error).message})`); }

  console.log("\n[Solana tx — real signature pulled at runtime (network)]");
  try {
    const target = await recentSig(TOKEN_PROGRAM);
    check("found a recent signature", !!target);
    if (target) {
      check("signature detected as solanaSig", detect(target).kind === "solanaSig", `${target.length} chars`);
      const r = await analyzeSolanaTransaction({ rpc: RPC, cluster: "mainnet-beta" }, target);
      check("report returned", !!r, "null report");
      check("status resolved", r?.status === "success" || r?.status === "failed", r?.status);
      check("fee present", !!r && Number(r.fee) >= 0, r?.fee);
      check("has programs", (r?.programs.length ?? 0) > 0, `${r?.programs.length}`);
      check("has instructions", (r?.instructions.length ?? 0) > 0, `${r?.instructions.length}`);
      const anchorDecoded = r?.instructions.filter((i) => i.source === "anchor IDL").length ?? 0;
      console.log(`    ↳ ${r?.instructions.length} ix (${anchorDecoded} via Anchor IDL), ${r?.transfers.length} transfers, ${r?.programs.length} programs`);
      if (r?.transfers[0]) console.log(`    ↳ transfer: ${r.transfers[0].amount} ${r.transfers[0].kind} ${r.transfers[0].from.slice(0,6)}…→${r.transfers[0].to.slice(0,6)}…`);
    }
  } catch (e) { console.log(`  (skipped: ${(e as Error).message})`); }

  console.log("\n[Anchor IDL decode — real Jupiter v6 swap (network)]");
  try {
    const target = await recentSig(JUPITER);
    if (!target) {
      console.log("  (skipped: no recent Jupiter signature)");
    } else {
      const r = await analyzeSolanaTransaction({ rpc: RPC, cluster: "mainnet-beta" }, target);
      const jup = r?.instructions.find((i) => i.programId === JUPITER);
      check("Jupiter instruction present", !!jup, JSON.stringify(jup?.summary));
      check("decoded via Anchor IDL", jup?.source === "anchor IDL", `source=${jup?.source}`);
      check("Anchor decode yielded named args", (jup?.args.length ?? 0) > 0, `${jup?.args.length} args`);
      if (jup) console.log(`    ↳ ${jup.program}.${jup.summary}(${jup.args.map((a) => a.name).join(", ")})`);
    }
  } catch (e) {
    console.log(`  (skipped: ${(e as Error).message})`);
  }

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail > 0 ? 1 : 0);
}
main();
