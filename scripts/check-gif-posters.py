#!/usr/bin/env python3
"""Verify real GIF frame-0 pixels, not a separately generated/repainted poster.
Requires Pillow. Run from repository root. --write extracts lossless PNGs first.
"""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path
from PIL import Image
parser = argparse.ArgumentParser()
parser.add_argument('--write', action='store_true', help='extract registered GIF first frames before verifying')
args = parser.parse_args()
pairs = json.loads(subprocess.check_output(['node', '-e', '''
const a=require('./harness/scene-animation.js'),r=require('./illustration-system.js');
console.log(JSON.stringify(Object.keys(a.scenes).map(nodeId=>{
const input={faction:'qing',nodeId,asset:r.sceneFor({faction:'qing',nodeId})};
return {nodeId,gif:a.pathFor(input),poster:a.posterFor(input)};})));
'''], text=True))
for entry in pairs:
    gif, poster = Path(entry['gif']), Path(entry['poster'])
    with Image.open(gif) as image:
        image.seek(0)
        if args.write: image.copy().save(poster, optimize=True)
        pixels = image.convert('RGBA').tobytes()
        size = image.size
    with Image.open(poster) as image:
        assert image.size == size and image.convert('RGBA').tobytes() == pixels, f'not actual first frame: {poster}'
    entry.update(width=size[0], height=size[1], rgbaSha256=hashlib.sha256(pixels).hexdigest(),
                 gifSha256=hashlib.sha256(gif.read_bytes()).hexdigest(), posterSha256=hashlib.sha256(poster.read_bytes()).hexdigest())
print(json.dumps(pairs, ensure_ascii=False, indent=2))
