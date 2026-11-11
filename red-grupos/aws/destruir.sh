#!/usr/bin/env bash
# Borra el hub de AWS (instancia, IP elástica y security group). Las claves y certificados se pierden:
# si vuelves a desplegar, la IP cambia y hay que repartir paquetes nuevos a los 3 grupos.
set -euo pipefail
STACK="${STACK:-red-grupos-hub}"
read -r -p "¿Borrar el stack $STACK? Escribe SI: " r
[ "$r" = "SI" ] || { echo "Cancelado"; exit 1; }
aws cloudformation delete-stack --stack-name "$STACK"
aws cloudformation wait stack-delete-complete --stack-name "$STACK"
echo "Borrado."
