// javascript version of build-release.sh

var os = require('os');
var fs = require('fs');
var path = require('path');
var child_process = require('child_process');

var Fiber = require('fibers');
var Future = require('fibers/future');
var _ = require('underscore');
var files = require('../../tools/files.js');
var warehouse = require('../../tools/warehouse.js');
var SHA1 = require("./tinySHA1.r4");

// runs a command, returns stdout.
var execFileSync = function (binary, args) {
  return Future.wrap(function(cb) {
    var cb2 = function(err, stdout, stderr) { cb(err, stdout); };
    child_process.execFile(binary, args, cb2);
  })().wait();
};

// Copy a file or directory (and its contents) to the given
// destination directory.
var cp = function (src, dst) {
  if (fs.existsSync(dst) && fs.statSync(dst).isDirectory()) {
    dst = path.join(dst, path.basename(src));
  }
  if (fs.existsSync(src) && fs.statSync(src).isDirectory()) {
    files.cp_r(src, dst);
  } else {
    var contents = fs.readFileSync(src);
    fs.writeFileSync(dst, contents);
  }
};

var removeMeteorLocalDirs = function (filepath) {
  var stat = fs.statSync(filepath);
  if (stat.isDirectory()) {
    var localpath = path.join(filepath, '.meteor', 'local');
    if (fs.existsSync(localpath)) {
      files.rm_recursive(localpath);
    }
    _.each(fs.readdirSync(filepath), function (name) {
        removeMeteorLocalDirs(path.join(filepath, name));
    });
  }
};

//---------------------------------------------------------------------------

// Returns tools version
var buildToolsTree = function (TARGET_DIR) {
  // This script fills TARGET_DIR with what should go into
  //     ~/.meteor/tools/VERSION
  // It does not set up the top-level springboard file in
  // ~/.meteor/tools or the ~/.meteor/meteor symlink.

  console.log('Setting up tools tree in %s', TARGET_DIR);

  // Make sure that the entire contents TARGET_DIR is what we placed
  // there
  if (fs.existsSync(TARGET_DIR)) {
    throw new Error('Target directory already exists: ' + TARGET_DIR);
  }

  // make sure dev bundle exists before trying to install
  //zzz ./meteor --get-ready
  // XXX ENSURE get-ready called

  //zzz function CPR {
  //zzz    tar -c --exclude .meteor/local "$1" | tar -x -C "$2"
  //zzz }

  // The tools starts as a copy of the dev bundle.
  //zzz cp -a dev_bundle "$TARGET_DIR"
  console.log("# Copying dev_bundle");
  cp('dev_bundle', TARGET_DIR);

  // Copy over files and directories that we want in the tarball. Keep this list
  // synchronized with the files used in the TOOLS_VERSION calculation below. The
  // "meteor" script file contains the version number of the dev bundle, so we
  // include that instead of the (arch-specific) bundle itself in sha calculation.
  cp('LICENSE.txt', TARGET_DIR);
  cp('meteor', path.join(TARGET_DIR, 'bin'));
  if (process.platform === 'win32') {
    cp('meteor.bat', path.join(TARGET_DIR, 'bin'));
  }

  console.log("# Copying tools");
  cp('tools', TARGET_DIR);
  console.log("# Copying examples");
  cp('examples', TARGET_DIR);

  // Script is not actually used, but it's nice to distribute it for users.
  //zzz cp scripts/admin/launch-meteor "$TARGET_DIR"
  cp(path.join('scripts', 'admin', 'launch-meteor'), TARGET_DIR);

  // Trim tests and unfinished examples.
  console.log("# Trimming tests and unfinished examples");
  files.rm_recursive(path.join(TARGET_DIR, 'tools', 'tests'));
  files.rm_recursive(path.join(TARGET_DIR, 'examples', 'unfinished'));
  files.rm_recursive(path.join(TARGET_DIR, 'examples', 'other'));

  // Avoid releasing any .meteor/local directories
  removeMeteorLocalDirs(TARGET_DIR);

  // mark directory with current git sha
  //zzz git rev-parse HEAD > "$TARGET_DIR/.git_version.txt"
  var gitVersion = execFileSync('git', ['rev-parse', 'HEAD']);
  fs.writeFileSync(path.join(TARGET_DIR, '.git_version.txt'));

  // generate tools version: directory hash that depends only on file contents and
  // permissions but nothing else, eg modification time or build outputs. This
  // version is treated fully opaquely, so to make it a little more attractive we
  // just use the first ten characters.
  process.stdout.write("Computing tools version... ");
  //zzz TOOLS_VERSION=$(git ls-tree HEAD \
  //zzz   LICENSE.txt meteor tools examples scripts/admin/launch-meteor \
  //zzz  | shasum | cut -c 1-10) # shasum's output looks like: 'SHA -'

  var output = execFileSync('git', ['ls-tree', 'HEAD',
    'LICENSE.txt', 'meteor', 'tools', 'examples',
    path.join('scripts', 'admin', 'launch-meteor')
  ]);
  var TOOLS_VERSION = SHA1(output).slice(0, 10);

  //zzz echo $TOOLS_VERSION
  console.log(TOOLS_VERSION);

  //zzz echo -n "$TOOLS_VERSION" > "$TARGET_DIR/.tools_version.txt"
  return TOOLS_VERSION;
};

