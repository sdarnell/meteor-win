// javascript version of build-release.sh

var os = require('os');
var fs = require('fs');
var path = require('path');
var child_process = require('child_process');
var crypto = require('crypto');

var Fiber = require('fibers');
var Future = require('fibers/future');
var _ = require('underscore');
var files = require('../../tools/files.js');
var warehouse = require('../../tools/warehouse.js');

var sha1 = function (contents) {
  var hash = crypto.createHash('sha1');
  hash.update(contents);
  return hash.digest('hex');
};

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

// Build tools tree to TARGET_DIR and returns tools version
var buildToolsTree = function (TARGET_DIR) {
  // This script fills TARGET_DIR with what should go into
  //     ~/.meteor/tools/VERSION
  // It does not set up the top-level springboard file in
  // ~/.meteor/tools or the ~/.meteor/meteor symlink.

  console.log('Setting up tools tree in %s', TARGET_DIR);

  // Make sure that the entire contents TARGET_DIR is what we placed there
  if (fs.existsSync(TARGET_DIR)) {
    throw new Error('Target directory already exists: ' + TARGET_DIR);
  }

  console.log('Copying dev_bundle');
  cp('dev_bundle', TARGET_DIR);

  // Copy over files and directories that we want in the tarball. Keep this
  // list synchronized with the files used in the TOOLS_VERSION calculation
  // below. The "meteor" script file contains the version number of the dev
  // bundle, so we include that instead of the (arch-specific) bundle itself
  // in sha calculation.
  cp('LICENSE.txt', TARGET_DIR);
  cp('meteor', path.join(TARGET_DIR, 'bin'));
  if (process.platform === 'win32') {
    cp('meteor.bat', path.join(TARGET_DIR, 'bin'));
  }

  console.log('Copying tools');
  cp('tools', TARGET_DIR);
  console.log('Copying examples');
  cp('examples', TARGET_DIR);

  // Script is not actually used, but it's nice to distribute it for users.
  cp(path.join('scripts', 'admin', 'launch-meteor'), TARGET_DIR);

  console.log('Trimming unfinished examples');
  files.rm_recursive(path.join(TARGET_DIR, 'examples', 'unfinished'));
  files.rm_recursive(path.join(TARGET_DIR, 'examples', 'other'));

  // Avoid releasing any .meteor/local directories
  removeMeteorLocalDirs(TARGET_DIR);

  // mark directory with current git sha
  var gitVersion = execFileSync('git', ['rev-parse', 'HEAD']);
  fs.writeFileSync(path.join(TARGET_DIR, '.git_version.txt'), gitVersion);

  // generate tools version: directory hash that depends only on file contents and
  // permissions but nothing else, eg modification time or build outputs. This
  // version is treated fully opaquely, so to make it a little more attractive we
  // just use the first ten characters.
  process.stdout.write('Computing tools version... ');
  var output = execFileSync('git', ['ls-tree', 'HEAD',
    'LICENSE.txt', 'meteor', 'tools', 'examples',
    path.join('scripts', 'admin', 'launch-meteor')
  ]);
  var TOOLS_VERSION = sha1(output).slice(0, 10);
  console.log(TOOLS_VERSION);
  fs.writeFileSync(path.join(TARGET_DIR, '.tools_version.txt'), TOOLS_VERSION);

  return TOOLS_VERSION;
};

var buildToolsTarballs = function () {
  console.log('Building tools tarball');

  var TOOLS_TMPDIR = files.mkdtemp('meteor-build-release-');
  try {
    // build the tools in a temporary directory. after its built we know
    // its version so rename the directory.
    var TARGET_DIR = path.join(TOOLS_TMPDIR, 'new');
    var TOOLS_VERSION = buildToolsTree(TARGET_DIR);
    fs.renameSync(TARGET_DIR, path.join(TOOLS_TMPDIR, TOOLS_VERSION));

    var TOOLS_OUTDIR = path.join('dist', 'tools');
    files.mkdir_p(TOOLS_OUTDIR, 0755);

    var PLATFORM = warehouse._platform();
    var TOOLS_TARBALL = path.join(TOOLS_OUTDIR, 'meteor-tools-' + TOOLS_VERSION + '-' + PLATFORM + '.tar.gz');

    console.log('Building tools tarball to: %s', TOOLS_TARBALL);
    files.createTarball(path.join(TOOLS_TMPDIR, TOOLS_VERSION), TOOLS_TARBALL);

    return TOOLS_VERSION;
  } finally {
    console.log('Cleaning up: %s', TOOLS_TMPDIR);
    files.rm_recursive(TOOLS_TMPDIR);
  }
};

