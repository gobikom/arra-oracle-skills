/**
 * Skill profiles — named sets of skills for bulk install/uninstall.
 *
 * - `include` = only install these skills
 * - `exclude` = install all EXCEPT these
 * - Both empty = install everything (same as current default)
 */
export const profiles: Record<string, { include?: string[]; exclude?: string[] }> = {
  core: {
    include: [
      'trace', 'recap', 'rrr', 'forward', 'learn', 'project',
      'who-are-you', 'fyi', 'where-we-are', 'feel',
      'oracle-soul-sync-update', 'oracle',
    ],
  },
  minimal: {
    include: ['trace', 'recap', 'rrr', 'forward', 'fyi'],
  },
  full: {}, // all skills (default behavior)
  'post-awaken': {
    exclude: ['awaken', 'birth'],
  },
};

/**
 * Resolve a profile to a filtered list of skill names.
 * Returns null if no filtering should happen (full profile / unknown).
 */
export function resolveProfile(
  profileName: string,
  allSkillNames: string[]
): string[] | null {
  const profile = profiles[profileName];
  if (!profile) return null;

  if (profile.include && profile.include.length > 0) {
    return profile.include;
  }

  if (profile.exclude && profile.exclude.length > 0) {
    return allSkillNames.filter((s) => !profile.exclude!.includes(s));
  }

  // Both empty — install everything
  return null;
}
