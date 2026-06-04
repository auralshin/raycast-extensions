# ChainScope

Decode Ethereum and Solana transactions without leaving Raycast. Copy a tx hash, some calldata, an address, or a Solana signature, open Decode, and it works out what you pasted and shows what it does. No pasting ABIs by hand, no `cast`, no jumping to a block explorer.

## Commands

### Decode

Reads the clipboard when it opens and figures out the input type.

- Transaction hash: fetches the tx, decodes the function call and every event log, and shows status, gas, block, and timestamp. Follows EIP-1967 proxies to the implementation.
- Calldata (raw hex): same decoding, without the tx lookup.
- Address: checksums it, does an ENS reverse lookup, says whether it's a contract or an EOA, and resolves the proxy implementation. If it's a Gnosis Safe (or Safe-compatible) multisig, it also shows the m-of-n threshold and the full list of signers.
- ENS name: resolves it to an address.
- Number or short hex: shows unit conversions inline.

You can also type into the search bar to decode something else.

A few more things it handles:

- Nested calls. `multicall(bytes[])`, Safe `execTransaction`, and aggregator routers are expanded so you see the inner calls instead of one long bytes value.
- Safe `multiSend`. The packed batch is unpacked into a table with the operation, target, value, and decoded call for each entry.
- Revert reasons. For a reverted tx it replays the call and decodes `Error(string)`, `Panic(uint256)`, or a custom error. This is best-effort, since public nodes aren't archive nodes and can't always reproduce the failure.
- Detail panel (`⌘D`) with the full typed breakdown.
- Export. Copy as JSON (`⌘⇧J`), or save CSV/JSON to your Downloads folder (`⌘⇧C` / `⌘⇧S`).
- Custom ABI (`⌘⇧A`) for contracts that aren't verified anywhere. Paste a JSON ABI or human-readable signatures.
- Clipboard history (`⌘P`) when the most recent clip isn't decodable.

Chains: any chain `viem` knows about (around 300, including zkSync, Scroll, Zora, Linea, and the testnets). The RPC and explorer are picked automatically. For anything else, set a Custom Chain ID and give it an RPC.

Solana: paste a signature or an account address (base58) and Decode switches to the Solana path. It shows status, fee, the SOL and SPL token transfers (from, to, amount), the programs that ran, and the logs, with a Solscan link. Instructions are decoded against the program's on-chain Anchor IDL when one exists (a Jupiter `route`, for example), and fall back to the program id and account list otherwise. Set the cluster and RPC in preferences; the RPC field also works for SVM rollups like Eclipse.

ABI lookup order is Etherscan V2 (if you've set an API key), then Sourcify, then the openchain.xyz signature database. Signature-database matches are marked "best guess", since 4-byte selectors collide; the alternatives are listed.

### Convert Units

wei, gwei, ether, hex/decimal, and bytes32 padding, updated as you type.

### Hash & Selector

keccak256 of a string, plus the 4-byte function selector and 32-byte event topic for a signature like `transfer(address,uint256)`.

### Search Explorer

Detects an address, tx hash, or block number and opens it on Etherscan, Basescan, Arbiscan, and the rest.

### Search Tokens

Find tokens by symbol, name, or address, filtered by chain. EVM tokens come from the Uniswap list, Solana tokens from Jupiter's verified search. Each result shows the address or mint, decimals, a verified badge, price, and (for Solana) the mint and freeze-authority status. `⌘D` opens the detail panel.

### Search Chains

Search every supported chain by name or id. Copy the chain id or RPC URL, or open the explorer. Custom chains you've added show up here too.

## Preferences

To set these, highlight any ChainScope command in Raycast and press `⌘K` → Configure Extension, or open Settings (`⌘,`) → Extensions → ChainScope. They're all optional, so the commands work without any setup. If your RPC provider puts an API key in the URL (Alchemy, Infura, and so on), paste the whole URL into the relevant RPC field.

- Etherscan API Key (optional). A V2 key works across chains and gives the most accurate decoding. Without one, decoding falls back to Sourcify and the signature database.
- Default Chain / Custom Chain ID. Pick a common chain, or type any EVM chain id.
- Custom Chains / RPCs (optional JSON). Add a chain that isn't bundled, or override the RPC and explorer for one that is: `[{"id":1,"rpc":"https://my-node"},{"id":7777777,"name":"Zora","rpc":"https://rpc.zora.energy","explorer":"https://explorer.zora.energy"}]`
- RPC URL Override (optional). Point the selected chain at your own node.
- Solana Cluster / RPC (optional). Cluster and endpoint for Solana decoding.

## Development

```bash
npm install
npm run dev       # load into Raycast in development mode
npm run build     # validate the manifest, typecheck, and bundle
npm run lint      # eslint, prettier, and manifest/icon checks
npm test          # EVM engine checks against live RPCs
npm run test:svm  # Solana engine checks
```

The decode engines (`src/lib/evm.ts`, `src/lib/svm.ts`) don't import `@raycast/api`, so the `scripts/` smoke suites can run them directly against live mainnet. Solana support is written without `@solana/web3.js` or `@coral-xyz/anchor` (raw JSON-RPC, `@noble/curves`, and node builtins) to keep the bundle small, so please don't pull those back in. The commands themselves live in the `src/*.tsx` files.

## Privacy

Decoding talks to a few third-party services: the RPC you've configured, Etherscan (only if you set a key), Sourcify, and openchain.xyz. The addresses, hashes, and calldata you decode are sent to them. ENS reverse lookups always use Ethereum mainnet.
