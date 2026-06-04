// "Decode this →" hint shown in the utility commands when the input belongs in Decode.
import { Action, ActionPanel, Color, Icon, LaunchType, List, launchCommand } from "@raycast/api";
import type { DetectedKind } from "./lib/detect";

const LABELS: Partial<Record<DetectedKind, string>> = {
  txHash: "transaction hash",
  address: "address",
  calldata: "calldata",
  ensName: "ENS name",
  solanaSig: "Solana signature",
  solanaAddress: "Solana address",
};

export function isDecodable(kind: DetectedKind): boolean {
  return LABELS[kind] !== undefined;
}

// Shown at the top of the utility commands when the input is really something
// the Decode command should handle — one keystroke hands it off (with the input).
export function DecodeHint({ text, kind }: { text: string; kind: DetectedKind }) {
  return (
    <List.Item
      icon={{ source: Icon.Wand, tintColor: Color.Blue }}
      title={`Decode this ${LABELS[kind] ?? "value"}`}
      subtitle="this looks like a job for the Decode command"
      accessories={[{ tag: { value: "↩ Decode", color: Color.Blue } }]}
      actions={
        <ActionPanel>
          <Action
            title="Decode"
            icon={Icon.Wand}
            onAction={() => launchCommand({ name: "decode", type: LaunchType.UserInitiated, context: { text } })}
          />
        </ActionPanel>
      }
    />
  );
}
