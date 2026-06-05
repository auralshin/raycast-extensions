// Typed preferences and small config accessors (chain, RPC, explorer, Solana).
import { getPreferenceValues } from "@raycast/api";
import { getChain, registerCustomChains, type CustomChainInput } from "./chains";
import type { DecodeConfig } from "./evm";

// `Preferences` is auto-generated in raycast-env.d.ts from package.json.

function parseCustomChains(raw?: string): CustomChainInput[] {
  if (!raw?.trim()) return [];
  try {
    const json = JSON.parse(raw);
    const arr = Array.isArray(json) ? json : [json];
    return arr.filter((e) => e && Number.isInteger(e.id));
  } catch {
    return [];
  }
}

// Load user chain/RPC overrides into the registry. Call once per command launch.
export function loadRegistry(): void {
  registerCustomChains(parseCustomChains(getPreferenceValues<Preferences>().customChains));
}

export function getConfig(): DecodeConfig {
  loadRegistry();
  const prefs = getPreferenceValues<Preferences>();
  const custom = Number(prefs.customChainId?.trim());
  const chainId = Number.isInteger(custom) && custom > 0 ? custom : Number(prefs.defaultChain || "1");
  return {
    chainId,
    rpcUrl: prefs.rpcUrl?.trim() || undefined,
    etherscanApiKey: prefs.etherscanApiKey?.trim() || undefined,
  };
}

export function explorerUrl(chainId: number, path: string): string {
  return `${getChain(chainId).explorer}/${path}`;
}

export function nativeSymbol(chainId: number): string {
  return getChain(chainId).chain.nativeCurrency.symbol;
}

export function chainName(chainId: number): string {
  return getChain(chainId).name;
}

export function getSolanaConfig(): { rpc: string; cluster: string } {
  const prefs = getPreferenceValues<Preferences>();
  return {
    rpc: prefs.solanaRpc?.trim() || "https://solana-rpc.publicnode.com",
    cluster: prefs.solanaCluster || "mainnet-beta",
  };
}

export function solscanUrl(cluster: string, path: string): string {
  const q = cluster && cluster !== "mainnet-beta" ? `?cluster=${cluster}` : "";
  return `https://solscan.io/${path}${q}`;
}
