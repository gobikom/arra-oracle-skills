#!/usr/bin/env bun

// Build-time define for compiled binaries
declare const IS_COMPILED: boolean;

// Bun runtime check - skip in compiled mode (binary embeds Bun)
try {
  if (!(typeof IS_COMPILED !== 'undefined' && IS_COMPILED) && typeof Bun === 'undefined') {
    console.error(`
❌ oracle-skills requires Bun runtime

You're running with Node.js, but this CLI uses Bun-specific features.

To fix:
  1. Install Bun: curl -fsSL https://bun.sh/install | bash
  2. Run with: bunx oracle-skills install -g -y

Or install the compiled binary (no Bun needed):
  curl -fsSL https://raw.githubusercontent.com/Soul-Brews-Studio/oracle-skills-cli/main/install.sh | bash

More info: https://bun.sh
`);
    process.exit(1);
  }
} catch {
  // IS_COMPILED not defined — running in dev mode, check passed
}

import { program } from 'commander';
import * as p from '@clack/prompts';
import { agents, detectInstalledAgents, getAgentNames } from './agents.js';
import { listSkills, installSkills, uninstallSkills, discoverSkills } from './installer.js';
import { profiles, resolveProfile } from '../profiles.js';
import type { ShellMode } from './fs-utils.js';
import pkg from '../../package.json' with { type: 'json' };

const VERSION = pkg.version;

program
  .name('oracle-skills')
  .description('Install Oracle skills to Claude Code, OpenCode, Cursor, and 11+ AI coding agents')
  .version(VERSION);

// Install command (default)
program
  .command('install', { isDefault: true })
  .description('Install Oracle skills to agents')
  .option('-g, --global', 'Install to user directory instead of project')
  .option('-a, --agent <agents...>', 'Target specific agents (e.g., claude-code, opencode)')
  .option('-s, --skill <skills...>', 'Install specific skills by name')
  .option('-p, --profile <name>', 'Install a skill profile (seed, minimal, standard, full)')
  .option('-l, --list', 'List available skills without installing')
  .option('-y, --yes', 'Skip confirmation prompts')
  .option('--commands', 'Also install command stubs to ~/.claude/commands/')
  .option('--shell', 'Force Bun.$ shell commands (use on Windows to test shell compatibility)')
  .option('--no-shell', 'Force Node.js fs operations (use on Unix if Bun.$ causes issues)')
  .action(async (options) => {
    p.intro(`🔮 Oracle Skills Installer v${VERSION}`);

    try {
      // List mode - just show skills and exit
      if (options.list) {
        await listSkills();
        p.outro('Use --skill <name> to install specific skills');
        return;
      }

      // Determine target agents
      let targetAgents: string[] = options.agent || [];

      if (targetAgents.length === 0) {
        // Auto-detect installed agents
        const detected = detectInstalledAgents();

        if (detected.length > 0) {
          p.log.info(`Detected agents: ${detected.map((a) => agents[a as keyof typeof agents]?.displayName).join(', ')}`);

          if (!options.yes) {
            const useDetected = await p.confirm({
              message: 'Install to detected agents?',
            });

            if (p.isCancel(useDetected)) {
              p.log.info('Cancelled');
              return;
            }

            if (useDetected) {
              targetAgents = detected;
            }
          } else {
            targetAgents = detected;
          }
        }

        // If still no agents, prompt user to select
        if (targetAgents.length === 0) {
          const selected = await p.multiselect({
            message: 'Select agents to install to:',
            options: Object.entries(agents).map(([key, config]) => ({
              value: key,
              label: config.displayName,
              hint: options.global ? config.globalSkillsDir : config.skillsDir,
            })),
            required: true,
          });

          if (p.isCancel(selected)) {
            p.log.info('Cancelled');
            return;
          }

          targetAgents = selected as string[];
        }
      }

      // Validate agent names
      const validAgents = getAgentNames();
      const invalidAgents = targetAgents.filter((a) => !validAgents.includes(a));
      if (invalidAgents.length > 0) {
        p.log.error(`Unknown agents: ${invalidAgents.join(', ')}`);
        p.log.info(`Valid agents: ${validAgents.join(', ')}`);
        return;
      }

      // Determine shell mode
      const shellMode: ShellMode = options.shell ? 'shell'
        : options.noShell ? 'no-shell'
        : 'auto';

      // Validate profile if specified
      if (options.profile && !profiles[options.profile]) {
        p.log.error(`Unknown profile: ${options.profile}`);
        p.log.info(`Available profiles: ${Object.keys(profiles).join(', ')}`);
        return;
      }

      // Install skills
      await installSkills(targetAgents, {
        global: options.global,
        skills: options.skill,
        profile: options.profile,
        yes: options.yes,
        commands: options.commands,
        shellMode,
      });

      p.outro('✨ Oracle skills installed! Restart your agent to activate.');
    } catch (error) {
      p.log.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      process.exit(1);
    }
  });

