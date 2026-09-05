#!/bin/bash
# Пересобирает копии документов из оригиналов на Рабочем столе.
# Оригиналы — источник истины; файлы в репозитории только переименованы.
set -e

SRC="$(cd "$(dirname "$0")/.." && pwd)"
DST="$(cd "$(dirname "$0")" && pwd)"

copy() {
  cp "$SRC/$1" "$DST/$2"
  if [ "$(md5 -q "$SRC/$1")" = "$(md5 -q "$DST/$2")" ]; then
    echo "OK    $2  <-  $1"
  else
    echo "FAIL  $2"; exit 1
  fi
}

copy "Коммерческое предложение.html"        offer.html
copy "index (2).html"                       technical.html
copy "Ключевые решения перед стартом.html"  questions.html

echo
echo "Готово. Опубликовать:  git add -A && git commit -m 'sync docs' && git push"
