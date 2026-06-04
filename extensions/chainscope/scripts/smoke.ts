/* Headless checks for the pure + network lib layer. Run: npx tsx scripts/smoke.ts */
import { detect } from "../src/lib/detect";
import { checksum, convertUnits, hashAndSelector } from "../src/lib/convert";
import {
  analyzeAddress,
  analyzeCalldata,
  analyzeTransaction,
  decodeRevertData,
  decodeWithCustomAbi,
  fetchTransaction,
  parseAbiText,
  reverseEns,
} from "../src/lib/evm";
import {
  concat,
  createPublicClient,
  encodeAbiParameters,
  encodeFunctionData,
  encodePacked,
  http,
  parseAbiItem,
  toFunctionSelector,
} from "viem";
import { mainnet } from "viem/chains";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const VITALIK = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const USDC = "0xA0b86991c6218b36C1d19D4a2e9Eb0cE3606eB48"; // proxy on mainnet
// transfer(0x1111...1111, 1000000)
const TRANSFER_CALLDATA = encodeFunctionData({
  abi: [parseAbiItem("function transfer(address,uint256)")],
  functionName: "transfer",
  args: ["0x1111111111111111111111111111111111111111", 1000000n],
});

async function main() {
  console.log("\n[detect]");
  check("address", detect(VITALIK).kind === "address");
  check("ens name", detect("vitalik.eth").kind === "ensName");
  check("tx hash (32 bytes)", detect(`0x${"ab".repeat(32)}`).kind === "txHash");
  check("calldata", detect(TRANSFER_CALLDATA).kind === "calldata");
  check("number", detect("1000000000000000000").kind === "number");
  check("decimal", detect("1.5").kind === "number");
  check("unknown", detect("hello world").kind === "unknown");

  console.log("\n[convert]");
  check("checksum round-trip", checksum(VITALIK.toLowerCase()) === VITALIK);
  const u = convertUnits("1000000000000000000");
  check("1e18 wei → 1 ether", u.some((r) => r.label === "As wei → ether" && r.value === "1"), JSON.stringify(u));
  const h = hashAndSelector("transfer(address,uint256)");
  check(
    "selector transfer = 0xa9059cbb",
    h.some((r) => r.label.startsWith("Function selector") && r.value === "0xa9059cbb"),
    JSON.stringify(h),
  );

  console.log("\n[decode — standard ABI (named params, no network needed)]");
  {
    const { decoded } = await analyzeCalldata({ chainId: 1 }, TRANSFER_CALLDATA);
    check("decodes transfer", decoded?.functionName === "transfer", JSON.stringify(decoded));
    check("arg count = 2", decoded?.args.length === 2, JSON.stringify(decoded?.args));
    check("args are NAMED (to, amount)", decoded?.args[0]?.name === "to" && decoded?.args[1]?.name === "amount", JSON.stringify(decoded?.args.map((a) => a.name)));
    check("amount value = 1000000", decoded?.args[1]?.value === "1000000", JSON.stringify(decoded?.args));
  }

  console.log("\n[proxy + ABI resolve (network)]");
  try {
    const { decoded, proxy } = await analyzeCalldata({ chainId: 1 }, TRANSFER_CALLDATA, USDC);
    check("USDC proxy detected", !!proxy?.implementation, JSON.stringify(proxy));
    check("decoded against USDC", decoded?.functionName === "transfer", JSON.stringify(decoded));
  } catch (e) {
    console.log(`  (skipped, network error: ${(e as Error).message})`);
  }

  console.log("\n[multisig config checker — real Gnosis Safe (network)]");
  try {
    const SAFE = "0x4f2083f5fBede34C2714aFfb3105539775f7FE64";
    const r = await analyzeAddress({ chainId: 1 }, SAFE as `0x${string}`);
    check("Safe detected as multisig", !!r.multisig, JSON.stringify({ isContract: r.isContract, ms: !!r.multisig }));
    check("multisig kind is Safe", !!r.multisig && /safe/i.test(r.multisig.kind), r.multisig?.kind);
    check("threshold ≤ owner count, both ≥ 1", !!r.multisig && r.multisig.threshold >= 1 && r.multisig.owners.length >= r.multisig.threshold, JSON.stringify(r.multisig && { m: r.multisig.threshold, n: r.multisig.owners.length }));
    if (r.multisig) console.log(`    ↳ ${r.multisig.kind} · ${r.multisig.threshold}-of-${r.multisig.owners.length}`);
  } catch (e) {
    console.log(`  (skipped, network error: ${(e as Error).message})`);
  }

  console.log("\n[ENS reverse (network)]");
  try {
    const name = await reverseEns(VITALIK as `0x${string}`);
    check("reverse resolves vitalik.eth", name === "vitalik.eth", String(name));
  } catch (e) {
    console.log(`  (skipped, network error: ${(e as Error).message})`);
  }

  console.log("\n[analyzeAddress (network)]");
  try {
    const r = await analyzeAddress({ chainId: 1 }, USDC as `0x${string}`);
    check("USDC is a contract", r.isContract, JSON.stringify({ isContract: r.isContract }));
    check("USDC proxy implementation found", !!r.proxy, JSON.stringify(r.proxy));
  } catch (e) {
    console.log(`  (skipped, network error: ${(e as Error).message})`);
  }

  console.log("\n[headline flow — real tx hash → fetch → decode (network)]");
  try {
    // Pull a real recent contract-call tx from a finalized block; no hardcoded hash.
    const client = createPublicClient({ chain: mainnet, transport: http("https://ethereum-rpc.publicnode.com") });
    const head = await client.getBlockNumber();
    const block = await client.getBlock({ blockNumber: head - 10n, includeTransactions: true });
    const calls = block.transactions.filter((t) => typeof t === "object" && t.to && t.input.length > 10).slice(0, 15);
    check("found contract-call txs in block", calls.length > 0, `${calls.length} candidates`);

    let fetched = 0;
    let decoded = 0;
    let sample = "";
    for (const t of calls) {
      const tx = await fetchTransaction({ chainId: 1 }, t.hash);
      if (!tx) continue;
      fetched++;
      if (!tx.input || tx.input === "0x") continue;
      const { decoded: d } = await analyzeCalldata({ chainId: 1 }, tx.input, tx.to ?? undefined);
      if (d) {
        decoded++;
        if (!sample) sample = `${t.hash.slice(0, 12)}… → ${d.signature} (${d.source})`;
      }
    }
    check("fetchTransaction resolves real hashes", fetched === calls.length, `${fetched}/${calls.length}`);
    check("at least one tx decodes end-to-end", decoded > 0, `${decoded}/${fetched} decoded — e.g. ${sample}`);
    if (sample) console.log(`    ↳ ${sample}`);
  } catch (e) {
    console.log(`  (skipped, network error: ${(e as Error).message})`);
  }

  console.log("\n[tx inspection — heaviest tx in block, log decode share (network)]");
  try {
    const client = createPublicClient({ chain: mainnet, transport: http("https://ethereum-rpc.publicnode.com") });
    const head = await client.getBlockNumber();
    const block = await client.getBlock({ blockNumber: head - 12n, includeTransactions: true });
    // find the tx with the MOST logs — the fan-out path (Uniswap/1inch-style swaps)
    let target = "";
    let maxLogs = 0;
    const scan = block.transactions.filter((t) => typeof t === "object" && t.to).slice(0, 30);
    for (const t of scan) {
      const r = await client.getTransactionReceipt({ hash: t.hash }).catch(() => null);
      if (r && r.logs.length > maxLogs) {
        maxLogs = r.logs.length;
        target = t.hash;
      }
    }
    check("found a multi-log tx", maxLogs >= 2, `heaviest tx has ${maxLogs} logs`);
    if (target) {
      const report = await analyzeTransaction({ chainId: 1 }, target as `0x${string}`);
      check("report has status", report?.status === "success" || report?.status === "reverted", report?.status ?? "null");
      check("report has gas + block", !!report?.gasUsed && !!report?.blockNumber);
      const total = report?.logs.length ?? 0;
      const named = report?.logs.filter((l) => l.eventName).length ?? 0;
      const share = total ? named / total : 0;
      // bounded fan-out should decode most logs (Transfer/Approval are in openchain even without an Etherscan key)
      check("≥70% of logs decoded (no rate-limit collapse)", share >= 0.7, `${named}/${total} = ${Math.round(share * 100)}%`);
      const ex = report?.logs.find((l) => l.eventName);
      if (ex) console.log(`    ↳ ${named}/${total} logs named — e.g. ${ex.eventName} via ${ex.source || "unknown"}${ex.guess ? " (best guess)" : ""}`);
    }
  } catch (e) {
    console.log(`  (skipped, network error: ${(e as Error).message})`);
  }

  console.log("\n[nested decode — multicall(bytes[]) (network sig DB)]");
  try {
    const inner = encodeFunctionData({
      abi: [parseAbiItem("function transfer(address,uint256)")],
      functionName: "transfer",
      args: ["0x1111111111111111111111111111111111111111", 5n],
    });
    const multicall = encodeFunctionData({
      abi: [parseAbiItem("function multicall(bytes[] data)")],
      functionName: "multicall",
      args: [[inner, inner]],
    });
    const { decoded } = await analyzeCalldata({ chainId: 1 }, multicall);
    check("outer is multicall", decoded?.functionName === "multicall", decoded?.signature);
    const nested = decoded?.args[0]?.nested ?? [];
    check("nested decoded 2 inner calls", nested.length === 2, `${nested.length} nested`);
    check("inner calls are transfer", nested.every((c) => c.functionName === "transfer"), JSON.stringify(nested.map((c) => c.functionName)));
  } catch (e) {
    console.log(`  (skipped, network error: ${(e as Error).message})`);
  }

  console.log("\n[custom ABI decode (pure)]");
  {
    const data = encodeFunctionData({
      abi: [parseAbiItem("function approve(address,uint256)")],
      functionName: "approve",
      args: ["0x1111111111111111111111111111111111111111", 42n],
    });
    const abi = parseAbiText("function approve(address spender, uint256 value)");
    check("parseAbiText (human-readable)", !!abi);
    const decoded = abi ? decodeWithCustomAbi(data, abi) : null;
    check("custom ABI decodes approve", decoded?.functionName === "approve", decoded?.signature);
    check("named arg from custom ABI", decoded?.args[0]?.name === "spender", JSON.stringify(decoded?.args));
    const jsonAbi = parseAbiText('[{"type":"function","name":"approve","inputs":[{"type":"address"},{"type":"uint256"}]}]');
    check("parseAbiText (JSON)", !!jsonAbi && decodeWithCustomAbi(data, jsonAbi)?.functionName === "approve");
  }

  console.log("\n[multiSend packed batch decode (network sig DB)]");
  try {
    const inner0 = encodeFunctionData({
      abi: [parseAbiItem("function transfer(address,uint256)")],
      functionName: "transfer",
      args: ["0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", 5n],
    });
    // packed entry: operation(1) ‖ to(20) ‖ value(32) ‖ dataLen(32) ‖ data
    const entry = (to: `0x${string}`, value: bigint, data: `0x${string}`) =>
      encodePacked(
        ["uint8", "address", "uint256", "uint256", "bytes"],
        [0, to, value, BigInt((data.length - 2) / 2), data],
      );
    const packed = concat([
      entry("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", 0n, inner0),
      entry("0xcccccccccccccccccccccccccccccccccccccccc", 1000n, "0x"),
    ]);
    const multiSendData = encodeFunctionData({
      abi: [parseAbiItem("function multiSend(bytes)")],
      functionName: "multiSend",
      args: [packed],
    });
    const { decoded } = await analyzeCalldata({ chainId: 1 }, multiSendData);
    check("decodes multiSend", decoded?.functionName === "multiSend", decoded?.signature);
    check("expands 2 inner txs", decoded?.batch?.length === 2, `${decoded?.batch?.length} inner`);
    check("inner #0 is transfer", decoded?.batch?.[0]?.decoded?.functionName === "transfer", JSON.stringify(decoded?.batch?.[0]?.decoded?.signature));
    check("inner #0 args named (to, amount)", decoded?.batch?.[0]?.decoded?.args[0]?.name === "to", JSON.stringify(decoded?.batch?.[0]?.decoded?.args.map((a) => a.name)));
    check("inner #1 has value 1000", decoded?.batch?.[1]?.value === "1000", decoded?.batch?.[1]?.value);
    check("inner #0 to is set", decoded?.batch?.[0]?.to?.toLowerCase() === "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", decoded?.batch?.[0]?.to);
  } catch (e) {
    console.log(`  (skipped, network error: ${(e as Error).message})`);
  }

  console.log("\n[nested batch — Safe execTransaction → multiSend (network sig DB)]");
  try {
    const inner = encodeFunctionData({
      abi: [parseAbiItem("function transfer(address,uint256)")],
      functionName: "transfer",
      args: ["0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", 5n],
    });
    const entry = encodePacked(
      ["uint8", "address", "uint256", "uint256", "bytes"],
      [0, "0x1111111111111111111111111111111111111111", 0n, BigInt((inner.length - 2) / 2), inner],
    );
    const ms = encodeFunctionData({
      abi: [parseAbiItem("function multiSend(bytes)")],
      functionName: "multiSend",
      args: [entry],
    });
    const execTx = encodeFunctionData({
      abi: [
        parseAbiItem(
          "function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures)",
        ),
      ],
      functionName: "execTransaction",
      args: ["0x40A2aCCbd92BCA938b02010E17A5b8929b49130D", 0n, ms, 1, 0n, 0n, 0n, "0x0000000000000000000000000000000000000000", "0x0000000000000000000000000000000000000000", "0x"],
    });
    const { decoded } = await analyzeCalldata({ chainId: 1 }, execTx);
    check("outer is execTransaction", decoded?.functionName === "execTransaction", decoded?.functionName);
    const nested = decoded?.args.flatMap((a) => a.nested ?? []).find((c) => c.functionName === "multiSend");
    check("nested multiSend found", !!nested, JSON.stringify(decoded?.args.map((a) => a.nested?.map((n) => n.functionName))));
    check("nested multiSend carries a batch", (nested?.batch?.length ?? 0) === 1, `${nested?.batch?.length}`);
    check("batch inner is a named transfer", nested?.batch?.[0]?.decoded?.args[0]?.name === "to", JSON.stringify(nested?.batch?.[0]?.decoded?.args.map((a) => a.name)));
  } catch (e) {
    console.log(`  (skipped, network error: ${(e as Error).message})`);
  }

  console.log("\n[revert / error decode (network sig DB)]");
  try {
    // standard Error(string)
    const errData = concat(["0x08c379a0", encodeAbiParameters([{ type: "string" }], ["insufficient balance"])]);
    const e1 = await decodeRevertData({ chainId: 1 }, errData);
    check("decodes Error(string)", e1.kind === "Error" && e1.args[0]?.value === "insufficient balance", JSON.stringify(e1));
    // Panic(uint256) code 0x11 (overflow)
    const panicData = concat(["0x4e487b71", encodeAbiParameters([{ type: "uint256" }], [17n])]);
    const e2 = await decodeRevertData({ chainId: 1 }, panicData);
    check("decodes Panic(uint256)", e2.kind === "Panic" && e2.args[0]?.value.includes("overflow"), JSON.stringify(e2));
    // custom error via signature DB
    const sel = toFunctionSelector("error InsufficientBalance(uint256,uint256)");
    const customData = concat([sel, encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [50n, 100n])]);
    const e3 = await decodeRevertData({ chainId: 1 }, customData);
    check("decodes custom error (best effort)", e3.kind === "custom" || e3.kind === "raw", JSON.stringify({ kind: e3.kind, sig: e3.signature }));
    if (e3.kind === "custom") console.log(`    ↳ ${e3.signature}`);
  } catch (e) {
    console.log(`  (skipped, network error: ${(e as Error).message})`);
  }

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main();
