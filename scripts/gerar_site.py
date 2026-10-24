#!/usr/bin/env python3
"""
Gera o site a partir da pasta `musicas/`.

- Lê título, artista, álbum, duração e capa de cada ficheiro de áudio.
- Cria `musicas.json` com a lista (mais recentes primeiro).
- Lê as playlists de `musicas/playlists.json` (criadas na página "Gerir músicas").
- Cria uma página de partilha por música (m/<id>/) e por playlist (p/<id>/) para
  que, ao colar o link no WhatsApp/Instagram/iMessage, apareça o nome e a capa.
- Escreve tudo em `_site/`, que é o que o GitHub Pages publica.

Corre sozinho no GitHub (ver .github/workflows/publicar.yml).
Para testar no computador:  pip install mutagen pillow  &&  python scripts/gerar_site.py
"""
import hashlib
import html
import json
import os
import re
import shutil
import subprocess
import sys
import unicodedata
from pathlib import Path
from urllib.parse import quote

from mutagen import File as MutagenFile

RAIZ = Path(__file__).resolve().parent.parent
PASTA = RAIZ / "musicas"
SAIDA = RAIZ / "_site"
EXTENSOES = {".mp3", ".m4a", ".aac", ".ogg", ".oga", ".opus", ".wav", ".flac", ".webm"}
FICHEIROS_SITE = ["index.html", "gerir.html", "style.css", "app.js", "icone.svg", "icone.png", "capa-partilha.png"]


def slug(texto: str) -> str:
    t = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    t = re.sub(r"[^a-zA-Z0-9]+", "-", t).strip("-").lower()
    return t or "musica"


def primeiro(tags, *chaves):
    if not tags:
        return ""
    for k in chaves:
        try:
            v = tags.get(k)
        except Exception:
            v = None
        if v:
            v = v[0] if isinstance(v, (list, tuple)) else v
            v = getattr(v, "text", v)
            if isinstance(v, (list, tuple)):
                v = v[0] if v else ""
            v = str(v).strip()
            if v:
                return v
    return ""


def extrair_capa(audio, caminho: Path):
    """Devolve (bytes, extensão) da capa embutida, se existir."""
    tags = getattr(audio, "tags", None)
    try:
        # MP3 (ID3)
        if tags is not None and hasattr(tags, "getall"):
            for apic in tags.getall("APIC"):
                return apic.data, ".png" if "png" in apic.mime else ".jpg"
        # M4A / AAC
        if tags is not None and "covr" in tags:
            c = tags["covr"][0]
            return bytes(c), ".png" if getattr(c, "imageformat", 13) == 14 else ".jpg"
        # FLAC
        if getattr(audio, "pictures", None):
            p = audio.pictures[0]
            return p.data, ".png" if "png" in p.mime else ".jpg"
        # OGG / Opus
        if tags is not None and "metadata_block_picture" in tags:
            import base64
            from mutagen.flac import Picture
            p = Picture(base64.b64decode(tags["metadata_block_picture"][0]))
            return p.data, ".png" if "png" in p.mime else ".jpg"
    except Exception as e:
        print(f"  (capa ignorada em {caminho.name}: {e})")
    return None, None


def capa_ao_lado(caminho: Path):
    """Imagem com o mesmo nome da música (ex.: 'Musica.jpg' ao lado de 'Musica.mp3')."""
    for ext in (".jpg", ".jpeg", ".png", ".webp"):
        for c in (caminho.with_suffix(ext), caminho.with_suffix(ext.upper())):
            if c.exists():
                return c
    return None


def reduzir_imagem(dados: bytes, destino: Path):
    """Guarda a capa em JPG 600x600 para o site carregar rápido."""
    try:
        from io import BytesIO
        from PIL import Image
        im = Image.open(BytesIO(dados)).convert("RGB")
        im.thumbnail((600, 600))
        im.save(destino.with_suffix(".jpg"), "JPEG", quality=85, optimize=True)
        return destino.with_suffix(".jpg")
    except Exception:
        destino.write_bytes(dados)
        return destino


def data_adicionada(caminho: Path) -> int:
    """Data em que o ficheiro entrou no repositório (ou data de modificação)."""
    try:
        out = subprocess.run(
            ["git", "log", "--diff-filter=A", "--follow", "--format=%ct", "--", str(caminho)],
            cwd=RAIZ, capture_output=True, text=True, timeout=20,
        ).stdout.split()
        if out:
            return int(out[-1])
    except Exception:
        pass
    return int(caminho.stat().st_mtime)


