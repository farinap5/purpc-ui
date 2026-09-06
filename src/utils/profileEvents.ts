import { TeamEvents, type TeamEnvelope, type TeamProfile } from "../api/teamApi.ts";

export const sortTeamProfiles = (profiles: TeamProfile[]) =>
  [...profiles].sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));

export const upsertTeamProfile = (profiles: TeamProfile[], profile: TeamProfile) =>
  sortTeamProfiles([
    ...profiles.filter(item => item.name !== profile.name),
    profile
  ]);

/**
 * Profile create/update events contain the complete authoritative profile.
 * Replacing the cached item is intentional: relationship fields must never be
 * partially merged with an older listener attachment.
 */
export const reduceProfileEvent = (profiles: TeamProfile[], event: TeamEnvelope) => {
  if (event.type === TeamEvents.profileCreated || event.type === TeamEvents.profileUpdated) {
    const profile = event.data as TeamProfile | undefined;
    return profile?.name ? upsertTeamProfile(profiles, profile) : profiles;
  }

  if (event.type === TeamEvents.profileDeleted) {
    const name = (event.data as { name?: string } | undefined)?.name;
    return name ? profiles.filter(profile => profile.name !== name) : profiles;
  }

  return profiles;
};
