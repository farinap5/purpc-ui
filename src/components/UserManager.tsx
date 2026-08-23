import React, { useEffect, useState } from "react";
import { TeamUser, TeamUserCredentials } from "../api/teamApi";

interface UserManagerProps {
  users: TeamUser[];
  isConnected: boolean;
  onListUsers: () => Promise<TeamUser[]>;
  onCreateUser: (name: string) => Promise<TeamUserCredentials>;
  onRefreshUserToken: (name: string) => Promise<TeamUserCredentials>;
  onDeleteUser: (name: string) => Promise<TeamUser>;
}

interface IssuedCredential extends TeamUserCredentials {
  action: "created" | "refreshed";
}

const formatTimestamp = (value?: string) => {
  if (!value) return "Never";
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime()) || timestamp.getUTCFullYear() <= 1) return "Never";
  return timestamp.toLocaleString();
};

const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

export const UserManager: React.FC<UserManagerProps> = ({
  users,
  isConnected,
  onListUsers,
  onCreateUser,
  onRefreshUserToken,
  onDeleteUser
}) => {
  const [username, setUsername] = useState("");
  const [actionError, setActionError] = useState("");
  const [pendingAction, setPendingAction] = useState("");
  const [issuedCredential, setIssuedCredential] = useState<IssuedCredential | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (!isConnected) {
      setPendingAction("");
      return;
    }
    let cancelled = false;
    setActionError("");
    setPendingAction("list");
    void onListUsers()
      .catch(error => {
        if (!cancelled) setActionError(errorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setPendingAction("");
      });
    return () => {
      cancelled = true;
    };
  }, [isConnected]);

  useEffect(() => {
    if (issuedCredential && !users.some(user => user.uuid === issuedCredential.user.uuid)) {
      setIssuedCredential(null);
      setCopyState("idle");
    }
  }, [users, issuedCredential?.user.uuid]);

  const refreshUsers = async () => {
    setActionError("");
    setPendingAction("list");
    try {
      await onListUsers();
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setPendingAction("");
    }
  };

  const handleCreateUser = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = username.trim();
    if (!name) {
      setActionError("Enter a username.");
      return;
    }
    if (users.some(user => user.name.toLowerCase() === name.toLowerCase())) {
      setActionError("A user with this name already exists.");
      return;
    }

    setActionError("");
    setPendingAction("create");
    try {
      const credentials = await onCreateUser(name);
      setIssuedCredential({ ...credentials, action: "created" });
      setUsername("");
      setCopyState("idle");
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setPendingAction("");
    }
  };

  const handleRefreshToken = async (user: TeamUser) => {
    setActionError("");
    setPendingAction(`refresh:${user.uuid}`);
    try {
      const credentials = await onRefreshUserToken(user.name);
      setIssuedCredential({ ...credentials, action: "refreshed" });
      setCopyState("idle");
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setPendingAction("");
    }
  };

  const handleDeleteUser = async (user: TeamUser) => {
    setActionError("");
    setPendingAction(`delete:${user.uuid}`);
    try {
      await onDeleteUser(user.name);
      if (issuedCredential?.user.uuid === user.uuid) setIssuedCredential(null);
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setPendingAction("");
    }
  };

  const handleCopyToken = async () => {
    if (!issuedCredential) return;
    try {
      await navigator.clipboard.writeText(issuedCredential.token);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  const dismissCredential = () => {
    setIssuedCredential(null);
    setCopyState("idle");
  };

  const isBusy = Boolean(pendingAction);
  const connectedUsers = users.filter(user => user.connected).length;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto bg-[#1e1e1e] p-3 font-sans text-gray-300">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3 border-b border-[#333] pb-3">
        <div>
          <h2 className="text-sm font-bold text-gray-100">TeamServer Users</h2>
          <p className="mt-1 text-[10px] text-gray-500">
            Connected means the user has one or more active WebSocket connections.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded border border-[#414141] bg-[#292929] px-2 py-1 text-[10px] text-gray-400">
            {users.length} {users.length === 1 ? "user" : "users"} · {connectedUsers} connected
          </span>
          <button
            type="button"
            disabled={!isConnected || isBusy}
            onClick={() => void refreshUsers()}
            className="rounded border border-[#444] bg-[#292929] px-2 py-1 text-[10px] text-gray-200 transition hover:border-violet-500 hover:bg-[#333] focus:border-violet-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pendingAction === "list" ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="mb-3 rounded border border-violet-900/70 bg-violet-950/20 p-2 text-[10px] text-violet-200/80">
        User tokens can authenticate WebSocket and HTTP endpoints. Creating, refreshing, or deleting users requires the startup admin token.
      </div>

      {issuedCredential && (
        <section className="mb-3 rounded border border-violet-700/70 bg-violet-950/25 p-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-xs font-bold text-violet-100">
                Token {issuedCredential.action} for {issuedCredential.user.name}
              </h3>
              <p className="mt-1 text-[10px] text-violet-300/75">
                Copy this token now. It will not be returned by user listings or events.
                {issuedCredential.action === "refreshed" && " The previous token and its active WebSocket connections were revoked immediately."}
              </p>
            </div>
            <button
              type="button"
              onClick={dismissCredential}
              className="rounded px-1.5 py-0.5 text-[10px] text-gray-500 hover:bg-[#333] hover:text-gray-200 focus:outline-none focus:ring-1 focus:ring-violet-500"
            >
              Dismiss
            </button>
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              aria-label={`Authentication token for ${issuedCredential.user.name}`}
              readOnly
              value={issuedCredential.token}
              onFocus={event => event.currentTarget.select()}
              className="min-w-0 flex-1 select-text rounded border border-[#555] bg-[#111] px-3 py-2 font-mono text-xs text-gray-100 outline-none focus:border-violet-400"
            />
            <button
              type="button"
              onClick={() => void handleCopyToken()}
              className="rounded border border-violet-700 bg-violet-900/40 px-3 py-2 text-xs font-bold text-violet-100 transition hover:bg-violet-800/50 focus:outline-none focus:ring-1 focus:ring-violet-400"
            >
              {copyState === "copied" ? "Copied" : "Copy token"}
            </button>
          </div>
          {copyState === "failed" && (
            <p className="mt-2 text-[10px] text-red-300">Clipboard access failed. Select and copy the token manually.</p>
          )}
        </section>
      )}

      {actionError && (
        <p className="mb-3 rounded border border-red-900/70 bg-red-950/30 p-2 text-[10px] text-red-300">{actionError}</p>
      )}

      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="min-h-48 overflow-auto rounded border border-[#333] bg-[#222]">
          <table className="w-full min-w-[1050px] text-left text-xs">
            <thead className="sticky top-0 z-10 border-b border-[#3a3a3a] bg-[#292a2d] text-[10px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2">Username</th>
                <th className="px-3 py-2">UUID</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Connection</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2">Last seen</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#303030]">
              {users.map(user => (
                <tr key={user.uuid} className="hover:bg-[#292929]">
                  <td className="px-3 py-2 font-mono font-bold text-gray-100">{user.name}</td>
                  <td className="select-all px-3 py-2 font-mono text-[10px] text-gray-500">{user.uuid}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded border px-1.5 py-0.5 text-[9px] uppercase ${
                      user.admin
                        ? "border-violet-700/70 bg-violet-950/30 text-violet-200"
                        : "border-[#444] bg-[#292929] text-gray-400"
                    }`}>
                      {user.admin ? "Admin" : "User"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={user.connected ? "text-emerald-300" : "text-gray-500"}>
                      <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${user.connected ? "bg-emerald-400" : "bg-gray-600"}`} />
                      {user.connected ? "Connected" : "Offline"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-500">{formatTimestamp(user.created)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-500">{formatTimestamp(user.last_seen)}</td>
                  <td className="px-3 py-2 text-right">
                    {user.admin ? (
                      <span className="text-[10px] text-gray-600">Startup credential protected</span>
                    ) : (
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          disabled={!isConnected || isBusy}
                          onClick={() => void handleRefreshToken(user)}
                          title="Generate a new token and revoke this user's active connections"
                          className="rounded border border-violet-800/70 bg-violet-950/30 px-2 py-1 text-[10px] text-violet-200 transition hover:border-violet-500 hover:bg-violet-950/60 focus:border-violet-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {pendingAction === `refresh:${user.uuid}` ? "Refreshing…" : "Refresh token"}
                        </button>
                        <button
                          type="button"
                          disabled={!isConnected || isBusy}
                          onClick={() => void handleDeleteUser(user)}
                          title="Delete this user and revoke all active connections"
                          className="rounded border border-red-900/70 bg-red-950/30 px-2 py-1 text-[10px] text-red-300 transition hover:border-red-600 hover:bg-red-950/60 focus:border-violet-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {pendingAction === `delete:${user.uuid}` ? "Deleting…" : "Delete"}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-gray-600">
                    {isConnected ? "No users returned by the TeamServer." : "Connect to the TeamServer to list users."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="self-start rounded border border-[#333] bg-[#222] p-3">
          <h3 className="border-b border-[#333] pb-2 text-xs font-bold text-gray-100">Add new user</h3>
          <form onSubmit={handleCreateUser} className="mt-3">
            <label htmlFor="new-teamserver-username" className="mb-1 block text-[11px] text-gray-300">Username</label>
            <input
              id="new-teamserver-username"
              type="text"
              maxLength={64}
              autoComplete="off"
              value={username}
              onChange={event => {
                setUsername(event.target.value);
                setActionError("");
              }}
              placeholder="operator name"
              className="w-full rounded border border-[#444] bg-[#151515] px-3 py-2 text-xs text-white outline-none transition placeholder:text-gray-700 focus:border-violet-400"
            />
            <p className="mt-1 text-[10px] text-gray-600">
              The TeamServer securely generates the token. The token is displayed only after creation.
            </p>
            <button
              type="submit"
              disabled={!isConnected || isBusy || !username.trim()}
              className="mt-3 w-full rounded bg-violet-700 px-3 py-2 text-xs font-bold text-white transition hover:bg-violet-600 focus:outline-none focus:ring-1 focus:ring-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pendingAction === "create" ? "Creating…" : "Create user"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
};
