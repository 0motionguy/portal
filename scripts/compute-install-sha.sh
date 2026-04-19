#!/usr/bin/env bash
# Prints the values to paste into web/public/install and web/public/install.ps1
# for a given release tag.
#
# Usage:
#   scripts/compute-install-sha.sh v0.1.1
#
# Prerequisite: the tag must already exist on the 0motionguy/portal GitHub repo
# (`git push --tags` + `gh release create v0.1.1 --generate-notes`). GitHub
# auto-generates the source tarball at the archive URL below; the SHA256 is
# stable once the tag is created.

set -euo pipefail

tag="${1:-}"
if [ -z "$tag" ]; then
  printf 'usage: %s <tag>\n' "$0" >&2
  exit 2
fi

url="https://github.com/0motionguy/portal/archive/refs/tags/${tag}.tar.gz"

printf '# Fetching %s\n' "$url" >&2
sha="$(curl -fsSL "$url" | sha256sum | cut -d' ' -f1)"

cat <<EOF
# Paste into web/public/install:
REPO_REF="${tag}"
REPO_TARBALL_SHA256="${sha}"

# Paste into web/public/install.ps1:
\$RepoRef           = '${tag}'
\$RepoTarballSha256 = '${sha}'

# Verify matches upstream (human spot-check):
#   curl -fsSL ${url} | sha256sum
EOF
