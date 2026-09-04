# SeaGrid application

Flutter owns navigation, settings, downloads, and HUD chrome. Native AR scene
implementations own the camera and all world-locked geometry.

## Run checks

From the repository root:

```sh
dart pub get
dart run melos bootstrap
dart run melos run check
```

The first native iOS implementation is scheduled for PR 4. Platform folders
will be generated and reviewed with that native integration so no temporary AR
plugin architecture becomes part of PR 1.

