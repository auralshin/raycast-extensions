// Search Chains command — searchable registry of every supported chain + user custom chains.
import { Action, ActionPanel, Color, Icon, List } from "@raycast/api";
import { useMemo } from "react";
import { listChains } from "./lib/chains";
import { loadRegistry } from "./lib/prefs";

export default function Command() {
  loadRegistry(); // include user custom chains
  const chains = useMemo(() => listChains(), []);

  return (
    <List searchBarPlaceholder="Search chains by name or chain id">
      <List.Section title={`Chains (${chains.length})`}>
        {chains.map((c) => {
          const symbol = c.chain.nativeCurrency.symbol;
          return (
            <List.Item
              key={c.id}
              icon={c.custom ? { source: Icon.Pencil, tintColor: Color.Purple } : Icon.Link}
              title={c.name}
              subtitle={`Chain ID ${c.id}`}
              keywords={[String(c.id), symbol, c.name]}
              accessories={[...(c.custom ? [{ tag: { value: "custom", color: Color.Purple } }] : []), { text: symbol }]}
              actions={
                <ActionPanel>
                  <Action.CopyToClipboard title="Copy Chain ID" content={String(c.id)} />
                  {c.defaultRpc ? (
                    <Action.CopyToClipboard
                      title="Copy RPC URL"
                      content={c.defaultRpc}
                      shortcut={{ modifiers: ["cmd"], key: "r" }}
                    />
                  ) : null}
                  {c.explorer ? <Action.OpenInBrowser title="Open Explorer" url={c.explorer} /> : null}
                  {c.explorer ? <Action.CopyToClipboard title="Copy Explorer URL" content={c.explorer} /> : null}
                </ActionPanel>
              }
            />
          );
        })}
      </List.Section>
    </List>
  );
}
