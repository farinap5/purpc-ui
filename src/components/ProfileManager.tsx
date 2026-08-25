import React, { useEffect, useState } from "react";
import { TeamProfile, TeamProfileUpdateKey } from "../api/teamApi";

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
  template: "./template",
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
  { property: "template", apiKey: "TEMPLATE", label: "Template", placeholder: "./template" },
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

const normalizeProfile = (profile: TeamProfile): TeamProfile => ({
  ...profile,
  os_options: profile.os_options?.length ? profile.os_options : [profile.os],
  arch_options: profile.arch_options?.length ? profile.arch_options : [profile.arch],
  protocol: profile.protocol || "generic",
  options: profile.options && typeof profile.options === "object" && !Array.isArray(profile.options) ? profile.options : {},
  ots: "",
  ots_configured: Boolean(profile.ots_configured)
});

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 font-sans text-xs text-gray-300">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded border border-[#3E4044] bg-[#242528] shadow-2xl">
        <header className="flex items-center justify-between border-b border-[#3E4044] bg-[#1C1D1F] px-4 py-3">
          <div>
            <h2 className="font-bold text-gray-100">Implant Profiles</h2>
            <p className="mt-0.5 text-[10px] text-gray-500">Manage TeamServer implant build configurations.</p>
          </div>
          <button type="button" onClick={onClose} className="cursor-pointer rounded px-2 py-1 text-gray-400 hover:bg-[#333] hover:text-white">Close</button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[240px_1fr]">
          <aside className="flex min-h-40 flex-col border-b border-[#3E4044] bg-[#1A1B1D] p-3 md:border-b-0 md:border-r">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-bold text-gray-300">Profiles</span>
              <button type="button" onClick={beginCreate} disabled={isSaving} className="cursor-pointer rounded bg-[#385d8a] px-2 py-1 text-white hover:bg-[#486d9a] disabled:opacity-50">New</button>
            </div>
            <div className="min-h-0 flex-1 space-y-1 overflow-auto">
              {isLoading && profiles.length === 0 && <p className="p-2 text-gray-600">Loading profiles…</p>}
              {!isLoading && profiles.length === 0 && <p className="p-2 text-gray-600">No profiles.</p>}
              {profiles.map(profile => (
                <button
                  key={profile.name}
                  type="button"
                  onClick={() => void loadProfile(profile.name)}
                  disabled={isSaving}
                  className={`w-full cursor-pointer rounded border px-2 py-2 text-left disabled:opacity-50 ${
                    !isCreating && selectedName === profile.name
                      ? "border-[#486d9a] bg-[#385d8a] text-white"
                      : "border-[#303236] bg-[#242528] text-gray-300 hover:bg-[#303236]"
                  }`}
                >
                  <span className="block truncate font-bold">{profile.name}</span>
                  <span className="mt-0.5 block truncate text-[10px] opacity-60">{profile.type} · {profile.os}/{profile.arch}</span>
                </button>
              ))}
            </div>
            <button type="button" onClick={() => void refresh()} disabled={isLoading || isSaving} className="mt-2 cursor-pointer rounded border border-[#3E4044] px-2 py-1.5 text-gray-400 hover:bg-[#303236] hover:text-white disabled:opacity-50">Refresh</button>
          </aside>

          <main className="min-h-0 overflow-auto p-4">
            <div className="mb-4 flex items-end justify-between border-b border-[#333] pb-3">
              <div>
                <h3 className="font-bold text-gray-100">{isCreating ? "Create profile" : original ? original.name : "Select a profile"}</h3>
                {original && <p className="mt-0.5 text-[10px] text-gray-500">Profile names cannot be changed after creation.</p>}
              </div>
              {!isCreating && original && (
                <div className="flex gap-2">
                  <button type="button" onClick={() => void duplicateProfile()} disabled={isSaving || isLoading} className="cursor-pointer rounded border border-[#486d9a] bg-[#385d8a]/30 px-3 py-1.5 text-blue-200 hover:bg-[#385d8a]/60 disabled:opacity-50">Duplicate</button>
                  <button type="button" onClick={() => void deleteProfile()} disabled={isSaving} className="cursor-pointer rounded border border-red-900 bg-red-950/30 px-3 py-1.5 text-red-300 hover:bg-red-950/60 disabled:opacity-50">Delete</button>
                </div>
              )}
            </div>

            {(isCreating || original) ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="sm:col-span-2">
                  <span className="mb-1 block text-gray-400">Name</span>
                  <input
                    value={form.name}
                    onChange={event => setField("name", event.target.value)}
                    readOnly={!isCreating}
                    placeholder="profile-name"
                    className="w-full rounded border border-[#444] bg-[#17181A] px-3 py-2 text-white outline-none transition focus:border-violet-400 read-only:cursor-not-allowed read-only:text-gray-500"
                  />
                </label>
                {editableFields.map(field => (
                  <label key={field.property} className={field.property === "template" || field.property === "public_key" ? "sm:col-span-2" : ""}>
                    <span className="mb-1 block text-gray-400">{field.label}</span>
                    <input
                      value={form[field.property]}
                      onChange={event => setField(field.property, event.target.value)}
                      placeholder={field.placeholder}
                      list={field.property === "os" ? "profile-os-options" : field.property === "arch" ? "profile-arch-options" : undefined}
                      className="w-full rounded border border-[#444] bg-[#17181A] px-3 py-2 font-mono text-white outline-none transition focus:border-violet-400"
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
                  </label>
                ))}

                <section className="space-y-3 rounded border border-[#3A3B3E] bg-[#1C1D1F] p-3 sm:col-span-2">
                  <div>
                    <h4 className="font-bold text-gray-200">Protocol definition</h4>
                    <p className="mt-0.5 text-[10px] text-gray-500">Protocol-specific values stay separate from the generic builder profile.</p>
                  </div>

                  <label className="block">
                    <span className="mb-1 block text-gray-400">Protocol</span>
                    <input
                      value={form.protocol}
                      onChange={event => setForm(current => ({ ...current, protocol: event.target.value }))}
                      placeholder="http"
                      className="w-full rounded border border-[#444] bg-[#17181A] px-3 py-2 font-mono text-white outline-none transition focus:border-violet-400"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-gray-400">Options (JSON)</span>
                    <textarea
                      value={optionsText}
                      onChange={event => setOptionsText(event.target.value)}
                      rows={10}
                      spellCheck={false}
                      className="w-full resize-y rounded border border-[#444] bg-[#111214] px-3 py-2 font-mono text-[11px] leading-5 text-gray-200 outline-none transition focus:border-violet-400"
                    />
                    <span className="mt-1 block text-[10px] text-gray-500">All options are editable here, including path, headers, and protocol-specific values.</span>
                  </label>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label>
                      <span className="mb-1 block text-gray-400">New one-time secret</span>
                      <input
                        type="password"
                        value={otsDraft}
                        onChange={event => {
                          setOTSDraft(event.target.value);
                          if (event.target.value) setClearOTS(false);
                        }}
                        autoComplete="new-password"
                        placeholder={form.ots_configured ? "Leave blank to keep current OTS" : "Optional"}
                        className="w-full rounded border border-[#444] bg-[#17181A] px-3 py-2 font-mono text-white outline-none transition focus:border-violet-400"
                      />
                      <span className="mt-1 block text-[10px] text-gray-500">Existing secret values are never returned by the TeamServer.</span>
                    </label>

                    <label>
                      <span className="mb-1 block text-gray-400">OTS expires at (UTC)</span>
                      <input
                        type="datetime-local"
                        value={otsExpiresAt}
                        onChange={event => setOTSExpiresAt(event.target.value)}
                        className="w-full rounded border border-[#444] bg-[#17181A] px-3 py-2 font-mono text-white outline-none transition focus:border-violet-400"
                      />
                      <span className="mt-1 block text-[10px] text-gray-500">Clear the value to remove the expiration.</span>
                    </label>
                  </div>

                  {!isCreating && form.ots_configured && (
                    <label className="flex cursor-pointer items-center gap-2 rounded border border-red-950/70 bg-red-950/20 px-3 py-2 text-red-300">
                      <input
                        type="checkbox"
                        checked={clearOTS}
                        onChange={event => {
                          setClearOTS(event.target.checked);
                          if (event.target.checked) setOTSDraft("");
                        }}
                        className="accent-violet-500"
                      />
                      Clear the currently configured OTS when saving
                    </label>
                  )}

                  {!isCreating && (
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded border border-[#333] bg-[#17181A] p-3 text-[10px] sm:grid-cols-3">
                      <div><dt className="text-gray-500">OTS configured</dt><dd className="mt-0.5 text-gray-200">{form.ots_configured ? "Yes" : "No"}</dd></div>
                      <div><dt className="text-gray-500">OTS used at</dt><dd className="mt-0.5 text-gray-200">{formatTimestamp(form.ots_used_at)}</dd></div>
                      <div><dt className="text-gray-500">Config version</dt><dd className="mt-0.5 text-gray-200">{form.config_version || "—"}</dd></div>
                      <div><dt className="text-gray-500">Created</dt><dd className="mt-0.5 text-gray-200">{formatTimestamp(form.definition_created_at)}</dd></div>
                      <div><dt className="text-gray-500">Updated</dt><dd className="mt-0.5 text-gray-200">{formatTimestamp(form.definition_updated_at)}</dd></div>
                    </dl>
                  )}
                </section>
              </div>
            ) : (
              <div className="flex min-h-56 items-center justify-center rounded border border-dashed border-[#3A3B3E] text-gray-600">Select an existing profile or create a new one.</div>
            )}

            {error && <p className="mt-3 rounded border border-red-900/70 bg-red-950/30 p-2 text-red-300">{error}</p>}
            {notice && <p className="mt-3 rounded border border-emerald-900/70 bg-emerald-950/20 p-2 text-emerald-300">{notice}</p>}

            {(isCreating || original) && (
              <div className="mt-4 flex justify-end gap-2 border-t border-[#333] pt-3">
                {isCreating && <button type="button" onClick={() => void refresh()} disabled={isSaving} className="cursor-pointer rounded border border-[#444] px-3 py-2 text-gray-300 hover:bg-[#333] disabled:opacity-50">Cancel</button>}
                <button
                  type="button"
                  onClick={() => void (isCreating ? createProfile() : updateProfile())}
                  disabled={isSaving || isLoading}
                  className="cursor-pointer rounded bg-[#385d8a] px-4 py-2 font-bold text-white hover:bg-[#486d9a] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSaving ? "Saving…" : isCreating ? "Create Profile" : "Save Changes"}
                </button>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
};