var buildPackageTarballs = function () {
  console.log('Building package tarballs');

  // Build a tarball for each smart package, which will later be put on
  // warehouse.meteor.com. Compute a version for each package by
  // hashing its contents. Prepare the packages part of a release
  // manifest with each package's version.
  //
  // At the moment smart packages don't support binary dependencies so
  // we don't have to build on different architectures. At some point
  // this will change, at which we'll use an approach similar to what
  // we do for tools.

  var OUTDIR = path.join(process.cwd(), 'dist', 'packages');
  files.mkdir_p(OUTDIR);

  var PLATFORM = warehouse._platform();

  var manifest = '';
  process.chdir('packages');
  _.each(fs.readdirSync('.').sort(), function (PACKAGE) {
    if (fs.existsSync(path.join(PACKAGE, 'package.js'))) {
      if (manifest !== '') {
        manifest += ',\n';
      }

      var buildinfoPath = path.join(PACKAGE, '.build', 'buildinfo.json');
      var buildinfoRaw = fs.readFileSync(buildinfoPath);

      var munged = _.map(buildinfoRaw.toString().split(/\r?\n/), function (line) {
        line = line.replace('\\\\', '\\'); // json will escape the backslashes in Windows paths
        line = line.replace(process.cwd(), ''); // Once should be fine
        line = line.replace(/os\..*\.json/g, 'os.json');
        return line;
      }).join('\n');

      var PACKAGE_VERSION = sha1(munged).slice(0, 10);
      console.log('- %s version %s', PACKAGE, PACKAGE_VERSION);

      // We now need to create a tarball excluding the buildinfo.json file.
      // Ideally I'd like to add an exclude option to createTarball(), but for
      // now work-around it by temporarily deleting it.
      fs.unlinkSync(buildinfoPath);

      // The root directory of the package should also be the package id
      // achieve this by temporarily renaming the .build directory.
      // Maybe taking a copy would be better.
      var packageTmp = path.join(PACKAGE, PACKAGE + '-' + PACKAGE_VERSION + '-' + PLATFORM);
      fs.renameSync(path.join(PACKAGE, '.build'), packageTmp);

      var tarball = path.join(OUTDIR, PACKAGE + '-' + PACKAGE_VERSION + '-' + PLATFORM + '.tar.gz');
      files.createTarball(packageTmp, tarball);

      fs.renameSync(packageTmp, path.join(PACKAGE, '.build'));

      // Put the buildinfo.json file back
      fs.writeFileSync(buildinfoPath, buildinfoRaw);

      manifest += '    "' + PACKAGE + '": "' + PACKAGE_VERSION + '"';
    }
  });
  console.log('');
  process.chdir('..');

  return manifest;
};

var main = function() {
  process.chdir(path.join(__dirname, '..', '..'));

  var OUTDIR = path.join(process.cwd(), 'dist');
  console.log('Building release files to %s', OUTDIR);
  files.rm_recursive(OUTDIR);
  files.mkdir_p(OUTDIR, 0755);

  // Make sure all NPM modules are updated.
  console.log('Calling meteor --get-ready to update NPM modules');
  var meteor = (process.platform === 'win32') ? 'meteor.bat' : 'meteor';
  execFileSync(path.join('.', meteor), ['--get-ready']);

  var TOOLS_VERSION = buildToolsTarballs();
  var MANIFEST_PACKAGE_CHUNK = buildPackageTarballs();

  var releaseJson = [
    '{',
    '  "tools": "' + TOOLS_VERSION + '",',
    '  "packages": {',
    MANIFEST_PACKAGE_CHUNK,
    '  },',
    '  "upgraders": ["app-packages", "no-preserve-inputs"]',
    '}'
  ].join('\n');

  fs.writeFileSync(path.join(OUTDIR, 'release.json'), releaseJson);

  console.log('Updating release.json manifest to contain:');
  console.log('%s', releaseJson);
};

Fiber(main).run();
