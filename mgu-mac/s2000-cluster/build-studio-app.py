#!/usr/bin/env python3
"""Compile the current Studio theme and package it as a local MGU Store source."""

import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import tarfile
from tempfile import TemporaryDirectory
import zipfile

HERE = Path(__file__).resolve().parent
UPSTREAM = '35029ce5b95aa66acb4d0d880de1a2d9ff7a69d3'
OUTPUT = HERE.parents[1] / 'dist' / 's2000-studio-mgu-store.zip'


def write_module(path, data):
    path.write_text("'use strict';\nmodule.exports = " + json.dumps(data) + ';\n', encoding='utf-8')


def stage_app(checkout, scratch):
    source = HERE / 'studio-app'
    spec = json.loads((source / 'app.json').read_text())
    app = scratch / 'apps' / spec['id']
    shutil.copytree(source, app)
    runtime = checkout / 'apps' / 'idv7lol'
    for name in ('engine.js', 'conditions.js', 'text.js', 'units.js', 'etc2.js', 'shaders.js',
                 'cluster_render_client.js', 'LICENSE', 'NOTICE'):
        shutil.copyfile(runtime / name, app / name)
    local_apps = HERE.parent / 'apps' / 'apps'
    shutil.copyfile(local_apps / 'bmw_clusters' / 'controller.js', app / 'controller.js')
    shutil.copyfile(local_apps / 's2000_cluster' / 'model.js', app / 'model.js')
    with (app / 'NOTICE').open('a', encoding='utf-8') as notice:
        notice.write(f'\nS2000 Studio Cluster uses the idv7lol runtime from commit {UPSTREAM}.\n'
                     'The S2000 layout and LCD glyphs are authored locally. The atlas also contains\n'
                     'the Barlow-derived glyphs described above. The compiled layout and its patched\n'
                     'shader are generated from s2000.idv7theme and idv7lol-lcd.patch.\n')

    compiled = scratch / 'compiled'
    subprocess.run([
        'node', str(checkout / 'node_modules' / 'tsx' / 'dist' / 'cli.mjs'),
        'packages/theme-compiler/src/cli.ts', 'build', str(HERE / 's2000.idv7theme'), '--out', str(compiled)
    ], cwd=checkout, check=True)
    bundle = compiled / 's2000-g20'
    theme = json.loads((bundle / 'theme.json').read_text())
    if theme['warnings'] or theme['fonts'] != ['display'] or theme['target']['renderTarget'] != 'panel':
        raise ValueError('Unexpected compiler warnings, font, or panel target')
    for image in theme['images']:
        name = f'image-{image["componentId"]}.wad'
        shutil.copyfile(bundle / image['file'], app / name)
        image['file'] = name
    shutil.copyfile(bundle / 'fonts' / 'display.r8', app / 'font_display.wad')
    write_module(app / 'font_display.js', json.loads((bundle / 'fonts' / 'display.json').read_text()))
    write_module(app / 's2000-theme.js', theme)
    return spec


def build(checkout):
    checkout = checkout.resolve(strict=True)
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=checkout, text=True).strip()
    if head != UPSTREAM:
        raise ValueError(f'This package is checked against idv7lol {UPSTREAM}; got {head}')
    subprocess.run(['git', 'apply', '--reverse', '--check', str(HERE / 'idv7lol-lcd.patch')], cwd=checkout, check=True)
    packaging_spec = importlib.util.spec_from_file_location(
        'store_catalog', checkout / 'tools' / 'build' / 'build-store-catalog.py')
    packaging = importlib.util.module_from_spec(packaging_spec)
    packaging_spec.loader.exec_module(packaging)
    kit = packaging.load_kit_build()

    with TemporaryDirectory(prefix='s2000-studio-build-') as temp:
        scratch = Path(temp)
        spec = stage_app(checkout, scratch)
        app_id, version = spec['id'], spec['version']
        sdk_stub = scratch / 'sdk'
        sdk_stub.mkdir()
        (sdk_stub / 'index.js').write_text('// Build stand-in. Excluded from the Store artifact.\n')
        (sdk_stub / 'package.json').write_text('{"name":"oap-sdk","version":"0.0.0"}\n')
        kit.APPS, kit.DIST, kit.SDK = str(scratch / 'apps'), str(scratch / 'build'), str(sdk_stub)
        kit.build(app_id)

        name = f'{app_id}@{version}.tgz'
        artifact = scratch / name
        packaging.without_sdk(scratch / 'build' / name, artifact, {
            'productName': spec['title'], 'mguHmi': spec['mguHmi'], 'license': spec['license']
        })
        with tarfile.open(artifact) as package:
            names = set(package.getnames())
            if any('/node_modules/' in name for name in names) or not {
                'package/javascript/app.js', 'package/javascript/s2000-theme.js',
                'package/javascript/font_display.wad', 'package/rhmiData/application.json'
            }.issubset(names):
                raise ValueError('The package is missing runtime files or contains the SDK')

        upstream_catalog = json.loads((checkout / 'mgu-repo.json').read_text())
        requires = next(c['requires'] for c in upstream_catalog['components'] if c['id'] == 'idv7lol')
        catalog = {'schema': 2, 'components': [{
            'id': app_id, 'kind': 'app', 'title': spec['title'], 'version': version,
            'description': spec['description'], 'mguHmi': spec['mguHmi'], 'uninstallable': True,
            'requires': requires,
            'artifact': {'name': name, 'url': name, 'size': artifact.stat().st_size,
                         'sha256': hashlib.sha256(artifact.read_bytes()).hexdigest()}
        }]}
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        with TemporaryDirectory(prefix='.s2000-studio-', dir=OUTPUT.parent) as release:
            ready = Path(release) / OUTPUT.name
            with zipfile.ZipFile(ready, 'w', zipfile.ZIP_DEFLATED) as archive:
                prefix = f'mgu-repo/{app_id}/'
                archive.write(artifact, prefix + name)
                archive.writestr(prefix + 'catalog.json', json.dumps(catalog, indent=2) + '\n')
            ready.replace(OUTPUT)
    print(OUTPUT)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('idv7lol', type=Path, help='pinned checkout with idv7lol-lcd.patch and npm dependencies')
    build(parser.parse_args().idv7lol)
