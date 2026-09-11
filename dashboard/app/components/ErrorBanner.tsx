"use client";

// Shows API errors. If it looks like the token isn't set, show setup steps.
export function ErrorBanner({ message }: { message: string }) {
  const needsSetup = /NOTION_TOKEN|unauthorized|API token|restricted|Could not find/i.test(message);
  return (
    <div className="error">
      <strong>Couldn't reach Notion.</strong>
      <div style={{ marginTop: 6 }}>{message}</div>
      {needsSetup && (
        <ol className="setup" style={{ marginTop: 12, marginBottom: 0 }}>
          <li>
            Create an integration at{" "}
            <a className="link" href="https://www.notion.so/my-integrations" target="_blank" rel="noreferrer">
              notion.so/my-integrations
            </a>{" "}
            and copy its secret.
          </li>
          <li>
            Put it in <code>dashboard/.env.local</code> as <code>NOTION_TOKEN=...</code> (copy from{" "}
            <code>.env.local.example</code>).
          </li>
          <li>
            In Notion, open each of the 3 databases → <code>•••</code> → <strong>Connections</strong> → add your
            integration.
          </li>
          <li>Restart the dev server (stop it and run <code>npm run dev</code> again).</li>
        </ol>
      )}
    </div>
  );
}
