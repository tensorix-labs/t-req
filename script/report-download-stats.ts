#!/usr/bin/env bun

const GITHUB_API = 'https://api.github.com';
const POSTHOG_API = 'https://us.i.posthog.com/capture';
const REPO = 'tensorix-labs/t-req';

interface GitHubAsset {
  name: string;
  download_count: number;
}

interface GitHubRelease {
  tag_name: string;
  assets: GitHubAsset[];
}

interface PlatformBreakdown {
  'darwin-arm64': number;
  'darwin-x64': number;
  'linux-arm64': number;
  'linux-x64': number;
  'windows-x64': number;
}

function parseArgs(): { dryRun: boolean } {
  const args = process.argv.slice(2);
  let dryRun = false;

  for (const arg of args) {
    if (arg === '--dry-run' || arg === '-n') {
      dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      printHelp();
      process.exit(1);
    }
  }

  return { dryRun };
}

function printHelp(): void {
  console.log(`
Usage: bun run script/report-download-stats.ts [options]

Options:
  --dry-run, -n    Show what would be sent without posting to PostHog
  --help, -h       Show this help message

Environment:
  POSTHOG_API_KEY  Required PostHog project API key
  GITHUB_TOKEN     Optional GitHub token for higher rate limits
`);
}

function detectPlatform(assetName: string): keyof PlatformBreakdown | null {
  // Match patterns like: treq-0.3.5-darwin-arm64.tar.gz
  const platforms: Array<keyof PlatformBreakdown> = [
    'darwin-arm64',
    'darwin-x64',
    'linux-arm64',
    'linux-x64',
    'windows-x64'
  ];

  for (const platform of platforms) {
    if (assetName.includes(platform)) {
      return platform;
    }
  }

  return null;
}

async function fetchReleases(): Promise<GitHubRelease[]> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };

  const githubToken = process.env.GITHUB_TOKEN;
  if (githubToken) {
    headers['Authorization'] = `Bearer ${githubToken}`;
  }

  const releases: GitHubRelease[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const url = `${GITHUB_API}/repos/${REPO}/releases?per_page=${perPage}&page=${page}`;
    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const pageReleases: GitHubRelease[] = await response.json();
    if (pageReleases.length === 0) {
      break;
    }

    releases.push(...pageReleases);
    page++;

    // Safety limit
    if (page > 10) {
      break;
    }
  }

  return releases;
}

function aggregateDownloads(releases: GitHubRelease[]): {
  total: number;
  latestVersion: string;
  breakdown: PlatformBreakdown;
} {
  const breakdown: PlatformBreakdown = {
    'darwin-arm64': 0,
    'darwin-x64': 0,
    'linux-arm64': 0,
    'linux-x64': 0,
    'windows-x64': 0
  };

  let total = 0;
  let latestVersion = '';

  // Filter to app-v* releases only
  const appReleases = releases.filter((r) => r.tag_name.startsWith('app-v'));

  // Sort by version to find latest (tags are like app-v0.3.5)
  appReleases.sort((a, b) => {
    const versionA = a.tag_name.replace('app-v', '');
    const versionB = b.tag_name.replace('app-v', '');
    return versionB.localeCompare(versionA, undefined, { numeric: true });
  });

  const latestRelease = appReleases[0];
  if (latestRelease) {
    latestVersion = latestRelease.tag_name.replace('app-v', '');
  }

  for (const release of appReleases) {
    for (const asset of release.assets) {
      const platform = detectPlatform(asset.name);
      if (platform) {
        breakdown[platform] += asset.download_count;
        total += asset.download_count;
      }
    }
  }

  return { total, latestVersion, breakdown };
}

async function postToPostHog(
  apiKey: string,
  data: { total: number; latestVersion: string; breakdown: PlatformBreakdown },
  dryRun: boolean
): Promise<void> {
  const event = {
    api_key: apiKey,
    event: 'release_downloads_snapshot',
    distinct_id: 't-req-stats-collector',
    properties: {
      total_downloads: data.total,
      latest_version: data.latestVersion,
      downloads_darwin_arm64: data.breakdown['darwin-arm64'],
      downloads_darwin_x64: data.breakdown['darwin-x64'],
      downloads_linux_arm64: data.breakdown['linux-arm64'],
      downloads_linux_x64: data.breakdown['linux-x64'],
      downloads_windows_x64: data.breakdown['windows-x64']
    }
  };

  if (dryRun) {
    console.log('\n[dry-run] Would POST to PostHog:');
    console.log(JSON.stringify(event, null, 2));
    return;
  }

  const response = await fetch(POSTHOG_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(event)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`PostHog API error: ${response.status} ${response.statusText}\n${text}`);
  }

  console.log('  Posted event to PostHog');
}

async function main(): Promise<void> {
  const { dryRun } = parseArgs();

  console.log('Download Stats Reporter');
  console.log('=======================');

  if (dryRun) {
    console.log('[DRY RUN MODE]');
  }

  // Check for PostHog API key
  const posthogKey = process.env.POSTHOG_API_KEY ?? '';
  if (!posthogKey && !dryRun) {
    console.error('Error: POSTHOG_API_KEY environment variable is required');
    process.exit(1);
  }

  // Fetch releases from GitHub
  console.log('\nFetching releases from GitHub...');
  const releases = await fetchReleases();
  console.log(`  Found ${releases.length} total releases`);

  const appReleases = releases.filter((r) => r.tag_name.startsWith('app-v'));
  console.log(`  Found ${appReleases.length} app releases`);

  // Aggregate download stats
  console.log('\nAggregating download stats...');
  const stats = aggregateDownloads(releases);

  console.log(`  Total downloads: ${stats.total}`);
  console.log(`  Latest version: ${stats.latestVersion}`);
  console.log('  Breakdown:');
  for (const [platform, count] of Object.entries(stats.breakdown)) {
    console.log(`    ${platform}: ${count}`);
  }

  // Post to PostHog
  console.log('\nPosting to PostHog...');
  await postToPostHog(dryRun ? 'dry-run-key' : posthogKey, stats, dryRun);

  console.log('\n=======================');
  if (dryRun) {
    console.log('Dry run complete. No data was sent.');
  } else {
    console.log('Stats reported successfully!');
  }
}

main().catch((error) => {
  console.error('Failed to report stats:', error);
  process.exit(1);
});