// Init command — first-time setup with default profile
program
  .command('init')
  .description('First-time setup: install standard profile globally')
  .option('-p, --profile <name>', 'Profile to install (default: standard)', 'standard')
  .option('-y, --yes', 'Skip confirmation prompts')
  .action(async (options) => {
    p.intro(`🔮 Oracle Skills Init v${VERSION}`);

    try {
      const profileName = options.profile;
      if (!profiles[profileName]) {
        p.log.error(`Unknown profile: ${profileName}`);
        p.log.info(`Available: ${Object.keys(profiles).join(', ')}`);
        return;
      }

      // Auto-detect agents
      const detected = detectInstalledAgents();
      if (detected.length === 0) {
        p.log.error('No agents detected. Install Claude Code, Codex, or another supported agent first.');
        return;
      }

      p.log.info(`Detected: ${detected.map((a) => agents[a as keyof typeof agents]?.displayName).join(', ')}`);
      p.log.info(`Profile: ${profileName}`);

      if (!options.yes) {
        const confirmed = await p.confirm({
          message: `Install ${profileName} profile globally?`,
        });

        if (p.isCancel(confirmed) || !confirmed) {
          p.log.info('Cancelled');
          return;
        }
      }

      await installSkills(detected, {
        global: true,
        profile: profileName,
        yes: true,
        commands: true,
      });

      p.outro(`✨ Initialized with ${profileName} profile! Restart your agent to activate.`);
    } catch (error) {
      p.log.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      process.exit(1);
    }
  });

// Uninstall command
program
  .command('uninstall')
  .description('Remove installed Oracle skills')
  .option('-g, --global', 'Uninstall from user directory')
  .option('-a, --agent <agents...>', 'Target specific agents')
  .option('-s, --skill <skills...>', 'Remove specific skills only')
  .option('-y, --yes', 'Skip confirmation prompts')
  .option('--shell', 'Force Bun.$ shell commands')
  .option('--no-shell', 'Force Node.js fs operations')
  .action(async (options) => {
    p.intro(`🔮 Oracle Skills Uninstaller v${VERSION}`);

    try {
      // Determine target agents
      let targetAgents: string[] = options.agent ? [...options.agent] : [];

      // Skip auto-detect if agents specified
      if (targetAgents.length > 0) {
        p.log.info(`Using specified agents: ${targetAgents.join(', ')}`);
      } else {
        const detected = detectInstalledAgents();
        if (detected.length > 0) {
          p.log.info(`Detected agents: ${detected.map((a) => agents[a as keyof typeof agents]?.displayName).join(', ')}`);
          targetAgents = detected;
        }
      }

      if (targetAgents.length === 0) {
        p.log.error('No agents detected. Use --agent to specify.');
        return;
      }

      // Confirm
      if (!options.yes) {
        const skillInfo = options.skill ? `skills: ${options.skill.join(', ')}` : 'all Oracle skills';
        const confirmed = await p.confirm({
          message: `Remove ${skillInfo} from ${targetAgents.length} agent(s)?`,
        });

        if (p.isCancel(confirmed) || !confirmed) {
          p.log.info('Cancelled');
          return;
        }
      }

      const spinner = p.spinner();
      spinner.start('Removing skills');

      // Determine shell mode
      const shellMode: ShellMode = options.shell ? 'shell'
        : options.noShell ? 'no-shell'
        : 'auto';

      const result = await uninstallSkills(targetAgents, {
        global: options.global,
        skills: options.skill,
        yes: options.yes,
        shellMode,
      });

      spinner.stop(`Removed ${result.removed} skills from ${result.agents} agent(s)`);
      p.outro('✨ Skills removed. Restart your agent to apply changes.');
    } catch (error) {
      p.log.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      process.exit(1);
    }
  });

