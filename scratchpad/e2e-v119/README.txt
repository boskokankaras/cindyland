Provjera v1.19.0 (25.10.2026) - sve headless, demo server `cindyland-demo` (port 8643, /tmp/cindy_demo):
  sh demo_sync.sh                      kopira app/ + seed/ u /tmp/cindy_demo sa praznim config.js
  node e2e/e2e.mjs ["dio naziva toka"] 20 tokova (Došao/Otišao/avans/nazad/kartice/kalendar/Nenaplaćeno) + inventar funkcija
  node shots.mjs <folder> 375,1280     snimci svih 18 ekrana
  node tok.mjs && node slaganje.mjs    slike toka za Boška -> ../v1.19.0-slike/
Playwright se uzima iz ~/tiramisu-upload/node_modules; Node je u ~/.local/node/bin.
