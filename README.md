# ⚽ Futebol de Botão 3D Multiplayer

Um jogo moderno e completo de **futebol de botão em 3D por turnos**, desenvolvido com **Three.js**, física realista **Cannon-es**, áudio procedural via **Web Audio API** e suporte a **Multiplayer em Tempo Real com o Supabase** (pronto para hospedar no **GitHub Pages**).

---

## 🌟 Funcionalidades e Características

- 🎛️ **Customização Total do Jogador e Botão**:
  - Nome do Jogador (ex: *Craque 10*, *Pelé*, etc.)
  - Nome do Time (ex: *Flamengo*, *Real Madrid*, *Brasil*, etc.)
  - Cor do Botão (Color picker livre + paleta de atalhos rápidos)
  - Abreviação de exatamente **3 Letras** (gravada em relevo no topo do botão acrílico 3D)
  - Preview dinâmico em tempo real no menu

- 🎯 **Mecânica de Trajetória e Força (Estilingue / Slingshot)**:
  - Clique e arraste para trás em qualquer botão do seu time quando for seu turno.
  - Linha guia de mira tracejada 3D dinâmica que indica a direção precisa do chute.
  - Barra e anel de força com gradiente de potência (Verde &rarr; Amarelo &rarr; Vermelho) de 0% a 100%.
  - Ao soltar o mouse, o impulso físico é aplicado com colisões nas tabelas da mesa, entre botões e na bola.

- 📐 **Regras Oficiais do Futebol de Mesa**:
  - Formato **4x4** (1 Goleiro + 3 Botões de Linha) ou **5x5** (1 Goleiro + 4 Botões de Linha), escolhido na criação da partida.
  - Turnos alternados: cada jogador chuta uma vez e o turno só passa para o próximo quando todos os botões e a bola param completamente.
  - **Detecção de Gol**:
    - Som de apito e comemoração de torcida.
    - Efeito especial de chuva de **confetes** na tela.
    - Banner animado estilizado com o nome do time que marcou.
    - Atualização automática do placar.
    - Reposicionamento automático de todas as peças e da bola no meio de campo.
    - Saída de bola no centro concedida ao time que sofreu o gol!
  - **Tempo de Partida**: Cronômetro de 3 minutos regressivo (180s) com apito final e tela de campeão com opção de revanche.

- 💬 **Chat Interno da Partida**:
  - Painel flutuante retrátil com mensagens em tempo real.
  - Cores e abreviação do time identificando o autor.
  - Reações rápidas de emojis (⚽, 🎯, 🔥, 👏, 😱, 🏆).
  - Alerta de notificações de novas mensagens.

- 🎮 **Três Modos de Jogo**:
  1. **Multiplayer Online**: Conecte com amigos à distância por código de sala (ex: `7429`) usando o Supabase Realtime Broadcast.
  2. **1x1 Local (Pass & Play)**: Jogue com um amigo revezando o mesmo mouse/teclado.
  3. **Treino VS Bot (IA)**: Pratique suas jogadas sozinho contra o computador.

- 🔊 **Áudio Procedural Nativo**:
  - Apito com duplo trilo de árbitro.
  - Som oco de estalo de botão acrílico batendo na bolinha.
  - Som de impacto na madeira da tabela.
  - Efeitos sonoros sem depender de arquivos MP3 externos (zero risco de erro 404).

---

## 🚀 Como Hospedar no GitHub Pages (Passo a Passo)

Como este projeto utiliza **ES Modules** puros e CDNs para as bibliotecas, ele **NÃO necessita de compilação ou build (npm run build)**. Você pode publicá-lo diretamente no GitHub Pages em menos de 1 minuto:

1. Crie um novo repositório no seu GitHub (ex: `futebol-de-botao-3d`).
2. Faça o upload ou commit de todos os arquivos desta pasta:
   - `index.html` (deve estar na raiz)
   - `styles.css`
   - pasta `js/`
   - `README.md`
3. No seu repositório no GitHub, clique em **Settings** &rarr; **Pages** (no menu lateral esquerdo).
4. Em **Build and deployment &rarr; Branch**, selecione a branch `main` e a pasta `/ (root)`.
5. Clique em **Save**.
6. Em cerca de 30 a 60 segundos, o GitHub fornecerá a URL pública do seu jogo (ex: `https://seu-usuario.github.io/futebol-de-botao-3d/`).

---

## ⚡ Configuração do Supabase (Para o Multiplayer Online)

O jogo utiliza os canais de **Broadcast do Supabase Realtime**, que funcionam diretamente do navegador sem necessidade de criar tabelas ou servidores:

1. Acesse [supabase.com](https://supabase.com) e crie uma conta gratuita.
2. Crie um novo projeto (ex: `futebol-de-botao`).
3. No painel do seu projeto, vá em **Project Settings &rarr; API** (ícone de engrenagem no canto inferior esquerdo).
4. Copie os dois valores:
   - **Project URL** (ex: `https://xyzcompany.supabase.co`)
   - **Project API Keys &rarr; `anon` `public`** (sua chave pública anônima)
5. Abra o jogo, vá na aba **"3. Supabase Cloud"** do menu, cole os dois valores e clique em **Salvar Credenciais**.
6. As credenciais ficarão salvas com segurança no `localStorage` do seu navegador. Agora basta criar uma sala, passar o código de 4 dígitos para o seu amigo e jogar!

> 💡 **Nota**: Se você não quiser configurar o Supabase agora, pode se divertir imediatamente usando os modos **1x1 Local** ou **Treino com o Robô**, que funcionam 100% offline!

---

## 🛠️ Tecnologias Utilizadas

- **Three.js** (v0.160.0) - Renderização 3D, câmeras, sombras suaves e texturas dinâmicas.
- **Cannon-es** (v0.20.0) - Motor de física de corpos rígidos 3D, atrito de mesa, colisões elásticas e detecção de repouso.
- **Supabase-js** (v2) - Canais de broadcast e eventos de tempo real para multiplayer.
- **Canvas-confetti** - Efeitos de comemoração ao fazer gol.
- **Web Audio API** - Síntese procedural de som (sem arquivos externos).
- **CSS3 Moderno** - Glassmorphism, animações de gols e design esportivo responsivo.
