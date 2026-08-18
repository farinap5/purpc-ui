import { FormEvent, useState } from "react";
import { ConnectionSettings } from "../types";

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
    <main className="min-h-screen bg-[#151618] text-white flex items-center justify-center p-4 font-sans">
      <section className="w-full max-w-md overflow-hidden rounded border border-[#393b40] bg-[#242528] shadow-2xl">
        <header className="border-b border-[#393b40] bg-[#1c1d1f] px-5 py-4">
          <h1 className="text-base font-semibold tracking-wide">PurpleCommand</h1>
          <p className="mt-1 text-xs text-gray-400">Connect to your server</p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div>
            <label htmlFor="auth-username" className="mb-1.5 block text-xs text-gray-300">Username</label>
            <input
              id="auth-username"
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder={DEFAULT_USERNAME}
              autoComplete="username"
              autoFocus
              className="w-full rounded border border-[#474a50] bg-[#18191b] px-3 py-2 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-violet-400"
            />
          </div>

          <div>
            <label htmlFor="auth-token" className="mb-1.5 block text-xs text-gray-300">Token</label>
            <input
              id="auth-token"
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder={TOKEN_EXAMPLE}
              autoComplete="off"
              required
              className="w-full rounded border border-[#474a50] bg-[#18191b] px-3 py-2 font-mono text-xs text-white outline-none transition placeholder:text-gray-700 focus:border-violet-400"
            />
          </div>

          <div>
            <label htmlFor="auth-server" className="mb-1.5 block text-xs text-gray-300">Server Address</label>
            <input
              id="auth-server"
              type="url"
              value={serverAddress}
              onChange={(event) => setServerAddress(event.target.value)}
              placeholder={DEFAULT_SERVER_ADDRESS}
              className="w-full rounded border border-[#474a50] bg-[#18191b] px-3 py-2 font-mono text-xs text-white outline-none transition placeholder:text-gray-600 focus:border-violet-400"
            />
          </div>

          {error && (
            <p role="alert" className="rounded border border-red-900/80 bg-red-950/40 px-3 py-2 text-xs text-red-300">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isConnecting}
            className="w-full cursor-pointer rounded bg-[#385d8a] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#486d9a] focus:outline-none focus:ring-2 focus:ring-violet-400 disabled:cursor-wait disabled:opacity-60"
          >
            {isConnecting ? "Connecting…" : "Connect"}
          </button>

          <p className="text-center text-[10px] text-gray-500">
            Credentials remain in memory for this browser session only.
          </p>
        </form>
      </section>
    </main>
  );
}
