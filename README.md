# Conectividad entre los 3 grupos: guía a prueba de tontos

Esta guía sirve para que **cada grupo junte los datos de sus placas en su propia Raspberry**, los **guarde en local**
y los **suba cifrados a AWS**. Cada grupo ve sus datos en el dashboard de su Raspberry. Ve paso por paso, en orden, sin saltarte nada.
Si algo falla, busca el síntoma en [Si algo falla](#si-algo-falla).

## Los grupos

Usen **exactamente estos nombres**. Valen para el sketch, para la Raspberry y para la nube.
**Todas las placas de los 3 grupos van en el canal 6**, que es el que trae el sketch.

| Grupo | Integrante de referencia | Nombre del grupo | Nodo 1 | Nodo 2 |
|---|---|---|---|---|
| Grupo 1 | Martín Díaz | `grupo-1` | `grupo-1-a` | `grupo-1-b` |
| Grupo 2 | Savka (FloraSense) | `grupo-2` | `grupo-2-a` | `grupo-2-b` |
| Grupo 3 | Matías Nonque | `grupo-3` | `grupo-3-a` | `grupo-3-b` |

El dashboard separa los datos de cada grupo **por el nombre del nodo**: todo lo que empieza con `grupo-1` es del grupo 1.
Por eso el nombre se respeta al pie de la letra.

> La nube (AWS) la crea **una sola persona**. Los otros grupos solo reciben su paquete ([sección 3](#3-parte-b-la-nube-aws-solo-una-persona)).

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

 PARTE B: de cada Raspberry a la NUBE (AWS)
 ─────────────────────────────────────────
   Raspberry grupo-1 ─┐   cada 5 s, lote cifrado con la CLAVE PÚBLICA de AWS
   Raspberry grupo-2 ─┼── (RSA-OAEP + AES-256-GCM) por HTTPS ──► EC2 en AWS ──► S3 (cifrado AES-256)
   Raspberry grupo-3 ─┘                                            │  descifra con la clave PRIVADA de AWS
                                                                   └── dashboard de los 3 grupos (https://<IP>)
   Cada Raspberry además guarda todo en local (datos/AAAA-MM-DD.jsonl). Si se corta internet,
   sigue guardando y lo sube cuando vuelve.
```

- **Parte A** = carpeta [`malla_espnow/`](malla_espnow/) (el sketch).
- **Lo que corre en la Raspberry y en AWS** está en el repo **privado** `florasense-dashboard-malla` (pídele acceso a Savka).

**Quién hace qué:**

| Quién | Qué hace | Sección |
|---|---|---|
| Cada grupo | Crea su clave y la pega en el sketch | [1](#1-parte-a-los-2-nodos-de-cada-grupo) |
| Cada grupo | Sube el sketch a sus 2 nodos | [1](#1-parte-a-los-2-nodos-de-cada-grupo) |
| Cada grupo | Sube el sketch a su concentrador, lo enchufa a su Raspberry y abre el dashboard | [2](#2-parte-a-el-concentrador-y-el-dashboard-de-cada-grupo) |
| Solo una persona | Crea la nube en AWS y reparte los paquetes | [3](#3-parte-b-la-nube-aws-solo-una-persona) |
| Cada grupo | Conecta su Raspberry a la nube con su paquete | [4](#4-parte-b-conectar-tu-raspberry-a-la-nube) |
| Solo el grupo de Savka | Abre el dashboard de la nube | [5](#5-el-dashboard-de-la-nube) |

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
- **Nodo:** busca por nombre (ej: `grupo-1-b`). También puedes marcar *Solo activos* para esconder nodos apagados.
- El dashboard recuerda los filtros que dejaste la última vez.
- En la Raspberry ves **tus** nodos. Los 3 grupos juntos se ven en el [dashboard de la nube](#5-el-dashboard-de-la-nube).

Cada lectura queda guardada en la Raspberry, en `florasense-dashboard-malla/datos/AAAA-MM-DD.jsonl` (un archivo por día).

**¿Probar sin placas?** `node claves.mjs && node simulador.mjs grupo-3` y abre `http://localhost:3100`.

---

## 3. PARTE B: la nube AWS (solo una persona)

Lo hace **una sola persona** desde su AWS Academy Learner Lab. El código es privado, así que se sube a CloudShell como archivo:

1. En el PC, dentro de `florasense-dashboard-malla`: `bash nube/empaquetar.sh` → crea `~/Descargas/nube-aws.tar.gz`.
2. Learner Lab → **Start Lab** → espera el punto verde → **AWS** → abre **CloudShell** (`>_`). La región tiene que ser **us-east-1**.
3. En CloudShell: **Actions → Upload file** → `nube-aws.tar.gz`.
4. Pega:
   ```bash
   tar xzf nube-aws.tar.gz && bash nube/desplegar.sh
   ```
5. Espera unos **8 a 10 minutos**. Al final muestra la URL `https://<IP>`.
6. **Actions → Download file** → `/home/cloudshell-user/paquetes-nube.zip`.
7. A cada grupo le das **solo su carpeta** `paquetes-nube/<grupo>/`. Con ella su Raspberry **sube** datos, pero no puede ver el panel.
   **`panel.txt` no se comparte**: el dashboard de la nube es solo del grupo de Savka.

Lo que crea en AWS:
- **S3** cifrado con **AES-256**, sin acceso público y solo por HTTPS. Ahí queda cada lote en `lecturas/fecha=AAAA-MM-DD/grupo=<grupo>/`.
- **EC2** `t3.micro`. Ahí se crea la **clave privada de AWS**, que **nunca sale** de la máquina. También corre el receptor y el dashboard.
- **IP elástica**, que no cambia aunque el lab se apague.
- **Security group con solo el 443 abierto**, sin SSH. Se administra por SSM.

> - Cuando el Learner Lab se apaga, la EC2 se detiene. Las Raspberry **siguen guardando en local** y suben todo cuando el lab vuelve.
> - Para volver a bajar los paquetes: `bash nube/paquetes.sh`. Para borrar todo, **datos incluidos**: `bash nube/destruir.sh`.

---

## 4. PARTE B: conectar tu Raspberry a la nube

1. Copia **tu** carpeta `paquetes-nube/<tu_grupo>/` dentro de `florasense-dashboard-malla/`, con el nombre `paquete-nube/`.
   Trae 3 archivos:
   - `nube.json`: la URL y el token de tu grupo.
   - `aws-publica.pem`: la clave **pública** de AWS.
   - `ca.crt`: el certificado para verificar que hablas con **tu** nube y no con un impostor.
2. Arranca con `--nube`:
   ```bash
   node servidor.mjs --grupo grupo-3 --serie /dev/ttyUSB0 --nube paquete-nube
   ```
3. En tu dashboard tiene que aparecer **Nube AWS al día**. Si dice *sin conexión*, igual guarda todo y lo reenvía cuando vuelve.

> **La hora de la Raspberry tiene que estar bien.** La nube rechaza lotes con más de 15 minutos de diferencia, para que nadie
> pueda reenviar un lote viejo capturado. Se arregla con `timedatectl` (NTP activado).

---

## 5. El dashboard de la nube

1. Abre **`https://<IP_de_AWS>`** desde cualquier lugar con internet.
2. El navegador va a decir **"conexión no segura"**. Es normal: el certificado lo firmó la CA propia de la nube. Entra en *Avanzado → Continuar*.
3. Usuario y clave de `panel.txt`. **Es privado**: solo lo tiene el grupo de Savka.
4. Arriba ves si la **Raspberry de cada grupo está en línea**. Los filtros son los mismos de la Raspberry: grupo, nodo y solo activos.

**Lo que protege la nube** (probado):
- Un grupo **no puede subir datos a nombre de otro**: tiene que tener el token del otro grupo, y además el sobre va amarrado a su grupo.
- **Se descartan** las lecturas de nodos de otro grupo.
- **Se rechazan** los lotes repetidos, los viejos y los alterados aunque sea en 1 bit.

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
| Dashboard: *Nube AWS sin conexión* | El lab está apagado, no hay internet o el 443 está bloqueado | Revisa que el Learner Lab esté encendido. Mientras tanto se guarda todo en local |
| La nube responde `fuera de ventana` | La hora de la Raspberry está mal | `sudo timedatectl set-ntp true` |
| La nube responde `token inválido` | Usas el paquete de otro grupo | Usa **tu** carpeta de `paquetes-nube/` |
| El paquete es de otro grupo | `--grupo` no coincide con `nube.json` | Usa el mismo grupo en los dos |

## Reglas de oro

1. **Todas las placas van en el canal 6.**
2. **Cada nodo lleva un nombre único** (`grupo-X-a` o `grupo-X-b`).
3. **Cada grupo usa su clave:** `privada.pem` no sale de su Raspberry.
4. **Nunca subas** `.pem`, `paquete-nube/`, `panel.txt` ni tokens a GitHub.
5. **Cada grupo recibe solo su paquete.**

---

Instrucciones originales de la malla: [`malla_espnow/LEEME.txt`](malla_espnow/LEEME.txt)
