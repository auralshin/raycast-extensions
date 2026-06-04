// Token registry: fetches reputable verified token lists (Uniswap EVM, Jupiter Solana) for search.
import { getAddress } from "viem";
import { getChain } from "./chains";

export type Token = {
  chain: string;
  chainId?: number; // EVM only
  symbol: string;
  name: string;
  address: string; // EVM address or Solana mint
  decimals: number;
  logoURI?: string;
  verified: boolean;
  priceUsd?: number;
  audit?: string; // Solana: mint/freeze authority status
};

const UNISWAP_LIST = "https://tokens.uniswap.org";
const JUPITER_SEARCH = "https://datapi.jup.ag/v1/assets/search";

type UniToken = { chainId: number; address: string; name: string; symbol: string; decimals: number; logoURI?: string };
type JupAsset = {
  id: string;
  name: string;
  symbol: string;
  icon?: string;
  decimals: number;
  isVerified?: boolean;
  usdPrice?: number;
  audit?: { mintAuthorityDisabled?: boolean; freezeAuthorityDisabled?: boolean };
};

function auditSummary(a?: JupAsset["audit"]): string | undefined {
  if (!a) return undefined;
  return `mint authority ${a.mintAuthorityDisabled ? "revoked ✓" : "active ⚠"} · freeze ${a.freezeAuthorityDisabled ? "revoked ✓" : "active ⚠"}`;
}

// EVM tokens from the Uniswap default list (curated → "verified"). Fetch once, cache, filter locally.
export async function fetchEvmTokens(): Promise<Token[]> {
  const res = await fetch(UNISWAP_LIST);
  if (!res.ok) return [];
  const json = (await res.json()) as { tokens: UniToken[] };
  return json.tokens.map((t) => ({
    chain: getChain(t.chainId).name,
    chainId: t.chainId,
    symbol: t.symbol,
    name: t.name,
    address: safeChecksum(t.address),
    decimals: t.decimals,
    logoURI: t.logoURI,
    verified: true,
  }));
}

function safeChecksum(addr: string): string {
  try {
    return getAddress(addr.toLowerCase()); // re-checksum (the list ships non-canonical casing)
  } catch {
    return addr;
  }
}

// Solana tokens via Jupiter's live search API (returns verification + audit info).
export async function searchSolanaTokens(query: string): Promise<Token[]> {
  if (query.trim().length < 1) return [];
  try {
    const res = await fetch(`${JUPITER_SEARCH}?query=${encodeURIComponent(query.trim())}`);
    if (!res.ok) return [];
    const arr = (await res.json()) as JupAsset[];
    return arr.map((a) => ({
      chain: "Solana",
      symbol: a.symbol,
      name: a.name,
      address: a.id,
      decimals: a.decimals,
      logoURI: a.icon,
      verified: !!a.isVerified,
      priceUsd: a.usdPrice,
      audit: auditSummary(a.audit),
    }));
  } catch {
    return [];
  }
}

export function filterEvmTokens(tokens: Token[], query: string, chainId?: number): Token[] {
  const q = query.trim().toLowerCase();
  const scoped = chainId ? tokens.filter((t) => t.chainId === chainId) : tokens;
  if (!q) return scoped.slice(0, 100);
  const matches = scoped.filter(
    (t) => t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q) || t.address.toLowerCase() === q,
  );
  // exact symbol matches first
  matches.sort((a, b) => Number(b.symbol.toLowerCase() === q) - Number(a.symbol.toLowerCase() === q));
  return matches.slice(0, 100);
}
