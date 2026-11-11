#!/usr/bin/env bash
# Publica telemetría falsa de un grupo directo al hub (TLS), para probar el dashboard
# sin NodeMCU ni puente. Necesita mosquitto_pub (paquete mosquitto-clients).
# Uso: ./simular-grupo.sh <hub> <grupo> <clave_del_grupo> <ca.crt> [segundos_entre_envios]
set -euo pipefail
HUB="${1:?hub}"; GRUPO="${2:?grupo}"; CLAVE="${3:?clave}"; CA="${4:?ruta a ca.crt}"; PAUSA="${5:-3}"
DISP="sim-$GRUPO"
suelo=55; temp=22

while true; do
  # caminata aleatoria simple para que las curvas se muevan
  suelo=$(( suelo + RANDOM % 7 - 3 )); (( suelo < 20 )) && suelo=20; (( suelo > 90 )) && suelo=90
  temp=$(( temp + RANDOM % 3 - 1 )); (( temp < 15 )) && temp=15; (( temp > 32 )) && temp=32
  bomba=false; (( suelo < 40 )) && bomba=true
  hum=$(( 45 + RANDOM % 15 ))
  msg="{\"temperatureC\": $temp.$(( RANDOM % 10 )), \"airHumidityPct\": $hum, \"soilMoisturePct\": $suelo, \"pumpOn\": $bomba, \"version\": 1}"
  mosquitto_pub -h "$HUB" -p 8884 --cafile "$CA" -u "$GRUPO" -P "$CLAVE" -i "sim-$GRUPO-$$" \
    -t "red/$GRUPO/$DISP/telemetry" -m "$msg" -q 1
  echo "$(date +%T) red/$GRUPO/$DISP/telemetry $msg"
  sleep "$PAUSA"
done
