# Conectividad entre los 3 grupos: guía a prueba de tontos

Esta guía sirve para que **las placas y las Raspberry de los 3 grupos hablen entre sí** y
todos vean sus datos en **un mismo dashboard**. Ve paso por paso, en orden, sin saltarte nada.
Si algo falla, busca el síntoma en [Si algo falla](#si-algo-falla).

---

## 0. Lo primero: entiende el dibujo (1 minuto)

Hay **dos formas de conectarse**. Las dos llegan al mismo lado.

```
 FORMA A: por radio (ESP-NOW), sin WiFi
 ──────────────────────────────────────
  NodeMCU grupo-1 ))) NodeMCU grupo-2 ))) NodeMCU grupo-3 ))) CONCENTRADOR ──USB──► Raspberry
  (cada placa le pasa el mensaje a la siguiente, hasta 3 saltos)

 FORMA B: entre Raspberry, por la red (MQTT con TLS)
 ───────────────────────────────────────────────────
  Raspberry grupo-1 ─┐
  Raspberry grupo-2 ─┼──── cifrado TLS, puerto 8884 ────► Raspberry HUB
  Raspberry grupo-3 ─┘                                       │
                                                             └── dashboard https://IP_DEL_HUB:9443
                                                                 (entran los 3 grupos)
```

- **Forma A** = carpeta [`malla_espnow/`](malla_espnow/). Cada grupo sube **el mismo archivo** a su NodeMCU.
- **Forma B** = carpeta [`red-grupos/`](red-grupos/). Una Raspberry es el **HUB** y las otras se conectan a ella.

**Quién hace qué:**

| Persona | Qué hace | Sección |
|---|---|---|
| Cada grupo | Sube el sketch a su NodeMCU | [1](#1-forma-a-cada-grupo-sube-el-sketch-a-su-nodemcu) |
| El dueño del concentrador | Sube el sketch con `PERFIL 1` y lo enchufa a la Raspberry | [2](#2-forma-a-el-concentrador-solo-una-persona) |
| El dueño del HUB | Corre `crear-red.sh` y reparte paquetes | [3](#3-forma-b-la-raspberry-hub-solo-una-persona) |
| Cada grupo con Raspberry | Instala su paquete | [4](#4-forma-b-cada-raspberry-de-grupo) |
| Todos | Abren el dashboard | [5](#5-ver-el-dashboard) |

---

## 1. FORMA A: cada grupo sube el sketch a su NodeMCU

### Lo que necesitas
- [ ] Una **NodeMCU / ESP8266**. **Un ESP32 NO sirve.**
- [ ] Un cable USB **de datos**. Muchos cables solo cargan: si el PC no detecta la placa, cambia el cable.
- [ ] Arduino IDE instalado.

### Pasos
1. **Descarga este repo:** botón verde **Code → Download ZIP** y descomprímelo.
   - La carpeta debe llamarse **`malla_espnow`**, igual que el archivo `malla_espnow.ino`. Si se llama distinto, Arduino no lo abre.
   - **No pongas otro `.ino` dentro de esa carpeta.** Arduino junta todos los `.ino` de la carpeta y la compilación falla.
2. **Instala el core de la placa:** Arduino IDE → *Herramientas → Placa → Gestor de tarjetas* → busca `esp8266` →
   instala **"esp8266 by ESP8266 Community" versión 3.1.2**. Tiene que ser **exactamente la 3.1.2**.
3. **Abre** `malla_espnow/malla_espnow.ino`.
4. **Elige la placa y el puerto:**
   - *Herramientas → Placa* → **NodeMCU 1.0 (ESP-12E Module)**
   - *Herramientas → Puerto* → el de tu placa. Si no sale ninguno, instala el driver **CH340** o **CP2102** (depende de tu placa).
5. **Cambia SOLO esta línea** (está arriba, línea ~36):
   ```c
   #define NOMBRE_NODO     ""        // ← pon aquí el nombre de TU grupo, ej: "grupo-2"
   ```
   - El nombre tiene que ser **distinto en cada placa**. Usa solo letras, números, `-` y `_`, sin espacios ni tildes.
   - Ese nombre es el que se verá en el dashboard.
   - **NO toques nada más**: ni `PERFIL`, ni `CANAL`, ni la clave. Si una placa usa otro canal, queda fuera de la malla.
6. **Sube el sketch** con la flecha (→) y espera a que diga **"Subido"** o **"Hecho"**.
7. **Comprueba que funciona** (opcional): *Herramientas → Monitor Serie* a **115200 baudios**. Debe aparecer:
   ```
   === Malla ESP-NOW · nodo de invernadero (solo radio) ===
   solo radio en el canal 6 ...
   ```
8. **Déjala encendida** cerca de otra placa o del concentrador. En unos **10 segundos** tu grupo aparece en el dashboard.

> Los datos que manda el nodo son **simulados** (temperatura, humedad, suelo y flujo de agua) porque no tiene sensores conectados.
> Van **cifrados** (RSA-2048 + AES-256-GCM): las placas que retransmiten no pueden leerlos, solo la Raspberry.

---

## 2. FORMA A: el concentrador (solo una persona)

El concentrador es una NodeMCU que **escucha la malla** y le pasa todo a la Raspberry por USB.

1. Haz los pasos 1 a 4 de arriba.
2. Cambia `#define PERFIL 0` por **`#define PERFIL 1`**. No hace falta cambiar `NOMBRE_NODO`, porque el concentrador se llama `concentrador` solo.
3. Súbelo y **conéctalo por USB a la Raspberry** (o al PC que hace de Raspberry).
4. En la Raspberry corre el puente serie del proyecto de la pasarela: `npm run puente -- <puerto>` (por ejemplo `/dev/ttyUSB0`).
   - **Cierra el Monitor Serie de Arduino antes.** El puerto no se puede usar en dos programas a la vez.

---

## 3. FORMA B: la Raspberry HUB (solo una persona)

**Antes de empezar**, pónganse de acuerdo en dos cosas:
- [ ] **Cuál Raspberry es el HUB.**
- [ ] **Los nombres de los 3 grupos** (ej: `florasense grupo2 grupo3`), sin espacios.

Y en la Raspberry HUB:
- [ ] Tiene **Docker** instalado (`docker --version` responde).
- [ ] Tiene una **IP fija**: resérvala en el router o hotspot. **La IP queda grabada en el certificado**, así que si cambia hay que rehacer todo.
- [ ] Los puertos **8884** y **9443** están abiertos para los demás.

Pasos:
```bash
git clone https://github.com/savkacarvajal/florasense-red-3-grupos.git
cd florasense-red-3-grupos/red-grupos
hostname -I                                          # anota la IP de esta Raspberry
./crear-red.sh <IP_DEL_HUB> florasense grupo2 grupo3 # usa los nombres que acordaron
docker compose up -d
```

Esto crea la carpeta `salida/`. **Nunca la subas a GitHub** (ya está en `.gitignore`):

| Archivo | Qué hacer con él |
|---|---|
| `salida/paquetes/<grupo>/` | Dale a **cada grupo solo SU carpeta** (por pendrive, Discord, etc.) |
| `salida/credenciales.txt` | Comparte **solo la clave de `panel`** con todos (sirve para el dashboard) |
| `salida/ca-private/ca.key` | **NO sale de esta Raspberry. Nunca.** |

---

## 4. FORMA B: cada Raspberry de grupo

Recibiste una carpeta con **`ca.crt`** y **`puente.conf`**. Si tu Mosquitto está instalado con `apt`:

```bash
sudo mkdir -p /etc/mosquitto/red-grupos
sudo cp ca.crt /etc/mosquitto/red-grupos/
sudo cp puente.conf /etc/mosquitto/conf.d/
sudo sed -i 's#/mosquitto/config/red-grupos/ca.crt#/etc/mosquitto/red-grupos/ca.crt#' /etc/mosquitto/conf.d/puente.conf
sudo systemctl restart mosquitto
```

Si tu Mosquitto corre en Docker, sigue [`red-grupos/DETALLE-TECNICO.md`](red-grupos/DETALLE-TECNICO.md) (paso 2).

**¿Quedó bien?** Pídele al dueño del HUB que corra `docker logs red_grupos_hub`. Tiene que salir
`New bridge connected ... as puente-<tu_grupo>`. Además, en el dashboard tu grupo aparece como **Puente activo**.

**¿No tienes Raspberry todavía?** Puedes probar desde un PC con `mosquitto-clients` instalado:
```bash
./red-grupos/grupo/simular-grupo.sh <IP_DEL_HUB> <tu_grupo> <tu_clave> ca.crt
```
Manda datos falsos cada 3 segundos.

---

## 5. Ver el dashboard

1. Conéctate a la **misma red** que el HUB.
2. Abre **`https://<IP_DEL_HUB>:9443`**. Tiene que ser `https`, no `http`.
3. El navegador va a decir **"conexión no segura"**. **Es normal**: el certificado lo firmó la CA de la red y no una autoridad pública. Entra en *Avanzado → Continuar*.
4. Usuario **`panel`**, con la clave que te pasó el dueño del HUB.
5. El dashboard es **solo de lectura**: desde ahí nadie puede prender la bomba de otro grupo.

---

## Si algo falla

| Síntoma | Causa | Solución |
|---|---|---|
| Arduino no compila | El core no es la 3.1.2, la placa es un ESP32 o hay otro `.ino` en la carpeta | Instala la versión 3.1.2, usa una NodeMCU y deja un solo `.ino` |
| No aparece el puerto | El cable solo carga o falta el driver | Cambia el cable o instala el driver CH340/CP2102 |
| Monitor Serie: `sin respuesta ... reintento` | El concentrador o la Raspberry están apagados, o la placa está muy lejos | Acércate o pon otra placa al medio, porque cada placa retransmite |
| Dos grupos salen con el mismo nombre | Repitieron `NOMBRE_NODO` | Cada placa necesita un nombre distinto |
| Una placa no se ve con las otras | Le cambiaron el `CANAL` | Todas las placas van en el canal **6** |
| `not authorised` en el puente | La clave es incorrecta o el paquete es de otro grupo | Usa **tu** carpeta de `paquetes/` |
| El puente no conecta | La IP del HUB cambió o el firewall bloquea el 8884 | Fija la IP. Si cambió, rehaz `crear-red.sh` (borra `salida/`) |
| El dashboard no carga | Entraste con `http` o el puerto 9443 está cerrado | Usa `https://...:9443` |
| El dashboard carga pero no muestra datos | El puente está caído o el `topic` no coincide | Revisa el log del HUB y la línea `topic` de `puente.conf` |

## Reglas de oro

1. **Mismo archivo, mismo canal y nombre distinto** en todas las placas.
2. **Nunca subas** `.pem`, `.key`, `salida/` ni claves a GitHub.
3. **Cada grupo recibe solo su paquete.**
4. La **IP del HUB no se cambia** después de correr `crear-red.sh`.

---

Detalle técnico de la Forma B (seguridad, ACL, tópicos y trampas): [`red-grupos/DETALLE-TECNICO.md`](red-grupos/DETALLE-TECNICO.md) ·
Instrucciones originales de la malla: [`malla_espnow/LEEME.txt`](malla_espnow/LEEME.txt)
