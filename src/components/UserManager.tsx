import React, { useEffect, useState } from "react";
import { TeamUser, TeamUserCredentials } from "../api/teamApi";
import {
  CompactButton,
  CompactFormGrid,
  CompactFormRow,
  CompactInput,
  CompactScrollbar,
  DataGrid,
  DesktopPanel,
  PanelHeader,
  StatusBar
} from "./desktop";

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
    <DesktopPanel className="user-manager">
      <PanelHeader actions={
        <>
          <span className="panel-counter">
            {users.length} {users.length === 1 ? "user" : "users"} · {connectedUsers} connected
          </span>
          <CompactButton
            type="button"
            disabled={!isConnected || isBusy}
            onClick={() => void refreshUsers()}
          >
            {pendingAction === "list" ? "Refreshing…" : "Refresh"}
          </CompactButton>
        </>
      }>TeamServer Users</PanelHeader>

      <div className="desktop-alert desktop-alert--accent user-manager-notice">
        User tokens can authenticate WebSocket and HTTP endpoints. Creating, refreshing, or deleting users requires the startup admin token.
      </div>

      {issuedCredential && (
        <section className="issued-credential-panel">
          <div className="issued-credential-header">
            <div>
              <strong>
                Token {issuedCredential.action} for {issuedCredential.user.name}
              </strong>
              <p>
                Copy this token now. It will not be returned by user listings or events.
                {issuedCredential.action === "refreshed" && " The previous token and its active WebSocket connections were revoked immediately."}
              </p>
            </div>
            <CompactButton
              type="button"
              onClick={dismissCredential}
              variant="ghost"
            >
              Dismiss
            </CompactButton>
          </div>
          <div className="issued-token-row">
            <CompactInput
              aria-label={`Authentication token for ${issuedCredential.user.name}`}
              readOnly
              value={issuedCredential.token}
              onFocus={event => event.currentTarget.select()}
              className="select-text"
            />
            <CompactButton
              type="button"
              onClick={() => void handleCopyToken()}
              variant="secondary"
            >
              {copyState === "copied" ? "Copied" : "Copy token"}
            </CompactButton>
          </div>
          {copyState === "failed" && (
            <p className="mt-2 text-[10px] text-red-300">Clipboard access failed. Select and copy the token manually.</p>
          )}
        </section>
      )}

      {actionError && (
        <p role="alert" className="desktop-alert desktop-alert--error user-action-error">{actionError}</p>
      )}

      <div className="user-manager-split">
        <CompactScrollbar className="user-grid-scroll">
          <DataGrid aria-label="TeamServer users" className="user-grid">
            <colgroup>
              <col style={{ width: 150 }} /><col style={{ width: 270 }} /><col style={{ width: 80 }} />
              <col style={{ width: 120 }} /><col style={{ width: 170 }} /><col style={{ width: 170 }} /><col style={{ width: 220 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Username</th><th>UUID</th><th>Role</th><th>Connection</th><th>Created</th><th>Last seen</th><th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.uuid}>
                  <td className="text-gray-100">{user.name}</td>
                  <td className="select-all text-[10px] text-gray-500">{user.uuid}</td>
                  <td>
                    <span className={user.admin ? "user-role is-admin" : "user-role"}>
                      {user.admin ? "Admin" : "User"}
                    </span>
                  </td>
                  <td>
                    <span className={user.connected ? "user-connection is-connected" : "user-connection"}>
                      <span />
                      {user.connected ? "Connected" : "Offline"}
                    </span>
                  </td>
                  <td>{formatTimestamp(user.created)}</td>
                  <td>{formatTimestamp(user.last_seen)}</td>
                  <td className="text-right">
                    {user.admin ? (
                      <span className="text-[10px] text-gray-600">Startup credential protected</span>
                    ) : (
                      <div className="grid-actions">
                        <CompactButton
                          type="button"
                          disabled={!isConnected || isBusy}
                          onClick={() => void handleRefreshToken(user)}
                          title="Generate a new token and revoke this user's active connections"
                          variant="secondary"
                        >
                          {pendingAction === `refresh:${user.uuid}` ? "Refreshing…" : "Refresh token"}
                        </CompactButton>
                        <CompactButton
                          type="button"
                          disabled={!isConnected || isBusy}
                          onClick={() => void handleDeleteUser(user)}
                          title="Delete this user and revoke all active connections"
                          variant="danger"
                        >
                          {pendingAction === `delete:${user.uuid}` ? "Deleting…" : "Delete"}
                        </CompactButton>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={7} className="empty-grid-cell">
                    {isConnected ? "No users returned by the TeamServer." : "Connect to the TeamServer to list users."}
                  </td>
                </tr>
              )}
            </tbody>
          </DataGrid>
        </CompactScrollbar>

        <DesktopPanel className="add-user-panel">
          <PanelHeader>Add new user</PanelHeader>
          <form onSubmit={handleCreateUser} className="add-user-form">
            <CompactFormGrid>
            <CompactFormRow label="Username" htmlFor="new-teamserver-username" hint="The token is shown once after creation." className="user-form-row">
            <CompactInput
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
            />
            </CompactFormRow>
            </CompactFormGrid>
            <CompactButton
              type="submit"
              disabled={!isConnected || isBusy || !username.trim()}
              variant="primary"
            >
              {pendingAction === "create" ? "Creating…" : "Create user"}
            </CompactButton>
          </form>
        </DesktopPanel>
      </div>
      <StatusBar>Connected means the user has one or more active WebSocket connections.</StatusBar>
    </DesktopPanel>
  );
};
