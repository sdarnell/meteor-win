How to build Meteor for Windows
-------------------------------

Start git bash (mingw shell)

Build the dev_bundle
```
$ ./scripts/generate-dev-bundle.sh

```
This will extract the node MSI (but doesn't install it).
It also installs lots of NPM modules.
Some of these modules contain native components and will need
to be compiled. This requires visual studio and python 2.7.

There will probably be some warnings (at least with VS 2012).

Once the dev_bundle has been built, there will be a tar.gz file in the root
 directory, and that should be expanded:
```
$ mkdir dev_bundle
$ tar -xf dev_bundle_Windows*.tar.gz -C dev_bundle
```
or
```
$ mkdir dev_bundle ; tar xf dev_bundle_Windows*.tar.gz -C dev_bundle
```

Then switch to a regular command prompt window at the root, and run:
```
scripts\windows\build.bat
```

This builds the 'checkout' which should allow you to run locally.
So now you should be able to run meteor, for example:
```
.\meteor search sacha
```

If you get to the point where you want to publish that release, here are some
notes to help. Currently only sdarnell can do this because the windows
packages are owned by him. If you want to release your own, you need to
change the prefix.

If meteor-tool has been updated:
```
cd packages\meteor-tool
Update package.js to bump version number
..\..\meteor publish [--create]
```

Then update the scripts\admin\windows-release-experimental.json file and
run the following command to publish the release (list of versions):
```
meteor publish-release scripts\admin\windows-release-experimental.json --from-checkout [--create-track]
```

Finally, to build the bootstrap tarball run:
```
set TEMP=c:\t
mkdir %TEMP%
meteor admin make-bootstrap-tarballs windows:METEOR@0.9.0.1-rc3 c:\tmp\tarballdir
```


Misc notes:

I'd suggest enabling long paths with git:
   git config --global core.longpaths true