def titulo_do_nome(nome: str):
    """'01 - Artista - Título' -> ('Título', 'Artista')"""
    base = re.sub(r"^\s*\d{1,3}[\s.\-_]+", "", nome)
    base = base.replace("_", " ").strip()
    if " - " in base:
        artista, titulo = base.split(" - ", 1)
        return titulo.strip(), artista.strip()
    return base, ""


def url_do_site(cfg) -> str:
    if cfg.get("url"):
        return cfg["url"].rstrip("/") + "/"
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    if "/" in repo:
        dono, nome = repo.split("/", 1)
        if nome.lower() == f"{dono.lower()}.github.io":
            return f"https://{nome.lower()}/"
        return f"https://{dono.lower()}.github.io/{nome}/"
    return ""


def pagina_partilha(pasta: Path, destino: str, tipo: str, emoji: str, titulo: str, desc: str,
                    imagem: str, og_url: str, extra: str = ""):
    """Página mínima com etiquetas Open Graph que reencaminha para o site."""
    e = html.escape
    pasta.mkdir(parents=True)
    (pasta / "index.html").write_text(f"""<!doctype html>
<html lang="pt"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(titulo)}</title>
<meta property="og:type" content="{tipo}">
<meta property="og:title" content="{emoji} {e(titulo)}">
<meta property="og:description" content="{e(desc)}">
{f'<meta property="og:image" content="{e(imagem)}">' if imagem else ''}
{f'<meta property="og:url" content="{e(og_url)}">' if og_url else ''}
{extra}<meta name="twitter:card" content="summary">
<meta http-equiv="refresh" content="0; url={destino}">
<link rel="canonical" href="{destino}">
</head><body><script>location.replace({json.dumps(destino)})</script>
<p><a href="{destino}">Ouvir “{e(titulo)}”</a></p></body></html>
""", encoding="utf-8")