// Agents command
program
  .command('agents')
  .description('List all supported agents')
  .action(() => {
    console.log('\nSupported agents:\n');
    for (const [key, config] of Object.entries(agents)) {
      const installed = config.detectInstalled() ? '✓' : ' ';
      console.log(`  [${installed}] ${key.padEnd(15)} ${config.displayName}`);
    }
    console.log('\n  ✓ = detected on this system\n');
  });

// List installed skills command
program
  .command('list')
  .description('Show installed Oracle skills')
  .option('-g, --global', 'Show global (user-level) skills')
  .option('-a, --agent <agents...>', 'Show skills for specific agents')
  .action(async (options) => {
    const { readdirSync, existsSync } = await import('fs');
    const { join } = await import('path');

    let targetAgents: string[] = options.agent || [];

    if (targetAgents.length === 0) {
      targetAgents = detectInstalledAgents();
    }

    if (targetAgents.length === 0) {
      console.log('\nNo agents detected. Use --agent to specify.\n');
      return;
    }

    console.log('\nInstalled Oracle skills:\n');

    let totalSkills = 0;

    for (const agentName of targetAgents) {
      const agent = agents[agentName as keyof typeof agents];
      if (!agent) continue;

      const skillsDir = options.global
        ? agent.globalSkillsDir
        : join(process.cwd(), agent.skillsDir);

      const scope = options.global ? '(global)' : '(local)';

      if (!existsSync(skillsDir)) {
        console.log(`  ${agent.displayName} ${scope}: (no skills directory)`);
        continue;
      }

      const skillDirs = readdirSync(skillsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
        .map((d) => d.name);

      if (skillDirs.length === 0) {
        console.log(`  ${agent.displayName} ${scope}: (empty)`);
      } else {
        console.log(`  ${agent.displayName} ${scope}: ${skillDirs.length} skills`);
        for (const skill of skillDirs) {
          // Try to read version from SKILL.md
          let version = '';
          const skillMdPath = join(skillsDir, skill, 'SKILL.md');
          if (existsSync(skillMdPath)) {
            try {
              const content = require('fs').readFileSync(skillMdPath, 'utf-8');
              const versionMatch = content.match(/v(\d+\.\d+\.\d+)/);
              if (versionMatch) {
                version = ` (v${versionMatch[1]})`;
              }
            } catch {}
          }
          console.log(`    - ${skill}${version}`);
        }
        totalSkills += skillDirs.length;
      }
      console.log('');
    }

    console.log(`Total: ${totalSkills} skills across ${targetAgents.length} agent(s)\n`);
  });

// Profiles command
program
  .command('profiles')
  .description('List available skill profiles')
  .argument('[name]', 'Show skills in a specific profile')
  .action(async (name?: string) => {
    if (name) {
      // Show specific profile
      const profile = profiles[name];
      if (!profile) {
        console.log(`\nUnknown profile: ${name}`);
        console.log(`Available: ${Object.keys(profiles).join(', ')}\n`);
        return;
      }

      const allSkills = await discoverSkills();
      const allNames = allSkills.map((s) => s.name);
      const resolved = resolveProfile(name, allNames);
      const skillList = resolved || allNames;

      console.log(`\nProfile: ${name}`);
      if (profile.include) {
        console.log(`Type: include (${profile.include.length} skills)\n`);
      } else if (profile.exclude) {
        console.log(`Type: exclude ${profile.exclude.length} skills (${skillList.length} remaining)\n`);
      } else {
        console.log(`Type: full (all ${skillList.length} skills)\n`);
      }

      for (const skill of skillList.sort()) {
        console.log(`  - ${skill}`);
      }
      console.log('');
    } else {
      // List all profiles
      const allSkills = await discoverSkills();
      const allNames = allSkills.map((s) => s.name);

      console.log('\nAvailable profiles:\n');
      for (const [profileName, profile] of Object.entries(profiles)) {
        const resolved = resolveProfile(profileName, allNames);
        const count = resolved ? resolved.length : allNames.length;
        let type = 'all';
        if (profile.include) type = 'include';
        else if (profile.exclude) type = 'exclude';
        console.log(`  ${profileName.padEnd(15)} ${String(count).padStart(2)} skills  (${type})`);
      }
      console.log(`\nUsage: oracle-skills profiles <name>   — show skills in profile`);
      console.log(`       oracle-skills install -g --profile <name> -y\n`);
    }
  });

// About command — version, prereqs, system check
program
  .command('about')
  .description('Show version, check prerequisites, and system status')
  .action(async () => {
    const { existsSync, readdirSync } = await import('fs');
    const { execSync } = await import('child_process');
    const { join } = await import('path');
    const { homedir } = await import('os');

    console.log(`\n  oracle-skills v${VERSION}`);
    console.log(`  Digitized from Nat Weerawan's brain — Soul Brews Studio\n`);

    // Check prereqs
    console.log('  Prerequisites:\n');

    const checks: { name: string; ok: boolean; detail: string }[] = [];

    // Bun
    try {
      const bunVersion = execSync('bun --version', { encoding: 'utf-8' }).trim();
      checks.push({ name: 'Bun', ok: true, detail: `v${bunVersion}` });
    } catch {
      checks.push({ name: 'Bun', ok: false, detail: 'not installed (curl -fsSL https://bun.sh/install | bash)' });
    }

    // Git
    try {
      const gitVersion = execSync('git --version', { encoding: 'utf-8' }).trim().replace('git version ', '');
      checks.push({ name: 'Git', ok: true, detail: `v${gitVersion}` });
    } catch {
      checks.push({ name: 'Git', ok: false, detail: 'not installed' });
    }

    // gh CLI
    try {
      const ghVersion = execSync('gh --version', { encoding: 'utf-8' }).split('\n')[0].replace('gh version ', '').trim();
      checks.push({ name: 'GitHub CLI', ok: true, detail: `v${ghVersion}` });
    } catch {
      checks.push({ name: 'GitHub CLI', ok: false, detail: 'not installed (optional — needed for /trace, /project)' });
    }

    for (const check of checks) {
      const icon = check.ok ? '✓' : '✗';
      console.log(`  ${icon} ${check.name.padEnd(15)} ${check.detail}`);
    }

    // Detected agents
    console.log('\n  Agents:\n');
    const detected = detectInstalledAgents();
    for (const [key, config] of Object.entries(agents)) {
      const isDetected = detected.includes(key);
      if (!isDetected) continue;

      const skillsDir = config.globalSkillsDir;
      let skillCount = 0;
      if (existsSync(skillsDir)) {
        skillCount = readdirSync(skillsDir, { withFileTypes: true })
          .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
          .length;
      }

      const status = skillCount > 0 ? `${skillCount} skills installed` : 'no skills';
      console.log(`  ✓ ${config.displayName.padEnd(18)} ${status}`);
    }

    const notDetected = Object.entries(agents).filter(([key]) => !detected.includes(key));
    if (notDetected.length > 0) {
      console.log(`    (${notDetected.length} more agents supported — run 'oracle-skills agents' to see all)`);
    }

    // Installed profile hint
    const home = homedir();
    const manifestPath = join(home, '.claude/skills/.oracle-skills.json');
    if (existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(await Bun.file(manifestPath).text());
        console.log(`\n  Installed: v${manifest.version} (${manifest.skills?.length || '?'} skills)`);
        console.log(`  Installed at: ${manifest.installedAt}`);
      } catch {}
    } else {
      console.log('\n  Not initialized. Run: oracle-skills init');
    }

    console.log('');
  });

program.parse();
