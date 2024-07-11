#!/usr/bin/env bash

set -eo pipefail

FN="$(npm pkg get name | sed 's/@//g;s/\//-/;s/"//g')-$(npm pkg get version | sed 's/["v]//g').tgz"

package() {
  yarn run test
  yarn run build
  touch dist/yarn.lock
  pushd dist
  yarn pack --filename="$FN"
  mv "$FN" ..
  popd
}

publish() {
  yarn run test
  yarn run build
  pushd dist
  echo -n > yarn.lock
  yarn workspaces focus
  if false && ! [ -r "$FN" ]; then
    echo "File not found: $FN" >&2
    exit 1
  fi
  yarn npm publish --access public
  popd
}

case "$1" in
package)
  package
  ;;
publish)
  publish
  ;;
*)
  echo "Usage: $0 [package|publish]" >&2
  exit 1
esac
