# Conectividad entre los 3 grupos: guía a prueba de tontos

Esta guía sirve para que **cada grupo junte los datos de sus placas en su propia Raspberry** y
para que **las 3 Raspberry compartan los datos entre ellas**. Ve paso por paso, en orden, sin saltarte nada.
Si algo falla, busca el síntoma en [Si algo falla](#si-algo-falla).

## Los grupos

Usen **exactamente estos nombres**. Valen para el sketch, para `crear-red.sh` y para el dashboard.
**Todas las placas de los 3 grupos van en el canal 6**, que es el que trae el sketch.

| Grupo | Integrante de referencia | Nombre del grupo | Nodo 1 | Nodo 2 |
|---|---|---|---|---|
| Grupo 1 | Martín Díaz | `grupo-1` | `grupo-1-a` | `grupo-1-b` |
| Grupo 2 | Matías Nonque | `grupo-2` | `grupo-2-a` | `grupo-2-b` |
| Grupo 3 | Savka (FloraSense) | `grupo-3` | `grupo-3-a` | `grupo-3-b` |

El dashboard separa los datos de cada grupo **por el nombre del nodo**: todo lo que empieza con `grupo-1` es del grupo 1.
Por eso el nombre se respeta al pie de la letra.

> **Pendiente:** acordar cuál de las 3 Raspberry es el **HUB** (ver [qué es el hub](#qué-es-el-hub)).

---

## 0. Lo primero: entiende el dibujo (1 minuto)

**Cada grupo tiene lo mismo:** 3 NodeMCU (2 nodos y 1 concentrador), una Raspberry y su propio dashboard.

```
 PARTE A: dentro de CADA grupo (por radio ESP-NOW, sin WiFi)
 ────────────────────────────────────────────────────────────
   NodeMCU nodo-a ))) NodeMCU nodo-b ))) NodeMCU CONCENTRADOR ──USB──► Raspberry del grupo ──► dashboard del grupo
     PERFIL 0          PERFIL 0            PERFIL 1                  (descifra los datos)    (filtros por grupo)
   (miden y retransmiten)               (solo escucha, no mide)
   Todo en el canal 6. Cada grupo cifra con SU clave: el concentrador de otro grupo
   puede retransmitir tus datos, pero no puede leerlos.

 PARTE B: ENTRE los 3 grupos (por la red, MQTT con TLS)
 ───────────────────────────────────────────────────────
   Raspberry grupo-1 ─┐
   Raspberry grupo-2 ─┼──── cifrado TLS, puerto 8884 ────► Raspberry HUB
   Raspberry grupo-3 ─┘                                       │
                                                              └── dashboard compartido https://IP_DEL_HUB:9443
```

- **Parte A** = carpeta [`malla_espnow/`](malla_espnow/) (el sketch) + la pasarela y el dashboard que corren en la Raspberry,
  que están en el repo **privado** `florasense-dashboard-malla` (pídele acceso a Savka).
- **Parte B** = carpeta [`red-grupos/`](red-grupos/).

### Qué es el hub

El hub es **una de las 3 Raspberry, que hace de punto de encuentro**, como un grupo de WhatsApp.
En vez de conectar cada grupo con los otros dos (3 conexiones), todos se conectan solo al hub (1 conexión cada uno).
**No es un aparato extra:** la Raspberry del hub sigue siendo la de su grupo, con su malla y su dashboard.
Solo necesita estar **prendida** y con **IP fija**.

**Quién hace qué:**

| Quién | Qué hace | Sección |
|---|---|---|
| Cada grupo | Crea su clave y la pega en el sketch | [1](#1-parte-a-los-2-nodos-de-cada-grupo) |
| Cada grupo | Sube el sketch a sus 2 nodos | [1](#1-parte-a-los-2-nodos-de-cada-grupo) |
| Cada grupo | Sube el sketch a su concentrador, lo enchufa a su Raspberry y abre el dashboard | [2](#2-parte-a-el-concentrador-y-el-dashboard-de-cada-grupo) |
| Solo el dueño del HUB | Corre `crear-red.sh` y reparte los paquetes | [3](#3-parte-b-la-raspberry-hub-solo-un-grupo) |
| Cada grupo | Instala su paquete en su Raspberry | [4](#4-parte-b-la-raspberry-de-cada-grupo) |
| Todos | Abren el dashboard compartido | [5](#5-ver-el-dashboard-compartido) |

---

## 1. PARTE A: los 2 nodos de cada grupo

### Lo que necesitas
- [ ] **NodeMCU / ESP8266.** **Un ESP32 NO sirve.**
- [ ] Un cable USB **de datos**. Muchos cables solo cargan: si el PC no detecta la placa, cambia el cable.
- [ ] Arduino IDE instalado.

### Paso 0 (una vez por grupo, en la Raspberry del grupo): tu clave

El sketch cifra con una clave **pública**. Solo la Raspberry que tiene la clave **privada** que le corresponde puede leer los datos.
Por eso **cada grupo crea su par de claves** en su Raspberry y pega la pública en el sketch **antes** de subirlo:

```bash
sudo apt install -y nodejs git          # Node 18 o más nuevo
git clone https://github.com/savkacarvajal/florasense-red-3-grupos.git
git clone https://github.com/savkacarvajal/florasense-dashboard-malla.git    # privado: pide acceso
cd florasense-dashboard-malla
node claves.mjs ../florasense-red-3-grupos/malla_espnow/malla_espnow.ino
```

Eso crea `privada.pem`, que **nunca sale de la Raspberry**, y deja `malla_espnow/malla_espnow.ino` con **tu** clave.
Usa **ese** `.ino` para tus 3 placas. Puedes copiarlo al PC donde tengas Arduino IDE.

> Si borras `privada.pem` y creas otra, tienes que volver a subir el sketch a las 3 placas.

### Pasos (repítelos para cada nodo)
1. **Usa el `.ino` con tu clave** del paso 0. Si lo copias a otra carpeta, esa carpeta tiene que llamarse `malla_espnow`.
   - La carpeta debe llamarse **`malla_espnow`**, igual que el archivo `malla_espnow.ino`. Si se llama distinto, Arduino no lo abre.
   - **No pongas otro `.ino` dentro de esa carpeta.** Arduino junta todos los `.ino` de la carpeta y la compilación falla.
2. **Instala el core de la placa:** Arduino IDE → *Herramientas → Placa → Gestor de tarjetas* → busca `esp8266` →
   instala **"esp8266 by ESP8266 Community" versión 3.1.2**. Tiene que ser **exactamente la 3.1.2**.
3. **Abre** `malla_espnow/malla_espnow.ino`.
4. **Elige la placa y el puerto:**
   - *Herramientas → Placa* → **NodeMCU 1.0 (ESP-12E Module)**
   - *Herramientas → Puerto* → el de tu placa. Si no sale ninguno, instala el driver **CH340** o **CP2102** (depende de tu placa).
5. **Cambia SOLO esta línea** (sácala de la [tabla de grupos](#los-grupos)):
   ```c
   #define NOMBRE_NODO     "grupo-3-a"   // línea ~36: el nombre de ESTE nodo
   ```
   - El **nodo 1** lleva `-a` y el **nodo 2** lleva `-b`. **Nunca repitas un nombre.**
   - Usa solo letras, números, `-` y `_`, sin espacios ni tildes.
   - **Deja `PERFIL` en `0` y `CANAL` en `6`.**
6. **Sube el sketch** con la flecha (→) y espera a que diga **"Subido"** o **"Hecho"**.
7. **Comprueba que funciona** (opcional): *Herramientas → Monitor Serie* a **115200 baudios**. Debe aparecer:
   ```
   === Malla ESP-NOW · nodo de invernadero (solo radio) ===
   clave publica del servidor: cargada · identificador: grupo-3-a
   solo radio en el canal 6 ...
   ```
8. **Déjala encendida** cerca de tu otro nodo o de algún concentrador. Cualquier placa del canal 6 retransmite, también las de otros grupos, hasta 3 saltos.

> Los datos son **simulados** (temperatura, humedad, suelo y flujo de agua) porque no hay sensores conectados.
> Van **cifrados** (RSA-2048 + AES-256-GCM): ni los nodos que retransmiten ni el concentrador pueden leerlos, solo la Raspberry.

---

## 2. PARTE A: el concentrador y el dashboard de cada grupo

El concentrador es la **tercera NodeMCU** del grupo. **Escucha la malla** y le pasa todo a la Raspberry por USB. **No mide nada.**

1. Haz los pasos 1 a 4 de arriba, con el `.ino` que tiene tu clave.
2. Cambia esta línea:
   ```c
     #define PERFIL        1      // línea ~46: 1 = concentrador
   ```
   No hace falta tocar `NOMBRE_NODO`: el concentrador se llama `concentrador` solo.
3. Súbelo y **conéctalo por USB a la Raspberry de tu grupo**.
4. **Cierra el Monitor Serie de Arduino** si lo tienes abierto. Dos programas no pueden usar el puerto a la vez.
5. En la Raspberry, arranca el dashboard:
   ```bash
   cd florasense-dashboard-malla
   ls /dev/ttyUSB* /dev/ttyACM*                         # el puerto del concentrador
   sudo usermod -aG dialout $USER                       # SOLO la primera vez; después cierra sesión y vuelve a entrar
   node servidor.mjs --grupo grupo-3 --serie /dev/ttyUSB0
   ```
   (Cambia `grupo-3` por **tu** grupo).
6. Abre **`http://<IP_de_tu_Raspberry>:3100`**. Arriba debe decir **Concentrador conectado**, y tus 2 nodos aparecen en unos 10 segundos.

### Los filtros del dashboard

- **Grupo:** Todos, `grupo-1`, `grupo-2` o `grupo-3`. Cada grupo tiene su color en las tarjetas y en la tabla.
- **Origen:** *Malla (radio)* son tus placas. *Otros grupos (hub)* son los datos que llegan por la Parte B.
- **Nodo:** busca por nombre (ej: `grupo-1-b`). También puedes marcar *Solo activos* para esconder nodos apagados.
- El dashboard recuerda los filtros que dejaste la última vez.

Para ver también a los **otros grupos** en tu dashboard, conecta tu Raspberry al hub (Parte B) y arranca con `--mqtt`:
```bash
node servidor.mjs --grupo grupo-3 --serie /dev/ttyUSB0 --mqtt
```
Así tus datos salen al hub y los de los otros llegan a tu dashboard. Usa `mosquitto_pub` y `mosquitto_sub` del paquete `mosquitto-clients`.

**¿Probar sin placas?** `node claves.mjs && node simulador.mjs grupo-3` y abre `http://localhost:3100`.
Más detalles en el README del repo privado `florasense-dashboard-malla`.

---

## 3. PARTE B: la Raspberry HUB (solo un grupo)

**Antes de empezar:**
- [ ] Acordaron **cuál Raspberry es el HUB**.
- [x] Los nombres de los grupos son `grupo-1`, `grupo-2` y `grupo-3`.

La Raspberry HUB necesita:
- [ ] **Docker** instalado (`docker --version` responde).
- [ ] Una **IP fija**: resérvala en el router o hotspot. **La IP queda grabada en el certificado**, así que si cambia hay que rehacer todo.
- [ ] Los puertos **8884** y **9443** abiertos para los demás.

Pasos:
```bash
git clone https://github.com/savkacarvajal/florasense-red-3-grupos.git
cd florasense-red-3-grupos/red-grupos
hostname -I                                          # anota la IP de esta Raspberry
./crear-red.sh <IP_DEL_HUB> grupo-1 grupo-2 grupo-3 # en este orden: fija el color de cada grupo
docker compose up -d
```

Opcional: para que el dashboard compartido muestre nombres más claros, edita `dashboard/config.js`
(por ejemplo `nombre: "Grupo 1 · Martín Díaz"`). **No cambies el `id`.**

Esto crea la carpeta `salida/`. **Nunca la subas a GitHub** (ya está en `.gitignore`):

| Archivo | Qué hacer con él |
|---|---|
| `salida/paquetes/<grupo>/` | A **cada grupo** le das **solo SU carpeta** (por pendrive o Discord privado). El HUB también instala la suya |
| `salida/credenciales.txt` | Con todos compartes **solo la clave de `panel`**, que sirve para el dashboard |
| `salida/ca-private/ca.key` | **NO sale de esta Raspberry. Nunca.** |

---

## 4. PARTE B: la Raspberry de cada grupo

Recibiste una carpeta con **`ca.crt`** y **`puente.conf`**. Si tu Mosquitto está instalado con `apt`:

```bash
sudo mkdir -p /etc/mosquitto/red-grupos
sudo cp ca.crt /etc/mosquitto/red-grupos/
sudo cp puente.conf /etc/mosquitto/conf.d/
sudo sed -i 's#/mosquitto/config/red-grupos/ca.crt#/etc/mosquitto/red-grupos/ca.crt#' /etc/mosquitto/conf.d/puente.conf
sudo systemctl restart mosquitto
```

Si tu Mosquitto corre en Docker, sigue [`red-grupos/DETALLE-TECNICO.md`](red-grupos/DETALLE-TECNICO.md) (paso 2).

**La línea `topic`** al final de `puente.conf` manda `iot/v1/devices/<nodo>/telemetry` al hub. Es justo donde publica
el dashboard con `--mqtt`, así que **no hay que cambiarla**.

**¿Quedó bien?** Pídele al dueño del HUB que corra `docker logs red_grupos_hub`. Tiene que salir
`New bridge connected ... as puente-<tu_grupo>`. Además, en el dashboard compartido tu grupo aparece como **Puente activo**.

### Para ver los datos de los otros grupos en TU dashboard

Agrega esta línea al final de `puente.conf` y reinicia Mosquitto:
```
topic # in 1 red-entrante/ red/
```
Los datos de todos llegan a tu Mosquitto local bajo `red-entrante/<grupo>/...`. El dashboard con `--mqtt` los lee de ahí
y los muestra con el filtro *Otros grupos (hub)*. El hub permite que cada grupo **lea** todo, pero cada grupo **solo puede escribir** lo suyo.

**¿No tienes Raspberry todavía?** Puedes probar desde un PC con `mosquitto-clients` instalado:
```bash
./red-grupos/grupo/simular-grupo.sh <IP_DEL_HUB> <tu_grupo> <tu_clave> ca.crt
```
Manda datos falsos cada 3 segundos.

---

## 5. Ver el dashboard compartido

Cada grupo **sigue usando su propio dashboard**. Además está el dashboard compartido del hub, que muestra a los 3 grupos juntos:

1. Conéctate a la **misma red** que el HUB.
2. Abre **`https://<IP_DEL_HUB>:9443`**. Tiene que ser `https`, no `http`.
3. El navegador va a decir **"conexión no segura"**. **Es normal**: el certificado lo firmó la CA de la red y no una autoridad pública. Entra en *Avanzado → Continuar*.
4. Usuario **`panel`**, con la clave que te pasó el dueño del HUB.
5. Es **solo de lectura**: desde ahí nadie puede prender la bomba de otro grupo.

---

## Si algo falla

| Síntoma | Causa | Solución |
|---|---|---|
| Arduino no compila | El core no es la 3.1.2, la placa es un ESP32 o hay otro `.ino` en la carpeta | Instala la versión 3.1.2, usa una NodeMCU y deja un solo `.ino` |
| No aparece el puerto | El cable solo carga o falta el driver | Cambia el cable o instala el driver CH340/CP2102 |
| Monitor Serie: `sin respuesta ... reintento` | El concentrador o `servidor.mjs` están apagados, o la placa está muy lejos | Revisa que el dashboard diga *Concentrador conectado*, o acerca la placa |
| Monitor Serie: `clave publica del servidor: FALTA` | No pegaste tu clave | Corre `node claves.mjs ../florasense-red-3-grupos/malla_espnow/malla_espnow.ino` y vuelve a subir |
| Un nodo no llega a ningún concentrador | Le cambiaron el `CANAL` | Todas las placas van en el canal **6** |
| `servidor.mjs` dice `no lo puedo descifrar` | Es un nodo de **otro grupo** (normal), o tu placa tiene una clave vieja | Si es tuyo, vuelve a subirle el `.ino` con tu clave |
| `stty falló` o `Permission denied` en `/dev/ttyUSB0` | Falta el permiso `dialout`, el puerto es otro o el Monitor Serie está abierto | Haz `usermod -aG dialout`, revisa `ls /dev/ttyUSB*` y cierra Arduino |
| Tu nodo sale en el grupo `sin-grupo` | El `NOMBRE_NODO` no empieza con `grupo-N` | Usa el nombre de la [tabla](#los-grupos) |
| Dos nodos salen con el mismo nombre | Repitieron `NOMBRE_NODO` | Usa `-a` y `-b` según la tabla |
| `not authorised` en el puente | La clave es incorrecta o el paquete es de otro grupo | Usa **tu** carpeta de `paquetes/` |
| El puente no conecta | La IP del HUB cambió o el firewall bloquea el 8884 | Fija la IP. Si cambió, rehaz `crear-red.sh` (borra `salida/`) |
| El dashboard compartido no carga | Entraste con `http` o el puerto 9443 está cerrado | Usa `https://...:9443` |
| El dashboard compartido no muestra datos de tu grupo | El puente está caído o el `topic` no coincide | Revisa el log del HUB y la línea `topic` de `puente.conf` |

## Reglas de oro

1. **Todas las placas van en el canal 6.**
2. **Cada nodo lleva un nombre único** (`grupo-X-a` o `grupo-X-b`).
3. **Cada grupo usa su clave:** `privada.pem` no sale de su Raspberry.
4. **Nunca subas** `.pem`, `.key`, `salida/` ni claves a GitHub.
5. **Cada grupo recibe solo su paquete.**
6. La **IP del HUB no se cambia** después de correr `crear-red.sh`.

---

Detalle técnico de la Parte B (seguridad, ACL, tópicos y trampas): [`red-grupos/DETALLE-TECNICO.md`](red-grupos/DETALLE-TECNICO.md) ·
Instrucciones originales de la malla: [`malla_espnow/LEEME.txt`](malla_espnow/LEEME.txt)
