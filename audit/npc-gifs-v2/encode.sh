#!/usr/bin/env bash
set -euo pipefail
# NPC artwork generated with imagegen. ffmpeg encodes cinematic local firelight.
# No camera motion; only bounded firelight regions vary. Shared fixed palette prevents palette shimmer.
for spec in 'council qing_bg_chongzheng_snow_council 280 178 565 180' 'front qing_bg_yipianshi_blizzard_front 358 245 420 136' 'tent qing_bg_guihua_golden_tent 398 280 790 280'; do
 read -r name id x1 y1 x2 y2 <<< "$spec"
 expression="0.08*sin(2*PI*T/2)*(if(lt((X-${x1})^2+(Y-${y1})^2,3600),exp(-((X-${x1})^2+(Y-${y1})^2)/800),0)+if(lt((X-${x2})^2+(Y-${y2})^2,3600),exp(-((X-${x2})^2+(Y-${y2})^2)/800),0))"
 ffmpeg -hide_banner -loglevel error -y -loop 1 -t 2 -i "asset-inbox/npc-gifs-v2/$name.png" -t 2 -filter_complex "[0:v]scale=836:470,fps=6,format=gbrp,geq=r='r(X,Y)*(1+$expression)':g='g(X,Y)*(1+$expression)':b='b(X,Y)*(1+$expression)',split[a][b];[a]palettegen=max_colors=256:stats_mode=full[p];[b][p]paletteuse=dither=bayer:bayer_scale=3" -loop 0 "data/illustrations/qing/animated/${id}-npc-v2.gif"
done
