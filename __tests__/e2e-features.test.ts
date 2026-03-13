import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { readdir, rm, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { tmpdir } from "os";
import { agents } from "../src/cli/agents";
import { installSkills, uninstallSkills, discoverSkills } from "../src/cli/installer";
import { profiles, features, resolveProfileWithFeatures } from "../src/profiles";
import type { AgentConfig } from "../src/cli/types";

const TEST_DIR = join(tmpdir(), `oracle-skills-feat-${Date.now()}`);
const SKILLS_DIR = join(TEST_DIR, "skills");
const COMMANDS_DIR = join(TEST_DIR, "commands");
const TEST_AGENT = "test-feat" as any;

const testAgentConfig: AgentConfig = {
  name: "test-feat",
  displayName: "Test Features",
  skillsDir: "test-skills",
  globalSkillsDir: SKILLS_DIR,
  commandsDir: "test-commands",
  globalCommandsDir: COMMANDS_DIR,
  useFlatFiles: true,
  detectInstalled: () => true,
};

beforeAll(async () => {
  await mkdir(TEST_DIR, { recursive: true });
  (agents as any)[TEST_AGENT] = testAgentConfig;
});

afterAll(async () => {
  delete (agents as any)[TEST_AGENT];
  if (existsSync(TEST_DIR)) {
    await rm(TEST_DIR, { recursive: true });
  }
});

async function listSkillDirs(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((d) => d.isDirectory() && !d.name.startsWith("."))
    .map((d) => d.name)
    .sort();
}

async function cleanup() {
  if (existsSync(SKILLS_DIR)) {
    await rm(SKILLS_DIR, { recursive: true });
    await mkdir(SKILLS_DIR, { recursive: true });
  }
  if (existsSync(COMMANDS_DIR)) {
    await rm(COMMANDS_DIR, { recursive: true });
    await mkdir(COMMANDS_DIR, { recursive: true });
  }
}

describe("e2e: install with profile + feature", () => {
  beforeEach(cleanup);

  it("minimal + soul installs combined set", async () => {
    await installSkills([TEST_AGENT], {
      global: true,
      profile: "minimal",
      features: ["soul"],
      yes: true,
    });

    const installed = await listSkillDirs(SKILLS_DIR);
    const allSkills = await discoverSkills();
    const allNames = allSkills.map((s) => s.name);
    const expected = resolveProfileWithFeatures("minimal", ["soul"], allNames);

    expect(installed.length).toBe(expected.length);
    for (const name of expected) {
      expect(installed).toContain(name);
    }
  });

  it("standard + soul + creator installs combined set", async () => {
    await installSkills([TEST_AGENT], {
      global: true,
      profile: "standard",
      features: ["soul", "creator"],
      yes: true,
    });

    const installed = await listSkillDirs(SKILLS_DIR);
    const allSkills = await discoverSkills();
    const allNames = allSkills.map((s) => s.name);
    const expected = resolveProfileWithFeatures("standard", ["soul", "creator"], allNames);

    expect(installed.length).toBe(expected.length);
    for (const name of expected) {
      expect(installed).toContain(name);
    }
  });

  it("profile + feature cleans up non-matching skills", async () => {
    // Install full first
    await installSkills([TEST_AGENT], {
      global: true,
      yes: true,
    });

    const allSkills = await discoverSkills();
    let installed = await listSkillDirs(SKILLS_DIR);
    expect(installed.length).toBe(allSkills.length);

    // Switch to minimal + soul
    await installSkills([TEST_AGENT], {
      global: true,
      profile: "minimal",
      features: ["soul"],
      yes: true,
    });

    installed = await listSkillDirs(SKILLS_DIR);
    const allNames = allSkills.map((s) => s.name);
    const expected = resolveProfileWithFeatures("minimal", ["soul"], allNames);

    expect(installed.length).toBe(expected.length);
  });
});

describe("e2e: feature-only install (additive)", () => {
  beforeEach(cleanup);

  it("feature-only installs just those skills", async () => {
    await installSkills([TEST_AGENT], {
      global: true,
      features: ["soul"],
      yes: true,
    });

    const installed = await listSkillDirs(SKILLS_DIR);
    const soulSkills = features.soul;

    expect(installed.length).toBe(soulSkills.length);
    for (const name of soulSkills) {
      expect(installed).toContain(name);
    }
  });

  it("feature-only does NOT remove existing skills", async () => {
    // Install standard first
    await installSkills([TEST_AGENT], {
      global: true,
      profile: "standard",
      yes: true,
    });

    const standardCount = profiles.standard.include!.length;

    // Add soul feature (additive)
    await installSkills([TEST_AGENT], {
      global: true,
      features: ["soul"],
      yes: true,
    });

    const installed = await listSkillDirs(SKILLS_DIR);
    // Should have at least standard count (soul may overlap)
    expect(installed.length).toBeGreaterThanOrEqual(standardCount);
    // Soul skills should all be present
    for (const name of features.soul) {
      expect(installed).toContain(name);
    }
    // Standard skills should still be present
    for (const name of profiles.standard.include!) {
      expect(installed).toContain(name);
    }
  });
});

describe("e2e: uninstall with feature", () => {
  beforeEach(cleanup);

  it("uninstall --feature removes feature skills", async () => {
    // Install standard + soul
    await installSkills([TEST_AGENT], {
      global: true,
      profile: "standard",
      features: ["soul"],
      yes: true,
    });

    // Uninstall soul feature
    await uninstallSkills([TEST_AGENT], {
      global: true,
      skills: [...features.soul],
      yes: true,
    });

    const installed = await listSkillDirs(SKILLS_DIR);
    // Soul-only skills should be gone (unless also in standard)
    const standardSet = new Set(profiles.standard.include!);
    const soulOnly = features.soul.filter((s) => !standardSet.has(s));
    for (const name of soulOnly) {
      expect(installed).not.toContain(name);
    }
  });
});
