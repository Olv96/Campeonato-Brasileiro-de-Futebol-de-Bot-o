/**
 * network.js - Gerenciador de Rede Multiplayer & Modos de Jogo
 * Modos: 'online' (Supabase Realtime Broadcast), 'local' (2P Pass & Play), 'bot' (VS IA)
 */

import { supabaseManager } from './supabaseClient.js';

export class NetworkManager {
  constructor(game) {
    this.game = game;
    this.mode = 'local'; // 'online' | 'local' | 'bot'
    this.roomCode = null;
    this.isHost = true;
    this.channel = null;
    this.localPlayerIndex = 0; // 0 para Time 1 (Home), 1 para Time 2 (Away)
    
    // Callbacks de UI
    this.onPlayerJoined = null;
    this.onGameStart = null;
    this.onChatMessage = null;
    this.onPlayerLeft = null;
    this.onStatusChange = null;
  }

  setMode(mode) {
    this.mode = mode;
    if (mode === 'local') {
      this.isHost = true;
      this.localPlayerIndex = 0; // Ambos jogam alternadamente no mesmo dispositivo
    } else if (mode === 'bot') {
      this.isHost = true;
      this.localPlayerIndex = 0; // Jogador humano é Time 1, Bot é Time 2
    }
  }

  // Gera código aleatório de sala (ex: 8392)
  generateRoomCode() {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  // Cria uma nova sala via Supabase Broadcast
  async createRoom(roomCode, hostPlayerData, formation = 4) {
    if (!supabaseManager.isConfigured()) {
      throw new Error('Supabase não configurado! Configure URL e Anon Key na aba Supabase.');
    }

    this.mode = 'online';
    this.isHost = true;
    this.roomCode = roomCode;
    this.localPlayerIndex = 0;

    const client = supabaseManager.client;
    const channelName = `futebol3d_room_${roomCode}`;

    if (this.channel) {
      await this.channel.unsubscribe();
    }

    this.channel = client.channel(channelName, {
      config: { broadcast: { ack: true } }
    });

    this.setupChannelListeners();

    return new Promise((resolve, reject) => {
      this.channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          resolve({ success: true, roomCode });
        } else if (status === 'CHANNEL_ERROR') {
          reject(new Error('Erro ao conectar ao canal da sala.'));
        }
      });
    });
  }

  // Entra em uma sala existente
  async joinRoom(roomCode, guestPlayerData) {
    if (!supabaseManager.isConfigured()) {
      throw new Error('Supabase não configurado! Configure URL e Anon Key na aba Supabase.');
    }

    this.mode = 'online';
    this.isHost = false;
    this.roomCode = roomCode;
    this.localPlayerIndex = 1;

    const client = supabaseManager.client;
    const channelName = `futebol3d_room_${roomCode}`;

    if (this.channel) {
      await this.channel.unsubscribe();
    }

    this.channel = client.channel(channelName, {
      config: { broadcast: { ack: true } }
    });

    this.setupChannelListeners();

    return new Promise((resolve, reject) => {
      this.channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          // Notifica o Host que o Guest entrou
          await this.sendBroadcast('guest_joined', { guest: guestPlayerData });
          resolve({ success: true });
        } else if (status === 'CHANNEL_ERROR') {
          reject(new Error('Falha ao conectar na sala ' + roomCode));
        }
      });
    });
  }

  setupChannelListeners() {
    if (!this.channel) return;

    this.channel
      .on('broadcast', { event: 'guest_joined' }, ({ payload }) => {
        if (this.isHost && this.onPlayerJoined) {
          this.onPlayerJoined(payload.guest);
          // O Host responde com seus dados e as regras da sala
          this.sendBroadcast('host_handshake', {
            host: this.game.players[0],
            formation: this.game.formation
          });
        }
      })
      .on('broadcast', { event: 'host_handshake' }, ({ payload }) => {
        if (!this.isHost && this.onPlayerJoined) {
          // O Guest recebe a confirmação do host
          this.onPlayerJoined(payload.host, payload.formation);
        }
      })
      .on('broadcast', { event: 'start_match' }, ({ payload }) => {
        if (this.onGameStart) {
          this.onGameStart(payload);
        }
      })
      .on('broadcast', { event: 'player_shot' }, ({ payload }) => {
        if (this.game) {
          this.game.applyRemoteShot(payload);
        }
      })
      .on('broadcast', { event: 'sync_reset' }, ({ payload }) => {
        if (this.game) {
          this.game.resetFieldPositions(payload.possessionTeam);
        }
      })
      .on('broadcast', { event: 'chat_message' }, ({ payload }) => {
        if (this.onChatMessage) {
          this.onChatMessage(payload);
        }
      })
      .on('broadcast', { event: 'player_left' }, ({ payload }) => {
        if (this.onPlayerLeft) {
          this.onPlayerLeft(payload);
        }
      });
  }

  async sendBroadcast(event, payload) {
    if (this.mode === 'online' && this.channel) {
      try {
        await this.channel.send({
          type: 'broadcast',
          event,
          payload
        });
      } catch (err) {
        console.warn('Erro ao enviar broadcast:', event, err);
      }
    }
  }

  // Dispara arremesso (shot)
  sendShot(pieceId, impulseX, impulseZ) {
    if (this.mode === 'online') {
      this.sendBroadcast('player_shot', {
        pieceId,
        impulseX,
        impulseZ,
        turnIndex: this.game.currentTurn
      });
    }
  }

  // Envia mensagem de chat
  sendChat(authorName, teamAbbr, teamColor, text) {
    const messageData = {
      authorName,
      teamAbbr,
      teamColor,
      text,
      timestamp: Date.now()
    };

    if (this.mode === 'online') {
      this.sendBroadcast('chat_message', messageData);
    }

    // Retorna para exibir na própria UI
    if (this.onChatMessage) {
      this.onChatMessage(messageData);
    }
  }

  // Notifica início de partida (Host envia para Guest)
  startOnlineMatch() {
    if (this.isHost && this.mode === 'online') {
      const matchConfig = {
        formation: this.game.formation,
        startTime: Date.now(),
        turn: 0
      };
      this.sendBroadcast('start_match', matchConfig);
      if (this.onGameStart) {
        this.onGameStart(matchConfig);
      }
    }
  }

  // Desconecta da sala
  leaveRoom() {
    if (this.channel) {
      this.sendBroadcast('player_left', { isHost: this.isHost });
      this.channel.unsubscribe();
      this.channel = null;
    }
    this.roomCode = null;
    this.mode = 'local';
  }

  // Checa se o jogador local pode jogar agora
  canLocalPlayerShoot(currentTurnIndex) {
    if (this.mode === 'local') {
      return true; // No mesmo PC, qualquer um joga quando é a sua vez
    }
    if (this.mode === 'bot') {
      return currentTurnIndex === 0; // Humano só joga no turno 0
    }
    if (this.mode === 'online') {
      return currentTurnIndex === this.localPlayerIndex;
    }
    return false;
  }
}
