#!/bin/bash
# Prueba del AppImage dentro de WSL2 SIN sudo (entorno de pruebas del dueño).
#
# Para que sirve: WSL Ubuntu no trae las librerias de Electron ni un servidor X. Este script
#  1) se baja los .deb que faltan y los desempalqueta en ~/kf-libs (sin root),
#  2) levanta un Xvfb :99 propio (via proot, para que encuentre /usr/bin/xkbcomp),
#  3) arranca el AppImage que le pases y comprueba /api/config con y sin token.
#
# Uso:
#   bash scripts/prueba-linux-wsl.sh [ruta/al/KoRForge-x.y.z-linux-x86_64.AppImage]
#
# Requiere: curl, dpkg, arrancar desde dentro de WSL (no desde Windows).
set -u

APPIMAGE="${1:-}"
if [ -z "$APPIMAGE" ] || [ ! -f "$APPIMAGE" ]; then
  echo "Uso: bash scripts/prueba-linux-wsl.sh <ruta al AppImage>"
  exit 1
fi
APPIMAGE="$(readlink -f "$APPIMAGE")"

DEBS="$HOME/kf-debs"
LIBS="$HOME/kf-libs"
mkdir -p "$DEBS" "$LIBS"

bajar_deb() {
  local paquete="$1"
  cd "$DEBS" || return 1
  if ls "${paquete}"_*.deb >/dev/null 2>&1; then return 0; fi
  apt-get download "$paquete" >/dev/null 2>&1 && echo "  bajado: $paquete" || echo "  NO disponible: $paquete"
}

echo "== 1. Librerias de Electron =="
for paquete in libnspr4 libnss3 libasound2t64 libatk1.0-0t64 libatk-bridge2.0-0t64 libcups2t64 \
  libdrm2 libgbm1 libpango-1.0-0 libcairo2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
  libxrandr2 libatspi2.0-0t64 libgtk-3-0t64 libglib2.0-0t64 libdbus-1-3 libexpat1 libx11-6 libxcb1; do
  bajar_deb "$paquete"
done

echo "== 2. Servidor X virtual (xvfb de universe) =="
cd "$DEBS" || exit 1
for paquete in xserver-common x11-xkb-utils libxfont2 xkb-data xauth libaudit1 libnettle8t64 \
  libselinux1 libunwind8 libgl1 libsystemd0; do
  bajar_deb "$paquete"
done
if ! ls xvfb_*.deb >/dev/null 2>&1; then
  # xvfb no esta en los indices de apt de esta WSL: se baja directo del archivo de Ubuntu.
  curl -sfL "http://archive.ubuntu.com/ubuntu/pool/universe/x/xorg-server/xvfb_21.1.22-1ubuntu1_amd64.deb" \
    -o "xvfb_21.1.22-1ubuntu1_amd64.deb" && echo "  bajado: xvfb (directo)" || echo "  FALLO: xvfb"
fi
for d in *.deb; do dpkg -x "$d" "$LIBS" 2>/dev/null; done

if [ ! -x "$HOME/proot" ]; then
  curl -sfL https://proot.gitlab.io/proot/bin/proot -o "$HOME/proot" && chmod +x "$HOME/proot" \
    && echo "  proot instalado" || { echo "  FALLO: no pude bajar proot"; exit 1; }
fi

export LD_LIBRARY_PATH="$LIBS/usr/lib/x86_64-linux-gnu:${LD_LIBRARY_PATH:-}"
export PATH="$LIBS/usr/bin:$PATH"

echo "== 3. Xvfb :99 =="
pkill -f 'Xvfb :99' 2>/dev/null
sleep 1
nohup "$HOME/proot" \
  -b "$LIBS/usr/bin/xkbcomp:/usr/bin/xkbcomp" \
  -b "$LIBS/usr/bin/xauth:/usr/bin/xauth" \
  -b "$LIBS/usr/share/X11:/usr/share/X11" \
  "$LIBS/usr/bin/Xvfb" :99 -screen 0 1280x1024x24 -nolisten tcp > /tmp/xvfb-korforge.log 2>&1 &
sleep 6
if ! pgrep -f 'Xvfb :99' > /dev/null; then
  echo "Xvfb no arranco:"; tail -10 /tmp/xvfb-korforge.log; exit 1
fi
echo "  Xvfb en :99"

echo "== 4. AppImage =="
export DISPLAY=:99
export APPIMAGE_EXTRACT_AND_RUN=1
LOG=/tmp/korforge-linux.log
pkill -f 'appimage_extracted_.*/korforge' 2>/dev/null
sleep 1
cd "$(dirname "$APPIMAGE")" || exit 1
nohup "$APPIMAGE" --remote-debugging-port=9336 > "$LOG" 2>&1 &
sleep 20

echo "== 5. Comprobaciones =="
PUERTO=$(grep -o 'Servidor activo en http://localhost:[0-9]*' "$LOG" | tail -1 | sed -E 's#.*:([0-9]+)#\1#')
if [ -z "$PUERTO" ]; then
  echo "La app no arranco. Log:"; grep -v '/tmp/appimage_extracted' "$LOG" | tail -15; exit 1
fi
echo "  puerto del API: $PUERTO"
echo -n "  /api/config sin token (debe ser 401): "
curl -s -o /dev/null -w '%{http_code}\n' "http://127.0.0.1:$PUERTO/api/config"
TOKEN=$(curl -s "http://127.0.0.1:$PUERTO/api/session" | sed -E 's#.*"token":"([a-f0-9]+)".*#\1#')
echo -n "  /api/config con token (debe traer la version): "
curl -s -H "x-korforge-token: $TOKEN" "http://127.0.0.1:$PUERTO/api/config" | head -c 80
echo
echo -n "  aviso de clave de CurseForge en el log: "
grep -ci 'Sin clave de CurseForge' "$LOG" || true

echo
echo "Listo. La app sigue viva en :99 (CDP en 9336). Para verla, exporta DISPLAY=:99 en esa sesion."
echo "Para pararla: pkill -f 'appimage_extracted_'; pkill -f 'Xvfb :99'"
