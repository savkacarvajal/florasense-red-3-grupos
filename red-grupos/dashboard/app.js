// Dashboard de la red de grupos: se suscribe a red/# en el hub por WSS y muestra
// la última lectura de cada dispositivo de cada grupo. Solo lectura.
(() => {
  "use strict";

  const CFG = window.RED_CONFIG || { grupos: [] };
  const SIN_DATOS_MS = (CFG.segundosSinDatos || 30) * 1000;
  const MAX_PUNTOS = 60;     // puntos por sparkline
  const MAX_MENSAJES = 80;   // filas de la tabla

  // Etiquetas conocidas; cualquier otro campo numérico se muestra con su nombre
  const METRICAS = {
    temperatureC: ["Temperatura", "°C", 1],
    temperatura: ["Temperatura", "°C", 1],
    airHumidityPct: ["Humedad aire", "%", 0],
    humedad: ["Humedad", "%", 0],
    soilMoisturePct: ["Humedad suelo", "%", 0],
    humedadSuelo: ["Humedad suelo", "%", 0],
    soilMoistureRaw: ["Suelo (ADC)", "", 0],
    luz: ["Luz", "lx", 0],
    lux: ["Luz", "lx", 0],
    rssi: ["Señal WiFi", "dBm", 0],
  };
  const ESTADOS = {
    pumpOn: ["Bomba", "encendida", "apagada"], bomba: ["Bomba", "encendida", "apagada"],
    fanOn: ["Ventilador", "encendido", "apagado"], ventilador: ["Ventilador", "encendido", "apagado"],
  };
  const IGNORAR = new Set(["version", "payloadVersion", "deviceId", "ts", "timestamp"]);

  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* sin storage */ } },
  };

  // ---------- estado ----------
  // grupos: id -> { nombre, color, puente: null|"1"|"0", disp: Map(id -> dispositivo) }
  const grupos = new Map();
  CFG.grupos.forEach((g, i) => grupos.set(g.id, crearGrupo(g.id, g.nombre, i)));
  const mensajes = [];
  let client = null;

  function crearGrupo(id, nombre, i) {
    const color = i < 3 ? `var(--series-${i + 1})` : "var(--series-x)";
    return { id, nombre: nombre || id, color, puente: null, disp: new Map() };
  }

  // ---------- login ----------
  const defUrl = location.protocol === "https:" ? `wss://${location.host}` : "wss://localhost:9443";
  $("url").value = store.get("red.url") || defUrl;
  $("usuario").value = store.get("red.usuario") || "panel";

  $("login").addEventListener("submit", (e) => {
    e.preventDefault();
    conectar($("url").value.trim(), $("usuario").value.trim(), $("clave").value);
  });
  $("btnSalir").addEventListener("click", () => {
    if (client) client.end(true);
    client = null;
    $("panel").hidden = true;
    $("login").hidden = false;
    $("btnSalir").hidden = true;
    $("clave").value = "";
    ponerEstado("", "Desconectado");
  });

  function ponerEstado(clase, texto) {
    const p = $("estadoConexion");
    p.querySelector(".dot").className = "dot " + clase;
    p.lastElementChild.textContent = texto;
  }

  function conectar(url, usuario, clave) {
    $("loginError").textContent = "";
    if (client) client.end(true);
    ponerEstado("warning", "Conectando…");
    let primera = true;
    client = mqtt.connect(url, {
      username: usuario,
      password: clave,
      clientId: "panel-" + Math.random().toString(16).slice(2, 10),
      reconnectPeriod: 3000,
      connectTimeout: 8000,
      clean: true,
    });

    client.on("connect", () => {
      primera = false;
      store.set("red.url", url);
      store.set("red.usuario", usuario);
      ponerEstado("good", "Conectado");
      $("cifrado").hidden = !url.startsWith("wss://");
      $("login").hidden = true;
      $("panel").hidden = false;
      $("btnSalir").hidden = false;
      client.subscribe("red/#", { qos: 0 }, (err, granted) => {
        if (err || (granted && granted.some((g) => g.qos === 128))) {
          ponerEstado("critical", "Sin permiso para leer red/#");
        }
      });
      render();
    });
    client.on("reconnect", () => ponerEstado("warning", "Reconectando…"));
    client.on("offline", () => ponerEstado("critical", "Sin conexión"));
    client.on("error", (err) => {
      const msg = /auth|Not authorized|Bad user/i.test(err.message) ? "Usuario o clave incorrectos." : err.message;
      if (primera) {
        $("loginError").textContent = msg;
        client.end(true);
        ponerEstado("critical", "Error");
      }
    });
    client.on("close", () => {
      if (primera) {
        $("loginError").textContent ||= "No se pudo conectar. ¿Aceptaste el certificado en " +
          url.replace(/^wss/, "https") + " ?";
        ponerEstado("critical", "Sin conexión");
      }
    });
    client.on("message", recibir);
  }

  // ---------- mensajes ----------
  function recibir(topic, buf) {
    const partes = topic.split("/");           // red/<grupo>/<dispositivo>/<tipo...>
    if (partes[0] !== "red" || partes.length < 3) return;
    const gid = partes[1];
    let g = grupos.get(gid);
    if (!g) { g = crearGrupo(gid, gid, grupos.size); grupos.set(gid, g); }
    const texto = buf.toString();

    if (partes[2] === "_puente") {             // estado del puente (1 = arriba, 0 = caído)
      g.puente = texto.trim();
      programarRender();
      return;
    }

    const did = partes[2];
    let datos = null;
    try { datos = JSON.parse(texto); } catch { /* no es JSON */ }
    agregarMensaje(g, topic, texto);

    if (datos && typeof datos === "object" && !Array.isArray(datos)) {
      let d = g.disp.get(did);
      if (!d) { d = { id: did, visto: 0, metricas: new Map(), estados: new Map() }; g.disp.set(did, d); }
      const ahora = Date.now();
      d.visto = ahora;
      for (const [k, v] of Object.entries(aplanar(datos))) {
        if (IGNORAR.has(k)) continue;
        if (typeof v === "boolean") d.estados.set(k, v);
        else if (typeof v === "number" && Number.isFinite(v)) {
          let serie = d.metricas.get(k);
          if (!serie) { serie = []; d.metricas.set(k, serie); }
          serie.push({ t: ahora, v });
          if (serie.length > MAX_PUNTOS) serie.shift();
        }
      }
    }
    programarRender();
  }

  // {"a":{"b":1}} -> {"a.b":1}  (un nivel, suficiente para payloads de sensores)
  function aplanar(obj, pre = "", out = {}) {
    for (const [k, v] of Object.entries(obj)) {
      const key = pre ? `${pre}.${k}` : k;
      if (v && typeof v === "object" && !Array.isArray(v) && !pre) aplanar(v, key, out);
      else out[key] = v;
    }
    return out;
  }

  function agregarMensaje(g, topic, texto) {
    mensajes.unshift({ t: new Date(), g, topic, texto: texto.length > 300 ? texto.slice(0, 300) + "…" : texto });
    if (mensajes.length > MAX_MENSAJES) mensajes.pop();
  }

  // ---------- render ----------
  let pendiente = false;
  function programarRender() {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(() => { pendiente = false; render(); });
  }
  setInterval(() => { if (!$("panel").hidden) render(); }, 5000); // refresca "hace X s"

  const hora = (d) => d.toLocaleTimeString("es-CL", { hour12: false });
  function hace(ms) {
    const s = Math.round((Date.now() - ms) / 1000);
    if (s < 5) return "ahora";
    if (s < 60) return `hace ${s} s`;
    if (s < 3600) return `hace ${Math.round(s / 60)} min`;
    return `hace ${Math.round(s / 3600)} h`;
  }
  function fmt(v, dec) {
    const d = dec != null ? dec : (Number.isInteger(v) ? 0 : 1);
    return v.toLocaleString("es-CL", { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  function chip(clase, texto, icono) {
    const c = el("span", "pill estado");
    if (icono) c.insertAdjacentHTML("beforeend", icono);
    else c.append(el("span", "dot " + clase));
    c.append(texto);
    return c;
  }
  const ICONO_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="var(--good)" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>';
  const ICONO_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 12h12"/></svg>';
  const ICONO_AVISO = '<svg viewBox="0 0 24 24" fill="none" stroke="var(--warning)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17.5v.5"/></svg>';

  function render() {
    $("tooltip").style.display = "none"; // el SVG bajo el cursor se reemplaza
    const cont = $("grupos");
    cont.replaceChildren();
    for (const g of grupos.values()) cont.append(renderGrupo(g));

    $("nMensajes").textContent = mensajes.length;
    const tb = $("tablaMensajes");
    tb.replaceChildren();
    for (const m of mensajes) {
      const tr = el("tr");
      tr.append(el("td", "num", hora(m.t)), el("td", null, m.g.nombre), el("td", "payload", m.topic), el("td", "payload", m.texto));
      tb.append(tr);
    }
  }

  function renderGrupo(g) {
    const sec = el("section", "grupo");
    const head = el("div", "grupo-head");
    const sw = el("span", "swatch");
    sw.style.background = g.color;
    head.append(sw, el("h2", null, g.nombre));
    const n = g.disp.size;
    head.append(el("span", "meta", n === 1 ? "1 dispositivo" : `${n} dispositivos`), el("span", "spacer"));
    if (g.puente === "1") head.append(chip("good", "Puente activo"));
    else if (g.puente === "0") head.append(chip("critical", "Puente caído"));
    else head.append(chip("", "Puente sin reportar"));
    sec.append(head);

    const body = el("div", "grupo-body");
    if (!n) body.append(el("div", "vacio", "Esperando datos de este grupo…"));
    for (const d of g.disp.values()) body.append(renderDisp(g, d));
    sec.append(body);
    return sec;
  }

  function renderDisp(g, d) {
    const card = el("div", "disp");
    const head = el("div", "disp-head");
    const nombre = d.id.length > 14 ? d.id.slice(0, 8) + "…" : d.id;
    const s = el("strong", null, nombre);
    s.title = d.id;
    head.append(s, el("span", "spacer"));
    const viejo = Date.now() - d.visto > SIN_DATOS_MS;
    head.append(viejo ? chip("", "Sin datos", ICONO_AVISO) : chip("good", "En línea"));
    head.append(el("span", "meta", hace(d.visto)));
    card.append(head);

    if (d.estados.size) {
      const es = el("div", "estados");
      for (const [k, v] of d.estados) {
        const [nom, on, off] = ESTADOS[k] || [k, "sí", "no"];
        es.append(chip("", `${nom}: ${v ? on : off}`, v ? ICONO_ON : ICONO_OFF));
      }
      card.append(es);
    }

    const ms = el("div", "metricas");
    for (const [k, serie] of d.metricas) {
      const [lbl, unidad, dec] = METRICAS[k] || [k, "", null];
      const ult = serie[serie.length - 1].v;
      const m = el("div", "metrica");
      m.append(el("div", "lbl", lbl));
      const val = el("div", "val num", fmt(ult, dec));
      if (unidad) val.append(el("small", null, unidad));
      m.append(val, sparkline(serie, g.color, lbl, unidad, dec));
      ms.append(m);
    }
    card.append(ms);
    return card;
  }

  // Línea de 2px con punto final; hover muestra el valor más cercano.
  function sparkline(serie, color, lbl, unidad, dec) {
    const W = 200, H = 34, P = 4;
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("class", "spark");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `${lbl}: últimas ${serie.length} lecturas`);
    let min = Infinity, max = -Infinity;
    for (const p of serie) { min = Math.min(min, p.v); max = Math.max(max, p.v); }
    if (max - min < 1e-9) { min -= 1; max += 1; }
    const n = Math.max(serie.length - 1, 1);
    const x = (i) => serie.length === 1 ? W - P : P + (i * (W - 2 * P)) / n;
    const y = (v) => H - P - ((v - min) / (max - min)) * (H - 2 * P);
    const pts = serie.map((p, i) => `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`);

    const line = document.createElementNS(NS, "polyline");
    line.setAttribute("points", pts.join(" "));
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", color);
    line.setAttribute("stroke-width", "2");
    line.setAttribute("stroke-linejoin", "round");
    line.setAttribute("stroke-linecap", "round");
    line.setAttribute("vector-effect", "non-scaling-stroke");
    svg.append(line);

    const tip = $("tooltip");
    svg.addEventListener("mousemove", (ev) => {
      const r = svg.getBoundingClientRect();
      const px = ((ev.clientX - r.left) / r.width) * W;
      let i = Math.round(((px - P) * n) / (W - 2 * P));
      i = Math.max(0, Math.min(serie.length - 1, i));
      const p = serie[i];
      tip.textContent = `${fmt(p.v, dec)}${unidad ? " " + unidad : ""} · ${hora(new Date(p.t))}`;
      tip.style.display = "block";
      tip.style.left = Math.min(ev.clientX + 12, innerWidth - tip.offsetWidth - 8) + "px";
      tip.style.top = ev.clientY - 30 + "px";
    });
    svg.addEventListener("mouseleave", () => { tip.style.display = "none"; });
    return svg;
  }
})();
