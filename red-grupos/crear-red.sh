#!/usr/bin/env bash
# Crea la "red de grupos": CA propia, certificado del broker central (hub), usuarios,
# ACL y un paquete por grupo con lo que necesita para conectar su Raspberry.
#
# Se corre UNA sola vez, en la Raspberry que hará de hub.
# Uso: ./crear-red.sh <IP_del_hub> [grupo1 grupo2 grupo3]
# Ej:  ./crear-red.sh 10.23.178.173 florasense grupo2 grupo3
set -euo pipefail

HUB="${1:?Falta la IP (o hostname) de la Raspberry que hace de hub}"
shift
if [ "$#" -gt 0 ]; then GRUPOS=("$@"); else GRUPOS=(grupo1 grupo2 grupo3); fi

BASE="$(cd "$(dirname "$0")" && pwd)"
OUT="$BASE/salida"            # todo lo generado (está en .gitignore)
CERTS="$OUT/certs"
PRIV="$OUT/ca-private"        # ca.key: no sale de esta Raspberry
PAQ="$OUT/paquetes"

if [ -e "$OUT/pwfile" ]; then
  echo "Ya existe $OUT. Si quieres empezar de cero, bórralo a mano (se pierden las claves)." >&2
  exit 1
fi
for g in "${GRUPOS[@]}"; do
  [[ "$g" =~ ^[a-z0-9_-]+$ ]] || { echo "Nombre de grupo inválido: '$g' (solo a-z, 0-9, - y _)" >&2; exit 1; }
done
mkdir -p "$CERTS" "$PRIV" "$PAQ"

if [[ "$HUB" =~ ^[0-9.]+$ ]]; then SAN="IP:$HUB,DNS:localhost,IP:127.0.0.1"; else SAN="DNS:$HUB,DNS:localhost,IP:127.0.0.1"; fi

echo "== CA de la red y certificado del hub ($HUB)"
openssl genrsa -out "$PRIV/ca.key" 2048 2>/dev/null
openssl req -x509 -new -nodes -key "$PRIV/ca.key" -sha256 -days 1825 \
  -subj "/CN=Red Grupos IoT CA" -out "$CERTS/ca.crt"
openssl genrsa -out "$CERTS/server.key" 2048 2>/dev/null
openssl req -new -key "$CERTS/server.key" -subj "/CN=$HUB" -out "$CERTS/server.csr"
openssl x509 -req -in "$CERTS/server.csr" -CA "$CERTS/ca.crt" -CAkey "$PRIV/ca.key" \
  -CAserial "$PRIV/ca.srl" -CAcreateserial -out "$CERTS/server.crt" -days 825 -sha256 \
  -extfile <(printf "subjectAltName=%s\nextendedKeyUsage=serverAuth" "$SAN") 2>/dev/null
rm -f "$CERTS/server.csr"
chmod 600 "$PRIV/ca.key"
chmod 644 "$CERTS/ca.crt" "$CERTS/server.crt" "$CERTS/server.key"  # el usuario mosquitto del contenedor debe leerla

# Se usa el mosquitto_passwd de la MISMA imagen que corre el hub: el de Mosquitto 2.1
# genera hashes que la 2.0 no sabe leer ("Unable to decode password salt").
passwd_cmd() {
  if command -v docker >/dev/null; then
    docker run --rm -u "$(id -u):$(id -g)" -v "$OUT":/c eclipse-mosquitto:2.0 mosquitto_passwd -b /c/pwfile "$1" "$2" 2>/dev/null
  else
    mosquitto_passwd -b "$OUT/pwfile" "$1" "$2"   # Mosquitto por apt en la propia Raspberry
  fi
}
nueva_clave() { openssl rand -base64 18 | tr -d '/+=' | cut -c1-20; }

echo "== Usuarios y ACL"
: > "$OUT/pwfile"
CRED="$OUT/credenciales.txt"
{
  echo "Credenciales de la red de grupos (hub $HUB). NO subir a git ni mandar por grupos de WhatsApp abiertos."
  echo
} > "$CRED"

{
  echo "# Generado por crear-red.sh. Cada grupo solo escribe en su rama y lee todas."
  echo
} > "$OUT/acl"

for g in "${GRUPOS[@]}"; do
  pass="$(nueva_clave)"
  passwd_cmd "$g" "$pass"
  printf "user %s\ntopic write red/%s/#\ntopic read red/#\n\n" "$g" "$g" >> "$OUT/acl"
  echo "puente  $g / $pass" >> "$CRED"

  # Paquete para el grupo: CA pública + config del puente ya rellenada
  mkdir -p "$PAQ/$g"
  cp "$CERTS/ca.crt" "$PAQ/$g/ca.crt"
  sed -e "s/__GRUPO__/$g/g" -e "s/__HUB__/$HUB/g" -e "s/__CLAVE__/$pass/g" \
    "$BASE/grupo/puente.conf.plantilla" > "$PAQ/$g/puente.conf"
  chmod 600 "$PAQ/$g/puente.conf"
done

PANEL_PASS="$(nueva_clave)"
passwd_cmd panel "$PANEL_PASS"
printf "# Usuario del dashboard: solo lectura\nuser panel\ntopic read red/#\n" >> "$OUT/acl"
echo "panel   panel / $PANEL_PASS   (dashboard, solo lectura)" >> "$CRED"
chmod 644 "$OUT/pwfile" "$OUT/acl"

# Lista de grupos del dashboard (el orden fija el color de cada uno)
{
  echo "// Generado por crear-red.sh. Puedes cambiar los \"nombre\" a mano."
  echo "window.RED_CONFIG = {"
  echo "  grupos: ["
  for g in "${GRUPOS[@]}"; do echo "    { id: \"$g\", nombre: \"$g\" },"; done
  echo "  ],"
  echo "  segundosSinDatos: 30,"
  echo "};"
} > "$BASE/dashboard/config.js"
chmod 600 "$CRED"

echo
echo "Listo. Generado en $OUT"
echo "  - Levanta el hub:      docker compose -f $BASE/docker-compose.yml up -d"
echo "  - Dashboard:           https://$HUB:9443  (usuario panel)"
echo "  - Entrega a cada grupo SOLO su carpeta de $PAQ/<grupo>/ (por pendrive o scp)"
echo
cat "$CRED"
