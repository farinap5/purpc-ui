import React, { useEffect, useState } from "react";
import { TeamProfile, TeamProfileUpdateKey } from "../api/teamApi";
import type { Listener } from "../types";
import {
  getProfileListenerCompatibility,
  type ListenerLHostSnapshot
} from "../utils/listenerEndpoint";
import { generateRandomOTS } from "../utils/randomSecret";
import {
  CompactButton,
  CompactCheckbox,
  CompactFormGrid,
  CompactFormRow,
  CompactInput,
  CompactScrollbar,
  CompactSelect,
  CompactTextArea,
  DesktopModal,
  DesktopPanel,
  PanelHeader
} from "./desktop";

interface ProfileManagerProps {
  isOpen: boolean;
  listeners: Listener[];
  serverProfiles: TeamProfile[];
  onClose: () => void;
  onList: () => Promise<TeamProfile[]>;
  onGet: (name: string) => Promise<TeamProfile>;
  onCreate: (profile: TeamProfile) => Promise<TeamProfile>;
  onUpdate: (name: string, key: TeamProfileUpdateKey, value: string) => Promise<TeamProfile>;
  onSetListener: (name: string, listenerUUID: string) => Promise<TeamProfile>;
  onDelete: (name: string) => Promise<void>;
}

type EditableProfileKey = Exclude<
  keyof TeamProfile,
  | "name"
  | "listener_uuid"
  | "mode"
  | "os_options"
  | "arch_options"
  | "protocol"
  | "options"
  | "ots"
  | "ots_configured"
  | "ots_expires_at"
  | "ots_used_at"
  | "config_version"
  | "definition_created_at"
  | "definition_updated_at"
  | "template"
  | "builder"
>;

const defaultProfile = (): TeamProfile => ({
  name: "",
  listener_uuid: "",
  type: "impl",
  mode: "reverse",
  lhost: "",
  os: "linux",
  arch: "amd64",
  os_options: ["linux"],
  arch_options: ["amd64"],
  protocol: "http",
  options: { path: "/", header: {} },
  ots: "",
  ots_configured: false,
  output: "implant",
  public_key: "server.pub"
});

const editableFields: Array<{
  property: EditableProfileKey;
  apiKey: TeamProfileUpdateKey;
  label: string;
  placeholder?: string;
}> = [
  { property: "type", apiKey: "TYPE", label: "Payload type", placeholder: "impl" },
  { property: "lhost", apiKey: "LHOST", label: "LHOST", placeholder: "127.0.0.1:8080" },
  { property: "os", apiKey: "OS", label: "Operating system", placeholder: "linux" },
  { property: "arch", apiKey: "ARCH", label: "Architecture", placeholder: "amd64" },
  { property: "output", apiKey: "OUTPUT", label: "Output", placeholder: "implant" },
  { property: "public_key", apiKey: "PUBLICKEY", label: "Public key", placeholder: "server.pub" }
];

const sortProfiles = (profiles: TeamProfile[]) => [...profiles].sort((left, right) => left.name.localeCompare(right.name));

const profileRevision = (profile: TeamProfile) => JSON.stringify({
  listener_uuid: profile.listener_uuid || "",
  mode: profile.mode || "reverse",
  lhost: profile.lhost,
  type: profile.type,
  os: profile.os,
  arch: profile.arch,
  protocol: profile.protocol,
  options: profile.options,
  ots_configured: profile.ots_configured,
  ots_expires_at: profile.ots_expires_at,
  ots_used_at: profile.ots_used_at,
  config_version: profile.config_version,
  definition_updated_at: profile.definition_updated_at,
  output: profile.output,
  public_key: profile.public_key
});

const nextDuplicateName = (name: string, profiles: TeamProfile[]) => {
  const existingNames = new Set(profiles.map(profile => profile.name));
  const trailingNumber = name.match(/^(.*?)(\d+)$/);
  const stem = trailingNumber?.[1] || name;
  const parsedSuffix = trailingNumber ? Number.parseInt(trailingNumber[2], 10) : 0;
  let suffix = Number.isSafeInteger(parsedSuffix) ? parsedSuffix + 1 : 1;

  while (existingNames.has(`${stem}${suffix}`)) suffix += 1;
  return `${stem}${suffix}`;
};

