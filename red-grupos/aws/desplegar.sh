#!/usr/bin/env bash
# Crea el hub en AWS y baja los paquetes de cada grupo. Se corre en AWS CloudShell:
#   git clone https://github.com/savkacarvajal/florasense-red-3-grupos.git
#   bash florasense-red-3-grupos/red-grupos/aws/desplegar.sh
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
STACK="${STACK:-red-grupos-hub}"
REGION="${AWS_REGION:-us-east-1}"
export AWS_REGION="$REGION"

echo "== 1/3 Creando el stack $STACK en $REGION (2-3 min)"
aws cloudformation deploy --stack-name "$STACK" --template-file "$AQUI/hub.yaml" --no-fail-on-empty-changeset

salida() { aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
IP="$(salida IpHub)"; INST="$(salida Instancia)"
echo "   IP del hub: $IP   instancia: $INST"

echo "== 2/3 Esperando que la instancia instale Docker y genere certificados (3-5 min)"
aws ec2 wait instance-status-ok --instance-ids "$INST"
for i in $(seq 1 60); do
  CID="$(aws ssm send-command --instance-ids "$INST" --document-name AWS-RunShellScript \
        --parameters 'commands=["test -f /opt/red/LISTO && echo SI || echo NO"]' --query Command.CommandId --output text 2>/dev/null || true)"
  if [ -n "$CID" ]; then
    sleep 4
    R="$(aws ssm get-command-invocation --command-id "$CID" --instance-id "$INST" --query StandardOutputContent --output text 2>/dev/null || true)"
    [ "$(echo "$R" | tr -d '[:space:]')" = "SI" ] && break
  fi
  printf "."; sleep 10
done
echo

echo "== 3/3 Bajando los paquetes de los grupos"
bash "$AQUI/paquetes.sh"

echo
echo "LISTO."
echo "  Dashboard compartido: https://$IP:9443   (usuario panel, clave en paquetes-hub/credenciales.txt)"
echo "  Descarga la carpeta: CloudShell -> Actions -> Download file -> $(pwd)/paquetes-hub.zip"
echo "  A cada grupo le das SOLO su carpeta paquetes-hub/<grupo>/"
