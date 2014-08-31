// This is a cut-down version of bless-release.js that builds the
// bootstrap tarball given a dist directory that has been built
// with build-release.js.
//
// Run this script as:
//   $ node build-bootstrap.js RELEASE_NAME
//

var fs = require('fs');
var path = require('path');
var child_process = require('child_process');

var Fiber = require('fibers');
var Future = require('fibers/future');
var _ = require('underscore');

var files = require('../../tools/files.js');
var warehouse = require('../../tools/warehouse.js');
var httpHelpers = require('../../tools/http-helpers.js');

var sleep = function(ms) {
  var fiber = Fiber.current;
  setTimeout(function() {
    fiber.run();
  }, ms);
  Fiber.yield();
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

var PLATFORMS = [
  'Windows_i686'
];

var die = function (msg) {
  console.error(msg);
  process.exit(1);
};

var doOrDie = function (errorMessage, f) {
  try {
    return f();
  } catch (e) {
    console.log("Error: ", e);
    die(errorMessage);
  }
};

// Writes out a JSON file, pretty-printed and read-only.
var writeJSONFile = function (path, jsonObject) {
  fs.writeFileSync(path, JSON.stringify(jsonObject, null, 2));
  // In 0.10 we can pass a mode to writeFileSync, but not yet...
  //fs.chmodSync(path, 0444);
};
var readJSONFile = function (path) {
  return JSON.parse(fs.readFileSync(path));
};

var distDirectory, warehouseDirectory;

// Deletes $SOURCE_ROOT/dist and builds out a .meteor inside it containing
// everything but packages and tools.
var resetDistDirectory = function (blessedReleaseName, rcManifest, notices) {
  distDirectory = path.resolve(__dirname, '..', '..', 'dist');
  console.log("Building in " + distDirectory);
  //files.rm_recursive(distDirectory);
  //fs.mkdirSync(distDirectory);

  files.rm_recursive(path.join(distDirectory, blessedReleaseName + '.release.json'));
  files.rm_recursive(path.join(distDirectory, blessedReleaseName + '.notices.json'));

  warehouseDirectory = path.join(distDirectory, '.meteor');
  writeJSONFile(path.join(distDirectory, blessedReleaseName + '.release.json'),
                rcManifest);
  writeJSONFile(path.join(distDirectory, blessedReleaseName + '.notices.json'),
                notices);
};

var makeWarehouseStructure = function (blessedReleaseName, rcManifest, notices) {
  files.rm_recursive(warehouseDirectory);
  files.mkdir_p(path.join(warehouseDirectory, 'releases'), 0755);
  fs.mkdirSync(path.join(warehouseDirectory, 'packages'), 0755);
  fs.mkdirSync(path.join(warehouseDirectory, 'tools'), 0755);

  // Avoid using symlinks on windows
  cp(path.resolve(__dirname, '..', '..', 'meteor.bat'),
     path.join(warehouseDirectory, 'meteor.bat'));

  cp(path.resolve(__dirname, '..', 'windows', 'LaunchMeteor.exe'),
     path.join(warehouseDirectory, 'meteor.exe'));

  fs.writeFileSync(path.join(warehouseDirectory, 'releases', 'latest'),
                   blessedReleaseName + '.release.json');
  fs.writeFileSync(path.join(warehouseDirectory, 'tools', 'latest'),
                   rcManifest.tools);

  writeJSONFile(path.join(warehouseDirectory, 'releases',
                          blessedReleaseName + '.release.json'),
                rcManifest);
  writeJSONFile(path.join(warehouseDirectory, 'releases',
                          blessedReleaseName + '.notices.json'),
                notices);
};

var downloadPackages = function (packages, platform) {
  console.log("Downloading packages for " + platform);
  warehouse.downloadPackagesToWarehouse(
    packages, platform, warehouseDirectory, true);
};

var downloadTools = function (toolsVersion, platform) {
  console.log("Downloading tools for " + platform);
  warehouse.downloadToolsToWarehouse(
    toolsVersion, platform, warehouseDirectory, true);
};

var bootstrapTarballFilename = function (platform) {
  return "meteor-bootstrap-" + platform + ".tar.gz";
};

var makeBootstrapTarball = function (platform) {
  console.log("Creating bootstrap tarball for " + platform);
  var tarballName = bootstrapTarballFilename(platform);
  files.createTarball(warehouseDirectory,
                      path.join(distDirectory, tarballName));
};

var writeGlobalManifest = function (blessedReleaseName, banner) {
  console.log("Writing global manifest");
  var globalManifest = {
    releases: {
      stable: {
        version: blessedReleaseName,
        banner: banner
      }
    }
  };

  writeJSONFile(path.join(distDirectory, 'manifest.json'), globalManifest);
};

var writeBigRedButton = function (blessedReleaseName, gitTagSourceSha, gitTag) {
  var s3Files = _.map(PLATFORMS, function (platform) {
    return [bootstrapTarballFilename(platform),
            'com.meteor.warehouse/bootstrap/' + blessedReleaseName];
  });
  s3Files.push([blessedReleaseName + '.notices.json',
                'com.meteor.warehouse/releases']);
  s3Files.push([blessedReleaseName + '.release.json',
                'com.meteor.warehouse/releases']);
  s3Files.push(['manifest.json', 'com.meteor.static/update']);
  var scriptText =
        "#!/bin/bash\n" +
        "# Wow! It's time to release Meteor " + blessedReleaseName + "!\n" +
        "# Look at the contents of this directory, cross your fingers, and\n" +
        "# run this script!\n\n" +
        "set -e\n" +
        "cd '" + distDirectory + "'\n" +
        "echo 'Blessing Meteor " + blessedReleaseName + "'\n\n";
  scriptText = scriptText + _.map(s3Files, function (f) {
    return "s3cmd -P put " + f[0] + " s3://" + f[1] + "/\n";
  }).join('');

  scriptText = scriptText +
    "git tag " + gitTag + " " + gitTagSourceSha + "\n" +
    "git push git@github.com:meteor/meteor.git refs/tags/" + gitTag + "\n" +
    "echo 'Gesundheit!'\n";

  var scriptFilename = path.join(distDirectory, "big-red-button.sh");
  fs.writeFileSync(scriptFilename, scriptText);
  fs.chmodSync(scriptFilename, 0755);

  console.log("Take a look at the dist/ directory in your checkout.");
  console.log("If everything looks OK, run the big-red-button.sh you'll " +
              "find there.");
};

var replacementGetUrl = function (urlOrOptions) {
  var url = urlOrOptions.url || urlOrOptions;
  //console.log("getUrl: " + url);
  var file = url.substring(url.lastIndexOf('/')+1);

  if (/\/packages\/./.test(url)) {
    file = path.join('packages', file);
    console.log("package: "+file);
    return fs.readFileSync(path.resolve(__dirname, '..', '..', 'dist', file));
  }

  if (/\/tools\/./.test(url)) {
    file = path.join('tools', file);
    console.log("package: "+file);
    return fs.readFileSync(path.resolve(__dirname, '..', '..', 'dist', file));
  }

  sleep(1000);
  throw new Error("Unexpected URL %s", url);
};

var main = function () {
  // node and the script itself are included in process.argv
  if (process.argv.length !== 3) {
    die("usage: node build-bootstrap.js RELEASE_NAME");
  }

  if (!httpHelpers.getUrl) {
    die("Failed to override httpHelpers.getUrl");
  }
  httpHelpers.getUrl = replacementGetUrl;

  var releaseName = process.argv[2];

  var manifestFilename = path.resolve(__dirname, '..', '..', 'dist', 'release.json');
  var manifest = doOrDie("Can't read release manifest " + manifestFilename, function () {
    return readJSONFile(manifestFilename);
  });

  var gitTag = "release/" + releaseName;
  var gitTagSourceSha = "xxx";

  var noticesFilename = path.resolve(__dirname, 'notices.json');
  var notices = doOrDie("Can't read notices file " + noticesFilename, function () {
    return readJSONFile(noticesFilename);
  });

  _.each(notices, function (record) {
    if (!record.release)
      die("An element of notices.json lacks a release.");
    _.each(record.notices, function (line) {
      if (line.length + record.release.length + 2 > 80) {
        die("notices.json: notice line too long: " + line);
      }
    });
  });

  var bannerFilename = path.resolve(__dirname, 'banner.txt');
  var banner = doOrDie("Can't read banner file " + bannerFilename, function () {
    return fs.readFileSync(bannerFilename, 'utf8');
  });

  // Print the banner first, so we can kill if we forgot to update it.
  console.log("Here's the banner users will see that tells them to upgrade:");
  console.log(banner);

  resetDistDirectory(releaseName, manifest, notices);
  _.each(PLATFORMS, function (platform) {
    makeWarehouseStructure(releaseName, manifest, notices);
    downloadPackages(manifest.packages, platform);
    downloadTools(manifest.tools, platform);
    makeBootstrapTarball(platform);
  });
  writeGlobalManifest(releaseName, banner);

  writeBigRedButton(releaseName, gitTagSourceSha, gitTag);

  // Now copy the files into the structure needed for the web:
  //
  // manifest.json
  // releases/<release>.release.json
  // releases/<release>.notices.json
  // tools/<version>/meteor-tools-<version>-<platform>.tar.gz
  // packages/<name>/<version>/<name>-<version>-<platform>.tar.gz
  //
  // Official meteor uses:
  // bootstrap/<release>/meteor-bootstrap-<platform>.tar.gz
  // but for simplicity, use:
  // bootstrap/meteor-bootstrap-<platform>.tar.gz

  var web = path.join(distDirectory, 'public');
  var webReleases = path.join(web, 'releases');
  var webTools = path.join(web, 'tools', manifest.tools);
  var webPackages = path.join(web, 'packages');
  var webBootstrap = path.join(web, 'bootstrap');

  files.mkdir_p(web, 0755);
  cp(path.join(distDirectory, 'manifest.json'), web);

  files.mkdir_p(webReleases, 0755);
  cp(path.join(distDirectory, releaseName + '.release.json'), webReleases);
  cp(path.join(distDirectory, releaseName + '.notices.json'), webReleases);

  _.each(PLATFORMS, function (platform) {
    files.mkdir_p(webTools, 0755);
    cp(path.join(distDirectory, 'tools', 'meteor-tools-' + manifest.tools + '-' + platform + '.tar.gz'), webTools);

    _.each(manifest.packages, function (version, package) {
      files.mkdir_p(path.join(webPackages, package, version), 0755);
      cp(path.join(distDirectory, 'packages', package + '-' + version + '-' + platform + '.tar.gz'),
        path.join(webPackages, package, version));
    });

    files.mkdir_p(webBootstrap, 0755);
    cp(path.join(distDirectory, 'meteor-bootstrap-' + platform + '.tar.gz'), webBootstrap);
  });
};

Fiber(main).run();