def main():
    cfg = json.loads((RAIZ / "config.json").read_text(encoding="utf-8"))
    url = url_do_site(cfg)

    if SAIDA.exists():
        shutil.rmtree(SAIDA)
    (SAIDA / "musicas").mkdir(parents=True)
    (SAIDA / "capas").mkdir()

    # nomes escolhidos na página "Gerir músicas" (sobrepõem-se às etiquetas)
    nomes = {}
    if (PASTA / "nomes.json").exists():
        try:
            nomes = json.loads((PASTA / "nomes.json").read_text(encoding="utf-8"))
        except Exception as e:
            print(f"  (nomes.json ignorado: {e})")

    musicas, usados, por_ficheiro = [], set(), {}
    ficheiros = sorted(p for p in PASTA.rglob("*") if p.is_file() and p.suffix.lower() in EXTENSOES) if PASTA.exists() else []
    print(f"{len(ficheiros)} ficheiro(s) de áudio encontrados em musicas/")

    for caminho in ficheiros:
        rel = caminho.relative_to(PASTA)
        try:
            audio = MutagenFile(caminho, easy=False)
            easy = MutagenFile(caminho, easy=True)
        except Exception as e:
            print(f"  ! não consegui ler {rel}: {e}")
            audio = easy = None

        tags = getattr(easy, "tags", None)
        t_nome, a_nome = titulo_do_nome(caminho.stem)
        titulo = primeiro(tags, "title", "\xa9nam") or t_nome
        artista = primeiro(tags, "artist", "albumartist", "\xa9ART") or a_nome or cfg.get("autor", "")
        album = primeiro(tags, "album", "\xa9alb")
        escolhido = nomes.get(rel.as_posix()) or {}
        titulo = (escolhido.get("titulo") or "").strip() or titulo
        artista = (escolhido.get("artista") or "").strip() or artista
        duracao = round(getattr(getattr(audio, "info", None), "length", 0) or 0)

        ident = slug(titulo if not artista else f"{artista}-{titulo}")
        n, original = 2, ident
        while ident in usados:
            ident, n = f"{original}-{n}", n + 1
        usados.add(ident)
        por_ficheiro[rel.as_posix()] = ident

        # copia o áudio
        destino_audio = SAIDA / "musicas" / rel
        destino_audio.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(caminho, destino_audio)

        # capa: imagem ao lado > capa embutida > nenhuma (o site desenha uma)
        capa = ""
        img = capa_ao_lado(caminho)
        dados, ext = (img.read_bytes(), img.suffix) if img else extrair_capa(audio, caminho) if audio else (None, None)
        if dados:
            final = reduzir_imagem(dados, SAIDA / "capas" / f"{ident}{ext}")
            capa = f"capas/{final.name}"

        musicas.append({
            "id": ident,
            "ficheiro": "musicas/" + quote(rel.as_posix()),
            "titulo": titulo,
            "artista": artista,
            "album": album,
            "duracao": duracao,
            "capa": capa,
            "adicionada": data_adicionada(caminho),
        })
        print(f"  ✓ {titulo}" + (f" — {artista}" if artista else ""))

    musicas.sort(key=lambda m: (-m["adicionada"], m["titulo"].lower()))

    # páginas de partilha por música (pré-visualização bonita nos links)
    imagem_padrao = url + "capa-partilha.png" if url else ""
    for m in musicas:
        audio_og = html.escape(url + m["ficheiro"]) if url else ""
        pagina_partilha(
            SAIDA / "m" / m["id"], f"../../?m={quote(m['id'])}", "music.song", "🎵", m["titulo"],
            " · ".join(x for x in (m["artista"], cfg.get("titulo", "")) if x),
            (url + m["capa"]) if (url and m["capa"]) else imagem_padrao,
            f"{url}m/{m['id']}/" if url else "",
            f'<meta property="og:audio" content="{audio_og}">\n',
        )
        if url:
            m["partilha"] = f"{url}m/{m['id']}/"

    # playlists: guardam os ficheiros (ex.: "Artista - Título.mp3") pela ordem escolhida
    playlists = []
    if (PASTA / "playlists.json").exists():
        try:
            lidas = json.loads((PASTA / "playlists.json").read_text(encoding="utf-8"))
        except Exception as e:
            print(f"  (playlists.json ignorado: {e})")
            lidas = []
        por_id = {m["id"]: m for m in musicas}
        ids_pl = set()
        for pl in lidas if isinstance(lidas, list) else []:
            nome = str(pl.get("nome") or "").strip()
            if not nome:
                continue
            ident = slug(str(pl.get("id") or nome))
            n, original = 2, ident
            while ident in ids_pl:
                ident, n = f"{original}-{n}", n + 1
            ids_pl.add(ident)
            faixas = [por_ficheiro[f] for f in pl.get("musicas", []) if f in por_ficheiro]
            capa = next((por_id[i]["capa"] for i in faixas if por_id[i]["capa"]), "")
            playlists.append({
                "id": ident,
                "nome": nome,
                "descricao": str(pl.get("descricao") or "").strip(),
                "musicas": faixas,
            })
            pagina_partilha(
                SAIDA / "p" / ident, f"../../?p={quote(ident)}", "music.playlist", "🎧", nome,
                playlists[-1]["descricao"] or " · ".join(x for x in (
                    f"{len(faixas)} {'música' if len(faixas) == 1 else 'músicas'}", cfg.get("titulo", "")) if x),
                (url + capa) if (url and capa) else imagem_padrao,
                f"{url}p/{ident}/" if url else "",
            )
            if url:
                playlists[-1]["partilha"] = f"{url}p/{ident}/"
            print(f"  ♫ playlist {nome} ({len(faixas)})")

    dados = {
        "config": {k: cfg.get(k, "") for k in ("titulo", "subtitulo", "autor")},
        "url": url,
        "musicas": musicas,
        "playlists": playlists,
    }
    (SAIDA / "musicas.json").write_text(json.dumps(dados, ensure_ascii=False, indent=1), encoding="utf-8")

    # ficheiros do site + preencher título/descrição/imagem de partilha
    for f in FICHEIROS_SITE:
        if (RAIZ / f).exists():
            shutil.copy2(RAIZ / f, SAIDA / f)
    imagem_site = (url + "capa-partilha.png") if url else "capa-partilha.png"
    if cfg.get("imagem"):
        imagem_site = cfg["imagem"] if cfg["imagem"].startswith("http") else url + cfg["imagem"]
        if (RAIZ / cfg["imagem"]).exists():
            shutil.copy2(RAIZ / cfg["imagem"], SAIDA / cfg["imagem"])
    # versão dos ficheiros: muda quando o código muda, para o browser não usar a cópia antiga
    versao = hashlib.sha1(b"".join((RAIZ / f).read_bytes() for f in ("app.js", "style.css"))).hexdigest()[:10]
    pagina = (SAIDA / "index.html").read_text(encoding="utf-8")
    for chave, valor in {
        "VERSAO": versao,
        "TITULO": cfg.get("titulo", "Músicas"),
        "SUBTITULO": cfg.get("subtitulo", ""),
        "IMAGEM": imagem_site,
        "URL": url,
    }.items():
        pagina = pagina.replace("{{" + chave + "}}", html.escape(valor))
    (SAIDA / "index.html").write_text(pagina, encoding="utf-8")
    (SAIDA / ".nojekyll").write_text("")

    print(f"\nSite gerado em _site/ com {len(musicas)} música(s).")
    if url:
        print(f"Endereço: {url}")


if __name__ == "__main__":
    sys.exit(main())