var buildToolsTarballs = function () {
  console.log('# Building tools tarball');
  //zzz # cd to top level dir
  //zzz cd `dirname $0`
  //zzz cd ../..
  //zzz TOPDIR=$(pwd)

  //zzz TOOLS_TMPDIR=$(mktemp -d -t meteor-build-release-XXXXXXXX)
  var TOOLS_TMPDIR = files.mkdtemp('meteor-build-release-');
  try {
    // build the tools in a temporary directory. after its built we know
    // its version so rename the directory.
    //zzz export TARGET_DIR="$TOOLS_TMPDIR/new"
    var TARGET_DIR = path.join(TOOLS_TMPDIR, 'new');

    //zzz $TOPDIR/scripts/admin/build-tools-tree.sh
    var TOOLS_VERSION = buildToolsTree(TARGET_DIR);

    //zzz mv "$TARGET_DIR" "$TOOLS_TMPDIR/$TOOLS_VERSION"
    fs.renameSync(TARGET_DIR, path.join(TOOLS_TMPDIR, TOOLS_VERSION));

    var TOOLS_OUTDIR = path.join('dist', 'tools');
    //zzz mkdir -p "$TOOLS_OUTDIR"
    files.mkdir_p(TOOLS_OUTDIR, 0755);

    //zzz TOOLS_TARBALL="$TOOLS_OUTDIR/meteor-tools-${TOOLS_VERSION}-${PLATFORM}.tar.gz"
    var PLATFORM = warehouse._platform();
    var TOOLS_TARBALL = path.join(TOOLS_OUTDIR, 'meteor-tools-' + TOOLS_VERSION + '-' + PLATFORM + '.tar.gz');

    console.log('# Tarring tools to: %s', TOOLS_TARBALL);
    //zzz $TAR -C "$TOOLS_TMPDIR" --exclude .meteor/local -czf "$TOOLS_TARBALL" "$TOOLS_VERSION"
    files.createTarball(path.join(TOOLS_TMPDIR, TOOLS_VERSION), TOOLS_TARBALL);

    // A hacky (?) way to pass $TOOLS_VERSION back into build-release.sh
    //zzz echo $TOOLS_VERSION > $TOPDIR/.tools_version
    return TOOLS_VERSION;
  } finally {
    //zzz trap 'rm -rf "$TOOLS_TMPDIR" >/dev/null 2>&1' 0
    console.log('# Cleaning up: %s', TOOLS_TMPDIR);
    files.rm_recursive(TOOLS_TMPDIR);
  }
};

