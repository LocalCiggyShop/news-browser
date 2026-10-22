#!/usr/bin/env python3
"""Build both browser packages using only the Python standard library."""
from pathlib import Path
import json
import shutil
import struct
import zlib
import zipfile

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'extension'
DIST = ROOT / 'dist'

def png_icon(size):
    # Supersampled, local-only icon: rounded green newspaper with cream lines.
    scale = 4
    pixels = bytearray()
    for y in range(size):
        pixels.append(0)
        for x in range(size):
            samples = []
            for sy in range(scale):
                for sx in range(scale):
                    u, v = (x + (sx + .5) / scale) / size, (y + (sy + .5) / scale) / size
                    radius = .20
                    dx = max(radius - u, 0, u - (1 - radius))
                    dy = max(radius - v, 0, v - (1 - radius))
                    inside = dx * dx + dy * dy <= radius * radius
                    ink = any(y0 <= v <= y0 + .065 and .235 <= u <= end for y0, end in [(.29, .765), (.465, .765), (.64, .58)])
                    samples.append((245, 245, 240, 255) if inside and ink else (36, 83, 63, 255) if inside else (0, 0, 0, 0))
            pixels.extend(round(sum(p[c] for p in samples) / len(samples)) for c in range(4))
    def chunk(kind, data):
        return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind + data) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!2I5B', size, size, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(bytes(pixels), 9)) + chunk(b'IEND', b'')

def main():
    for size in (16, 32, 48, 128):
        (SOURCE / 'icons' / f'icon{size}.png').write_bytes(png_icon(size))
    DIST.mkdir(exist_ok=True)
    manifest = json.loads((SOURCE / 'manifest.json').read_text())
    for browser in ('chrome', 'firefox'):
        target = DIST / browser
        if target.exists():
            shutil.rmtree(target)
        shutil.copytree(SOURCE, target)
        config = dict(manifest)
        if browser == 'firefox':
            config.pop('minimum_chrome_version', None)
            config['background'] = {'scripts': ['background.js'], 'type': 'module'}
            config['browser_specific_settings'] = {'gecko': {'id': 'news-browser@local.extension', 'strict_min_version': '142.0', 'data_collection_permissions': {'required': ['none']}}}
        else:
            (target / 'background.html').unlink(missing_ok=True)
        (target / 'manifest.json').write_text(json.dumps(config, indent=2) + '\n')
        with zipfile.ZipFile(DIST / f'news-browser-{browser}.zip', 'w', compression=zipfile.ZIP_DEFLATED) as archive:
            for file in sorted(target.rglob('*')):
                if file.is_file():
                    archive.write(file, file.relative_to(target))
        print(f'Built dist/{browser}/ and dist/news-browser-{browser}.zip')

if __name__ == '__main__':
    main()
