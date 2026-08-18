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

type EditableProfileKey = Exclude<keyof TeamProfile, "name">;

const defaultProfile = (): TeamProfile => ({
  name: "",
  type: "impl",
  lhost: "",
  os: "linux",
  arch: "amd64",
  uri: "/",
  ua: "Mozilla PurpCMD",
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
  { property: "uri", apiKey: "URI", label: "Callback URI", placeholder: "/" },
  { property: "ua", apiKey: "UA", label: "User agent", placeholder: "Mozilla PurpCMD" },
  { property: "output", apiKey: "OUTPUT", label: "Output", placeholder: "implant" },
  { property: "template", apiKey: "TEMPLATE", label: "Template", placeholder: "./template" },
  { property: "public_key", apiKey: "PUBLICKEY", label: "Public key", placeholder: "server.pub" }
];

const sortProfiles = (profiles: TeamProfile[]) => [...profiles].sort((left, right) => left.name.localeCompare(right.name));

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

  const loadProfile = async (name: string) => {
    if (!name) return;
    setIsLoading(true);
    setError("");
    setNotice("");
    try {
      const profile = await onGet(name);
      setOriginal(profile);
      setForm(profile);
      setSelectedName(profile.name);
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
        setSelectedName(profile.name);
        setOriginal(profile);
        setForm(profile);
        setIsCreating(false);
      } else {
        setSelectedName("");
        setOriginal(null);
        setForm(defaultProfile());
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

  const setField = (property: keyof TeamProfile, value: string) => {
    setForm(current => ({ ...current, [property]: value }));
    setError("");
    setNotice("");
  };

  const validate = () => {
    if (!form.name.trim()) return "Profile name is required.";
    if (!form.type.trim()) return "Payload type is required.";
    if (!form.os.trim()) return "Operating system is required.";
    if (!form.arch.trim()) return "Architecture is required.";
    if (!form.uri.startsWith("/")) return "Callback URI must begin with /.";
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
      const created = await onCreate({ ...form, name: form.name.trim() });
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
    if (changes.length === 0) {
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
      await refresh();
      setNotice(`Profile ${deletedName} deleted.`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
    } finally {
      setIsSaving(false);
    }
  };

  const beginCreate = () => {
    setSelectedName("");
    setOriginal(null);
    setForm(defaultProfile());
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
                <button type="button" onClick={() => void deleteProfile()} disabled={isSaving} className="cursor-pointer rounded border border-red-900 bg-red-950/30 px-3 py-1.5 text-red-300 hover:bg-red-950/60 disabled:opacity-50">Delete</button>
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
                  <label key={field.property} className={field.property === "ua" || field.property === "template" || field.property === "public_key" ? "sm:col-span-2" : ""}>
                    <span className="mb-1 block text-gray-400">{field.label}</span>
                    <input
                      value={form[field.property]}
                      onChange={event => setField(field.property, event.target.value)}
                      placeholder={field.placeholder}
                      className="w-full rounded border border-[#444] bg-[#17181A] px-3 py-2 font-mono text-white outline-none transition focus:border-violet-400"
                    />
                  </label>
                ))}
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
