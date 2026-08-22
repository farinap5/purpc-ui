import React, { useEffect, useState } from "react";

interface UserManagerProps {
  currentUsername: string;
}

interface ManagedUser {
  id: string;
  username: string;
  createdAt: string;
  isCurrent: boolean;
}

interface IssuedCredential {
  userId: string;
  username: string;
  token: string;
}

const createIdentifier = () => {
  if ("randomUUID" in window.crypto) return window.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

const createAuthenticationToken = () => {
  const bytes = new Uint8Array(32);
  window.crypto.getRandomValues(bytes);
  let binary = "";
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

export const UserManager: React.FC<UserManagerProps> = ({ currentUsername }) => {
  const [users, setUsers] = useState<ManagedUser[]>(() => [{
    id: "current-operator",
    username: currentUsername || "gnome",
    createdAt: "Current session",
    isCurrent: true
  }]);
  const [username, setUsername] = useState("");
  const [formError, setFormError] = useState("");
  const [issuedCredential, setIssuedCredential] = useState<IssuedCredential | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    setUsers(current => current.map(user => user.isCurrent
      ? { ...user, username: currentUsername || "gnome" }
      : user
    ));
  }, [currentUsername]);

  const handleCreateUser = (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedUsername = username.trim();
    if (!normalizedUsername) {
      setFormError("Enter a username.");
      return;
    }
    if (users.some(user => user.username.toLowerCase() === normalizedUsername.toLowerCase())) {
      setFormError("A user with this name already exists.");
      return;
    }

    const userId = createIdentifier();
    const newUser: ManagedUser = {
      id: userId,
      username: normalizedUsername,
      createdAt: new Date().toLocaleString(),
      isCurrent: false
    };
    setUsers(current => [...current, newUser]);
    setIssuedCredential({
      userId,
      username: normalizedUsername,
      token: createAuthenticationToken()
    });
    setUsername("");
    setFormError("");
    setCopyState("idle");
  };

  const handleDeleteUser = (user: ManagedUser) => {
    if (user.isCurrent) return;
    setUsers(current => current.filter(item => item.id !== user.id));
    if (issuedCredential?.userId === user.id) setIssuedCredential(null);
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

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto bg-[#1e1e1e] p-3 font-sans text-gray-300">
      <div className="mb-3 flex items-start justify-between gap-4 border-b border-[#333] pb-3">
        <div>
          <h2 className="text-sm font-bold text-gray-100">TeamServer Users</h2>
          <p className="mt-1 text-[10px] text-gray-500">Interface preview — changes are stored only in this browser session.</p>
        </div>
        <span className="rounded border border-[#414141] bg-[#292929] px-2 py-1 text-[10px] text-gray-400">
          {users.length} {users.length === 1 ? "user" : "users"}
        </span>
      </div>

      {issuedCredential && (
        <section className="mb-3 rounded border border-violet-700/70 bg-violet-950/20 p-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-xs font-bold text-violet-200">Authentication token created for {issuedCredential.username}</h3>
              <p className="mt-1 text-[10px] text-violet-300/70">Copy this token now. The finished TeamServer flow should display it only once.</p>
            </div>
            <button
              type="button"
              onClick={() => setIssuedCredential(null)}
              className="rounded px-1.5 py-0.5 text-[10px] text-gray-500 hover:bg-[#333] hover:text-gray-200 focus:outline-none focus:ring-1 focus:ring-violet-500"
            >
              Dismiss
            </button>
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              aria-label={`Authentication token for ${issuedCredential.username}`}
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

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="min-h-48 overflow-auto rounded border border-[#333] bg-[#222]">
          <table className="w-full min-w-[620px] text-left text-xs">
            <thead className="sticky top-0 z-10 border-b border-[#3a3a3a] bg-[#292a2d] text-[10px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2">Username</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2">Credential</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#303030]">
              {users.map(user => (
                <tr key={user.id} className="hover:bg-[#292929]">
                  <td className="px-3 py-2 font-mono font-bold text-gray-100">
                    {user.username}
                    {user.isCurrent && <span className="ml-2 text-[9px] font-normal text-violet-300">CURRENT</span>}
                  </td>
                  <td className="px-3 py-2 text-gray-500">{user.createdAt}</td>
                  <td className="px-3 py-2 text-gray-400">{user.isCurrent ? "Existing token" : "Token issued"}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      disabled={user.isCurrent}
                      onClick={() => handleDeleteUser(user)}
                      className="rounded border border-red-900/70 bg-red-950/30 px-2 py-1 text-[10px] text-red-300 transition hover:border-red-600 hover:bg-red-950/60 focus:border-violet-400 focus:outline-none disabled:cursor-not-allowed disabled:border-[#3a3a3a] disabled:bg-[#292929] disabled:text-gray-600"
                      title={user.isCurrent ? "The current signed-in user cannot be deleted." : `Delete ${user.username}`}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
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
                setFormError("");
              }}
              placeholder="operator name"
              className="w-full rounded border border-[#444] bg-[#151515] px-3 py-2 text-xs text-white outline-none transition placeholder:text-gray-700 focus:border-violet-400"
            />
            <p className="mt-1 text-[10px] text-gray-600">A random authentication token is generated when the user is created.</p>
            {formError && (
              <p className="mt-2 rounded border border-red-900/70 bg-red-950/30 p-2 text-[10px] text-red-300">{formError}</p>
            )}
            <button
              type="submit"
              disabled={!username.trim()}
              className="mt-3 w-full rounded bg-violet-700 px-3 py-2 text-xs font-bold text-white transition hover:bg-violet-600 focus:outline-none focus:ring-1 focus:ring-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Create user
            </button>
          </form>
        </section>
      </div>
    </div>
  );
};
