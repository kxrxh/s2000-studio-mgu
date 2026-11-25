# S2000 Studio Cluster

An S2000-style instrument cluster overlay for BMW iDrive 7 (MGU). The app includes the compiled idv7lol layout, custom LCD lettering, and an iDrive menu to start it or restore the BMW display. The layout targets the 1920×720 cluster and uses a 6,000 RPM red zone, a 59 L fuel scale, and metric units.

## Install with MGU Store

1. In MGU Store, add `kxrxh/s2000-studio-mgu` as a GitHub source and select **Releases**. The [catalog URL](https://github.com/kxrxh/s2000-studio-mgu/releases/download/catalog/catalog.json) also works as an HTTPS source.
2. Refresh the source and install **S2000 Studio Cluster**. The catalog declares `cluster-render >= 0.8.7` and `mgu-deploy >= 0.8.27`.
3. Open the app in iDrive. **Включить S2000** starts the overlay. **Выключить и вернуть BMW** removes it and restores the factory display.

For USB installation, extract the ZIP from the [catalog release](https://github.com/kxrxh/s2000-studio-mgu/releases/tag/catalog) to the root of the drive. Keep its `mgu-repo/` directory.

The overlay starts off for each app session. It drops its layers when live RPM or speed expires, during power-off, or if the renderer rejects the layout. The release was verified with the MGU Store catalog parser and the packaged app was exercised over a local renderer socket. Rendering and factory restoration on a physical cluster still need verification.

## Rebuild

From the root of this repository, with Node.js 20+ and Python 3 installed:

```sh
git clone https://github.com/ALMSTRA/idv7lol.git ../idv7lol-s2000
git -C ../idv7lol-s2000 checkout --detach 35029ce5b95aa66acb4d0d880de1a2d9ff7a69d3
git -C ../idv7lol-s2000 apply "$PWD/mgu-mac/s2000-cluster/idv7lol-lcd.patch"
npm --prefix ../idv7lol-s2000 ci
python3 -B mgu-mac/s2000-cluster/build-studio-app.py ../idv7lol-s2000
```

The build writes `dist/s2000-studio-mgu-store.zip`. Edit `mgu-mac/s2000-cluster/s2000.idv7theme` in Studio or regenerate it from its authored outlines:

```sh
node mgu-mac/s2000-cluster/export-idv7lol.js > mgu-mac/s2000-cluster/s2000.idv7theme
node mgu-mac/s2000-cluster/test_idv7lol.js
```

`bake-lcd-font.py` regenerates the TrueType font with FontTools. To test start and stop against a local renderer socket, extract the app `.tgz` and pass its `package/javascript` path to `mgu-mac/s2000-cluster/test_studio_app.js` with Node.

## Licensing

The app uses GPL-3.0-or-later and builds with the [pinned idv7lol source](https://github.com/ALMSTRA/idv7lol/tree/35029ce5b95aa66acb4d0d880de1a2d9ff7a69d3) and the checked-in patch. The MGU App Kit code is under its [MIT license](mgu-mac/apps/LICENSE). The release atlas includes Barlow-derived glyphs under the [SIL Open Font License](LICENSES/OFL-1.1-Barlow.txt). See [upstream notices](LICENSES/NOTICE-idv7lol.txt) and [S2000 artwork provenance](mgu-mac/apps/apps/s2000_cluster/NOTICE).
