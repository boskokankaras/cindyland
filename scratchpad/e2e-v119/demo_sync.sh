#!/bin/sh
# kopira radnu verziju u /tmp/cindy_demo (probni režim, prazan config)
set -e
D=/tmp/cindy_demo
mkdir -p $D
rsync -a --delete /Users/boskokankaras/cindyland/app/ $D/app/
rsync -a /Users/boskokankaras/cindyland/seed/ $D/seed/
cp /Users/boskokankaras/cindyland/index.html $D/index.html
echo 'window.CINDY = {};' > $D/app/config.js
echo synced
