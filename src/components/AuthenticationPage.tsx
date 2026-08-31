import { FormEvent, useState } from "react";
import { ConnectionSettings } from "../types";
import {
  CompactButton,
  CompactFormGrid,
  CompactFormRow,
  CompactInput,
  DesktopWindow,
  WindowTitleBar
} from "./desktop";

interface AuthenticationPageProps {
  initialSettings: ConnectionSettings;
  onConnect: (settings: ConnectionSettings) => Promise<void>;
}

const DEFAULT_USERNAME = "gnome";
const TOKEN_EXAMPLE = "WazdOO4JweiJsf00LV4YebQcXDEKEcMeLmjG9N0klGg";
const DEFAULT_SERVER_ADDRESS = "http://127.0.0.1:8080";

export function AuthenticationPage({ initialSettings, onConnect }: AuthenticationPageProps) {
  const [username, setUsername] = useState("");
  const [token, setToken] = useState(initialSettings.token);
  const [serverAddress, setServerAddress] = useState("");
  const [error, setError] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextUsername = username.trim() || DEFAULT_USERNAME;
    const nextToken = token.trim();
    const nextServerAddress = serverAddress.trim() || DEFAULT_SERVER_ADDRESS;

    if (!nextToken) {
      setError("Enter an authentication token.");
      return;
    }

    try {
      const parsedAddress = new URL(nextServerAddress);
      if (parsedAddress.protocol !== "http:" && parsedAddress.protocol !== "https:") {
        throw new Error("Unsupported protocol");
      }
    } catch {
      setError("Enter a valid HTTP or HTTPS server address.");
      return;
    }

    setError("");
    setIsConnecting(true);
    try {
      await onConnect({
        username: nextUsername,
        token: nextToken,
        serverAddress: nextServerAddress.replace(/\/$/, "")
      });
    } catch (connectionError) {
      setError(connectionError instanceof Error ? connectionError.message : "Could not connect to the teamserver.");
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <main className="desktop-app authentication-shell">
      <DesktopWindow className="authentication-window">
        <WindowTitleBar title="PurpleCommand" subtitle="TeamServer connection" />

        <form onSubmit={handleSubmit} className="authentication-form">
          <CompactFormGrid>
            <CompactFormRow label="Username" htmlFor="auth-username">
              <CompactInput
              id="auth-username"
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder={DEFAULT_USERNAME}
              autoComplete="username"
              autoFocus
              />
            </CompactFormRow>

            <CompactFormRow label="Token" htmlFor="auth-token" required>
              <CompactInput
              id="auth-token"
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder={TOKEN_EXAMPLE}
              autoComplete="off"
              required
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "authentication-error" : undefined}
              />
            </CompactFormRow>

            <CompactFormRow label="Server Address" htmlFor="auth-server">
              <CompactInput
              id="auth-server"
              type="url"
              value={serverAddress}
              onChange={(event) => setServerAddress(event.target.value)}
              placeholder={DEFAULT_SERVER_ADDRESS}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "authentication-error" : undefined}
              />
            </CompactFormRow>
          </CompactFormGrid>

          {error && (
            <p id="authentication-error" role="alert" className="desktop-alert desktop-alert--error">
              {error}
            </p>
          )}

          <div className="authentication-actions">
            <CompactButton
            type="submit"
            disabled={isConnecting}
            variant="primary"
            className="authentication-submit"
            >
              {isConnecting ? "Connecting…" : "Connect"}
            </CompactButton>
          </div>
        </form>
      </DesktopWindow>
    </main>
  );
}
