import React, { FormEvent, useEffect, useState } from "react";
import { ConnectionSettings } from "../types";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  operatorName: string;
  authToken: string;
  serverAddress: string;
  isWsConnected: boolean;
  onReconnect: (settings: ConnectionSettings) => Promise<void>;
  onResetAll: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  operatorName,
  authToken,
  serverAddress,
  isWsConnected,
  onReconnect,
  onResetAll
}) => {
  const [draftUsername, setDraftUsername] = useState(operatorName);
  const [draftToken, setDraftToken] = useState(authToken);
  const [draftServerAddress, setDraftServerAddress] = useState(serverAddress);
  const [formError, setFormError] = useState("");
  const [isReconnecting, setIsReconnecting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDraftUsername(operatorName);
      setDraftToken(authToken);
      setDraftServerAddress(serverAddress);
      setFormError("");
    }
  }, [isOpen, operatorName, authToken, serverAddress]);

  if (!isOpen) return null;

  const handleReconnect = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const username = draftUsername.trim() || "gnome";
    const token = draftToken.trim();
    const address = draftServerAddress.trim();

    if (!token || !address) {
      setFormError("Username, token, and server address are required to reconnect.");
      return;
    }

    try {
      const parsedAddress = new URL(address);
      if (parsedAddress.protocol !== "http:" && parsedAddress.protocol !== "https:") {
        throw new Error("Unsupported protocol");
      }
    } catch {
      setFormError("Enter a valid HTTP or HTTPS server address.");
      return;
    }

    setIsReconnecting(true);
    try {
      await onReconnect({
        username,
        token,
        serverAddress: address.replace(/\/$/, "")
      });
      onClose();
    } catch (connectionError) {
      setFormError(connectionError instanceof Error ? connectionError.message : "Could not reconnect to the teamserver.");
    } finally {
      setIsReconnecting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 font-sans">
      <div className="bg-[#242528] border border-[#3E4044] rounded shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="bg-[#1C1D1F] px-4 py-2 border-b border-[#3E4044] flex items-center justify-between">
          <span className="text-gray-300 font-bold text-xs">PurpleCommand C2 Configurations</span>
          <button 
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white transition text-xs cursor-pointer"
          >
            Close
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleReconnect} className="p-4 space-y-3 text-xs text-gray-300 overflow-y-auto">
          
          <div className="bg-[#1A1B1D] p-3 rounded border border-[#333333] space-y-2">
            <h4 className="text-gray-300 font-bold uppercase text-[10px] tracking-wider">Server Connection</h4>
            <div>
              <label htmlFor="settings-username" className="block text-gray-400 mb-1">Username</label>
              <input
                id="settings-username"
                type="text"
                value={draftUsername}
                onChange={(e) => setDraftUsername(e.target.value)}
                placeholder="gnome"
                className="w-full bg-[#242528] border border-[#444] rounded p-1.5 text-white outline-none transition focus:border-violet-400 font-semibold"
              />
            </div>
            <div>
              <label htmlFor="settings-server" className="block text-gray-400 mb-1">Server Address</label>
              <input
                id="settings-server"
                type="url"
                value={draftServerAddress}
                onChange={(e) => setDraftServerAddress(e.target.value)}
                placeholder="http://127.0.0.1:8080"
                required
                className="w-full bg-[#242528] border border-[#444] rounded p-1.5 text-white outline-none transition focus:border-violet-400 font-mono"
              />
            </div>
            <div>
              <label htmlFor="settings-token" className="block text-gray-400 mb-1">Token</label>
              <input
                id="settings-token"
                type="password"
                value={draftToken}
                onChange={(e) => setDraftToken(e.target.value)}
                placeholder="WazdOO4JweiJsf00LV4YebQcXDEKEcMeLmjG9N0klGg"
                autoComplete="off"
                required
                className="w-full bg-[#242528] border border-[#444] rounded p-1.5 text-white outline-none transition focus:border-violet-400 font-mono"
              />
            </div>
            <div className="text-[10px] text-gray-500">
              Status: {isWsConnected ? "Connected" : "Disconnected"}
            </div>
          </div>

          {formError && (
            <p role="alert" className="bg-red-950/40 border border-red-900/70 text-red-300 rounded p-2">
              {formError}
            </p>
          )}

          <div className="pt-2 border-t border-[#333] flex justify-between items-center">
            <button
              type="button"
              onClick={() => {
                if (confirm("Clear local tabs and reload state from the TeamServer?")) {
                  onResetAll();
                  onClose();
                }
              }}
              className="bg-[#333] text-gray-300 hover:bg-[#444] px-3 py-1.5 rounded text-xs cursor-pointer transition font-bold"
            >
              Refresh Dashboard
            </button>
            <button
              type="submit"
              disabled={isReconnecting}
              className="bg-[#385d8a] hover:bg-[#486d9a] text-white font-bold px-4 py-1.5 rounded text-xs cursor-pointer transition disabled:cursor-wait disabled:opacity-60"
            >
              {isReconnecting ? "Connecting…" : "Reconnect & Apply"}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
