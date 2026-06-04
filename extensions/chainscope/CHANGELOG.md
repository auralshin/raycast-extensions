# ChainScope Changelog

## [Initial Version] - {PR_MERGE_DATE}

- Added Decode: reads the clipboard and decodes EVM tx hashes, calldata, addresses, ENS names, and Solana signatures and accounts.
- Added EVM transaction inspection with status, gas, event-log decoding, and EIP-1967 proxy resolution. ABIs come from Etherscan V2, then Sourcify, then the openchain.xyz signature database.
- Added nested-call and Safe `multiSend` expansion, best-effort revert reasons, and Gnosis Safe multisig detection (m-of-n threshold and signers).
- Added Solana decoding: parsed transactions, SOL and SPL transfers, programs, logs, and Anchor IDL instruction decoding.
- Added support for any chain viem knows, plus custom chains and per-chain RPC overrides.
- Added JSON and CSV export of decoded results.
- Added the Search Tokens, Search Chains, Convert Units, and Hash & Selector commands.
