// Synchronous input classifier — routes a pasted string to the right decoder.
import { isAddress, isHex, size } from "viem";
import bs58 from "bs58";

export type DetectedKind =
  | "address"
  | "ensName"
  | "txHash"
  | "calldata"
  | "number"
  | "hex"
  | "solanaSig"
  | "solanaAddress"
  | "unknown"
  | "empty";

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,90}$/;

export type Detection = {
  kind: DetectedKind;
  value: string;
};

// Pure, synchronous router. The decode command enriches ambiguous kinds at
// runtime (e.g. a 32-byte hex is tried as a tx hash, then falls back to bytes32).
export function detect(raw: string): Detection {
  const value = raw.trim();
  if (!value) return { kind: "empty", value };

  if (isAddress(value, { strict: false })) return { kind: "address", value };

  if (/^[a-z0-9-]+(\.[a-z0-9-]+)*\.eth$/i.test(value)) return { kind: "ensName", value };

  if (isHex(value)) {
    const bytes = size(value);
    if (bytes === 32) return { kind: "txHash", value }; // ambiguous: tx hash or bytes32
    if (bytes >= 4) return { kind: "calldata", value }; // selector (4) + ABI-encoded args
    return { kind: "hex", value }; // short hex → treat as a number
  }

  if (/^\d+(\.\d+)?$/.test(value)) return { kind: "number", value };

  // Solana: validate by decoded byte length, not just the alphabet (64 = signature, 32 = pubkey).
  if (BASE58.test(value)) {
    try {
      const len = bs58.decode(value).length;
      if (len === 64) return { kind: "solanaSig", value };
      if (len === 32) return { kind: "solanaAddress", value };
    } catch {
      // not valid base58
    }
  }

  return { kind: "unknown", value };
}
