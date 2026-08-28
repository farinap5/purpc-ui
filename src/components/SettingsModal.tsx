import React, { FormEvent, useEffect, useState } from "react";
import { ConnectionSettings } from "../types";
import {
  CompactButton,
  CompactFormGrid,
  CompactFormRow,
  CompactInput,
  DesktopModal
} from "./desktop";

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
    <DesktopModal
      title="PurpleCommand C2 Configurations"
      subtitle="Server connection"
      onClose={onClose}
      width="620px"
    >
      <form onSubmit={handleReconnect} className="settings-form">
        <fieldset className="desktop-fieldset">
          <legend>Server Connection</legend>
          <CompactFormGrid>
            <CompactFormRow label="Username" htmlFor="settings-username">
              <CompactInput
                id="settings-username"
                type="text"
                value={draftUsername}
                onChange={(e) => setDraftUsername(e.target.value)}
                placeholder="gnome"
              />
            </CompactFormRow>
            <CompactFormRow label="Server Address" htmlFor="settings-server" required>
              <CompactInput
                id="settings-server"
                type="url"
                value={draftServerAddress}
                onChange={(e) => setDraftServerAddress(e.target.value)}
                placeholder="http://127.0.0.1:8080"
                required
                aria-invalid={Boolean(formError)}
                aria-describedby={formError ? "settings-form-error" : undefined}
              />
            </CompactFormRow>
            <CompactFormRow label="Token" htmlFor="settings-token" required>
              <CompactInput
                id="settings-token"
                type="password"
                value={draftToken}
                onChange={(e) => setDraftToken(e.target.value)}
                placeholder="WazdOO4JweiJsf00LV4YebQcXDEKEcMeLmjG9N0klGg"
                autoComplete="off"
                required
                aria-invalid={Boolean(formError)}
                aria-describedby={formError ? "settings-form-error" : undefined}
              />
            </CompactFormRow>
            <CompactFormRow label="Status">
              <span className={isWsConnected ? "connection-state is-connected" : "connection-state"}>
                {isWsConnected ? "Connected" : "Disconnected"}
              </span>
            </CompactFormRow>
          </CompactFormGrid>
        </fieldset>

        {formError && <p id="settings-form-error" role="alert" className="desktop-alert desktop-alert--error">{formError}</p>}

        <div className="settings-actions">
            <CompactButton
              type="button"
              onClick={() => {
                if (confirm("Clear local tabs and reload state from the TeamServer?")) {
                  onResetAll();
                  onClose();
                }
              }}
            >
              Refresh Dashboard
            </CompactButton>
            <CompactButton
              type="submit"
              disabled={isReconnecting}
              variant="primary"
            >
              {isReconnecting ? "Connecting…" : "Reconnect & Apply"}
            </CompactButton>
        </div>
      </form>
    </DesktopModal>
  );
};
