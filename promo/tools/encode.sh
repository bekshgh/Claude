#!/usr/bin/env bash
# Concatenate rendered lossless chunks + soundtrack into the delivery MP4.
#   tools/encode.sh frames/final audio/soundtrack.wav ../output/brick_engineers_promo_1920x1080_60fps.mp4
set -euo pipefail
CHUNKS_DIR=${1:-frames/final}
AUDIO=${2:-audio/soundtrack.wav}
OUT=${3:-../output/brick_engineers_promo_1920x1080_60fps.mp4}
mkdir -p "$(dirname "$OUT")"
LIST=$(mktemp)
for f in $(ls "$CHUNKS_DIR"/chunk_*.mkv | sort); do
  echo "file '$(realpath "$f")'" >> "$LIST"
done
cat "$LIST"
ffmpeg -y -hide_banner -loglevel warning -stats \
  -f concat -safe 0 -r 60 -i "$LIST" -i "$AUDIO" \
  -map 0:v:0 -map 1:a:0 \
  -vf "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p" \
  -c:v libx264 -preset slow -crf 14 -profile:v high -level 4.2 -r 60 -g 120 -bf 3 \
  -x264-params "keyint=120:min-keyint=60:aq-mode=3" \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv \
  -c:a aac -b:a 320k -ar 48000 \
  -t 15.0 -movflags +faststart "$OUT"
rm -f "$LIST"
ffprobe -hide_banner -v error -show_entries stream=codec_name,width,height,r_frame_rate,nb_frames,pix_fmt,sample_rate,channels -show_entries format=duration,size,bit_rate -of default=nw=1 "$OUT"