const normalizeProfile = (profile: TeamProfile): TeamProfile => {
  const { template: _legacyTemplate, ...currentProfile } = profile as TeamProfile & { template?: unknown };
  void _legacyTemplate;
  return {
    ...currentProfile,
    listener_uuid: profile.listener_uuid || "",
    mode: profile.mode || "reverse",
    os_options: profile.os_options?.length ? profile.os_options : [profile.os],
    arch_options: profile.arch_options?.length ? profile.arch_options : [profile.arch],
    protocol: profile.protocol || "generic",
    options: profile.options && typeof profile.options === "object" && !Array.isArray(profile.options) ? profile.options : {},
    ots: "",
    ots_configured: Boolean(profile.ots_configured)
  };
};

const formatOptions = (options: Record<string, unknown>) => JSON.stringify(options, null, 2);

const toUTCInputValue = (value?: string) => {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 16);
};

const fromUTCInputValue = (value: string) => value ? `${value}:00Z` : "";

const formatTimestamp = (value?: string) => value ? new Date(value).toLocaleString() : "Never";

const formatEndpointSource = (source: ListenerLHostSnapshot["source"]) =>
  source === "advertise+bind" ? "options.advertise + options.bind" : `options.${source}`;

export const ProfileManager: React.FC<ProfileManagerProps> = ({
  isOpen,
  listeners,
  serverProfiles,
  onClose,
  onList,
  onGet,
  onCreate,
  onUpdate,
  onSetListener,
  onDelete
}) => {
  const [profiles, setProfiles] = useState<TeamProfile[]>([]);
  const [selectedName, setSelectedName] = useState("");
  const [original, setOriginal] = useState<TeamProfile | null>(null);
  const [form, setForm] = useState<TeamProfile>(defaultProfile);
  const [isCreating, setIsCreating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [optionsText, setOptionsText] = useState(formatOptions(defaultProfile().options));
  const [otsDraft, setOTSDraft] = useState("");
  const [clearOTS, setClearOTS] = useState(false);
  const [otsExpiresAt, setOTSExpiresAt] = useState("");
  const loadDefinitionDrafts = (profile: TeamProfile) => {
    const normalized = normalizeProfile(profile);
    setForm(normalized);
    setOptionsText(formatOptions(normalized.options));
    setOTSDraft("");
    setClearOTS(false);
    setOTSExpiresAt(toUTCInputValue(normalized.ots_expires_at));
  };

  const loadProfile = async (name: string) => {
    if (!name) return;
    setIsLoading(true);
    setError("");
    setNotice("");
    try {
      const profile = await onGet(name);
      const normalized = normalizeProfile(profile);
      setOriginal(normalized);
      loadDefinitionDrafts(normalized);
      setSelectedName(normalized.name);
      setIsCreating(false);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setIsLoading(false);
    }
  };

  const refresh = async (preferredName?: string) => {
    setIsLoading(true);
    setError("");
    try {
      const items = sortProfiles(await onList());
      setProfiles(items);
      const nextName = preferredName && items.some(profile => profile.name === preferredName)
        ? preferredName
        : items.some(profile => profile.name === selectedName)
          ? selectedName
          : items[0]?.name || "";

      if (nextName) {
        const profile = await onGet(nextName);
        const normalized = normalizeProfile(profile);
        setSelectedName(normalized.name);
        setOriginal(normalized);
        loadDefinitionDrafts(normalized);
        setIsCreating(false);
      } else {
        setSelectedName("");
        setOriginal(null);
        setForm(defaultProfile());
        setOptionsText(formatOptions(defaultProfile().options));
        setOTSDraft("");
        setClearOTS(false);
        setOTSExpiresAt("");
      }
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) void refresh();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const normalizedProfiles = sortProfiles(serverProfiles.map(normalizeProfile));
    setProfiles(normalizedProfiles);
    if (isCreating || isSaving || !original) return;

    const authoritative = normalizedProfiles.find(profile => profile.name === original.name);
    if (!authoritative) {
      setSelectedName("");
      setOriginal(null);
      setForm(defaultProfile());
      setNotice(`Profile ${original.name} was deleted.`);
      return;
    }
    if (profileRevision(authoritative) !== profileRevision(original)) {
      setOriginal(authoritative);
      loadDefinitionDrafts(authoritative);
      setNotice(`Profile ${authoritative.name} was refreshed from a TeamServer event.`);
    }
  }, [serverProfiles]);

  if (!isOpen) return null;

  const setField = (property: "name" | EditableProfileKey, value: string) => {
    const detachesListener = property === "lhost" && Boolean(form.listener_uuid);
    setForm(current => ({
      ...current,
      [property]: value,
      ...(property === "lhost" ? { listener_uuid: "" } : {})
    }));
    setError("");
    setNotice(detachesListener
      ? "Editing LHOST manually will detach the listener when this profile is saved."
      : "");
  };

  const listenerChoices = [...listeners]
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }))
    .map(listener => ({ listener, compatibility: getProfileListenerCompatibility(listener) }));
  const selectedListenerChoice = listenerChoices.find(choice => choice.listener.uuid === form.listener_uuid);
  const selectedListenerSnapshot = selectedListenerChoice?.compatibility.snapshot || null;
  const missingAttachedListener = Boolean(form.listener_uuid && !selectedListenerChoice);

  const selectListener = (uuid: string) => {
    setError("");
    setNotice("");
    if (!uuid) {
      setForm(current => ({ ...current, listener_uuid: "" }));
      if (form.listener_uuid) setNotice("The listener will be detached when this profile is saved; its current LHOST will be preserved.");
      return;
    }
    if (form.protocol.trim().toLowerCase() !== "http") {
      setError("A listener can be attached only to a plain HTTP implant profile.");
      return;
    }
    if (form.mode !== "reverse") {
      setError("A reverse listener cannot be attached to a bind-mode profile.");
      return;
    }
    const choice = listenerChoices.find(item => item.listener.uuid === uuid);
    if (!choice?.compatibility.compatible || !choice.compatibility.snapshot) {
      setError(choice?.compatibility.reason || "The selected listener cannot be attached to this profile.");
      return;
    }
    const snapshot = choice.compatibility.snapshot;
    setForm(current => ({ ...current, listener_uuid: uuid, lhost: snapshot.endpoint }));
    setNotice(`Listener ${choice.listener.name} will be attached when saved. The TeamServer will materialize its advertised endpoint into LHOST.`);
  };

  const validate = () => {
    if (!form.name.trim()) return "Profile name is required.";
    if (!form.type.trim()) return "Payload type is required.";
    if (!form.os.trim()) return "Operating system is required.";
    if (!form.arch.trim()) return "Architecture is required.";
    if (!form.protocol.trim()) return "Protocol is required.";
    if (form.mode !== "reverse" && form.mode !== "bind") return "Profile mode must be reverse or bind.";
    if (form.listener_uuid && form.protocol.trim().toLowerCase() !== "http") {
      return "A listener can be attached only to a plain HTTP implant profile.";
    }
    if (form.listener_uuid && form.mode !== "reverse") return "Bind-mode profiles cannot attach to reverse listeners.";
    if (clearOTS && otsDraft !== "") return "Choose either a replacement OTS or Clear OTS, not both.";
    try {
      const options = JSON.parse(optionsText);
      if (!options || typeof options !== "object" || Array.isArray(options)) return "Protocol options must be a JSON object.";
    } catch {
      return "Protocol options must contain valid JSON.";
    }
    return "";
  };

  const createProfile = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSaving(true);
    setError("");
    setNotice("");
    try {
      const listenerUUID = form.listener_uuid;
      const created = await onCreate({
        ...form,
        listener_uuid: "",
        name: form.name.trim(),
        os_options: Array.from(new Set([...form.os_options, form.os])),
        arch_options: Array.from(new Set([...form.arch_options, form.arch])),
        protocol: form.protocol.trim(),
        options: JSON.parse(optionsText) as Record<string, unknown>,
        ots: otsDraft || undefined,
        ots_expires_at: fromUTCInputValue(otsExpiresAt) || undefined
      });
      if (listenerUUID) {
        try {
          const attached = await onSetListener(created.name, listenerUUID);
          await refresh(attached.name);
          setNotice(`Profile ${attached.name} created and attached to its listener.`);
        } catch (attachError) {
          await refresh(created.name);
          setError(`Profile ${created.name} was created, but listener attachment failed: ${attachError instanceof Error ? attachError.message : String(attachError)}`);
        }
      } else {
        await refresh(created.name);
        setNotice(`Profile ${created.name} created.`);
      }
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : String(createError));
    } finally {
      setIsSaving(false);
    }
  };

  const updateProfile = async () => {
    if (!original) return;
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    const listenerChanged = form.listener_uuid !== original.listener_uuid;
    const listenerNeedsApply = listenerChanged || Boolean(form.listener_uuid && form.lhost !== original.lhost);
    const changes = editableFields.filter(field =>
      form[field.property] !== original[field.property] &&
      !(field.property === "lhost" && Boolean(form.listener_uuid))
    );
    const parsedOptions = JSON.parse(optionsText) as Record<string, unknown>;
    const protocolChanged = form.protocol.trim() !== original.protocol;
    const modeChanged = form.mode !== original.mode;
    const optionsChanged = JSON.stringify(parsedOptions) !== JSON.stringify(original.options || {});
    const expiry = fromUTCInputValue(otsExpiresAt);
    const originalExpiry = fromUTCInputValue(toUTCInputValue(original.ots_expires_at));
    const expiryChanged = expiry !== originalExpiry;
    const otsChanged = otsDraft !== "";
    const clearExistingOTS = clearOTS && original.ots_configured;
    if (changes.length === 0 && !listenerNeedsApply && !protocolChanged && !modeChanged && !optionsChanged && !expiryChanged && !otsChanged && !clearExistingOTS) {
      setNotice("No profile changes to save.");
      return;
    }

    setIsSaving(true);
    setError("");
    setNotice("");
    try {
      let updated = original;
      for (const change of changes) {
        updated = await onUpdate(original.name, change.apiKey, form[change.property]);
      }
      if (modeChanged) updated = await onUpdate(original.name, "MODE", form.mode);
      if (protocolChanged) updated = await onUpdate(original.name, "PROTOCOL", form.protocol.trim());
      if (optionsChanged) updated = await onUpdate(original.name, "OPTIONS", JSON.stringify(parsedOptions));
      if (expiryChanged) updated = await onUpdate(original.name, "OTS_EXPIRES_AT", expiry);
      if (clearExistingOTS) updated = await onUpdate(original.name, "OTS_CLEAR", "");
      if (otsChanged) updated = await onUpdate(original.name, "OTS", otsDraft);
      if (listenerNeedsApply) updated = await onSetListener(original.name, form.listener_uuid);
      await refresh(updated.name);
      setNotice(`Profile ${updated.name} updated.`);
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : String(updateError);
      await refresh(original.name);
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const refreshAttachedListener = async () => {
    if (!original?.listener_uuid) return;
    setIsSaving(true);
    setError("");
    setNotice("");
    try {
      const refreshed = normalizeProfile(await onSetListener(original.name, original.listener_uuid));
      setProfiles(current => sortProfiles([
        ...current.filter(profile => profile.name !== refreshed.name),
        refreshed
      ]));
      setOriginal(refreshed);
      setForm(current => ({
        ...current,
        listener_uuid: refreshed.listener_uuid,
        lhost: refreshed.lhost,
        config_version: refreshed.config_version,
        definition_updated_at: refreshed.definition_updated_at
      }));
      setNotice(`LHOST refreshed from listener ${selectedListenerChoice?.listener.name || refreshed.listener_uuid}. Existing implants were not changed.`);
    } catch (refreshError) {
      const message = refreshError instanceof Error ? refreshError.message : String(refreshError);
      await refresh(original.name);
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const deleteProfile = async () => {
    if (!original) return;
    const deletedName = original.name;
    setIsSaving(true);
    setError("");
    setNotice("");
    try {
      await onDelete(deletedName);
      setSelectedName("");
      setOriginal(null);
      setForm(defaultProfile());
      setOptionsText(formatOptions(defaultProfile().options));
      setOTSDraft("");
      setClearOTS(false);
      setOTSExpiresAt("");
      await refresh();
      setNotice(`Profile ${deletedName} deleted.`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
    } finally {
      setIsSaving(false);
    }
  };

  const duplicateProfile = async () => {
    if (!original) return;
    const duplicateName = nextDuplicateName(original.name, profiles);
    setIsSaving(true);
    setError("");
    setNotice("");
    try {
      const listenerUUID = original.listener_uuid;
      const created = await onCreate({
        ...original,
        listener_uuid: "",
        name: duplicateName,
        os_options: [...original.os_options],
        arch_options: [...original.arch_options],
        options: { ...original.options },
        ots: undefined,
        ots_configured: false,
        ots_expires_at: undefined,
        ots_used_at: undefined,
        config_version: undefined,
        definition_created_at: undefined,
        definition_updated_at: undefined
      });
      if (listenerUUID) {
        try {
          const attached = await onSetListener(created.name, listenerUUID);
          await refresh(attached.name);
          setNotice(`Profile ${attached.name} created from ${original.name} with the same listener attached.`);
        } catch (attachError) {
          await refresh(created.name);
          setError(`Profile ${created.name} was duplicated, but listener attachment failed: ${attachError instanceof Error ? attachError.message : String(attachError)}`);
        }
      } else {
        await refresh(created.name);
        setNotice(`Profile ${created.name} created from ${original.name}.`);
      }
    } catch (duplicateError) {
      setError(duplicateError instanceof Error ? duplicateError.message : String(duplicateError));
    } finally {
      setIsSaving(false);
    }
  };

  const beginCreate = () => {
    setSelectedName("");
    setOriginal(null);
    setForm(defaultProfile());
    setOptionsText(formatOptions(defaultProfile().options));
    setOTSDraft("");
    setClearOTS(false);
    setOTSExpiresAt("");
    setIsCreating(true);
    setError("");
    setNotice("");
  };

  return (
    <DesktopModal
      title="Implant Profiles"
      subtitle="TeamServer implant build configurations"
      onClose={onClose}
      width="900px"
    >
        <div className="profile-manager-split">
          <DesktopPanel className="profile-browser">
            <PanelHeader actions={
              <CompactButton type="button" onClick={beginCreate} disabled={isSaving} variant="primary">New</CompactButton>
            }>Profiles</PanelHeader>
            <CompactScrollbar className="profile-list" role="listbox" aria-label="Implant profiles">
              {isLoading && profiles.length === 0 && <p className="p-2 text-gray-600">Loading profiles…</p>}
              {!isLoading && profiles.length === 0 && <p className="p-2 text-gray-600">No profiles.</p>}
              {profiles.map(profile => (
                <button
                  key={profile.name}
                  type="button"
                  onClick={() => void loadProfile(profile.name)}
                  disabled={isSaving}
                  role="option"
                  aria-selected={!isCreating && selectedName === profile.name}
                  className={`profile-list-item ${!isCreating && selectedName === profile.name ? "is-selected" : ""}`}
                >
                  <span>{profile.name}</span>
                  <small>{profile.type} · {profile.mode} · {profile.os}/{profile.arch}</small>
                </button>
              ))}
            </CompactScrollbar>
            <div className="profile-browser-footer">
              <CompactButton type="button" onClick={() => void refresh()} disabled={isLoading || isSaving}>Refresh</CompactButton>
            </div>
          </DesktopPanel>

          <DesktopPanel className="profile-editor">
            <PanelHeader actions={!isCreating && original ? (
              <>
                <CompactButton type="button" onClick={() => void duplicateProfile()} disabled={isSaving || isLoading} variant="secondary">Duplicate</CompactButton>
                <CompactButton type="button" onClick={() => void deleteProfile()} disabled={isSaving} variant="danger">Delete</CompactButton>
              </>
            ) : undefined}>
              {isCreating ? "Create profile" : original ? original.name : "Select a profile"}
            </PanelHeader>

            <CompactScrollbar className="profile-editor-scroll">
              {original && <p className="profile-editor-note">Profile names cannot be changed after creation.</p>}

            {(isCreating || original) ? (
              <CompactFormGrid>
                <CompactFormRow label="Name" htmlFor="profile-name">
                  <CompactInput
                    id="profile-name"
                    value={form.name}
                    onChange={event => setField("name", event.target.value)}
                    readOnly={!isCreating}
                    placeholder="profile-name"
                  />
                </CompactFormRow>
                <CompactFormRow
                  label="Transport mode"
                  htmlFor="profile-mode"
                  hint={form.mode === "bind"
                    ? "Bind implants accept requests from a speaker. Reverse-listener attachment is unavailable."
                    : "Reverse implants initiate callbacks to a listener."}
                >
                  <CompactSelect
                    id="profile-mode"
                    value={form.mode}
                    onChange={event => {
                      const mode = event.target.value as TeamProfile["mode"];
                      const detachesListener = mode === "bind" && Boolean(form.listener_uuid);
                      setForm(current => ({ ...current, mode, ...(mode === "bind" ? { listener_uuid: "" } : {}) }));
                      setError("");
                      setNotice(detachesListener ? "Changing to bind mode will detach the reverse listener when saved." : "");
                    }}
                    disabled={isSaving}
                  >
                    <option value="reverse">Reverse — implant calls a listener</option>
                    <option value="bind">Bind — speaker calls the implant</option>
                  </CompactSelect>
                </CompactFormRow>
                {editableFields.map(field => (
                  <React.Fragment key={field.property}>
                  {field.property === "lhost" && (
                    <CompactFormRow
                      label="Listener"
                      htmlFor="profile-lhost-listener"
                      hint="Optional persistent plain-HTTP listener. Advertisement fields fall back individually to bind fields."
                    >
                      <div className="inline-control-row">
                        <CompactSelect
                          id="profile-lhost-listener"
                          value={form.listener_uuid}
                          onChange={event => selectListener(event.target.value)}
                          disabled={isSaving || form.mode !== "reverse"}
                        >
                          <option value="">No listener — manual LHOST</option>
                          {missingAttachedListener && (
                            <option value={form.listener_uuid} disabled>
                              Attached listener unavailable — {form.listener_uuid}
                            </option>
                          )}
                          {listenerChoices.map(({ listener, compatibility }) => (
                            <option key={listener.uuid} value={listener.uuid} disabled={!compatibility.compatible}>
                              {listener.name}{compatibility.snapshot ? ` — ${compatibility.snapshot.endpoint}` : ""}
                              {!compatibility.compatible ? ` — ${compatibility.reason}` : ""}
                            </option>
                          ))}
                        </CompactSelect>
                        {!isCreating && original?.listener_uuid && form.listener_uuid === original.listener_uuid && (
                          <CompactButton
                            type="button"
                            variant="secondary"
                            onClick={() => void refreshAttachedListener()}
                            disabled={isSaving || isLoading || !selectedListenerChoice?.compatibility.compatible}
                          >
                            Refresh LHOST
                          </CompactButton>
                        )}
                      </div>
                    </CompactFormRow>
                  )}
                  <CompactFormRow
                    label={field.label}
                    htmlFor={`profile-${field.property}`}
                    hint={field.property === "lhost" && form.listener_uuid
                      ? "This profile value is authoritative. Editing it manually detaches the listener when saved."
                      : undefined}
                  >
                    <CompactInput
                      id={`profile-${field.property}`}
                      value={form[field.property]}
                      onChange={event => setField(field.property, event.target.value)}
                      placeholder={field.placeholder}
                      list={field.property === "os" ? "profile-os-options" : field.property === "arch" ? "profile-arch-options" : undefined}
                    />
                    {field.property === "os" && (
                      <datalist id="profile-os-options">
                        {form.os_options.map(option => <option key={option} value={option} />)}
                      </datalist>
                    )}
                    {field.property === "arch" && (
                      <datalist id="profile-arch-options">
                        {form.arch_options.map(option => <option key={option} value={option} />)}
                      </datalist>
                    )}
                  </CompactFormRow>
                  {field.property === "lhost" && form.listener_uuid && (
                    <div className="profile-listener-source">
                      <dl className="profile-metadata-grid profile-listener-source-metadata">
                        <div><dt>Listener</dt><dd>{selectedListenerChoice?.listener.name || "Unavailable"}</dd></div>
                        <div><dt>UUID</dt><dd title={form.listener_uuid}>{form.listener_uuid}</dd></div>
                        <div><dt>Current listener config</dt><dd>{selectedListenerChoice?.listener.configVersion ?? "—"}</dd></div>
                        <div><dt>Endpoint source</dt><dd>{selectedListenerSnapshot ? formatEndpointSource(selectedListenerSnapshot.source) : "—"}</dd></div>
                        <div><dt>Advertised now</dt><dd>{selectedListenerSnapshot?.endpoint || "Unavailable"}</dd></div>
                        <div><dt>Profile LHOST</dt><dd>{form.lhost || "—"}</dd></div>
                      </dl>
                      <p className="desktop-alert desktop-alert--warning">
                        The relationship is stored by listener UUID, but LHOST is a materialized build value. Listener
                        changes do not propagate automatically; use Refresh LHOST to reapply the current advertisement.
                        Existing implants are never changed. The profile API does not retain the listener config version
                        used at attachment, so the version above is the listener&apos;s current version.
                      </p>
                    </div>
                  )}
                  </React.Fragment>
                ))}

                <fieldset className="desktop-fieldset profile-protocol-fields">
                  <legend>Protocol definition</legend>
                  <CompactFormGrid>
                  <CompactFormRow label="Protocol" htmlFor="profile-protocol">
                    <CompactInput
                      id="profile-protocol"
                      value={form.protocol}
                      onChange={event => {
                        const protocol = event.target.value;
                        const detachesListener = protocol.trim().toLowerCase() !== "http" && Boolean(form.listener_uuid);
                        setForm(current => ({
                          ...current,
                          protocol,
                          ...(protocol.trim().toLowerCase() !== "http" ? { listener_uuid: "" } : {})
                        }));
                        setError("");
                        setNotice(detachesListener
                          ? "Changing away from HTTP will detach the listener when this profile is saved."
                          : "");
                      }}
                      placeholder="http"
                    />
                  </CompactFormRow>

                  <CompactFormRow
                    label="Options (JSON)"
                    htmlFor="profile-options"
                    hint="Includes paths, headers, and protocol-specific values."
                  >
                    <CompactTextArea
                      id="profile-options"
                      value={optionsText}
                      onChange={event => setOptionsText(event.target.value)}
                      rows={10}
                      spellCheck={false}
                    />
                  </CompactFormRow>

                  <CompactFormRow
                    label="New one-time secret"
                    htmlFor="profile-ots"
                    hint="Existing secret values are never returned by the TeamServer."
                  >
                    <div className="inline-control-row">
                      <CompactInput
                        id="profile-ots"
                        type="text"
                        value={otsDraft}
                        onChange={event => {
                          setOTSDraft(event.target.value);
                          if (event.target.value) setClearOTS(false);
                        }}
                        autoComplete="new-password"
                        placeholder={form.ots_configured ? "Leave blank to keep current OTS" : "Optional"}
                      />
                      <CompactButton
                        type="button"
                        variant="secondary"
                        aria-label="Generate a random 16-character one-time secret"
                        onClick={() => {
                          setOTSDraft(generateRandomOTS());
                          setClearOTS(false);
                        }}
                      >
                        Random OTS
                      </CompactButton>
                    </div>
                  </CompactFormRow>

                  <CompactFormRow label="OTS expires at (UTC)" htmlFor="profile-ots-expires" hint="Clear the value to remove expiration.">
                      <CompactInput
                        id="profile-ots-expires"
                        type="datetime-local"
                        value={otsExpiresAt}
                        onChange={event => setOTSExpiresAt(event.target.value)}
                      />
                  </CompactFormRow>

                  {!isCreating && form.ots_configured && (
                    <CompactFormRow label="One-time secret">
                    <label className="compact-check-label danger-check-label">
                      <CompactCheckbox
                        type="checkbox"
                        checked={clearOTS}
                        onChange={event => {
                          setClearOTS(event.target.checked);
                          if (event.target.checked) setOTSDraft("");
                        }}
                      />
                      Clear the currently configured OTS when saving
                    </label>
                    </CompactFormRow>
                  )}

                  {!isCreating && (
                    <dl className="profile-metadata-grid">
                      <div><dt>OTS configured</dt><dd>{form.ots_configured ? "Yes" : "No"}</dd></div>
                      <div><dt>OTS used at</dt><dd>{formatTimestamp(form.ots_used_at)}</dd></div>
                      <div><dt>Config version</dt><dd>{form.config_version || "—"}</dd></div>
                      <div><dt>Created</dt><dd>{formatTimestamp(form.definition_created_at)}</dd></div>
                      <div><dt>Updated</dt><dd>{formatTimestamp(form.definition_updated_at)}</dd></div>
                    </dl>
                  )}
                  </CompactFormGrid>
                </fieldset>
              </CompactFormGrid>
            ) : (
              <div className="empty-desktop-panel">Select an existing profile or create a new one.</div>
            )}

            {error && <p role="alert" className="desktop-alert desktop-alert--error">{error}</p>}
            {notice && <p className="desktop-alert desktop-alert--success">{notice}</p>}

            {(isCreating || original) && (
              <div className="profile-editor-actions">
                {isCreating && <CompactButton type="button" onClick={() => void refresh()} disabled={isSaving}>Cancel</CompactButton>}
                <CompactButton
                  type="button"
                  onClick={() => void (isCreating ? createProfile() : updateProfile())}
                  disabled={isSaving || isLoading}
                  variant="primary"
                >
                  {isSaving ? "Saving…" : isCreating ? "Create Profile" : "Save Changes"}
                </CompactButton>
              </div>
            )}
            </CompactScrollbar>
          </DesktopPanel>
        </div>
    </DesktopModal>
  );
};
