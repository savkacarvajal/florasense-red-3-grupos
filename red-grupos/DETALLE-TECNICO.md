# Red de grupos: telemetría cifrada entre Raspberry + dashboard compartido

Tres grupos, cada uno con su Raspberry y su broker Mosquitto. Una de las Raspberry hace
de **hub**: los otros grupos le mandan su telemetría por un **puente MQTT con TLS**, y el
hub sirve un **dashboard web** al que entran los 3 equipos.

```
 Grupo 1                Grupo 2                Grupo 3
 NodeMCU                NodeMCU                NodeMCU
    │ MQTT local           │                      │
 Mosquitto ─┐           Mosquitto ─┐           Mosquitto ─┐
            │ puente TLS :8884     │ puente TLS :8884     │ puente TLS :8884
            └──────────────► HUB (Mosquitto) ◄────────────┘
                              │ HTTPS + WSS :9443
                     navegadores de los 3 equipos (dashboard)
```

## Qué protege

| Tramo | Cómo va |
|---|---|
| Raspberry → hub | MQTT sobre TLS (puerto 8884). El certificado del hub se valida contra la CA de la red (`bridge_insecure false`). |
| Navegador → hub | HTTPS y WebSocket seguro (`wss://`, puerto 9443). |
| Autenticación | Usuario y clave por grupo. Sin usuario no entra nadie (`allow_anonymous false`). |
| Autorización (ACL) | Cada grupo **solo escribe** en `red/<su_grupo>/#` y lee todo `red/#`. Un grupo no puede hacerse pasar por otro. El usuario `panel` es **solo lectura**. |
| Comandos | El puente solo saca telemetría (`out`). Los comandos a la bomba nunca salen de la red local de cada grupo, y el dashboard no puede mandar órdenes. |

Probado en local con la imagen `eclipse-mosquitto:2.0`. Resultado: los puentes negocian
TLS 1.3, se rechaza la conexión sin TLS y la clave mala, y se descartan las publicaciones de
`grupo2` en `red/florasense/...` y las del usuario `panel`.

## Tópicos

Todo lo que llega al hub vive bajo `red/<grupo>/<dispositivo>/<tipo>`:

- `red/florasense/29b41b47-.../telemetry` → `{"temperatureC": 23.4, "soilMoisturePct": 48, "pumpOn": false}`
- `red/<grupo>/_puente/estado` → `1` (puente arriba) o `0` (puente caído). Lo publica Mosquitto solo.

El dashboard muestra cualquier JSON. Los campos numéricos salen como métrica con su
mini-gráfico y los `true`/`false` como estado. Los nombres conocidos (`temperatureC`,
`airHumidityPct`, `soilMoisturePct`, `pumpOn`, `fanOn`, `rssi`…) tienen etiqueta en español.
Para agregar otros, edita `METRICAS` en `dashboard/app.js`.

## Paso 1: en la Raspberry del hub (una sola vez)

```bash
cd red-grupos
./crear-red.sh <IP_del_hub> florasense grupo2 grupo3   # usa los nombres reales de los grupos
docker compose up -d
```

`crear-red.sh` deja todo en `salida/`, que está en `.gitignore`:

- `certs/`: CA pública y certificado del hub. `ca-private/ca.key` **no sale de esta Raspberry**.
- `pwfile` y `acl`: usuarios y permisos del hub.
- `credenciales.txt`: clave de cada puente y del usuario `panel`.
- `paquetes/<grupo>/`: `ca.crt` y `puente.conf` ya rellenado. **A cada grupo se le entrega solo su carpeta.**

También reescribe `dashboard/config.js` con la lista de grupos. El orden fija el color de
cada grupo, y el `nombre` visible se puede cambiar a mano.

> La IP del hub queda dentro del certificado. Si la Raspberry cambia de IP, hay que volver a
> generar todo (borra `salida/`). Conviene fijarle la IP en el router o hotspot.

## Paso 2: en la Raspberry de cada grupo

Copia tu carpeta `paquetes/<grupo>/` y agrégala al Mosquitto local.

**Mosquitto en Docker** (como el `docker-compose.yml` de FloraSense):

1. Copia la carpeta a `infra/red-grupos/mi-paquete/`.
2. En el servicio `mosquitto` agrega el volumen
   `- ./infra/red-grupos/mi-paquete:/mosquitto/config/red-grupos:ro`.
3. Al final de `infra/mosquitto/mosquitto.conf` agrega `include_dir /mosquitto/config/red-grupos`.
4. Corre `docker compose restart mosquitto`.

**Mosquitto instalado con apt:**

```bash
sudo mkdir -p /etc/mosquitto/red-grupos
sudo cp ca.crt /etc/mosquitto/red-grupos/
sudo cp puente.conf /etc/mosquitto/conf.d/
sudo sed -i 's#/mosquitto/config/red-grupos/ca.crt#/etc/mosquitto/red-grupos/ca.crt#' /etc/mosquitto/conf.d/puente.conf
sudo systemctl restart mosquitto
```

Si tu grupo no usa los tópicos `iot/v1/devices/<id>/telemetry`, cambia la línea `topic` del
final de `puente.conf`. Ahí mismo hay un ejemplo.

Para comprobarlo, en el log del hub (`docker logs red_grupos_hub`) debe aparecer
`New bridge connected ... as puente-<grupo>`, y en el dashboard **Puente activo**.

## Paso 3: el dashboard

1. Abre `https://<IP_del_hub>:9443` desde cualquier equipo de la misma red.
2. El navegador avisará que el certificado no es de confianza. Es esperable: lo firmó la CA
   de la red, no una autoridad pública. Acepta el aviso o importa `ca.crt` en el navegador.
3. Entra con usuario `panel` y la clave de `credenciales.txt`.

## Probar sin hardware

```bash
./grupo/simular-grupo.sh <IP_del_hub> <grupo> <clave_del_grupo> salida/certs/ca.crt
```

Publica telemetría falsa de ese grupo directo al hub cada 3 segundos. Necesita `mosquitto_pub`
(paquete `mosquitto-clients`).

## Trampas conocidas

- **Usa el `mosquitto_passwd` de la misma versión que el hub.** El de Mosquitto 2.1 genera
  hashes que la 2.0 no lee (`Unable to decode password salt ... removing entry`), y todos
  quedan `not authorised`. Por eso `crear-red.sh` usa el de la imagen Docker cuando hay Docker.
- Mosquitto 2.0 avisa que `acl` y `pwfile` son legibles por todos (`world readable`). Se
  dejan así porque el contenedor corre con otro usuario (`mosquitto`, uid 1883) y necesita leerlos.
- Los puertos 8884 y 9443 del hub deben estar abiertos para los otros grupos (firewall o
  aislamiento de clientes del hotspot).
