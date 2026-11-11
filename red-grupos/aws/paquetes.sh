#!/usr/bin/env bash
# Baja por SSM (sin SSH) lo que generó crear-red.sh en el hub: paquete de cada grupo + credenciales.
# Deja ./paquetes-hub/ y ./paquetes-hub.zip en CloudShell. La CA privada (ca.key) NO se baja.
set -euo pipefail
STACK="${STACK:-red-grupos-hub}"
INST="$(aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[?OutputKey=='Instancia'].OutputValue" --output text)"

remoto() {   # ejecuta un comando en el hub y devuelve su salida
  local cid
  cid="$(aws ssm send-command --instance-ids "$INST" --document-name AWS-RunShellScript \
         --parameters "commands=[\"$1\"]" --query Command.CommandId --output text)"
  aws ssm wait command-executed --command-id "$cid" --instance-id "$INST" 2>/dev/null || true
  aws ssm get-command-invocation --command-id "$cid" --instance-id "$INST" --query StandardOutputContent --output text
}

rm -rf paquetes-hub paquetes-hub.zip
mkdir -p paquetes-hub
S=/opt/red/red-grupos/salida
remoto "cat $S/credenciales.txt" > paquetes-hub/credenciales.txt
for g in $(remoto "ls $S/paquetes"); do
  mkdir -p "paquetes-hub/$g"
  remoto "cat $S/paquetes/$g/ca.crt" > "paquetes-hub/$g/ca.crt"
  remoto "cat $S/paquetes/$g/puente.conf" > "paquetes-hub/$g/puente.conf"
  echo "   $g: ca.crt + puente.conf"
done
(command -v zip >/dev/null && zip -qr paquetes-hub.zip paquetes-hub) || tar czf paquetes-hub.tar.gz paquetes-hub
ls -1 paquetes-hub.* 2>/dev/null
