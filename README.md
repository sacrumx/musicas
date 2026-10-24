# 🎧 Site de músicas para partilhar

Um site simples onde pões músicas e partilhas o link com os amigos.
Tocam no telemóvel ou no computador, sem conta e sem app.

**O que faz**
- Lista as músicas com capa, artista e duração (lidos do próprio ficheiro)
- Leitor fixo em baixo: play/pausa, anterior/seguinte, ordem aleatória, barra de tempo
- Controlos no ecrã de bloqueio do telemóvel
- Botão **Partilhar** no site inteiro e em cada música (abre o menu de partilha do telemóvel ou copia o link)
- O link de cada música mostra o nome e a capa dessa música quando colado no WhatsApp, iMessage, etc.
- Etiqueta **Nova** nas músicas adicionadas nos últimos 7 dias
- Procura automática quando há mais de 8 músicas
- Playlists, cada uma com o seu link para partilhar
- Modo claro/escuro automático

---

## Pôr o site online (uma vez só, ~5 minutos)

1. **Cria um repositório** em [github.com/new](https://github.com/new)
   - Nome: por exemplo `musicas` (o site fica em `https://O-TEU-UTILIZADOR.github.io/musicas/`)
   - Marca **Public** (o GitHub Pages grátis precisa de repositório público)
   - Clica **Create repository**

2. **Carrega estes ficheiros**
   - Na página do repositório, clica **uploading an existing file**
   - Arrasta para lá **todo o conteúdo** desta pasta (incluindo a pasta `.github`)
     > No Mac, a pasta `.github` está escondida: no Finder carrega em `Cmd + Shift + .` para a veres.
   - Clica **Commit changes**

3. **Liga o GitHub Pages**
   - No repositório: **Settings → Pages**
   - Em **Source**, escolhe **GitHub Actions**

4. **Espera 1–2 minutos.** No separador **Actions** vês o progresso (bolinha verde = pronto).
   O link aparece em **Settings → Pages**. Se a primeira tentativa falhou porque o passo 3 ainda não estava feito, vai a **Actions → Publicar site → Run workflow**.

## Adicionar músicas — pela página escondida (recomendado)

O site tem uma página de gestão que não aparece em lado nenhum para os teus amigos:

**`https://O-TEU-UTILIZADOR.github.io/musicas/gerir.html`**

Guarda esse endereço nos favoritos (também funciona no telemóvel). Lá podes:
- **arrastar músicas** (ou escolhê-las do telemóvel) e carregar em **Publicar**
- escrever o título e o artista, e escolher uma capa
- **mudar o nome** ou **apagar** músicas que já estão no site
- ver quando o site acabou de atualizar

**Primeira vez em cada dispositivo:** a página pede uma "chave" do GitHub. Carregas em
*Criar chave no GitHub*, escolhes **Only select repositories → musicas**, carregas em
*Generate token*, copias e colas. A chave fica guardada só nesse browser e dura 1 ano.
Mesmo que alguém descubra a página, sem a chave não consegue mexer em nada.

## Playlists

Na página de gestão há um cartão **Playlists**:
- **+ Nova playlist** → dás um nome (e uma descrição, se quiseres), carregas no **+** das músicas que queres e ordenas com as setas
- **Guardar playlist** e, passado 1–2 minutos, aparece no site por cima da lista
- cada playlist tem o seu link (`…/musicas/p/nome-da-playlist/`): no site, escolhe a playlist e carrega em **Partilhar**

As playlists ficam guardadas em `musicas/playlists.json`. Se apagares uma música, ela sai também das playlists.

## Links para a revista (QR codes)

- **Uma música:** `…/musicas/m/artista-titulo/` abre uma página só com essa música (capa, título, play e partilhar) — é este o link a pôr em cada QR code. No site, o botão de partilhar de cada música copia este link.
- **Uma playlist:** `…/musicas/p/nome-da-playlist/` abre uma página só com as músicas dessa playlist, sem as outras músicas nem as outras playlists.

Nestas páginas o nome do site (`titulo` do `config.json`) aparece só como uma linha pequena no topo.

## Adicionar músicas — diretamente no GitHub (alternativa)

1. Abre a pasta **`musicas`** no repositório
2. **Add file → Upload files** e arrasta os ficheiros de áudio
3. **Commit changes**

Em 1–2 minutos aparecem no site.

**Formatos:** MP3 (recomendado — funciona em todo o lado), M4A, AAC, OGG, Opus, FLAC, WAV.

**Nome, artista e capa:** são lidos das etiquetas do ficheiro. Se não tiver etiquetas:
- dá ao ficheiro o nome `Artista - Título.mp3` e o site separa-os sozinho
- para a capa, põe uma imagem com **o mesmo nome** ao lado: `Artista - Título.jpg`
- sem capa, o site desenha uma colorida com as iniciais

## Personalizar

Edita **`config.json`** no GitHub (ícone do lápis):

```json
{
  "titulo": "Portal da Música",
  "subtitulo": "Carrega no play. Partilha com quem quiseres.",
  "autor": "Catarina",
  "url": ""
}
```

- `autor` aparece no rodapé ("Partilhado por …")
- `url` só é preciso se usares um domínio próprio
- Para mudar a imagem que aparece quando partilhas o link do site, substitui `capa-partilha.png` (1200×630)

## Limites a ter em conta

- Cada ficheiro até **25 MB** pelo GitHub, ou até **95 MB** pela página de gestão (um MP3 de 5 min tem ~5–10 MB)
- O repositório deve ficar abaixo de **~1 GB** no total (dá para umas 100–150 músicas em MP3)
- O site é **público**: quem tiver o link consegue ouvir e descarregar. Usa-o para músicas tuas ou que tenhas direito de partilhar.

## Testar no computador (opcional)

```bash
pip install mutagen pillow
python scripts/gerar_site.py
cd _site && python -m http.server 8000
# abre http://localhost:8000
```