var buildPackageTarballs = function () {
  console.log('# Building package tarballs');

  // Build a tarball for each smart package, which will later be put on
  // warehouse.meteor.com. Compute a version for each package by
  // hashing its contents. Prepare the packages part of a release
  // manifest with each package's version.
  //
  // At the moment smart packages don't support binary dependencies so
  // we don't have to build on different architectures. At some point
  // this will change, at which we'll use an approach similar to what
  // we do for tools.

  //zzz cd `dirname $0`
  //zzz cd ../..
  //zzz TOPDIR=$(pwd)

  //zzz OUTDIR="$TOPDIR/dist/packages"
  var OUTDIR = path.join(process.cwd(), 'dist', 'packages');
  //zzz mkdir -p $OUTDIR
  files.mkdir_p(OUTDIR);

  // Make sure all NPM modules are updated.
  //zzz ./meteor --get-ready

  // A hacky (?) way to pass the release manifest chunk with package
  // versions back into build-release.sh.  Contents set below
  //zzz if [ -e "$TOPDIR/.package_manifest_chunk" ]; then
  //zzz  rm "$TOPDIR/.package_manifest_chunk"
  //zzz fi

  //FIRST_RUN=true # keep track to place commas correctly
  //zzz cd packages
/*
  var FIRST_RUN = true;
  for PACKAGE in *
  do
    if [ -a "$PACKAGE/package.js" ]; then
      if [ $FIRST_RUN == false ]; then
        echo "," >> "$TOPDIR/.package_manifest_chunk"
      fi

      PACKAGE_VERSION=$(git ls-tree HEAD $PACKAGE | shasum | cut -f 1 -d " ") # shasum's output looks like: 'SHA -'
      echo "$PACKAGE version $PACKAGE_VERSION"
      $TAR -c -z -f $OUTDIR/$PACKAGE-${PACKAGE_VERSION}-${PLATFORM}.tar.gz $PACKAGE

      # this is used in build-release.sh, which constructs the release json.
      echo -n "    \"$PACKAGE\": \"$PACKAGE_VERSION\"" >> "$TOPDIR/.package_manifest_chunk"
      FIRST_RUN=false
    fi
  done
*/
  var PLATFORM = warehouse._platform();

  var manifest = '';
  process.chdir('packages');
  _.each(fs.readdirSync('.'), function (PACKAGE) {
    if (fs.existsSync(path.join(PACKAGE, 'package.js'))) {
      if (manifest !== '') {
        manifest += ',\n';
      }

      //zzz PACKAGE_VERSION=$(git ls-tree HEAD $PACKAGE | shasum | cut -f 1 -d " ") # shasum's output looks like: 'SHA -'
      var output = execFileSync('git', ['ls-tree', 'HEAD', PACKAGE]);
      var PACKAGE_VERSION = SHA1(output).slice(0, 10);

      //zzz echo "$PACKAGE version $PACKAGE_VERSION"
      console.log('- %s version %s', PACKAGE, PACKAGE_VERSION);

      //zzz $TAR -c -z -f $OUTDIR/$PACKAGE-${PACKAGE_VERSION}-${PLATFORM}.tar.gz $PACKAGE
      var tarball = path.join(OUTDIR, PACKAGE + '-' + PACKAGE_VERSION + '-' + PLATFORM + '.tar.gz');
      files.createTarball(PACKAGE, tarball);

      //zzz echo -n "    \"$PACKAGE\": \"$PACKAGE_VERSION\"" >> "$TOPDIR/.package_manifest_chunk"
      manifest += '    "' + PACKAGE + '": "' + PACKAGE_VERSION + '"';
    }
  });
  process.chdir('..');
  
  // Add one newline at the end
  //zzz echo >> "$TOPDIR/.package_manifest_chunk"
  console.log('');
  return manifest;
};

var main = function() {

  // cd to top level dir
  //zzz cd `dirname $0`
  //zzz cd ../..
  process.chdir(path.join(__dirname, '..', '..'));

  //zzz TOPDIR=$(pwd)
  //zzz OUTDIR="$TOPDIR/dist"
  var OUTDIR = path.join(process.cwd(), 'dist');
  console.log('# Building release files to ' + OUTDIR);

  //zzz rm -rf "$OUTDIR"
  files.rm_recursive(OUTDIR);
  //zzzz mkdir -p "$OUTDIR"
  files.mkdir_p(OUTDIR, 0755);

  /* zzz
  # Node, in its infinite wisdom, creates some hard links in some of its binary
  # output (eg, kexec.node). These hard links are across directories. Some
  # filesystems (eg, AFS) don't support hard links across directories, so make
  # sure that on Linux, our tarballs don't have hard links. (Why only on Linux?
  # Because neither /usr/bin/tar nor /usr/bin/gnutar on Mac appear to have this
  # flag or an equivalent. And we don't care too much about AFS support on Mac
  # anyway.)
  if [ "$UNAME" = "Linux" ]; then
    TAR="tar --hard-dereference"
  else
    TAR=tar
  fi
  export TAR
  */

  //zzz scripts/admin/build-tools-tarballs.sh
  //zzz TOOLS_VERSION=$(cat "$TOPDIR/.tools_version")
  var TOOLS_VERSION = buildToolsTarballs();

  //zzz scripts/admin/build-package-tarballs.sh
  //zzz MANIFEST_PACKAGE_CHUNK=$(cat "$TOPDIR/.package_manifest_chunk")
  var MANIFEST_PACKAGE_CHUNK = buildPackageTarballs();

  // don't keep these around since they get outdated
  //zzz rm "$TOPDIR/.tools_version"
  //zzz rm "$TOPDIR/.package_manifest_chunk"

  /*
  cat > "$OUTDIR/release.json" <<ENDOFMANIFEST
  {
    "tools": "$TOOLS_VERSION",
    "packages": {
  $MANIFEST_PACKAGE_CHUNK
    }
  }
  ENDOFMANIFEST
  */
  var releaseJson = [
    '{',
    '  "tools": "' + TOOLS_VERSION + '",',
    '  "packages": {',
    MANIFEST_PACKAGE_CHUNK,
    '  }',
    '}'
  ].join('\n');

  fs.writeFileSync(path.join(OUTDIR, 'release.json'), releaseJson);

  //zzz cat "$OUTDIR/release.json"
  console.log('# Updating release.json manifest to contain:');
  console.log('%s', releaseJson);
};

Fiber(main).run();
