# Salve CLI

Opinionated CLI tools for managing Minecraft mod releases in the Twelve Iterations organization.

## Installation

```bash
# Install dependencies
bun install

# Make the CLI available globally
bun link
```

## Configuration

Create a `salve.config.json` file in your working directory:

```json
{
  "organization": "TwelveIterations",
  "team": "mod-team",
  "repositoriesPath": "/path/to/repositories",
  "excludedRepositories": ["some-docs-repo", "another-excluded-repo"],
  "ide": "intellij-idea-community"
}
```

## Usage

### Authentication

Authenticate with GitHub:

```bash
salve auth github
```

### Fetch Unreleased Commits

Get all unreleased commits across repositories.

This assumes that releases are denoted by a "Set version to ..." commit.

By default, it will use the organization (and optionally team) specified in the configuration.

```bash
salve unreleased --branch 1.20.1
```

### Generate Changelogs

Generate a changelog for a specific repository.

This assumes you use conventional commits, but lets you review, edit and commit the changelog manually on top.

```bash
salve changelog --repo my-mod --branch 1.20.1
```

### Trigger Releases

Trigger release workflow for mods.

This assumes that there is a `publish_release` workflow with inputs for 'neoforge', 'fabric' and 'forge'.

It will dispatch a GitHub workflow to publish releases for the specified mod. If no repo is specified, it will prompt a release for all mods with unreleased changes.

```bash
salve release --branch 1.20.1 --repo my-mod
```

## Commands

- `auth github` - Authenticate with GitHub
- `auth status` - Check authentication status  
- `auth logout` - Logout from GitHub
- `unreleased` - Fetch unreleased commits for repositories
- `changelog` - Generate changelog from commits since last version
- `release` - Trigger release workflow for mods
