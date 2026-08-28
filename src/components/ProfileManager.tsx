import React, { useEffect, useState } from "react";
import { TeamProfile, TeamProfileUpdateKey } from "../api/teamApi";
import {
  CompactButton,
  CompactCheckbox,
  CompactFormGrid,
  CompactFormRow,
  CompactInput,
  CompactScrollbar,
  CompactTextArea,
  DesktopModal,
  DesktopPanel,
  PanelHeader
} from "./desktop";

interface ProfileManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onList: () => Promise<TeamProfile[]>;
  onGet: (name: string) => Promise<TeamProfile>;
  onCreate: (profile: TeamProfile) => Promise<TeamProfile>;
  onUpdate: (name: string, key: TeamProfileUpdateKey, value: string) => Promise<TeamProfile>;
  onDelete: (name: string) => Promise<void>;
}

type EditableProfileKey = Exclude<
  keyof TeamProfile,
  | "name"
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
>;

const defaultProfile = (): TeamProfile => ({
  name: "",
  type: "impl",
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

export const ProfileManager: React.FC<ProfileManagerProps> = ({
  isOpen,
  onClose,
  onList,
  onGet,
  onCreate,
  onUpdate,
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

  if (!isOpen) return null;

  const setField = (property: "name" | EditableProfileKey, value: string) => {
    setForm(current => ({ ...current, [property]: value }));
    setError("");
    setNotice("");
  };

  const validate = () => {
    if (!form.name.trim()) return "Profile name is required.";
    if (!form.type.trim()) return "Payload type is required.";
    if (!form.os.trim()) return "Operating system is required.";
    if (!form.arch.trim()) return "Architecture is required.";
    if (!form.protocol.trim()) return "Protocol is required.";
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
      const created = await onCreate({
        ...form,
        name: form.name.trim(),
        os_options: Array.from(new Set([...form.os_options, form.os])),
        arch_options: Array.from(new Set([...form.arch_options, form.arch])),
        protocol: form.protocol.trim(),
        options: JSON.parse(optionsText) as Record<string, unknown>,
        ots: otsDraft || undefined,
        ots_expires_at: fromUTCInputValue(otsExpiresAt) || undefined
      });
      await refresh(created.name);
      setNotice(`Profile ${created.name} created.`);
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

    const changes = editableFields.filter(field => form[field.property] !== original[field.property]);
    const parsedOptions = JSON.parse(optionsText) as Record<string, unknown>;
    const protocolChanged = form.protocol.trim() !== original.protocol;
    const optionsChanged = JSON.stringify(parsedOptions) !== JSON.stringify(original.options || {});
    const expiry = fromUTCInputValue(otsExpiresAt);
    const originalExpiry = fromUTCInputValue(toUTCInputValue(original.ots_expires_at));
    const expiryChanged = expiry !== originalExpiry;
    const otsChanged = otsDraft !== "";
    const clearExistingOTS = clearOTS && original.ots_configured;
    if (changes.length === 0 && !protocolChanged && !optionsChanged && !expiryChanged && !otsChanged && !clearExistingOTS) {
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
      if (protocolChanged) updated = await onUpdate(original.name, "PROTOCOL", form.protocol.trim());
      if (optionsChanged) updated = await onUpdate(original.name, "OPTIONS", JSON.stringify(parsedOptions));
      if (expiryChanged) updated = await onUpdate(original.name, "OTS_EXPIRES_AT", expiry);
      if (clearExistingOTS) updated = await onUpdate(original.name, "OTS_CLEAR", "");
      if (otsChanged) updated = await onUpdate(original.name, "OTS", otsDraft);
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
      const created = await onCreate({
        ...original,
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
      await refresh(created.name);
      setNotice(`Profile ${created.name} created from ${original.name}.`);
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
                  <small>{profile.type} · {profile.os}/{profile.arch}</small>
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
                {editableFields.map(field => (
                  <CompactFormRow key={field.property} label={field.label} htmlFor={`profile-${field.property}`}>
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
                ))}

                <fieldset className="desktop-fieldset profile-protocol-fields">
                  <legend>Protocol definition</legend>
                  <CompactFormGrid>
                  <CompactFormRow label="Protocol" htmlFor="profile-protocol">
                    <CompactInput
                      id="profile-protocol"
                      value={form.protocol}
                      onChange={event => setForm(current => ({ ...current, protocol: event.target.value }))}
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
                      <CompactInput
                        id="profile-ots"
                        type="password"
                        value={otsDraft}
                        onChange={event => {
                          setOTSDraft(event.target.value);
                          if (event.target.value) setClearOTS(false);
                        }}
                        autoComplete="new-password"
                        placeholder={form.ots_configured ? "Leave blank to keep current OTS" : "Optional"}
                      />
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
