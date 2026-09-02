import { useEffect, useState, type FormEvent } from "react";
import type { ListenerConfiguration as ListenerConfigurationValues, ListenerProtocol } from "../types";
import {
  CompactButton,
  CompactCheckbox,
  CompactFormGrid,
  CompactFormRow,
  CompactInput,
  CompactNumberInput,
  CompactSelect,
  DesktopModal
} from "./desktop";

interface ListenerConfigurationProps {
  isOpen: boolean;
  isConnected: boolean;
  onClose: () => void;
  onCreate: (configuration: ListenerConfigurationValues) => Promise<void>;
}

export function ListenerConfiguration({
  isOpen,
  isConnected,
  onClose,
  onCreate
}: ListenerConfigurationProps) {
  const [name, setName] = useState("");
  const [protocol, setProtocol] = useState<ListenerProtocol>("https");
  const [host, setHost] = useState("127.0.0.1");
  const [port, setPort] = useState("443");
  const [persistent, setPersistent] = useState(false);
  const [error, setError] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName("");
    setProtocol("https");
    setHost("127.0.0.1");
    setPort("443");
    setPersistent(false);
    setError("");
    setIsCreating(false);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const listenerName = name.trim();
    const listenerHost = host.trim();
    const listenerPort = Number(port);

    if (!listenerName) {
      setError("Enter a listener name.");
      return;
    }
    if (!listenerHost) {
      setError("Enter a listener host.");
      return;
    }
    if (!/^\d+$/.test(port) || !Number.isInteger(listenerPort) || listenerPort < 1 || listenerPort > 65535) {
      setError("Enter a port between 1 and 65535.");
      return;
    }
    if (!isConnected) {
      setError("Connect to the TeamServer before creating a listener.");
      return;
    }

    setError("");
    setIsCreating(true);
    try {
      await onCreate({ name: listenerName, protocol, host: listenerHost, port: listenerPort, persistent });
      onClose();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : String(createError));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <DesktopModal
      title="Add Listener"
      subtitle="TeamServer listener configuration"
      onClose={onClose}
      width="620px"
      footer={
        <>
          <CompactButton type="button" onClick={onClose}>Cancel</CompactButton>
          <CompactButton
            type="submit"
            form="listener-configuration-form"
            variant="primary"
            disabled={isCreating || !isConnected}
          >
            {isCreating ? "Creating…" : "Create Listener"}
          </CompactButton>
        </>
      }
    >
      <form id="listener-configuration-form" onSubmit={handleSubmit}>
        <CompactFormGrid>
          <CompactFormRow label="Listener Name" htmlFor="listener-configuration-name" required>
            <CompactInput
              id="listener-configuration-name"
              value={name}
              onChange={event => {
                setName(event.target.value);
                setError("");
              }}
              placeholder="HTTPS_Secure"
              autoComplete="off"
              required
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "listener-configuration-error" : undefined}
            />
          </CompactFormRow>

          <CompactFormRow label="Protocol" htmlFor="listener-configuration-protocol" required>
            <CompactSelect
              id="listener-configuration-protocol"
              value={protocol}
              onChange={event => {
                const nextProtocol = event.target.value as ListenerProtocol;
                setProtocol(nextProtocol);
                setPort(currentPort => currentPort === "80" || currentPort === "443"
                  ? nextProtocol === "https" ? "443" : "80"
                  : currentPort);
                setError("");
              }}
            >
              <option value="http">HTTP</option>
              <option value="https">HTTPS</option>
            </CompactSelect>
          </CompactFormRow>

          <CompactFormRow label="Host" htmlFor="listener-configuration-host" required>
            <CompactInput
              id="listener-configuration-host"
              value={host}
              onChange={event => {
                setHost(event.target.value);
                setError("");
              }}
              placeholder="127.0.0.1"
              autoComplete="off"
              required
            />
          </CompactFormRow>

          <CompactFormRow label="Port" htmlFor="listener-configuration-port" required>
            <CompactNumberInput
              id="listener-configuration-port"
              value={port}
              onChange={event => {
                setPort(event.target.value);
                setError("");
              }}
              min={1}
              max={65535}
              step={1}
              required
            />
          </CompactFormRow>

          <CompactFormRow label="Persistence">
            <label className="compact-check-label">
              <CompactCheckbox
                checked={persistent}
                onChange={event => setPersistent(event.target.checked)}
              />
              Across TeamServer restarts
            </label>
          </CompactFormRow>

          {error && (
            <p id="listener-configuration-error" role="alert" className="desktop-alert desktop-alert--error">
              {error}
            </p>
          )}
        </CompactFormGrid>
      </form>
    </DesktopModal>
  );
}
