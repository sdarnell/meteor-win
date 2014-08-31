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
scripts\windows\build.bat <releaseName>
```

The release name is optional but if specified builds the bootstrap package
and prepares a directory with the tarballs etc. in the right place.

Congratulations, you're done.
