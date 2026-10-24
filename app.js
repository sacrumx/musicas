(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const audio = $("audio");
  const lista = $("lista");

  let musicas = [];      // todas as músicas, pela ordem do site
  let playlists = [];    // [{id, nome, descricao, musicas: [ids]}]
  let playlist = null;   // playlist que está a ser vista (null = todas as músicas)
  let soPlaylist = false; // aberto pelo link de uma playlist: não mostra as outras
  let vista = [];        // índices em `musicas` que estão na lista
  let ordem = [];        // índices a partir dos quais a fila foi feita
  let fila = [];         // ordem de reprodução (pode estar baralhada)
  let atual = -1;        // índice em `musicas`
  let aleatorio = false;
  let aArrastar = false;

  // URL base do site (funciona em utilizador.github.io/repo/ e em domínio próprio)
  const base = (() => {
    const p = location.pathname.replace(/index\.html$/, "");
    return location.origin + (p.endsWith("/") ? p : p + "/");
  })();

  /* ---------------- Utilitários ---------------- */

  const tempo = (s) => {
    if (!isFinite(s) || s < 0) return "0:00";
    s = Math.floor(s);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    const mm = h ? String(m).padStart(2, "0") : m;
    return (h ? h + ":" : "") + mm + ":" + String(sec).padStart(2, "0");
  };

  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Capa de recurso: tom discreto derivado do nome + iniciais
  const corDe = (txt) => {
    let h = 0;
    for (const c of txt) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return h % 360;
  };
  const tonsCapa = (m) => {
    const h = corDe(m.titulo + m.artista);
    const escuro = matchMedia("(prefers-color-scheme: dark)").matches;
    return {
      de: escuro ? `hsl(${h} 14% 24%)` : `hsl(${h} 22% 90%)`,
      ate: escuro ? `hsl(${h} 12% 17%)` : `hsl(${h} 18% 82%)`,
      texto: escuro ? `hsl(${h} 20% 72%)` : `hsl(${h} 22% 34%)`,
    };
  };
  const iniciais = (m) => m.titulo.replace(/[^\p{L}\p{N} ]/gu, "").trim().split(/\s+/)
    .slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "♪";
  const pintarCapa = (el, m) => {
    if (m.capa) {
      el.style.backgroundImage = `url("${m.capa}")`;
      el.textContent = "";
      return;
    }
    const t = tonsCapa(m);
    el.style.backgroundImage = `linear-gradient(160deg, ${t.de}, ${t.ate})`;
    el.style.color = t.texto;
    el.textContent = iniciais(m);
  };

  // A mesma capa de recurso, desenhada numa imagem para as notificações / ecrã bloqueado
  const capaImagem = async (m) => {
    try { await document.fonts.load('600 220px "Source Serif 4"'); } catch {}
    const lado = 512, c = document.createElement("canvas");
    c.width = c.height = lado;
    const g = c.getContext("2d"), t = tonsCapa(m);
    // gradiente a 160deg, como no CSS
    const a = (160 - 90) * Math.PI / 180, r = lado / 2;
    const dx = Math.cos(a) * r, dy = Math.sin(a) * r;
    const grad = g.createLinearGradient(r - dx, r - dy, r + dx, r + dy);
    grad.addColorStop(0, t.de);
    grad.addColorStop(1, t.ate);
    g.fillStyle = grad;
    g.fillRect(0, 0, lado, lado);
    g.fillStyle = t.texto;
    g.font = '600 220px "Source Serif 4", Georgia, serif';
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(iniciais(m), r, r + 8);
    return c.toDataURL("image/png");
  };

  let avisoTimer;
  const aviso = (txt) => {
    const el = $("aviso");
    el.textContent = txt;
    el.classList.add("visivel");
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(() => el.classList.remove("visivel"), 2400);
  };

  const linkMusica = (m) => m.partilha || base + "?m=" + encodeURIComponent(m.id);
  const linkPlaylist = (pl) => pl.partilha || base + "?p=" + encodeURIComponent(pl.id);

  function atualizarUrl() {
    const q = new URLSearchParams();
    if (playlist) q.set("p", playlist.id);
    if (atual >= 0) q.set("m", musicas[atual].id);
    const t = q.toString();
    history.replaceState(null, "", t ? "?" + t : location.pathname);
  }

  async function partilhar({ title, text, url }) {
    if (navigator.share) {
      try { await navigator.share({ title, text, url }); return; }
      catch (e) { if (e.name === "AbortError") return; }
    }
    try {
      await navigator.clipboard.writeText(url);
      aviso("Link copiado — é só colar 👌");
    } catch {
      prompt("Copia este link:", url);
    }
  }

  /* ---------------- Carregar ---------------- */

  async function carregar() {
    let dados;
    try {
      const r = await fetch("musicas.json?v=" + Date.now(), { cache: "no-store" });
      if (!r.ok) throw new Error(r.status);
      dados = await r.json();
    } catch {
      dados = { musicas: [] };
    }

    const cfg = dados.config || {};
    if (cfg.titulo) { $("titulo").textContent = cfg.titulo; document.title = cfg.titulo; }
    if (cfg.subtitulo) $("subtitulo").textContent = cfg.subtitulo;
    if (cfg.autor) $("rodape").textContent = "Partilhado por " + cfg.autor;

    musicas = (dados.musicas || []).map((m) => ({
      ...m,
      titulo: m.titulo || m.ficheiro,
      artista: m.artista || "",
    }));

    if (!musicas.length) {
      $("vazio").hidden = false;
      $("tocarTudo").hidden = true;
      return;
    }

    const indice = new Map(musicas.map((m, i) => [m.id, i]));
    playlists = (dados.playlists || []).map((pl) => ({
      ...pl,
      faixas: (pl.musicas || []).map((id) => indice.get(id)).filter((i) => i !== undefined),
    }));

    // Links diretos: ?p=playlist e/ou ?m=música (ou #música)
    const params = new URLSearchParams(location.search);
    const pl = playlists.find((p) => p.id === params.get("p")) || null;
    const q = params.get("m") || decodeURIComponent(location.hash.slice(1));
    const i = q ? musicas.findIndex((m) => m.id === q) : -1;

    // o nome do site fica só como uma linha discreta no topo
    const nomeSite = $("titulo").textContent.trim();
    if ((pl || i >= 0) && nomeSite) {
      $("marca").textContent = nomeSite;
      $("marca").hidden = false;
    }

    // Link de uma música (QR da revista): só essa música, mais nada
    if (!pl && i >= 0) return mostrarSo(i);

    if (pl) {
      // Link de uma playlist: só as músicas dessa playlist
      soPlaylist = true;
      document.body.classList.add("modo-playlist");
      $("titulo").textContent = pl.nome;
      $("subtitulo").textContent = pl.descricao || "";
      document.title = pl.nome;
    } else {
      if (musicas.length > 8) $("procuraCaixa").hidden = false;
      desenharPlaylists();
    }
    mostrarPlaylist(pl);
    refazerFila(vista);

    if (i >= 0) {
      escolher(i, false);
      const li = lista.querySelector(`[data-i="${i}"]`);
      if (li) {
        li.classList.add("destacada");
        setTimeout(() => li.scrollIntoView({ behavior: "smooth", block: "center" }), 300);
      }
      aviso("Carrega no ▶ para ouvir");
    }
  }

  function mostrarSo(i) {
    const m = musicas[i];
    document.body.classList.add("modo-musica");
    document.title = m.titulo + (m.artista ? " — " + m.artista : "");
    $("soloTitulo").textContent = m.titulo;
    $("soloArtista").textContent = [m.artista, m.album].filter(Boolean).join(" · ");
    pintarCapa($("soloCapa"), m);
    $("solo").hidden = false;
    // o leitor fica dentro da página, entre o título e o botão de partilhar
    $("solo").insertBefore($("leitor"), $("soloPartilhar"));
    refazerFila([i]);
    escolher(i, false);
  }

  function desenharPlaylists() {
    const nav = $("playlists");
    if (!playlists.length) return;
    nav.innerHTML = `<button class="chip" type="button" data-p="">Todas</button>` +
      playlists.map((pl) =>
        `<button class="chip" type="button" data-p="${esc(pl.id)}">${esc(pl.nome)}<small>${pl.faixas.length}</small></button>`
      ).join("");
    nav.hidden = false;
  }

  function mostrarPlaylist(pl) {
    playlist = pl;
    vista = pl ? pl.faixas : musicas.map((_, i) => i);
    $("playlists").querySelectorAll(".chip").forEach((b) =>
      b.setAttribute("aria-pressed", b.dataset.p === (pl ? pl.id : "")));
    $("playlistDesc").textContent = pl?.descricao || "";
    $("playlistDesc").hidden = !pl?.descricao;

    const total = vista.reduce((a, i) => a + (musicas[i].duracao || 0), 0);
    $("contagem").textContent = (pl && !soPlaylist ? pl.nome + " · " : "") +
      `${vista.length} ${vista.length === 1 ? "música" : "músicas"}` +
      (total ? ` · ${Math.round(total / 60)} min` : "");
    $("tocarTudo").hidden = !vista.length;

    desenharLista();
    filtrar();
    atualizarUrl();
  }

  function desenharLista() {
    lista.innerHTML = vista.length ? "" : '<li class="lista-vazia">Esta playlist ainda não tem músicas.</li>';
    vista.forEach((i, pos) => {
      const m = musicas[i];
      const li = document.createElement("li");
      li.className = "faixa" + (i === atual ? " atual" : "");
      li.tabIndex = 0;
      li.dataset.i = i;
      li.dataset.procura = (m.titulo + " " + m.artista + " " + (m.album || "")).toLowerCase();
      const sub = [m.artista, m.album].filter(Boolean).join(" · ");
      li.innerHTML = `
        <div class="faixa-num"><span>${pos + 1}</span><div class="ondas"><i></i><i></i><i></i></div></div>
        <div class="capa"></div>
        <div class="faixa-texto">
          <span class="faixa-titulo">${esc(m.titulo)}</span>
          ${sub ? `<span class="faixa-sub">${esc(sub)}</span>` : ""}
        </div>
        <div class="faixa-acoes">
          <span class="faixa-dur">${m.duracao ? tempo(m.duracao) : ""}</span>
          <a class="icone baixar" href="${esc(m.ficheiro)}" download aria-label="Descarregar" title="Descarregar">
            <svg viewBox="0 0 24 24"><path d="M11 4h2v9l3.5-3.5 1.4 1.4L12 16.8 6.1 10.9l1.4-1.4L11 13zM5 18h14v2H5z"/></svg>
          </a>
          <button class="icone partilhar" type="button" aria-label="Partilhar ${esc(m.titulo)}" title="Partilhar">
            <svg viewBox="0 0 24 24"><path d="M18 16a3 3 0 0 0-2.4 1.2l-6.7-3.4a3 3 0 0 0 0-1.6l6.7-3.4A3 3 0 1 0 15 7c0 .3 0 .5.1.8L8.4 11.2a3 3 0 1 0 0 3.6l6.7 3.4c-.1.3-.1.5-.1.8a3 3 0 1 0 3-3z"/></svg>
          </button>
        </div>`;
      pintarCapa(li.querySelector(".capa"), m);
      lista.appendChild(li);
    });
  }

  /* ---------------- Reprodução ---------------- */

  function refazerFila(nova) {
    if (nova) ordem = nova;
    fila = [...ordem];
    if (aleatorio) {
      for (let i = fila.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [fila[i], fila[j]] = [fila[j], fila[i]];
      }
      // a música atual passa para o início para não se repetir
      if (fila.includes(atual)) fila = [atual, ...fila.filter((x) => x !== atual)];
    }
  }

  function escolher(i, tocar = true) {
    const m = musicas[i];
    if (!m) return;
    if (i !== atual) {
      atual = i;
      audio.src = m.ficheiro;
      $("leitorTitulo").textContent = m.titulo;
      $("leitorArtista").textContent = m.artista || m.album || "";
      pintarCapa($("leitorCapa"), m);
      $("tempoTotal").textContent = m.duracao ? tempo(m.duracao) : "0:00";
      $("tempoAtual").textContent = "0:00";
      definirBarra(0);
      [...lista.children].forEach((li) => li.classList.toggle("atual", +li.dataset.i === i));
      $("leitor").hidden = false;
      sessaoMedia(m);
      atualizarUrl();
    }
    if (tocar) audio.play().catch(() => {});
  }

  function passo(dir) {
    if (!fila.length) return;
    if (dir < 0 && audio.currentTime > 3) { audio.currentTime = 0; return; }
    let p = fila.indexOf(atual) + dir;
    if (p >= fila.length) p = 0;
    if (p < 0) p = fila.length - 1;
    escolher(fila[p]);
  }

  function alternar() {
    if (atual < 0) { refazerFila(vista); escolher(fila[0]); return; }
    audio.paused ? audio.play().catch(() => {}) : audio.pause();
  }

  function definirBarra(frac) {
    const b = $("barra");
    b.value = Math.round(frac * 1000);
    b.style.setProperty("--p", (frac * 100).toFixed(2) + "%");
  }

  async function sessaoMedia(m) {
    if (!("mediaSession" in navigator)) return;
    const src = m.capa ? new URL(m.capa, base).href : await capaImagem(m);
    if (m !== musicas[atual]) return; // entretanto mudou de música
    navigator.mediaSession.metadata = new MediaMetadata({
      title: m.titulo, artist: m.artista, album: m.album || $("titulo").textContent,
      artwork: [{ src, sizes: "512x512", type: m.capa ? undefined : "image/png" }],
    });
  }

  if ("mediaSession" in navigator) {
    const ms = navigator.mediaSession;
    ms.setActionHandler("play", () => audio.play());
    ms.setActionHandler("pause", () => audio.pause());
    ms.setActionHandler("previoustrack", () => passo(-1));
    ms.setActionHandler("nexttrack", () => passo(1));
    try { ms.setActionHandler("seekto", (e) => { audio.currentTime = e.seekTime; }); } catch {}
  }

  /* ---------------- Eventos ---------------- */

  audio.addEventListener("play", () => document.body.classList.add("a-tocar"));
  audio.addEventListener("pause", () => document.body.classList.remove("a-tocar"));
  audio.addEventListener("ended", () => { if (fila.length > 1) passo(1); });
  audio.addEventListener("loadedmetadata", () => { $("tempoTotal").textContent = tempo(audio.duration); });
  audio.addEventListener("timeupdate", () => {
    if (aArrastar || !audio.duration) return;
    definirBarra(audio.currentTime / audio.duration);
    $("tempoAtual").textContent = tempo(audio.currentTime);
  });
  audio.addEventListener("error", () => {
    if (atual >= 0) aviso("Não foi possível tocar esta música");
  });

  const barra = $("barra");
  barra.addEventListener("input", () => {
    aArrastar = true;
    const f = barra.value / 1000;
    barra.style.setProperty("--p", f * 100 + "%");
    if (audio.duration) $("tempoAtual").textContent = tempo(f * audio.duration);
  });
  barra.addEventListener("change", () => {
    if (audio.duration) audio.currentTime = (barra.value / 1000) * audio.duration;
    aArrastar = false;
  });

  lista.addEventListener("click", (e) => {
    const li = e.target.closest(".faixa");
    if (!li) return;
    const i = +li.dataset.i;
    if (e.target.closest(".partilhar")) {
      const m = musicas[i];
      partilhar({ title: m.titulo, text: `🎵 ${m.titulo}${m.artista ? " — " + m.artista : ""}`, url: linkMusica(m) });
      return;
    }
    if (e.target.closest(".baixar")) return;
    if (ordem !== vista) refazerFila(vista);
    i === atual ? alternar() : escolher(i);
  });
  lista.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.classList.contains("faixa")) {
      e.preventDefault();
      e.target.click();
    }
  });

  $("tocar").addEventListener("click", alternar);
  $("seguinte").addEventListener("click", () => passo(1));
  $("anterior").addEventListener("click", () => passo(-1));
  $("tocarTudo").addEventListener("click", () => {
    refazerFila(vista);
    escolher(fila[0]);
  });
  $("aleatorio").addEventListener("click", (e) => {
    aleatorio = !aleatorio;
    e.currentTarget.setAttribute("aria-pressed", aleatorio);
    refazerFila();
    aviso(aleatorio ? "Ordem aleatória ligada" : "Ordem aleatória desligada");
  });
  $("partilharSite").addEventListener("click", () => playlist
    ? partilhar({ title: playlist.nome, text: "🎧 " + playlist.nome, url: linkPlaylist(playlist) })
    : partilhar({ title: $("titulo").textContent, text: "🎧 " + $("titulo").textContent, url: base }));
  $("soloPartilhar").addEventListener("click", () => $("partilharAtual").click());
  $("partilharAtual").addEventListener("click", () => {
    const m = musicas[atual];
    if (m) partilhar({ title: m.titulo, text: `🎵 ${m.titulo}${m.artista ? " — " + m.artista : ""}`, url: linkMusica(m) });
  });

  $("playlists").addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (b) mostrarPlaylist(playlists.find((pl) => pl.id === b.dataset.p) || null);
  });

  function filtrar() {
    const t = $("procura").value.trim().toLowerCase();
    lista.querySelectorAll(".faixa").forEach((li) => { li.hidden = t && !li.dataset.procura.includes(t); });
  }
  $("procura").addEventListener("input", filtrar);

  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input, textarea") && e.target.type !== "range") return;
    if (e.code === "Space" && !e.target.classList.contains("faixa")) { e.preventDefault(); alternar(); }
    if (e.key === "ArrowRight" && e.shiftKey) passo(1);
    if (e.key === "ArrowLeft" && e.shiftKey) passo(-1);
  });

  carregar();
})();
